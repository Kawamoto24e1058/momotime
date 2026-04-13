<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import { 
		CalendarDays, 
		CheckSquare, 
		Users, 
		User 
	} from 'lucide-svelte';
	import PromoBanner from '$lib/components/PromoBanner.svelte';

	let { children } = $props();
	let session = $state<any>(null);
	let isInitialized = $state(false);

	onMount(() => {
		let subscription: any;

		const init = async () => {
			const { data: { session: initialSession } } = await supabase.auth.getSession();
			session = initialSession;
			isInitialized = true;

			const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, newSession) => {
				session = newSession;
				if (!session && page.url.pathname !== '/login') {
					goto('/login');
				} else if (session && page.url.pathname === '/login') {
					goto('/');
				}
			});
			subscription = sub;

			// Initial redirect check
			if (!session && page.url.pathname !== '/login') {
				goto('/login');
			}
		};

		init();

		return () => {
			if (subscription) subscription.unsubscribe();
		};
	});

	const navItems = [
		{ href: '/', icon: CalendarDays, label: '時間割' },
		{ href: '/tasks', icon: CheckSquare, label: 'タスク' },
		{ href: '/friends', icon: Users, label: '友達' },
		{ href: '/profile', icon: User, label: 'マイページ' }
	];
</script>

<div class="min-h-screen bg-secondary pb-36">
	<ToastContainer />
	
	{#if isInitialized}
		{#key page.url.pathname}
			<main 
				class="max-w-xl mx-auto px-4 pt-4 pb-12"
				in:fade={{ duration: 200, delay: 100 }}
				out:fade={{ duration: 100 }}
			>
				{@render children()}
			</main>
		{/key}

		{#if page.url.pathname !== '/login'}
			<div class="fixed bottom-[74px] left-0 right-0 px-4 z-40">
				<div class="max-w-xl mx-auto">
					<PromoBanner />
				</div>
			</div>

			<nav class="nav-bottom">
				{#each navItems as item}
					<a 
						href={item.href} 
						class="nav-item {page.url.pathname === item.href ? 'active' : ''}"
					>
						<item.icon size={24} strokeWidth={page.url.pathname === item.href ? 2.5 : 2} />
						<span class="text-[10px] font-medium">{item.label}</span>
					</a>
				{/each}
			</nav>
		{/if}
	{:else}
		<div class="fixed inset-0 flex items-center justify-center bg-white z-[100]">
			<div class="flex flex-col items-center gap-4">
				<h1 class="text-3xl font-black italic tracking-tighter animate-pulse">Momotime</h1>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
