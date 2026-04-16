<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Html5Qrcode } from 'html5-qrcode';
	import { Camera, ScanLine, AlertCircle } from 'lucide-svelte';

	let { onScanSuccess } = $props<{
		onScanSuccess: (decodedText: string) => void;
	}>();

	let scanner: Html5Qrcode | null = null;
	let isCameraActive = $state(false);
	let errorMessage = $state<string | null>(null);

	async function startCamera() {
		errorMessage = null;
		isCameraActive = true;
		
		// Wait for DOM to update and #qr-reader to be present
		setTimeout(async () => {
			try {
				scanner = new Html5Qrcode("qr-reader");
				
				const config = { 
					fps: 10, 
					qrbox: { width: 250, height: 250 },
					aspectRatio: 1.0,
				};

				const onSuccess = (decodedText: string) => {
					onScanSuccess(decodedText);
				};

				const onFailure = (errorMessage: string) => {
					// Quietly ignore scan errors
				};

				try {
					// Try exact environment camera first (typically back camera)
					await scanner.start(
						{ facingMode: { exact: "environment" } },
						config,
						onSuccess,
						onFailure
					);
				} catch (err) {
					console.warn("Exact environment camera failed, trying fallback", err);
					// Fallback if exact match fails
					await scanner.start(
						{ facingMode: "environment" },
						config,
						onSuccess,
						onFailure
					);
				}
			} catch (err: any) {
				console.error("Camera start failed", err);
				isCameraActive = false;
				if (err.includes("NotAllowedError") || err.toLowerCase().includes("permission")) {
					errorMessage = "カメラへのアクセスが拒否されました。ブラウザの設定から許可してください。";
				} else {
					errorMessage = `カメラの起動に失敗しました: ${err}`;
				}
			}
		}, 100);
	}

	async function stopCamera() {
		if (scanner) {
			try {
				if (scanner.isScanning) {
					await scanner.stop();
				}
			} catch (e) {
				console.error("Error stopping scanner", e);
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

	{#if errorMessage}
		<div class="w-full mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
			<AlertCircle size={20} class="text-red-500 shrink-0 mt-0.5" />
			<div class="flex flex-col gap-1">
				<p class="text-xs font-bold text-red-600 leading-tight">{errorMessage}</p>
				<button 
					class="text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-red-500 text-left mt-1"
					onclick={() => errorMessage = null}
				>
					閉じる
				</button>
			</div>
		</div>
	{/if}

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
		<div class="relative w-full overflow-hidden rounded-[40px] bg-black shadow-inner aspect-square">
			<div id="qr-reader" class="w-full h-full"></div>
			
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
		width: 100% !important;
		height: 100% !important;
		object-fit: cover !important;
		border-radius: 40px !important;
	}
</style>
