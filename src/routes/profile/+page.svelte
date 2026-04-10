<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { 
		Settings, 
		Grid, 
		Bookmark, 
		Users, 
		Shield, 
		LogOut, 
		ChevronRight,
		QrCode,
		Share2,
		Copy,
		ExternalLink
	} from 'lucide-svelte';
	import { fade, slide, scale } from 'svelte/transition';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { toasts } from '$lib/stores/toasts';
	import { page } from '$app/state';

	let userId = $state<string | null>(null);
	let user = $state<any>(null);
	let statsData = $state([
		{ label: 'Classes', value: 0, icon: Grid },
		{ label: 'Tasks', value: 0, icon: Bookmark },
		{ label: 'Friends', value: 0, icon: Users },
	]);
	let privacyMode = $state<'public' | 'friends' | 'private'>('friends');
	let isLoading = $state(true);
	let isEditModalOpen = $state(false);
	let isQrModalOpen = $state(false);
	let qrCodeDataUrl = $state('');

	let editData = $state({
		name: '',
		handle_id: '',
		avatar_url: ''
	});

	let validationError = $state<string | null>(null);
	let avatarFile = $state<File | null>(null);
	let avatarPreview = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();

	const avatarPresets = [
		'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
		'https://api.dicebear.com/7.x/avataaars/svg?seed=Aria',
		'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
		'https://api.dicebear.com/7.x/avataaars/svg?seed=Milo',
		'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
		'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe'
	];

	async function fetchProfile() {
		isLoading = true;
		try {
			const { data: { user: authUser } } = await supabase.auth.getUser();
			if (!authUser) return;
			userId = authUser.id;

			const { data: userData } = await supabase
				.from('Users')
				.select('*')
				.eq('id', userId)
				.single() as any;

			if (userData) {
				user = userData;
				editData = {
					name: userData.name,
					handle_id: userData.handle_id,
					avatar_url: userData.avatar_url || avatarPresets[0]
				};
				generateQrCode();
			}

			// Fetch stats
			const [classesCount, tasksCount, followsCount] = await Promise.all([
				supabase.from('User_Classes').select('*', { count: 'exact', head: true }).eq('user_id', userId),
				supabase.from('Tasks').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_completed', false),
				supabase.from('Follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
			]);

			statsData = [
				{ label: 'Classes', value: classesCount.count || 0, icon: Grid },
				{ label: 'Tasks', value: tasksCount.count || 0, icon: Bookmark },
				{ label: 'Friends', value: followsCount.count || 0, icon: Users },
			];
		} catch (error) {
			console.error('Error fetching profile:', error);
		} finally {
			isLoading = false;
		}
	}

	async function generateQrCode() {
		if (!user?.handle_id) return;
		const url = `${page.url.origin}/user/${user.handle_id}`;
		qrCodeDataUrl = await QRCode.toDataURL(url, {
			width: 600,
			margin: 2,
			color: {
				dark: '#000000',
				light: '#ffffff'
			}
		});
	}

	function copyShareLink() {
		const url = `${page.url.origin}/user/${user?.handle_id}`;
		navigator.clipboard.writeText(url);
		toasts.add('プロフィールURLをコピーしました！', 'success');
	}

	function validateHandle(handle: string) {
		const regex = /^[a-zA-Z0-9_]{3,20}$/;
		if (!regex.test(handle)) {
			return '3〜20文字の英数字を入力してください';
		}
		return null;
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			avatarFile = input.files[0];
			avatarPreview = URL.createObjectURL(avatarFile);
			editData.avatar_url = avatarPreview;
		}
	}

	async function uploadAvatar(): Promise<string | null> {
		if (!avatarFile || !userId) return null;

		const fileExt = avatarFile.name.split('.').pop();
		const filePath = `${userId}/${Math.random()}.${fileExt}`;

		const { error: uploadError, data } = await supabase.storage
			.from('avatars')
			.upload(filePath, avatarFile);

		if (uploadError) {
			console.error('Upload error:', uploadError);
			throw uploadError;
		}

		const { data: { publicUrl } } = supabase.storage
			.from('avatars')
			.getPublicUrl(filePath);

		return publicUrl;
	}

	async function saveProfile() {
		validationError = validateHandle(editData.handle_id);
		if (validationError) return;

		try {
			let finalAvatarUrl = editData.avatar_url;

			if (avatarFile) {
				const uploadedUrl = await uploadAvatar();
				if (uploadedUrl) finalAvatarUrl = uploadedUrl;
			}

			const { data: existingUser } = await supabase
				.from('Users')
				.select('id')
				.eq('handle_id', editData.handle_id)
				.neq('id', userId)
				.maybeSingle();

			if (existingUser) {
				validationError = 'この学籍番号/IDは既に使用されています';
				return;
			}

			const { error } = await (supabase.from('Users') as any)
				.upsert({
					id: userId,
					name: editData.name,
					handle_id: editData.handle_id,
					avatar_url: finalAvatarUrl
				});

			if (error) throw error;
			
			toasts.add('プロフィールを更新しました！', 'success');
			isEditModalOpen = false;
			avatarFile = null;
			avatarPreview = null;
			await fetchProfile();
		} catch (err) {
			toasts.add('更新に失敗しました', 'error');
		}
	}

	async function handleLogout() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			toasts.add('ログアウトに失敗しました', 'error');
		} else {
			toasts.add('ログアウトしました', 'success');
			goto('/login');
		}
	}

	onMount(fetchProfile);
