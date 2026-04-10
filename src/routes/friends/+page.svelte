<script lang="ts">
	import { onMount } from 'svelte';
	import { 
		Search, 
		MessageCircle, 
		ChevronRight, 
		Hash,
		QrCode,
		Plus,
		Check,
		Camera,
		ScanLine,
		X,
		Users
	} from 'lucide-svelte';
	import { slide, fly, fade, scale } from 'svelte/transition';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { toasts } from '$lib/stores/toasts';
	import { Html5QrcodeScanner } from 'html5-qrcode';

	let userId = $state<string | null>(null);
	let friends = $state<any[]>([]);
	let freeFriends = $state<any[]>([]);
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let isLoading = $state(true);
	let isScannerOpen = $state(false);
	let scanner: any = null;

	async function fetchData() {
		isLoading = true;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			userId = user.id;

			const { data: followsData, error: followsError } = await supabase
				.from('Follows')
				.select(`
					followed_id,
					Users:followed_id (*)
				`)
				.eq('follower_id', userId);

			if (followsError) throw followsError;
			friends = (followsData || []).map((f: any) => f.Users).filter(Boolean);
			freeFriends = friends.slice(0, 3); 
		} catch (error: any) {
			toasts.add('データの取得に失敗しました', 'error');
		} finally {
			isLoading = false;
		}
	}

	async function startScanner() {
		isScannerOpen = true;
		setTimeout(() => {
			scanner = new Html5QrcodeScanner(
				"reader",
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				/* verbose= */ false
			);
			scanner.render((decodedText: string) => {
				// Check if it's a Momotime URL
				if (decodedText.includes('/user/')) {
					const handle = decodedText.split('/user/').pop();
					if (handle) {
						stopScanner();
						isScannerOpen = false;
						goto(`/user/${handle}`);
					}
				}
			}, (error: any) => {
				// Quietly ignore errors (scanning is an iterative process)
			});
		}, 100);
	}

	function stopScanner() {
		if (scanner) {
			scanner.clear();
			scanner = null;
		}
	}

	async function handleFollow(targetId: string) {
		try {
			const { error } = await supabase
				.from('Follows')
				.insert({ 
					follower_id: userId, 
					followed_id: targetId 
				} as any);

			if (error) throw error;
			toasts.add('フォローしました！', 'success');
			await fetchData();
			await searchUsers(); // Refresh search preview
		} catch (err) {
			toasts.add('フォローに失敗しました', 'error');
		}
	}

	async function searchUsers() {
		if (searchQuery.length < 2) {
			searchResults = [];
			return;
		}

		const { data, error } = await supabase
			.from('Users')
			.select('*')
			.ilike('handle_id', `%${searchQuery.replace('@', '')}%`)
			.neq('id', userId)
			.limit(5);

		if (!error) {
			// Check if already following
			const dataList = data as any[] || [];
			searchResults = dataList.map(u => ({
				...u,
				isFollowing: friends.some(f => f.id === u.id)
			}));
		}
	}

	onMount(fetchData);

	$effect(() => {
		if (searchQuery) searchUsers();
	});
</script>

