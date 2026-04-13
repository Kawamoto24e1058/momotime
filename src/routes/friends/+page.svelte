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
	import MyQR from '$lib/components/MyQR.svelte';
	import QRScanner from '$lib/components/QRScanner.svelte';

	let userId = $state<string | null>(null);
	let friends = $state<any[]>([]);
	let freeFriends = $state<any[]>([]);
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let isLoading = $state(true);
	let currentUserProfile = $state<any>(null); // Store current user for handle_id
	let activeTab = $state<'list' | 'myqr' | 'scan'>('list');

	async function fetchData() {
		isLoading = true;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			userId = user.id;

			const { data: userData, error: userError } = await supabase
				.from('Users')
				.select('*')
				.eq('id', userId)
				.single() as any;
			if (!userError) currentUserProfile = userData;

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

	function handleScanSuccess(decodedText: string) {
		if (decodedText.includes('/user/')) {
			const handle = decodedText.split('/user/').pop();
			if (handle) {
				goto(`/user/${handle}`);
			}
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
				class="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
			>
				<Plus size={20} />
			</button>
		</div>
	</header>

	<!-- Tabs -->
	<div class="flex gap-2 pb-2 overflow-x-auto no-scrollbar scroll-smooth">
		<button
			class="px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap relative {activeTab === 'list' ? 'bg-black text-white shadow-md' : 'bg-white border border-border text-gray-400 hover:border-gray-400'}"
			onclick={() => (activeTab = 'list')}
		>
			友達リスト
		</button>
		<button
			class="px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap relative {activeTab === 'myqr' ? 'bg-black text-white shadow-md' : 'bg-white border border-border text-gray-400 hover:border-gray-400'}"
			onclick={() => (activeTab = 'myqr')}
		>
			マイQRコード
		</button>
		<button
			class="px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap relative flex items-center gap-2 {activeTab === 'scan' ? 'bg-black text-white shadow-md' : 'bg-white border border-border text-gray-400 hover:border-gray-400'}"
			onclick={() => (activeTab = 'scan')}
		>
			<ScanLine size={16} />
			スキャン
		</button>
	</div>

	{#if activeTab === 'list'}

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
	{:else if activeTab === 'myqr'}
		<div in:fade={{ duration: 200 }} class="w-full flex items-center justify-center py-8">
			<MyQR handleId={currentUserProfile?.handle_id || 'momo-user-unknown'} size={220} />
		</div>
	{:else if activeTab === 'scan'}
		<div in:fade={{ duration: 200 }} class="w-full flex items-center justify-center py-8">
			<QRScanner onScanSuccess={handleScanSuccess} />
		</div>
	{/if}
</div>

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
