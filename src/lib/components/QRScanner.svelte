<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Html5QrcodeScanner } from 'html5-qrcode';
	import { Camera, ScanLine } from 'lucide-svelte';

	let { onScanSuccess } = $props<{
		onScanSuccess: (decodedText: string) => void;
	}>();

	let scanner: Html5QrcodeScanner | null = null;
	let isCameraActive = $state(false);

	function startCamera() {
		isCameraActive = true;
		// Initialize the scanner after the DOM updates to show the #reader element
		setTimeout(() => {
			scanner = new Html5QrcodeScanner(
				"qr-reader",
				{ 
					fps: 10, 
					qrbox: { width: 250, height: 250 },
					aspectRatio: 1.0,
					showTorchButtonIfSupported: true
				},
				/* verbose= */ false
			);
			
			scanner.render(
				(decodedText) => {
					// Add a slight delay or just call immediately
					onScanSuccess(decodedText);
				}, 
				(error) => {
					// Quietly ignore errors (scanning is an iterative process)
				}
			);
		}, 50);
	}

	function stopCamera() {
		if (scanner) {
			try {
				scanner.clear();
			} catch (e) {
				console.error("Error clearing scanner", e);
			}
			scanner = null;
		}
		isCameraActive = false;
	}

	onDestroy(() => {
		stopCamera();
	});
</script>

<div class="flex flex-col items-center justify-center p-6 bg-white border border-gray-100 rounded-[48px] shadow-sm w-full max-w-sm mx-auto">
	<div class="flex flex-col items-center gap-1 mb-8">
		<h2 class="text-xl font-black italic tracking-tighter text-black flex items-center gap-2">
			<ScanLine size={24} />
			QR Scan
		</h2>
		<p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center mt-1">
			Scan a friend's profile
		</p>
	</div>

	{#if !isCameraActive}
		<div class="w-full aspect-square bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-6 p-8">
			<div class="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-400">
				<Camera size={32} />
			</div>
			
			<button 
				class="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 hover:bg-gray-900"
				onclick={startCamera}
			>
				カメラを起動する
			</button>
			<p class="text-[10px] text-gray-400 font-medium text-center leading-relaxed">
				カメラへのアクセスを許可して、<br/>友達のQRコードを読み取ってください
			</p>
		</div>
	{:else}
		<div class="relative w-full overflow-hidden rounded-[40px] bg-black shadow-inner">
			<div id="qr-reader" class="w-full"></div>
			
			<!-- Scanner Decorative Frame -->
			<div class="absolute inset-0 border-[24px] border-black/30 pointer-events-none flex items-center justify-center z-10">
				<div class="w-56 h-56 border-2 border-white/50 rounded-3xl relative">
					<div class="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
					<div class="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
					<div class="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
					<div class="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
					
					<!-- Scan Animation Line -->
					<div class="absolute inset-x-4 top-0 h-[2px] bg-accent/80 shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
				</div>
			</div>
		</div>

		<button 
			class="mt-6 px-6 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
			onclick={stopCamera}
		>
			キャンセル
		</button>
	{/if}
</div>

<style>
	@keyframes scan {
		0%, 100% { transform: translateY(10px); opacity: 0; }
		10% { opacity: 1; }
		90% { opacity: 1; }
		100% { transform: translateY(200px); opacity: 0; }
	}
	
	:global(#qr-reader video) {
		object-fit: cover !important;
		border-radius: 40px !important;
	}
	
	:global(#qr-reader__dashboard) {
		display: none !important;
	}
	
	:global(#qr-reader__header_message) {
		display: none !important;
	}
</style>
