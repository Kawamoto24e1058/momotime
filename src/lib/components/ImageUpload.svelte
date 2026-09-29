<script lang="ts">
	import { Camera, Image as ImageIcon, ClipboardPaste, X, Loader2, ChevronLeft } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toasts';
	import { supabase } from '$lib/supabaseClient';
	import { fade, slide } from 'svelte/transition';

	let { onUploadComplete, isOpen = $bindable(false) } = $props<{
		onUploadComplete: (classes: any[]) => void;
		userId?: string;
		isOpen?: boolean;
	}>();

	let isProcessing = $state(false);
	let mode = $state<'menu' | 'text'>('menu');
	let pastedText = $state('');
	let fileInput: HTMLInputElement;
	let cameraInput: HTMLInputElement;

	// Vercel のリクエスト上限は 4.5MB。base64 で約 1.33 倍になるので余裕を持たせる
	const TOTAL_BUDGET = 3_200_000;
	// 縦長スクショを 1000px に縮めると文字が潰れて AI が読めなくなるため、長辺は大きめに残す
	const MAX_LONG_SIDE = 2400;
	const MAX_PIXELS = 3_000_000;

	function close() {
		isOpen = false;
		mode = 'menu';
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const files = Array.from(input.files);
		input.value = '';
		close();
		isProcessing = true;

		try {
			const budget = TOTAL_BUDGET / files.length;
			const payload = await Promise.all(files.map((file) => prepareFile(file, budget)));
			await sendToOCR({ files: payload });
		} catch (error: any) {
			toasts.add(`エラー: ${error.message}`, 'error');
		} finally {
			isProcessing = false;
		}
	}

	async function handleTextSubmit() {
		const text = pastedText.trim();
		if (text.length < 10) {
			toasts.add('M-Portの時間割ページの文字を貼り付けてください', 'error');
			return;
		}
		close();
		isProcessing = true;
		try {
			await sendToOCR({ text });
			pastedText = '';
		} catch (error: any) {
			toasts.add(`エラー: ${error.message}`, 'error');
		} finally {
			isProcessing = false;
		}
	}

	async function pasteFromClipboard() {
		try {
			pastedText = await navigator.clipboard.readText();
		} catch {
			toasts.add('クリップボードを読み取れませんでした。入力欄に直接貼り付けてください', 'info');
		}
	}

	async function sendToOCR(body: { files?: { data: string; mimeType: string }[]; text?: string }) {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) throw new Error('ログインの有効期限が切れています。再ログインしてください。');

		const response = await fetch('/api/ocr', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify(body)
		});

		// タイムアウト等で HTML のエラーページが返ってくることがあるので JSON 以外も考慮する
		let result: any = null;
		try {
			result = await response.json();
		} catch {
			if (response.status === 413) throw new Error('画像のサイズが大きすぎます。枚数を減らしてください。');
			if (response.status === 504) throw new Error('解析がタイムアウトしました。枚数を減らして再度お試しください。');
			throw new Error(`サーバーエラーが発生しました (${response.status})`);
		}

		if (!response.ok || !result?.success) {
			throw new Error(result?.error || '不明なエラーが発生しました');
		}
		if (result.classes.length === 0) {
			throw new Error('授業を見つけられませんでした。時間割が写っているか確認してください。');
		}

		toasts.add(`AIが${result.classes.length}件の授業を認識しました。確認して[保存する]を押してください。`, 'success');
		onUploadComplete(result.classes);
	}

	async function prepareFile(file: File, budget: number): Promise<{ data: string; mimeType: string }> {
		if (file.type === 'application/pdf') {
			if (file.size * 1.34 > TOTAL_BUDGET) {
				throw new Error('PDFのサイズが大きすぎます（2MBまで）。');
			}
			return { data: await readAsBase64(file), mimeType: 'application/pdf' };
		}
		const dataUrl = await compressImage(file, budget);
		// canvas で JPEG に変換しているので mimeType は常に image/jpeg（元の file.type を使うと HEIC などで不一致になる）
		return { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
	}

	function readAsBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve((reader.result as string).split(',')[1]);
			reader.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
			reader.readAsDataURL(file);
		});
	}

	async function loadImage(file: File): Promise<HTMLImageElement> {
		const url = URL.createObjectURL(file);
		try {
			return await new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = () =>
					reject(new Error('画像を読み込めませんでした（HEIC形式の場合はスクリーンショットかJPEGでお試しください）'));
				img.src = url;
			});
		} finally {
			setTimeout(() => URL.revokeObjectURL(url), 0);
		}
	}

	async function compressImage(file: File, budget: number): Promise<string> {
		const img = await loadImage(file);
		let scale = Math.min(
			1,
			MAX_LONG_SIDE / Math.max(img.width, img.height),
			Math.sqrt(MAX_PIXELS / (img.width * img.height))
		);

		// サイズ予算に収まるまで画質 → 解像度の順に落とす
		for (let attempt = 0; attempt < 6; attempt++) {
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(img.width * scale);
			canvas.height = Math.round(img.height * scale);
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

			for (const quality of [0.85, 0.7, 0.55]) {
				const dataUrl = canvas.toDataURL('image/jpeg', quality);
				if (dataUrl.length <= budget) return dataUrl;
			}
			scale *= 0.8;
		}
		throw new Error('画像が大きすぎます。枚数を減らしてください。');
	}
