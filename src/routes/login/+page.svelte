<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { toasts } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';
	import { Mail, Lock, User, AtSign, Loader2 } from 'lucide-svelte';
	import { fade, slide, scale } from 'svelte/transition';

	let mode = $state<'login' | 'signup'>('login');
	let email = $state('');
	let password = $state('');
	let fullName = $state('');
	let handleId = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		loading = true;
		try {
			if (mode === 'signup') {
				const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
					email,
					password,
					options: {
						data: {
							full_name: fullName,
							handle_id: handleId.replace('@', '')
						}
					}
				});

				if (signUpError) throw signUpError;

				// Ensure record exists in public.Users
				if (signUpData.user) {
					await (supabase.from('Users') as any).upsert({
						id: signUpData.user.id,
						name: fullName,
						handle_id: handleId.replace('@', '')
					}, { onConflict: 'id' });
				}

				toasts.add('サインアップに成功しました！', 'success');
				const { data: { session } } = await supabase.auth.getSession();
				if (session) goto('/');
				else mode = 'login';
			} else {
				const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
					email,
					password
				});
				if (signInError) throw signInError;

				// Ensure record exists even on login (in case trigger was missed)
				if (signInData.user) {
					const { data: existingUser } = await supabase
						.from('Users')
						.select('id')
						.eq('id', signInData.user.id)
						.single();
					
					if (!existingUser) {
						await (supabase.from('Users') as any).insert({
							id: signInData.user.id,
							name: signInData.user.user_metadata?.full_name || 'User',
							handle_id: signInData.user.user_metadata?.handle_id || `user_${signInData.user.id.slice(0, 8)}`
						});
					}
				}

				toasts.add('おかえりなさい！', 'success');
				goto('/');
			}
		} catch (error: any) {
			toasts.add(error.message, 'error');
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex flex-col items-center justify-center min-h-[80vh] gap-8">
	<div class="flex flex-col items-center gap-2">
		<h1 class="text-4xl font-extrabold tracking-tighter italic">Momotime</h1>
		<p class="text-gray-400 text-sm font-medium">Capture your student life.</p>
	</div>

	<div class="w-full max-w-sm flex flex-col gap-4 bg-white p-8 rounded-[40px] border border-border shadow-md" in:scale>
		{#if mode === 'signup'}
			<div class="relative group" transition:slide>
				<User class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
				<input 
					type="text" 
					placeholder="Full Name" 
					class="w-full bg-gray-50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
					bind:value={fullName}
				/>
			</div>
			<div class="relative group" transition:slide>
				<AtSign class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
				<input 
					type="text" 
					placeholder="Handle (@name)" 
					class="w-full bg-gray-50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
					bind:value={handleId}
				/>
			</div>
		{/if}

		<div class="relative group">
			<Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
			<input 
				type="email" 
				placeholder="Email address" 
				class="w-full bg-gray-50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
				bind:value={email}
			/>
		</div>

		<div class="relative group">
			<Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
			<input 
				type="password" 
				placeholder="Password" 
				class="w-full bg-gray-50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
				bind:value={password}
			/>
		</div>

		<button 
			class="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm shadow-xl shadow-black/10 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
			onclick={handleSubmit}
			disabled={loading}
		>
			{#if loading}
				<Loader2 class="animate-spin" size={18} />
			{:else}
				{mode === 'login' ? 'Log In' : 'Sign Up'}
			{/if}
		</button>

		<div class="flex items-center gap-4 my-2">
			<div class="flex-1 h-[1px] bg-gray-100"></div>
			<span class="text-[10px] font-bold text-gray-300 uppercase tracking-widest">OR</span>
			<div class="flex-1 h-[1px] bg-gray-100"></div>
		</div>

		<button 
			class="w-full py-3.5 bg-white text-black border border-border rounded-2xl font-bold text-sm hover:bg-gray-50 transition-colors"
			onclick={() => mode = mode === 'login' ? 'signup' : 'login'}
		>
			{mode === 'login' ? 'Create new account' : 'Back to Login'}
		</button>
	</div>

	<p class="text-xs text-gray-400 font-medium tracking-tight">
		Forgot password? <span class="text-black font-bold cursor-pointer">Get help.</span>
	</p>
</div>