<div class="flex flex-col gap-8 pb-32">
	<!-- Header with Scanner Button -->
	<header class="flex justify-between items-center px-1">
		<h1 class="text-2xl font-black italic tracking-tighter">Friends</h1>
		<div class="flex gap-2">
			<button 
				class="w-10 h-10 bg-white border border-border rounded-xl flex items-center justify-center text-gray-500 shadow-sm active:scale-95 transition-all"
				onclick={startScanner}
			>
				<QrCode size={20} />
			</button>
			<button 
				class="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
			>
				<Plus size={20} />
			</button>
		</div>
	</header>

	<!-- Search Bar -->
	<div class="relative">
		<Search class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
		<input 
			type="text" 
			placeholder="学籍番号 / IDで検索..." 
			class="w-full bg-white border border-border rounded-2xl py-3 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5 transition-all shadow-sm"
			bind:value={searchQuery}
		/>
	</div>

	<!-- Search Results Preview -->
	{#if searchQuery && searchResults.length > 0}
		<section class="flex flex-col gap-4" in:slide>
			<h2 class="text-xs font-black text-gray-400 uppercase tracking-widest px-1">検索結果</h2>
			<div class="flex flex-col gap-2">
				{#each searchResults as user}
					<div class="flex items-center justify-between p-3 rounded-2xl bg-white border border-border shadow-sm">
						<div class="flex items-center gap-3">
							<img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle_id}`} alt={user.name} class="w-11 h-11 rounded-2xl object-cover bg-gray-50" />
							<div class="flex flex-col">
								<span class="text-sm font-bold leading-tight">{user.name}</span>
								<span class="text-[10px] font-bold text-gray-400 tracking-wider uppercase">@{user.handle_id}</span>
							</div>
						</div>
						
						{#if user.isFollowing}
							<button class="px-4 py-2 bg-gray-50 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-default flex items-center gap-1">
								<Check size={14} />
								Following
							</button>
						{:else}
							<button 
								class="px-5 py-2 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
								onclick={() => handleFollow(user.id)}
							>
								Follow
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Free Now Stories -->
	<section class="flex flex-col gap-4">
		<div class="flex justify-between items-center px-1">
			<h2 class="text-xs font-black text-gray-400 uppercase tracking-widest">今、空きコマの友達</h2>
			<div class="flex items-center gap-1.5">
				<div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
				<span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live</span>
			</div>
		</div>
		<div class="flex gap-4 overflow-x-auto no-scrollbar pb-2">
			{#if freeFriends.length > 0}
				{#each freeFriends as friend}
					<div class="flex flex-col items-center gap-2 shrink-0" in:fly={{ x: 20 }}>
						<div class="relative p-0.5 rounded-[18px] bg-gradient-to-tr from-yellow-400 to-fuchsia-600 shadow-md">
							<div class="p-0.5 bg-white rounded-[16px]">
								<img src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.handle_id}`} alt={friend.name} class="w-14 h-14 rounded-[14px] object-cover" />
							</div>
							<div class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-4 border-white rounded-full"></div>
						</div>
						<span class="text-[10px] font-bold text-gray-600">{friend.name}</span>
					</div>
				{/each}
			{:else}
				<div class="w-full h-20 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl">
					<p class="text-[10px] text-gray-300 font-bold uppercase tracking-widest">No friends free right now</p>
				</div>
			{/if}
		</div>
	</section>

	<!-- Friend List -->
	<section class="flex flex-col gap-4">
		<h2 class="text-xs font-black text-gray-400 uppercase tracking-widest px-1">すべての友達 ({friends.length})</h2>
		<div class="flex flex-col gap-2">
			{#each friends as friend}
				<button 
					class="w-full flex items-center justify-between p-3 rounded-2xl bg-white border border-border shadow-sm group hover:border-black/10 transition-colors cursor-pointer text-left"
					onclick={() => goto(`/user/${friend.handle_id}`)}
				>
					<div class="flex items-center gap-3">
						<img src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.handle_id}`} alt={friend.name} class="w-11 h-11 rounded-2xl object-cover bg-gray-50" />
						<div class="flex flex-col">
							<span class="text-sm font-bold leading-tight">{friend.name}</span>
							<span class="text-[10px] font-bold text-gray-400 tracking-wider uppercase">@{friend.handle_id}</span>
						</div>
					</div>
					<div class="flex gap-2">
						<div class="w-9 h-9 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:bg-black hover:text-white transition-all">
							<MessageCircle size={16} />
						</div>
						<div class="w-9 h-9 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:bg-black hover:text-white transition-all">
							<ChevronRight size={16} />
						</div>
					</div>
				</button>
			{:else}
				<div class="mt-8 flex flex-col items-center gap-4">
					<div class="w-16 h-16 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-200">
						<Users size={32} />
					</div>
					<p class="text-xs font-bold text-gray-300 uppercase tracking-widest">No friends yet</p>
				</div>
			{/each}
		</div>
	</section>
</div>

<!-- QR Scanner Modal -->
{#if isScannerOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex flex-col p-6 w-full h-full cursor-default text-left"
		transition:fade
		onclick={() => { stopScanner(); isScannerOpen = false; }}
		role="presentation"
	>
		<div class="flex justify-between items-center mb-12">
			<div class="flex flex-col">
				<h2 class="text-xl font-black text-white italic tracking-tighter">QR Scanner</h2>
				<p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Scan profile to follow</p>
			</div>
			<div 
				class="w-12 h-12 bg-white/10 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-all cursor-pointer"
				onclick={() => { stopScanner(); isScannerOpen = false; }}
				role="button"
				tabindex="0"
			>
				<X size={24} />
			</div>
		</div>

		<div class="flex-1 flex flex-col items-center justify-center gap-12">
			<div 
				class="relative w-full max-w-sm aspect-square bg-white/5 rounded-[48px] overflow-hidden border-2 border-white/10 shadow-2xl cursor-default"
				onclick={(e) => e.stopPropagation()}
				role="presentation"
			>
				<div id="reader" class="w-full h-full"></div>
				
				<!-- Scanner Frame Decoration -->
				<div class="absolute inset-0 border-[40px] border-black/20 pointer-events-none flex items-center justify-center">
					<div class="w-64 h-64 border-2 border-white/40 rounded-3xl relative">
						<div class="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
						<div class="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
						<div class="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
						<div class="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
						
						<!-- Scan Animation Line -->
						<div class="absolute inset-x-4 top-0 h-0.5 bg-accent/60 shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] animate-[scan_2s_ease-in-out_infinite]"></div>
					</div>
				</div>
			</div>

			<div class="flex flex-col items-center gap-4">
				<div class="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/10">
					<Camera size={14} class="text-gray-400" />
					<span class="text-[10px] font-bold text-white uppercase tracking-widest">Camera Active</span>
				</div>
				<p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest text-center max-w-[200px]">
					Position the QR code inside the frame to scan
				</p>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes scan {
		0%, 100% { transform: translateY(20px); opacity: 0; }
		10% { opacity: 1; }
		90% { opacity: 1; }
		100% { transform: translateY(230px); opacity: 0; }
	}
	
	:global(#reader video) {
		object-fit: cover !important;
	}
	
	:global(#reader__dashboard) {
		display: none !important;
	}
	
	:global(#reader__header_message) {
		display: none !important;
	}

	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