</script>

<!-- Overlay / Modal -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end justify-center"
		transition:fade={{ duration: 200 }}
		onclick={close}
	>
		<div
			class="bg-white w-full max-w-xl rounded-t-[32px] p-8 pb-12 flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
			transition:slide={{ axis: 'y' }}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex justify-between items-center mb-2">
				<div class="flex items-center gap-2">
					{#if mode === 'text'}
						<button class="p-1 -ml-1 text-gray-400" onclick={() => (mode = 'menu')} aria-label="戻る">
							<ChevronLeft size={24} />
						</button>
					{/if}
					<h2 class="text-xl font-bold">{mode === 'text' ? 'テキストから読み込む' : '時間割の登録'}</h2>
				</div>
				<button class="p-2 text-gray-400" onclick={close} aria-label="閉じる">
					<X size={24} />
				</button>
			</div>

			{#if mode === 'menu'}
				<button
					class="flex items-center gap-4 p-5 rounded-2xl bg-black text-white text-left active:scale-[0.98] transition-all"
					onclick={() => fileInput.click()}
				>
					<div class="w-12 h-12 shrink-0 rounded-full bg-white/10 flex items-center justify-center">
						<ImageIcon size={24} />
					</div>
					<div class="flex flex-col gap-0.5">
						<span class="text-sm font-bold">スクリーンショット / PDF を選択</span>
						<span class="text-[11px] text-white/60">おすすめ・複数枚まとめて選べます</span>
					</div>
				</button>

				<div class="grid grid-cols-2 gap-4">
					<button
						class="flex flex-col items-center gap-3 p-5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors"
						onclick={() => (mode = 'text')}
					>
						<div class="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
							<ClipboardPaste size={24} class="text-black" />
						</div>
						<span class="text-sm font-medium">テキストを貼り付け</span>
					</button>
					<button
						class="flex flex-col items-center gap-3 p-5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors"
						onclick={() => cameraInput.click()}
					>
						<div class="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
							<Camera size={24} class="text-black" />
						</div>
						<span class="text-sm font-medium">カメラで撮る</span>
					</button>
				</div>

				<div class="text-xs text-gray-500 bg-gray-50 rounded-2xl p-4 flex flex-col gap-1.5 leading-relaxed">
					<p class="font-bold text-gray-700">きれいに読み込むコツ</p>
					<p>・PCやスマホの画面を<b>別のスマホで撮影するより、スクリーンショット</b>の方が正確です。</p>
					<p>・iPhoneのSafariなら、スクショ後に「<b>フルページ</b>」を選んでPDF保存すると、スクロールせず1枚で全曜日を送れます。</p>
					<p>・複数枚に分ける場合は、曜日の見出しが写るように少しずつ重ねて撮ってください。</p>
				</div>
			{:else}
				<ol class="text-xs text-gray-500 bg-gray-50 rounded-2xl p-4 flex flex-col gap-1.5 leading-relaxed list-decimal list-inside">
					<li>M-Portで時間割（履修登録確認）のページを開く</li>
					<li>画面を長押し →「すべてを選択」→「コピー」（PCなら Ctrl+A → Ctrl+C）</li>
					<li>下の欄に貼り付けて「読み込む」</li>
				</ol>
				<textarea
					class="w-full h-48 bg-gray-50 border border-border rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
					placeholder="ここに貼り付け"
					bind:value={pastedText}
				></textarea>
				<div class="flex gap-3">
					<button
						class="flex-1 py-3.5 bg-white text-black border border-border rounded-2xl font-bold text-sm"
						onclick={pasteFromClipboard}
					>
						クリップボードから
					</button>
					<button
						class="flex-1 py-3.5 bg-black text-white rounded-2xl font-bold text-sm disabled:opacity-40"
						disabled={!pastedText.trim()}
						onclick={handleTextSubmit}
					>
						読み込む
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Hidden Inputs -->
<input
	type="file"
	accept="image/*,application/pdf"
	multiple={true}
	bind:this={fileInput}
	class="hidden"
	onchange={(e) => handleFileChange(e)}
/>
<input
	type="file"
	accept="image/*"
	capture="environment"
	bind:this={cameraInput}
	class="hidden"
	onchange={(e) => handleFileChange(e)}
/>

<!-- Processing Loader -->
{#if isProcessing}
	<div
		class="fixed inset-0 bg-white/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-4"
		transition:fade
	>
		<div class="relative w-20 h-20">
			<Loader2 class="w-20 h-20 text-black animate-spin" strokeWidth={1.5} />
		</div>
		<div class="flex flex-col items-center gap-1">
			<p class="text-lg font-bold">AIが解析中...</p>
			<p class="text-sm text-gray-400">10〜30秒ほどかかる場合があります</p>
		</div>
	</div>
{/if}
