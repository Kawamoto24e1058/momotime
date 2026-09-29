<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { toasts } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';
	import { Mail, Lock, User, AtSign, Loader2 } from 'lucide-svelte';
	import { slide, scale } from 'svelte/transition';

	let mode = $state<'login' | 'signup' | 'reset'>('login');
	let email = $state('');
	let password = $state('');
	let fullName = $state('');
	let handleId = $state('');
	let loading = $state(false);
	let notice = $state('');

	const inputClass =
		'w-full bg-gray-50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all';

	// Supabase の英語エラーを日本語に
	function toJapanese(error: any): string {
		const msg: string = error?.message ?? '';
		const code: string = error?.code ?? '';
		if (code === 'invalid_credentials' || msg.includes('Invalid login credentials'))
			return 'メールアドレスまたはパスワードが間違っています';
		if (code === 'email_not_confirmed' || msg.includes('Email not confirmed'))
			return 'メールアドレスの確認が完了していません。届いたメールのリンクを開いてください';
		if (code === 'user_already_exists' || msg.includes('already registered'))
			return 'このメールアドレスは既に登録されています。ログインしてください';
		if (code === 'weak_password' || msg.includes('Password should be'))
			return 'パスワードは6文字以上にしてください';
		if (code === 'over_email_send_rate_limit' || msg.includes('rate limit'))
			return '短時間に操作しすぎました。少し時間をおいてから再度お試しください';
		if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
			return '通信に失敗しました。電波の良い場所で再度お試しください';
		if (msg.includes('Unable to validate email') || code === 'email_address_invalid')
			return 'メールアドレスの形式が正しくありません';
		return msg || 'エラーが発生しました';
	}

	async function ensureUserRow(user: { id: string; user_metadata?: any }) {
		const { data: existingUser } = await supabase.from('Users').select('id').eq('id', user.id).maybeSingle();
		if (existingUser) return;

		const { error } = await (supabase.from('Users') as any).insert({
			id: user.id,
			name: user.user_metadata?.full_name || 'User',
			handle_id: user.user_metadata?.handle_id || `user_${user.id.slice(0, 8)}`
		});
		if (error) console.error('Failed to create Users row:', error);
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;
		notice = '';
		email = email.trim();

		if (mode === 'reset') return sendResetMail();

		if (mode === 'signup') {
			const handle = handleId.trim().replace(/^@/, '');
			if (!fullName.trim()) return toasts.add('名前を入力してください', 'error');
			if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle))
				return toasts.add('ユーザーIDは半角英数字と_で3〜20文字にしてください', 'error');
			if (password.length < 6) return toasts.add('パスワードは6文字以上にしてください', 'error');

			loading = true;
			try {
				const { data: taken } = await supabase.from('Users').select('id').eq('handle_id', handle).maybeSingle();
				if (taken) throw new Error('このユーザーIDは既に使われています');

				const { data, error } = await supabase.auth.signUp({
					email,
					password,
					options: {
						data: { full_name: fullName.trim(), handle_id: handle },
						emailRedirectTo: `${location.origin}/`
					}
				});
				if (error) throw error;

				// メール確認が有効な場合 session は null。Users 行は初回ログイン時に作る
				if (data.session && data.user) {
					await ensureUserRow(data.user);
					toasts.add('登録が完了しました！', 'success');
					goto('/');
				} else {
					notice = `${email} に確認メールを送信しました。メール内のリンクを開いてからログインしてください。`;
					mode = 'login';
					password = '';
				}
			} catch (error: any) {
				toasts.add(toJapanese(error), 'error');
			} finally {
				loading = false;
			}
			return;
		}

		loading = true;
		try {
			const { data, error } = await supabase.auth.signInWithPassword({ email, password });
			if (error) throw error;
			if (data.user) await ensureUserRow(data.user);
			toasts.add('おかえりなさい！', 'success');
			goto('/');
		} catch (error: any) {
			toasts.add(toJapanese(error), 'error');
		} finally {
			loading = false;
		}
	}

	async function sendResetMail() {
		if (!email) return toasts.add('メールアドレスを入力してください', 'error');
		loading = true;
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${location.origin}/reset-password`
			});
			if (error) throw error;
			notice = `${email} にパスワード再設定用のメールを送信しました。`;
			mode = 'login';
		} catch (error: any) {
			toasts.add(toJapanese(error), 'error');
		} finally {
			loading = false;
		}
	}

	function switchMode(next: typeof mode) {
		mode = next;
		notice = '';
	}
</script>

<div class="flex flex-col items-center justify-center min-h-[80vh] gap-8">
	<div class="flex flex-col items-center gap-2">
		<h1 class="text-4xl font-extrabold tracking-tighter italic">Momotime</h1>
		<p class="text-gray-400 text-sm font-medium">Capture your student life.</p>
	</div>

	<form
		class="w-full max-w-sm flex flex-col gap-4 bg-white p-8 rounded-[40px] border border-border shadow-md"
		in:scale
		onsubmit={handleSubmit}
	>
		{#if notice}
			<p class="text-xs font-medium text-green-700 bg-green-50 rounded-2xl p-3 leading-relaxed" transition:slide>
				{notice}
			</p>
		{/if}

		{#if mode === 'reset'}
			<p class="text-xs text-gray-500 leading-relaxed">
				登録したメールアドレスを入力してください。パスワード再設定用のリンクを送ります。
			</p>
		{/if}

		{#if mode === 'signup'}
			<div class="relative group" transition:slide>
				<User class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
				<input type="text" placeholder="名前" autocomplete="name" class={inputClass} bind:value={fullName} />
			</div>
			<div class="relative group" transition:slide>
				<AtSign class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
				<input
					type="text"
					placeholder="ユーザーID（半角英数字）"
					autocomplete="username"
					autocapitalize="off"
					class={inputClass}
					bind:value={handleId}
				/>
			</div>
		{/if}

		<div class="relative group">
			<Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
			<input
				type="email"
				placeholder="メールアドレス"
				autocomplete="email"
				autocapitalize="off"
				required
				class={inputClass}
				bind:value={email}
			/>
		</div>

		{#if mode !== 'reset'}
			<div class="relative group">
				<Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
				<input
					type="password"
					placeholder="パスワード（6文字以上）"
					autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
					required
					minlength="6"
					class={inputClass}
					bind:value={password}
				/>
			</div>
		{/if}

		<button
			type="submit"
			class="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm shadow-xl shadow-black/10 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
			disabled={loading}
		>
			{#if loading}
				<Loader2 class="animate-spin" size={18} />
			{:else}
				{mode === 'login' ? 'ログイン' : mode === 'signup' ? '新規登録' : '再設定メールを送る'}
			{/if}
		</button>

		<div class="flex items-center gap-4 my-2">
			<div class="flex-1 h-[1px] bg-gray-100"></div>
			<span class="text-[10px] font-bold text-gray-300 uppercase tracking-widest">OR</span>
			<div class="flex-1 h-[1px] bg-gray-100"></div>
		</div>

		<button
			type="button"
			class="w-full py-3.5 bg-white text-black border border-border rounded-2xl font-bold text-sm hover:bg-gray-50 transition-colors"
			onclick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
		>
			{mode === 'login' ? 'アカウントを作成' : 'ログインに戻る'}
		</button>
	</form>

	{#if mode === 'login'}
		<p class="text-xs text-gray-400 font-medium tracking-tight">
			パスワードを忘れた場合は
			<button type="button" class="text-black font-bold" onclick={() => switchMode('reset')}>こちら</button>
		</p>
	{/if}
</div>
