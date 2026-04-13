<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';
	import { AD_LIST } from '$lib/constants';
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';

	let currentIndex = $state(0);
	let imgError = $state(false);
	let interval: any;

	onMount(() => {
		// Start with a random ad
		currentIndex = Math.floor(Math.random() * AD_LIST.length);

		// Rotate every 8 seconds
		interval = setInterval(() => {
			currentIndex = (currentIndex + 1) % AD_LIST.length;
			imgError = false; // Reset error on change
		}, 8000);
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});

	const ad = $derived(AD_LIST[currentIndex]);
</script>

<div class="relative h-20 w-full">
	{#key currentIndex}
		<div 
			class="absolute inset-0 w-full"
			in:fade={{ duration: 400, delay: 200 }}
			out:fade={{ duration: 300 }}
		>
			<a 
				href={ad.href} 
				class="relative flex items-center bg-white border border-gray-100 p-3 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] group no-underline h-full"
				target="_blank"
				rel="noopener noreferrer"
			>
				<!-- PR Badge -->
				<span class="absolute top-2 right-3 text-[7px] font-black text-gray-300 uppercase tracking-widest">PR</span>

				<!-- Thumbnail -->
				<div class="w-14 h-14 shrink-0 bg-gray-50 rounded-xl overflow-hidden border border-gray-50 text-[10px] flex items-center justify-center text-gray-400">
					<img 
						src={imgError ? "https://placehold.co/200x200?text=Item" : ad.imgSrc} 
						alt={ad.title} 
						class="w-full h-full object-cover"
						referrerpolicy="no-referrer"
						onerror={() => (imgError = true)}
					/>
				</div>

				<!-- Content -->
				<div class="flex-1 ml-3 min-w-0">
					<h4 class="text-[11px] font-bold text-gray-900 leading-tight line-clamp-1">{ad.title}</h4>
					<p class="text-[9px] text-gray-500 font-medium leading-normal line-clamp-2 mt-0.5">{ad.description}</p>
				</div>

				<!-- Action -->
				<div class="ml-2 pr-1">
					<div class="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-black group-hover:text-white transition-colors">
						<ChevronRight size={14} />
					</div>
				</div>
			</a>
		</div>
	{/key}
</div>
