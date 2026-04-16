<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { Check, UserPlus, BellOff, X } from 'lucide-svelte';
	import { supabase } from '$lib/supabaseClient';
	import { toasts } from '$lib/stores/toasts';

	interface Notification {
		id: string;
		user_id: string;
		type: string;
		from_user_id: string;
		from_user_name: string;
		is_read: boolean;
		created_at: string;
	}

	let { userId, notifications = $bindable([]), onClose } = $props<{
		userId: string;
		notifications: Notification[];
		onClose: () => void;
	}>();

	async function markAsRead(notificationId: string) {
		const { error } = await (supabase
			.from('Notifications') as any)
			.update({ is_read: true })
			.eq('id', notificationId);
		
		if (!error) {
			notifications = notifications.map((n: Notification) => 
				n.id === notificationId ? { ...n, is_read: true } : n
			);
		}
	}

	async function handleFollowBack(notification: Notification) {
		try {
			// 1. Follow the user
			const { error: followError } = await (supabase
				.from('Follows') as any)
				.insert({ 
					follower_id: userId, 
					followed_id: notification.from_user_id 
				} as any);

			if (followError && !followError.message.includes('duplicate')) throw followError;

			// 2. Mark notification as read
			await markAsRead(notification.id);
			
			toasts.add(`${notification.from_user_name}さんをフォローしました！`, 'success');
		} catch (err) {
			console.error(err);
			toasts.add('フォローバックに失敗しました', 'error');
		}
	}

	async function markAllAsRead() {
		const { error } = await (supabase
			.from('Notifications') as any)
			.update({ is_read: true })
			.eq('user_id', userId)
			.eq('is_read', false);
		
		if (!error) {
			notifications = notifications.map((n: Notification) => ({ ...n, is_read: true }));
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-4">
	<div class="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onclick={onClose} transition:fade></div>
	
	<div 
		class="w-full max-w-md bg-white rounded-[32px] shadow-2xl z-10 overflow-hidden flex flex-col max-h-[80vh]"
		transition:slide={{ axis: 'y' }}
	>
		<header class="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-20">
			<div class="flex flex-col">
				<h2 class="text-xl font-black italic tracking-tighter">Notifications</h2>
				<span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">おしらせ</span>
			</div>
			<div class="flex gap-2">
				{#if notifications.some(n => !n.is_read)}
					<button 
						class="text-[10px] font-black uppercase tracking-widest text-accent hover:opacity-70 transition-opacity"
						onclick={markAllAsRead}
					>
						全て読了
					</button>
				{/if}
				<button class="p-2 bg-gray-50 text-gray-400 rounded-full hover:bg-gray-100 transition-colors" onclick={onClose}>
					<X size={18} />
				</button>
			</div>
		</header>

		<div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
			{#each notifications as n (n.id)}
				<div 
					class="p-4 rounded-2xl border transition-all flex flex-col gap-3 {n.is_read ? 'bg-gray-50/50 border-transparent opacity-60' : 'bg-white border-gray-100 shadow-sm'}"
					transition:slide
				>
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0 overflow-hidden">
							<img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${n.from_user_name}`} alt={n.from_user_name} />
						</div>
						<div class="flex-1">
							<p class="text-sm font-bold text-gray-800 leading-tight">
								<span class="text-black">{n.from_user_name}</span>さんがあなたをフォローしました
							</p>
							<span class="text-[10px] font-medium text-gray-400 italic">
								{new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
							</span>
						</div>
						{#if !n.is_read}
							<div class="w-2 h-2 rounded-full bg-accent shrink-0"></div>
						{/if}
					</div>

					{#if !n.is_read}
						<div class="flex gap-2 ml-13">
							<button 
								class="px-4 py-2 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-black/10"
								onclick={() => handleFollowBack(n)}
							>
								<UserPlus size={14} />
								Follow Back
							</button>
							<button 
								class="px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-colors"
								onclick={() => markAsRead(n.id)}
							>
								閉じる
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<div class="py-12 flex flex-col items-center gap-4 text-gray-300">
					<BellOff size={32} />
					<p class="text-xs font-bold uppercase tracking-widest">No notifications</p>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.ml-13 {
		margin-left: 3.25rem;
	}
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #eee;
		border-radius: 10px;
	}
</style>
