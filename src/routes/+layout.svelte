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

	// ログインしていなくても開けるページ
	const publicPaths = ['/login', '/reset-password'];
	const isPublic = $derived(publicPaths.includes(page.url.pathname));

	function redirectIfNeeded() {
		const path = page.url.pathname;
		if (!session && !publicPaths.includes(path)) {
			goto('/login', { replaceState: true });
		} else if (session && path === '/login') {
			goto('/', { replaceState: true });
		}
	}

	onMount(() => {
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
			session = newSession;
			if (event === 'PASSWORD_RECOVERY') {
				goto('/reset-password', { replaceState: true });
				return;
			}
			if (isInitialized) redirectIfNeeded();
		});

		const init = async () => {
			try {
				const { data, error } = await supabase.auth.getSession();
				if (error) throw error;
				session = data.session;
			} catch (error) {
				// 保存されたトークンが壊れている/期限切れ (Invalid Refresh Token 等) だと
				// 起動画面のまま固まっていたので、ローカルのセッションを破棄してログイン画面へ
				console.warn('Session restore failed:', error);
				await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
				session = null;
			} finally {
				isInitialized = true;
				redirectIfNeeded();
			}
		};

		init();

		return () => subscription.unsubscribe();
	});

	const navItems = [
		{ href: '/', icon: CalendarDays, label: '時間割' },
		{ href: '/tasks', icon: CheckSquare, label: 'タスク' },
		{ href: '/friends', icon: Users, label: '友達' },
		{ href: '/profile', icon: User, label: 'マイページ' }
	];
</script>

<div class="min-h-screen bg-secondary pb-48">
	<ToastContainer />
	
	{#if isInitialized && (session || isPublic)}
		{#key page.url.pathname}
			<main 
				class="max-w-xl mx-auto px-4 pt-4 pb-12"
				in:fade={{ duration: 200, delay: 100 }}
				out:fade={{ duration: 100 }}
			>
				{@render children()}
			</main>
		{/key}

		{#if !isPublic}
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
