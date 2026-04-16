<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Bell } from 'lucide-svelte';
	import { supabase } from '$lib/supabaseClient';
	import { fade, scale } from 'svelte/transition';
	import NotificationList from './NotificationList.svelte';

	let { userId } = $props<{ userId: string }>();

	let notifications = $state<any[]>([]);
	let unreadCount = $derived(notifications.filter(n => !n.is_read).length);
	let isListOpen = $state(false);
	let channel: any;

	async function fetchNotifications() {
		if (!userId) return;
		const { data, error } = await supabase
			.from('Notifications')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(20);
		
		if (!error) {
			notifications = data;
		}
	}

	function setupSubscription() {
		if (!userId) return;
		
		channel = supabase
			.channel(`user-notifications-${userId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'Notifications',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					console.log('Notification change received:', payload);
					if (payload.eventType === 'INSERT') {
						notifications = [payload.new, ...notifications];
						// Vibrate if supported
						if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
					} else if (payload.eventType === 'UPDATE') {
						notifications = notifications.map(n => 
							n.id === payload.new.id ? payload.new : n
						);
					} else if (payload.eventType === 'DELETE') {
						notifications = notifications.filter(n => n.id === payload.old.id);
					}
				}
			)
			.subscribe();
	}

	onMount(() => {
		fetchNotifications();
		setupSubscription();
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="relative">
	<button 
		class="p-2.5 rounded-2xl bg-white border border-border shadow-sm hover:bg-gray-50 transition-colors relative"
		onclick={() => isListOpen = !isListOpen}
		aria-label="Notifications"
	>
		<Bell size={20} class={unreadCount > 0 ? 'text-accent' : 'text-gray-400'} />
		
		{#if unreadCount > 0}
			<span 
				class="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-white shadow-sm"
				transition:scale
			>
				{unreadCount > 9 ? '9+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if isListOpen}
		<NotificationList 
			{userId} 
			bind:notifications 
			onClose={() => isListOpen = false} 
		/>
	{/if}
</div>
