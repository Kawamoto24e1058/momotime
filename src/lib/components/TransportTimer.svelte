<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Bus } from 'lucide-svelte';
	import { BUS_SCHEDULE_WEEKDAY, BUS_SCHEDULE_HOLIDAY, HOLIDAYS_2026 } from '$lib/constants';

	// 1. Initialize variables with safe defaults (SSR-safe)
	let nextBusTime = $state<Date | null>(null);
	let timeRemaining = $state('--:--');
	let isUrgent = $state(false);
	let scheduleType = $state<string>('');
	let interval: any;

	onMount(() => {
		// 2. Move all calculation logic into onMount to prevent SSR execution
		function getActiveScheduleInfo() {
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const dateStr = `${year}-${month}-${day}`;
			const dayOfWeek = now.getDay();
			
			const isHoliday = HOLIDAYS_2026.includes(dateStr) || dayOfWeek === 0 || dayOfWeek === 6;
			return {
				type: isHoliday ? '休日' : '平日',
				schedule: isHoliday ? BUS_SCHEDULE_HOLIDAY : BUS_SCHEDULE_WEEKDAY
			};
		}

		function findNextBus() {
			const now = new Date();
			const info = getActiveScheduleInfo();
			scheduleType = info.type;
			
			for (const timeStr of info.schedule) {
				const [hours, minutes] = timeStr.split(':').map(Number);
				const busTime = new Date();
				busTime.setHours(hours, minutes, 0, 0);

				if (busTime > now) {
					return busTime;
				}
			}
			return null;
		}

		function updateCountdown() {
			const now = new Date();
			
			// Refresh next bus if current one passed or not set
			if (!nextBusTime || nextBusTime <= now) {
				nextBusTime = findNextBus();
			}

			if (nextBusTime) {
				const diffMs = nextBusTime.getTime() - now.getTime();
				const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
				
				const mins = Math.floor(diffSecs / 60);
				const secs = diffSecs % 60;
				
				timeRemaining = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
				isUrgent = diffSecs < 180; // Red if less than 3 minutes
			} else {
				timeRemaining = '本日の運行は終了しました';
				isUrgent = false;
			}
		}

		// Initial update and start timer
		updateCountdown();
		interval = setInterval(updateCountdown, 1000);

		// 3. Prevent memory leaks with cleanup function
		return () => {
			if (interval) clearInterval(interval);
		};
	});
</script>

<div class="bg-blue-50/50 backdrop-blur-sm border border-blue-100/50 rounded-2xl p-4 shadow-sm flex items-center justify-between transition-all hover:bg-blue-50">
	<div class="flex items-center gap-3">
		<div class="p-2.5 bg-white rounded-xl shadow-sm border border-blue-100 flex items-center justify-center">
			<Bus size={22} class="text-blue-500" strokeWidth={2.5} />
		</div>
		<div class="flex flex-col">
			<div class="flex items-center gap-2 mb-1">
				<span class="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Bus Departure</span>
				{#if scheduleType}
					<span class="px-1.5 py-0.5 rounded-md text-[8px] font-bold {scheduleType === '平日' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}">
						{scheduleType}ダイヤ
					</span>
				{/if}
			</div>
			<h3 class="text-sm font-bold text-gray-800 tracking-tight leading-none">和泉中央駅行き 次のバス</h3>
		</div>
	</div>
	
	<div class="flex flex-col items-end">
		<div class="flex items-center gap-2">
			{#if isUrgent}
				<span class="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
			{/if}
			<span class="font-black transition-colors {isUrgent ? 'text-red-500' : 'text-gray-900'} {timeRemaining.length > 5 ? 'text-sm' : 'text-3xl tabular-nums'}">
				{timeRemaining}
			</span>
		</div>
		<span class="text-[9px] font-bold uppercase {isUrgent ? 'text-red-400 animate-pulse' : 'text-gray-400'} tracking-tighter">
			{isUrgent ? 'Hurry up!' : 'Time Remaining'}
		</span>
	</div>
</div>