</script>

<div class="flex flex-col gap-8">
	<!-- Profile Header -->
	<header class="flex flex-col items-center gap-6 mt-4">
		<div class="relative group">
			<div class="w-28 h-28 rounded-[40px] p-1.5 bg-gradient-to-tr from-yellow-400 to-fuchsia-600 shadow-xl rotate-3 group-hover:rotate-0 transition-transform duration-500">
				<div class="bg-white rounded-[35px] p-1 h-full w-full overflow-hidden">
					<img 
						src={user?.avatar_url || avatarPresets[0]} 
						alt="Profile" 
						class="w-full h-full rounded-[30px] object-cover"
					/>
				</div>
			</div>
			<button 
				class="absolute -bottom-2 -right-2 w-10 h-10 bg-black text-white rounded-2xl shadow-lg flex items-center justify-center active:scale-90 transition-transform border-4 border-white"
				onclick={() => isEditModalOpen = true}
			>
				<Settings size={18} />
			</button>
		</div>

		<div class="flex flex-col items-center gap-1">
			<h1 class="text-2xl font-bold tracking-tight">{user?.name || 'Loading...'}</h1>
			<p class="text-xs font-bold text-gray-400 tracking-wider">@{user?.handle_id || '...'}</p>
			
			<button 
				class="mt-4 px-6 py-2.5 bg-white border border-border rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all text-gray-700 hover:bg-gray-50 flex items-center gap-2"
				onclick={() => isEditModalOpen = true}
			>
				プロフィールを編集
			</button>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-3 w-full max-w-[280px]">
			<button 
				class="flex-1 px-4 py-2.5 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
				onclick={() => { generateQrCode(); isQrModalOpen = true; }}
			>
				<QrCode size={14} />
				QRコード
			</button>
			<button 
				class="flex-1 px-4 py-2.5 bg-white border border-border text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-gray-50"
				onclick={copyShareLink}
			>
				<Share2 size={14} />
				シェア
			</button>
		</div>

		<!-- Stats -->
		<div class="flex gap-4 w-full">
			{#each statsData as stat}
				<div class="flex-1 bg-white border border-border p-4 rounded-[28px] flex flex-col items-center gap-1 shadow-sm transition-transform hover:scale-105">
					<stat.icon size={18} class="text-gray-300 mb-1" />
					<span class="text-xl font-black">{stat.value}</span>
					<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</span>
				</div>
			{/each}
		</div>
	</header>

	<!-- Privacy Settings -->
	<section class="flex flex-col gap-4">
		<h2 class="text-sm font-bold px-1">プライバシー設定</h2>
		<div class="bg-white border border-border rounded-[32px] p-2 flex flex-col gap-1 shadow-sm">
			{#each ['public', 'friends', 'private'] as mode}
				<button 
					class="flex items-center justify-between p-4 rounded-2xl transition-all {privacyMode === mode ? 'bg-gray-50' : 'hover:bg-gray-50'}"
					onclick={() => privacyMode = mode as any}
				>
					<div class="flex items-center gap-4">
						<div class="w-10 h-10 rounded-full flex items-center justify-center {privacyMode === mode ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}">
							<Shield size={20} />
						</div>
						<div class="flex flex-col items-start">
							<span class="text-sm font-bold capitalize">{mode}</span>
							<p class="text-[10px] text-gray-400 font-medium">
								{#if mode === 'public'}自分の時間割を全員に公開します{:else if mode === 'friends'}友達にのみ空きコマを表示します{:else}自分以外誰も見ることができません{/if}
							</p>
						</div>
					</div>
					{#if privacyMode === mode}
						<div class="w-2 h-2 rounded-full bg-accent" in:scale></div>
					{/if}
				</button>
			{/each}
		</div>
	</section>

	<!-- Other Actions -->
	<section class="flex flex-col gap-2">
		<button 
			class="w-full insta-card p-5 flex items-center justify-between group bg-white border border-border rounded-[28px]"
			onclick={handleLogout}
		>
			<div class="flex items-center gap-4">
				<div class="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
					<LogOut size={20} />
				</div>
				<span class="text-sm font-bold text-red-500">ログアウト</span>
			</div>
			<ChevronRight size={18} class="text-gray-200 group-hover:text-gray-400" />
		</button>
	</section>

	<footer class="mt-4 mb-8">
		<p class="text-[10px] text-gray-300 text-center font-bold tracking-widest uppercase">Momotime v1.0.0-PROD</p>
	</footer>
</div>

<!-- Edit Profile Modal -->
{#if isEditModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end justify-center w-full h-full cursor-default"
		transition:fade={{ duration: 200 }}
		onclick={() => isEditModalOpen = false}
		role="presentation"
	>
		<div 
			class="bg-white w-full max-w-xl rounded-t-[40px] p-8 pb-12 flex flex-col gap-8 shadow-2xl overflow-y-auto max-h-[90vh] text-left cursor-default"
			transition:slide={{ axis: 'y', duration: 300 }}
			onclick={e => e.stopPropagation()}
			role="presentation"
		>
			<div class="w-12 h-1 bg-gray-200 rounded-full mx-auto -mt-2"></div>
			
			<div class="flex justify-between items-center">
				<h2 class="text-xl font-bold">プロフィール編集</h2>
				<button 
					class="text-sm font-bold text-gray-400"
					onclick={() => isEditModalOpen = false}
				>
					閉じる
				</button>
			</div>

			<div class="flex flex-col gap-6">
				<!-- Current Avatar Display -->
				<div class="flex flex-col items-center gap-4 py-2">
					<div 
						class="w-24 h-24 rounded-full border-2 border-gray-100 p-1 cursor-pointer hover:opacity-80 transition-opacity"
						onclick={() => fileInput?.click()}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
					>
						<img 
							src={editData.avatar_url} 
							alt="Current Avatar" 
							class="w-full h-full rounded-full object-cover"
						/>
					</div>
					<input 
						type="file" 
						accept="image/*" 
						class="hidden" 
						bind:this={fileInput}
						onchange={handleFileChange}
					/>
					<button 
						class="text-sm font-bold text-[#0095F6] hover:text-blue-600 active:scale-95 transition-all"
						onclick={() => fileInput?.click()}
					>
						プロフィール写真を変更
					</button>
				</div>

				<!-- Avatar Picker -->
				<div class="flex flex-col gap-3">
					<span class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">プリセットから選択</span>
					<div class="flex gap-4 overflow-x-auto no-scrollbar pb-2">
						{#each avatarPresets as preset}
							<button 
								class="relative shrink-0 w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all {editData.avatar_url === preset ? 'border-black scale-105 shadow-md' : 'border-transparent opacity-60'}"
								onclick={() => editData.avatar_url = preset}
							>
								<img src={preset} alt="preset" class="w-full h-full object-cover" />
								{#if editData.avatar_url === preset}
									<div class="absolute inset-0 bg-black/10 flex items-center justify-center">
										<div class="w-2 h-2 rounded-full bg-white"></div>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<!-- Name Input -->
				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1" for="editName">表示名</label>
					<input 
						id="editName"
						type="text" 
						class="w-full bg-gray-50 border border-border rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
						bind:value={editData.name}
						placeholder="お名前を入力"
					/>
				</div>

				<!-- Handle Input -->
				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1" for="editHandle">学籍番号 / ユーザーID</label>
					<input 
						id="editHandle"
						type="text" 
						class="w-full bg-gray-50 border {validationError ? 'border-red-400' : 'border-border'} rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5 transition-all text-gray-800"
						bind:value={editData.handle_id}
						placeholder="例: 25e1234"
					/>
					{#if validationError}
						<p class="text-[10px] text-red-500 font-bold px-1" in:fade>{validationError}</p>
					{:else}
						<p class="text-[10px] text-gray-400 font-medium px-1">英数字のみ、3〜20文字で入力してください</p>
					{/if}
				</div>
			</div>

			<button 
				class="w-full py-4 rounded-[24px] bg-black text-white font-bold text-sm shadow-xl active:scale-95 transition-all mt-4 hover:bg-gray-900"
				onclick={saveProfile}
			>
				変更を保存する
			</button>
		</div>
	</div>
{/if}

<!-- QR Code Modal -->
{#if isQrModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 w-full h-full cursor-default"
		transition:fade={{ duration: 200 }}
		onclick={() => isQrModalOpen = false}
		role="presentation"
	>
		<div 
			class="bg-white w-full max-w-sm rounded-[48px] p-8 flex flex-col items-center gap-8 shadow-2xl cursor-default"
			transition:scale={{ duration: 300, start: 0.9 }}
			onclick={e => e.stopPropagation()}
			role="presentation"
		>
			<div class="flex flex-col items-center gap-2">
				<h2 class="text-xl font-black italic tracking-tighter text-black">Momotime QR</h2>
				<p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Scan to follow @{user?.handle_id}</p>
			</div>

			<div class="relative w-64 h-64 bg-gray-50 rounded-[40px] p-8 border-2 border-dashed border-gray-100 flex items-center justify-center">
				{#if qrCodeDataUrl}
					<img src={qrCodeDataUrl} alt="QR Code" class="w-full h-full object-contain mix-blend-multiply" />
				{:else}
					<div class="animate-pulse text-gray-300">
						<QrCode size={48} />
					</div>
				{/if}
			</div>

			<div class="flex flex-col w-full gap-3">
				<button 
					class="w-full py-4 rounded-[24px] bg-black text-white font-bold text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
					onclick={copyShareLink}
				>
					<Copy size={16} />
					URLをコピー
				</button>
				<button 
					class="w-full py-4 rounded-[24px] bg-gray-100 text-gray-500 font-bold text-sm active:scale-95 transition-all text-center"
					onclick={() => isQrModalOpen = false}
				>
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}
