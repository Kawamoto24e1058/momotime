<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { toasts } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';
	import { Lock, Loader2 } from 'lucide-svelte';

	let password = $state('');
	let confirm = $state('');
	let loading = $state(false);

	const inputClass =
		'w-full bg-gray-50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all';

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (password.length < 6) return toasts.add('パスワードは6文字以上にしてください', 'error');
		if (password !== confirm) return toasts.add('パスワードが一致しません', 'error');

		loading = true;
		try {
			const { error } = await supabase.auth.updateUser({ password });
			if (error) throw error;
			toasts.add('パスワードを変更しました', 'success');
			goto('/');
		} catch (error: any) {
			toasts.add(
				error?.message?.includes('session')
					? 'リンクの有効期限が切れています。もう一度再設定メールを送ってください'
					: error?.message || 'エラーが発生しました',
				'error'
			);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Momotime | パスワード再設定</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-[80vh] gap-8">
	<h1 class="text-3xl font-extrabold tracking-tighter italic">パスワード再設定</h1>

	<form
		class="w-full max-w-sm flex flex-col gap-4 bg-white p-8 rounded-[40px] border border-border shadow-md"
		onsubmit={handleSubmit}
	>
		<div class="relative group">
			<Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
			<input
				type="password"
				placeholder="新しいパスワード"
				autocomplete="new-password"
				minlength="6"
				required
				class={inputClass}
				bind:value={password}
			/>
		</div>
		<div class="relative group">
			<Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-black transition-colors" size={18} />
			<input
				type="password"
				placeholder="新しいパスワード（確認）"
				autocomplete="new-password"
				minlength="6"
				required
				class={inputClass}
				bind:value={confirm}
			/>
		</div>

		<button
			type="submit"
			class="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
			disabled={loading}
		>
			{#if loading}
				<Loader2 class="animate-spin" size={18} />
			{:else}
				変更する
			{/if}
		</button>
	</form>
</div>
