<script lang="ts">
	import { toasts } from '$lib/stores/toasts';
	import { fade, fly } from 'svelte/transition';
	import { CheckCircle2, AlertCircle, Info } from 'lucide-svelte';

	const icons = {
		success: CheckCircle2,
		error: AlertCircle,
		info: Info
	};

	const colors = {
		success: 'bg-green-50 text-green-800 border-green-100',
		error: 'bg-red-50 text-red-800 border-red-100',
		info: 'bg-blue-50 text-blue-800 border-blue-100'
	};
</script>

<div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-3 w-full max-w-sm px-4">
	{#each $toasts as toast (toast.id)}
		{@const Icon = icons[toast.type]}
		<div
			class="{colors[toast.type]} border p-4 rounded-2xl shadow-xl flex items-center justify-between gap-3"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<div class="flex items-center gap-3">
				<Icon size={20} />
				<p class="text-xs font-bold">{toast.message}</p>
			</div>
			
			{#if toast.actionLabel}
				<button 
					class="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[10px] font-black uppercase tracking-wider backdrop-blur-md transition-colors"
					onclick={() => {
						toast.onAction?.();
						toasts.remove(toast.id);
					}}
				>
					{toast.actionLabel}
				</button>
			{/if}
		</div>
	{/each}
</div>
