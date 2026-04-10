<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '$lib/supabaseClient';
	import { fade, slide, scale } from 'svelte/transition';
	import { Users, Check, Plus, MessageCircle, ChevronLeft, Calendar } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';

	let handle = $derived(page.params.handle);
	let targetUser = $state<any>(null);
	let currentUserId = $state<string | null>(null);
	let isFollowing = $state(false);
	let isLoading = $state(true);
	let stats = $state({ classes: 0, following: 0 });

	async function fetchUser() {
		isLoading = true;
		try {
			const { data: { user: authUser } } = await supabase.auth.getUser();
			currentUserId = authUser?.id || null;

			if (!handle) throw new Error('Handle not found');

			// Fetch target user
			const { data: userData, error: userError } = await supabase
				.from('Users')
				.select('*')
				.eq('handle_id', handle as string)
				.single() as any;

			if (userError) throw userError;
			targetUser = userData;

			// Check following status
			if (currentUserId && targetUser) {
				const { data: followData } = await supabase
					.from('Follows')
					.select('*')
					.eq('follower_id', currentUserId)
					.eq('followed_id', targetUser.id)
					.maybeSingle();
				
				isFollowing = !!followData;
			}

			// Fetch stats
			const [classesCount, followsCount] = await Promise.all([
				supabase.from('User_Classes').select('*', { count: 'exact', head: true }).eq('user_id', targetUser.id),
				supabase.from('Follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetUser.id)
			]);

			stats = {
				classes: classesCount.count || 0,
				following: followsCount.count || 0
			};
		} catch (err) {
			console.error(err);
			toasts.add('ユーザーが見つかりませんでした', 'error');
			goto('/friends');
		} finally {
			isLoading = false;
		}
	}

	async function handleFollow() {
		if (!currentUserId) {
			goto('/login');
			return;
		}

		try {
			if (isFollowing) {
				await supabase
					.from('Follows')
					.delete()
					.eq('follower_id', currentUserId)
					.eq('followed_id', targetUser.id as any);
				isFollowing = false;
				toasts.add('フォローを解除しました', 'success');
			} else {
				await supabase
					.from('Follows')
					.insert({
						follower_id: currentUserId,
						followed_id: targetUser.id
					} as any);
				isFollowing = true;
				toasts.add('フォローしました！', 'success');
			}
		} catch (err) {
			toasts.add('操作に失敗しました', 'error');
		}
	}

	onMount(fetchUser);
</script>

<div class="flex flex-col gap-6 min-h-screen pb-20">
	<!-- Top Bar -->
	<div class="flex items-center justify-between px-1">
		<button 
			class="w-10 h-10 flex items-center justify-center bg-white border border-border rounded-xl shadow-sm text-gray-500 active:scale-95 transition-all"
			onclick={() => history.back()}
		>
			<ChevronLeft size={20} />
		</button>
		<h1 class="text-sm font-black uppercase tracking-widest text-gray-400">User Profile</h1>
		<div class="w-10"></div>
	</div>

	{#if isLoading}
		<div class="flex-1 flex items-center justify-center">
			<div class="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
		</div>
	{:else if targetUser}
		<!-- Profile Card -->
		<section class="flex flex-col items-center gap-6 mt-4">
			<div class="relative">
				<div class="w-32 h-32 rounded-[44px] p-1.5 bg-gradient-to-tr from-yellow-400 to-fuchsia-600 shadow-xl">
					<div class="bg-white rounded-[39px] p-1 h-full w-full overflow-hidden">
						<img 
							src={targetUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.handle_id}`} 
							alt={targetUser.name} 
							class="w-full h-full rounded-[35px] object-cover"
						/>
					</div>
				</div>
				{#if isFollowing}
					<div class="absolute -bottom-2 -right-2 w-10 h-10 bg-green-500 text-white rounded-2xl shadow-lg border-4 border-white flex items-center justify-center" in:scale>
						<Check size={20} />
					</div>
				{/if}
			</div>

			<div class="flex flex-col items-center gap-1">
				<h2 class="text-2xl font-black tracking-tighter">{targetUser.name}</h2>
				<p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">@{targetUser.handle_id}</p>
			</div>

			<!-- Stats -->
			<div class="flex gap-4 w-full px-4">
				<div class="flex-1 bg-white border border-border p-4 rounded-[28px] flex flex-col items-center gap-1 shadow-sm">
					<span class="text-xl font-black">{stats.classes}</span>
					<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Classes</span>
				</div>
				<div class="flex-1 bg-white border border-border p-4 rounded-[28px] flex flex-col items-center gap-1 shadow-sm">
					<span class="text-xl font-black">{stats.following}</span>
					<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Following</span>
				</div>
			</div>

			<div class="flex gap-3 w-full px-4 mt-2">
				<button 
					class="flex-1 py-4 rounded-[24px] font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 {isFollowing ? 'bg-gray-100 text-gray-500' : 'bg-black text-white'}"
					onclick={handleFollow}
				>
					{#if isFollowing}
						<Check size={16} />
						Following
					{:else}
						<Plus size={16} />
						Follow
					{/if}
				</button>
				<button class="w-14 h-14 bg-white border border-border rounded-[24px] flex items-center justify-center text-gray-400 shadow-sm active:scale-95 transition-all">
					<MessageCircle size={20} />
				</button>
			</div>
		</section>

		<!-- Timetable Peek (Future feature) -->
		<section class="flex flex-col gap-4 mt-8 px-4">
			<div class="flex justify-between items-center px-1">
				<h2 class="text-xs font-black text-gray-400 uppercase tracking-widest">Schedule Preview</h2>
				<span class="px-2 py-0.5 bg-gray-100 rounded-full text-[8px] font-black text-gray-400 uppercase tracking-widest">Private</span>
			</div>
			
			<div class="bg-gray-50 border-2 border-dashed border-gray-100 rounded-[32px] p-8 flex flex-col items-center gap-3 text-center">
				<div class="w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center text-gray-200">
					<Calendar size={24} />
				</div>
				<p class="text-[10px] font-bold text-gray-400 uppercase leading-relaxed max-w-[150px]">
					TimeTable is only visible to <br/> approved friends.
				</p>
			</div>
		</section>
	{/if}
</div>
