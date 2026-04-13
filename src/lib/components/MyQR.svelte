<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { QrCode, ScanFace } from 'lucide-svelte';

	let { handleId = "momo-user-001", size = 250 } = $props<{
		handleId?: string;
		size?: number;
	}>();

	let qrCodeDataUrl = $state('');

	onMount(async () => {
		try {
			// Prepend domain if needed, or just let the scanner parse user/xxx
			const url = `${window.location.origin}/user/${handleId}`;
			qrCodeDataUrl = await QRCode.toDataURL(url, {
				width: size,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff'
				}
			});
		} catch (err) {
			console.error('Failed to generate QR code', err);
		}
	});
</script>

<div class="flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-[48px] shadow-sm w-full max-w-sm mx-auto">
	<div class="flex flex-col items-center gap-1 mb-8">
		<h2 class="text-xl font-black italic tracking-tighter text-black flex items-center gap-2">
			<QrCode size={24} />
			My QR
		</h2>
		<p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center mt-1">
			Scan to follow @{handleId}
		</p>
	</div>

	<div class="relative w-full aspect-square bg-gray-50 rounded-[40px] p-6 border-2 border-dashed border-gray-100 flex items-center justify-center">
		{#if qrCodeDataUrl}
			<img src={qrCodeDataUrl} alt="My QR Code" class="w-full h-full object-contain mix-blend-multiply" />
		{:else}
			<div class="animate-pulse text-gray-300">
				<ScanFace size={48} />
			</div>
		{/if}
	</div>

	<div class="mt-8 px-6 py-3 bg-gray-50 rounded-2xl border border-gray-100">
		<p class="text-xs font-bold text-gray-500 text-center">
			友達にこの画面をスキャンしてもらおう！
		</p>
	</div>
</div>
