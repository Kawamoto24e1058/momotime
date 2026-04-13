<script lang="ts">
	import { Plus, Camera, Image as ImageIcon, X, Loader2 } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toasts';
	import { fade, slide } from 'svelte/transition';

	let { onUploadComplete, userId } = $props<{ 
		onUploadComplete: (classes: any[]) => void;
		userId: string;
	}>();

	let isOpen = $state(false);
	let isProcessing = $state(false);
	let fileInput: HTMLInputElement;
	let cameraInput: HTMLInputElement;

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const files = Array.from(input.files);
		isOpen = false;
		isProcessing = true;

		try {
			// Process all images in parallel
			const imageResults = await Promise.all(files.map(async (file) => {
				const compressedBase64 = await compressImage(file);
				return {
					image: compressedBase64.split(',')[1],
					mimeType: file.type
				};
			}));

			const response = await fetch('/api/ocr', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					images: imageResults,
					userId
				})
			});

			const result = await response.json();
			if (result.success) {
				toasts.add(`AIが${result.classes.length}件の授業を認識しました。配置を確認して[保存する]を押してください。`, 'success');
				onUploadComplete(result.classes);
			} else {
				throw new Error(result.error || '不明なエラーが発生しました');
			}
		} catch (error: any) {
			toasts.add(`エラー: ${error.message}`, 'error');
		} finally {
			isProcessing = false;
			input.value = ''; // Reset input
		}
	}

	async function compressImage(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					const MAX_WIDTH = 1000;
					const MAX_HEIGHT = 1000;
					let width = img.width;
					let height = img.height;

					if (width > height) {
						if (width > MAX_WIDTH) {
							height *= MAX_WIDTH / width;
							width = MAX_WIDTH;
						}
					} else {
						if (height > MAX_HEIGHT) {
							width *= MAX_HEIGHT / height;
							height = MAX_HEIGHT;
						}
					}

					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d');
					ctx?.drawImage(img, 0, 0, width, height);
					resolve(canvas.toDataURL('image/jpeg', 0.8));
				};
				img.onerror = reject;
				img.src = e.target?.result as string;
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}
</script>

<!-- Floating Action Button -->
<button
	class="fixed right-6 bottom-24 w-14 h-14 bg-black text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 z-40"
	onclick={() => (isOpen = true)}
	aria-label="Add timetable"
>
	<Plus size={28} />
</button>

<!-- Overlay / Modal -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end justify-center"
		transition:fade={{ duration: 200 }}
		onclick={() => (isOpen = false)}
	>
		<div
			class="bg-white w-full max-w-xl rounded-t-[32px] p-8 pb-12 flex flex-col gap-6"
			transition:slide={{ axis: 'y' }}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex justify-between items-center mb-2">
				<h2 class="text-xl font-bold">時間割の登録</h2>
				<button class="p-2 text-gray-400" onclick={() => (isOpen = false)}>
					<X size={24} />
				</button>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<button
					class="flex flex-col items-center gap-3 p-6 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors"
					onclick={() => cameraInput.click()}
				>
					<div class="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
						<Camera size={24} class="text-black" />
					</div>
					<span class="text-sm font-medium">写真を撮る</span>
				</button>
				<button
					class="flex flex-col items-center gap-3 p-6 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors"
					onclick={() => fileInput.click()}
				>
					<div class="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
						<ImageIcon size={24} class="text-black" />
					</div>
					<span class="text-sm font-medium">ライブラリから選択</span>
				</button>
			</div>

			<p class="text-xs text-gray-400 text-center px-4">
				時間割のスクリーンショット（複数可）をアップロードすると、AIが自動で統合して読み取ります。
			</p>
		</div>
	</div>
{/if}

<!-- Hidden Inputs -->
<input
	type="file"
	accept="image/*"
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
			<p class="text-sm text-gray-400">これには数秒かかる場合があります</p>
		</div>
	</div>
{/if}
