<script lang="ts">
	import { onMount, flushSync } from 'svelte';
	import { Plus, Bell, MoreHorizontal, Calendar, Info, MapPin, User, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { supabase } from '$lib/supabaseClient';
	import ImageUpload from '$lib/components/ImageUpload.svelte';
	import { toasts } from '$lib/stores/toasts';
	import { fade, slide, fly, scale } from 'svelte/transition';

	const days = ['月', '火', '水', '木', '金', '土'];
	const periods = [1, 2, 3, 4, 5, 6];
	const periodTimes: Record<number, { start: string, end: string }> = {
		1: { start: '09:20', end: '10:50' },
		2: { start: '11:00', end: '12:30' },
		3: { start: '13:20', end: '14:50' },
		4: { start: '15:00', end: '16:30' },
		5: { start: '16:40', end: '18:10' },
		6: { start: '18:20', end: '19:50' }
	};

	// Determine today
	const now = new Date();
	const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0, ..., Sat=5, Sun=6
	const todayIndex = dayOfWeek < 6 ? dayOfWeek : 0; // Default to Mon if Sunday
	const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${days[todayIndex]}）`;

	let userId = $state<string | null>(null);
	let userClasses = $state<any[]>([]);
	let pendingClasses = $state<any[]>([]);
	let selectedDay = $state(todayIndex);
	let viewMode = $state<'daily' | 'weekly'>('daily');
	let isLoading = $state(true);
	let selectedClass = $state<any | null>(null);
	let isEditMode = $state(false);
	const inputClass = 'w-full bg-gray-50 border border-border rounded-2xl py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all';
	let editData = $state({
		name: '',
		room: '',
		teacher: '',
		day_of_week: 0,
		period: 1,
		color: '#f3e8ff',
		is_remote: false
	});
	async function fetchUserClasses() {
		isLoading = true;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			userId = user.id;

			const { data, error } = await supabase
				.from('User_Classes')
				.select(`
					id,
					color,
					Classes (*)
				`)
				.eq('user_id', userId);

			if (error) throw error;
			userClasses = data || [];
		} catch (error: any) {
			toasts.add('データの取得に失敗しました', 'error');
		} finally {
			isLoading = false;
		}
	}

	function openAddModal(day: number, period: number) {
		editData = {
			name: '',
			room: '',
			teacher: '',
			day_of_week: day,
			period: period,
			color: '#f3e8ff',
			is_remote: false
		};
		selectedClass = null;
		isEditMode = true;
	}

	function openEditModal(item: any) {
		selectedClass = item;
		editData = {
			name: item.Classes.name,
			room: item.Classes.room,
			teacher: item.Classes.teacher,
			day_of_week: item.Classes.day_of_week,
			period: item.Classes.period,
			color: item.color,
			is_remote: item.Classes.is_remote
		};
		isEditMode = true;
	}

	async function saveClass() {
		if (!editData.name) {
			toasts.add('授業名を入力してください', 'error');
			return;
		}

		// If editing a pending class, update local state only
		if (selectedClass?.isPending) {
			const index = pendingClasses.findIndex(c => 
				c.day_of_week === selectedClass.Classes.day_of_week && 
				c.period === selectedClass.Classes.period
			);
			if (index !== -1) {
				pendingClasses[index] = {
					...pendingClasses[index],
					name: editData.name,
					room: editData.room,
					teacher: editData.teacher,
					day_of_week: Number(editData.day_of_week),
					period: Number(editData.period),
					is_remote: editData.is_remote,
					color: editData.color
				};
			}
			isEditMode = false;
			selectedClass = null;
			return;
		}

		try {
			// 1. Find or create Class record
			let { data: classData } = await (supabase.from('Classes') as any)
				.select('id')
				.eq('name', editData.name)
				.eq('day_of_week', editData.day_of_week)
				.eq('period', editData.period)
				.maybeSingle();
			
			let classId: string;
			if (classData) {
				classId = (classData as any).id;
				// Update existing class with potentially new room/teacher/is_remote
				const { error: updateError } = await (supabase.from('Classes') as any)
					.update({
						room: editData.room,
						teacher: editData.teacher,
						is_remote: editData.is_remote
					})
					.eq('id', classId);
				if (updateError) throw updateError;
			} else {
				const { data: newClass, error } = await (supabase.from('Classes') as any)
					.insert({
						name: editData.name,
						room: editData.room,
						teacher: editData.teacher,
						day_of_week: editData.day_of_week,
						period: editData.period,
						is_remote: editData.is_remote
					})
					.select()
					.single();
				if (error) throw error;
				classId = (newClass as any).id;
			}

			// 2. Upsert User_Classes
			const { error: linkError } = await (supabase.from('User_Classes') as any)
				.upsert({
					...(selectedClass ? { id: selectedClass.id } : {}),
					user_id: userId,
					class_id: classId,
					color: editData.color
				});
			
			if (linkError) throw linkError;

			toasts.add('保存しました！', 'success');
			isEditMode = false;
			selectedClass = null;
			fetchUserClasses();
		} catch (err: any) {
			toasts.add('保存に失敗しました', 'error');
			console.error(err);
		}
	}

	async function deleteClass() {
		if (!selectedClass) return;

		if (selectedClass.isPending) {
			pendingClasses = pendingClasses.filter(c => 
				!(c.day_of_week === selectedClass.Classes.day_of_week && c.period === selectedClass.Classes.period)
			);
			selectedClass = null;
			isEditMode = false;
			return;
		}

		if (!confirm('この授業を削除してもよろしいですか？')) return;

		try {
			const { error } = await supabase
				.from('User_Classes')
				.delete()
				.eq('id', selectedClass.id);
			
			if (error) throw error;

			toasts.add('削除しました', 'success');
			selectedClass = null;
			isEditMode = false;
			fetchUserClasses();
		} catch (err) {
			toasts.add('削除に失敗しました', 'error');
		}
	}

	function getClass(dayIndex: number, period: number) {
		const pending = pendingClasses.find(
			(c) => c.day_of_week === dayIndex && c.period === period
		);
		if (pending) {
			return {
				isPending: true,
				color: pending.color,
				Classes: {
					name: pending.name,
					room: pending.room,
					teacher: pending.teacher,
					day_of_week: pending.day_of_week,
					period: pending.period,
					is_remote: pending.is_remote
				}
			};
		}

		return userClasses.find(
			(uc) => uc.Classes.day_of_week === dayIndex && uc.Classes.period === period
		);
	}

	function onOCRSuccess(classes: any[]) {
		pendingClasses = classes;
	}

	async function savePendingClasses() {
		if (pendingClasses.length === 0) return;
		isLoading = true;
		try {
			for (const item of pendingClasses) {
				let { data: classData } = await (supabase.from('Classes') as any)
					.select('id')
					.eq('name', item.name)
					.eq('day_of_week', item.day_of_week)
					.eq('period', item.period)
					.maybeSingle();
				
				let classId: string;
				if (classData) {
					classId = (classData as any).id;
					await (supabase.from('Classes') as any).update({
						room: item.room,
						teacher: item.teacher,
						is_remote: item.is_remote
					}).eq('id', classId);
				} else {
					const { data: newClass, error } = await (supabase.from('Classes') as any)
						.insert({
							name: item.name,
							room: item.room,
							teacher: item.teacher,
							day_of_week: item.day_of_week,
							period: item.period,
							is_remote: item.is_remote
						})
						.select()
						.single();
					if (error) throw error;
					classId = (newClass as any).id;
				}

				await (supabase.from('User_Classes') as any)
					.upsert({
						user_id: userId,
						class_id: classId,
						color: item.color
					}, { onConflict: 'user_id, class_id' });
			}
			toasts.add('すべての授業を保存しました！', 'success');
			pendingClasses = [];
			fetchUserClasses();
		} catch (err) {
			toasts.add('保存に失敗しました', 'error');
		} finally {
			isLoading = false;
		}
	}

	function cancelPending() {
		if (confirm('解析結果を破棄してもよろしいですか？')) {
			pendingClasses = [];
		}
	}

	onMount(() => {
		fetchUserClasses();
	});
</script>

<svelte:head>
	<title>Momotime | 時間割</title>
</svelte:head>

<!-- Action Bar for Pending OCR Results -->
{#if pendingClasses.length > 0}
	<div 
		class="sticky top-4 z-50 w-full text-white px-6 py-4 rounded-[28px] shadow-2xl flex items-center justify-between mb-4 border border-white/10 backdrop-blur-md bg-black/90"
		transition:fly={{ y: -20, duration: 400 }}
	>
		<div class="flex flex-col">
			<span class="text-xs font-black uppercase tracking-widest text-accent">Preview Mode</span>
			<span class="text-[10px] font-bold text-gray-400">{pendingClasses.length}件の解析結果をプレビュー中</span>
		</div>
		<div class="flex gap-2">
			<button 
				class="px-4 py-2 bg-white text-black rounded-full text-[10px] font-black uppercase transition-all active:scale-95 shadow-lg shadow-white/10"
				onclick={savePendingClasses}
			>
				保存する
			</button>
			<button 
				class="px-4 py-2 bg-white/10 text-white rounded-full text-[10px] font-black uppercase transition-all hover:bg-white/20 active:scale-95"
				onclick={cancelPending}
			>
				キャンセル
			</button>
		</div>
	</div>
{/if}

<section class="flex flex-col gap-6">
	<!-- Header -->
	<header class="flex items-center justify-between">
		<div class="flex flex-col gap-0.5">
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-bold tracking-tight">TimeTable</h1>
				<button class="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
					<Calendar size={18} />
				</button>
			</div>
			<p class="text-gray-400 text-[10px] font-bold uppercase tracking-wider">{todayStr}</p>
		</div>
		<div class="flex gap-2">
			<button 
				class="p-2.5 rounded-2xl bg-white border border-border shadow-sm hover:bg-gray-50 transition-colors"
				onclick={() => viewMode = viewMode === 'daily' ? 'weekly' : 'daily'}
				aria-label="Toggle view"
			>
				<Calendar size={20} class={viewMode === 'weekly' ? 'text-accent' : 'text-gray-400'} />
			</button>
			<button class="p-2.5 rounded-2xl bg-white border border-border shadow-sm hover:bg-gray-50 transition-colors">
				<Bell size={20} class="text-gray-400" />
			</button>
		</div>
	</header>

	{#if viewMode === 'daily'}
		<!-- Day Selector -->
		<div class="flex gap-2 pb-2 overflow-x-auto no-scrollbar scroll-smooth" in:fade>
			{#each days as day, i}
				<button
					class="px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap relative {selectedDay === i
						? 'bg-black text-white shadow-md'
						: 'bg-white border border-border text-gray-400 hover:border-gray-400'} {i === todayIndex ? 'ring-2 ring-accent ring-offset-2' : ''}"
					onclick={() => (selectedDay = i)}
				>
					{day}曜日
					{#if i === todayIndex}
						<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent border-2 border-white rounded-full"></span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Daily Timetable -->
		<div class="flex flex-col gap-4" in:slide>
			{#if isLoading}
				{#each periods as p}
					<div class="h-28 bg-white border border-border rounded-[24px] animate-pulse"></div>
				{/each}
			{:else}
				{#each periods as period}
					{@const item = getClass(selectedDay, period)}
					<button
						type="button"
						class="insta-card p-6 flex justify-between items-center group cursor-pointer w-full text-left transition-all {item?.isPending ? 'ring-2 ring-accent ring-offset-4 ring-offset-secondary shadow-lg shadow-accent/20' : ''}"
						onclick={() => item ? openEditModal(item) : openAddModal(selectedDay, period)}
					>
						<div class="flex items-center gap-4">
							<div class="flex flex-col items-center">
								<div 
									class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
									style="background-color: {item?.color || '#f1f1f1'}; color: rgba(0,0,0,0.4)"
								>
									{period}
								</div>
								<div class="text-[9px] text-gray-500 font-bold mt-1 tracking-tighter">
									{periodTimes[period].start}
								</div>
							</div>
							<div class="flex flex-col gap-0.5">
								{#if item}
									<div class="flex items-center gap-1.5 flex-wrap">
										<h3 class="font-bold text-base leading-tight">{item.Classes.name}</h3>
										{#if item.isPending}
											<span class="text-[8px] bg-accent text-black px-1.5 py-0.5 rounded-md font-black italic tracking-tighter">NEW</span>
										{/if}
										{#if item.Classes.is_remote}
											<span class="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-md font-bold">遠隔</span>
										{/if}
									</div>
									<div class="flex items-center gap-2">
										<p class="text-xs text-gray-400 font-medium">{item.Classes.teacher || ''}</p>
										{#if item.Classes.room}
											<span class="bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full font-bold shadow-sm shadow-blue-200">
												{item.Classes.room}
											</span>
										{/if}
									</div>
								{:else}
									<h3 class="font-bold text-gray-300">No Class</h3>
									<p class="text-[9px] text-gray-300 font-bold">TAP TO ADD</p>
								{/if}
							</div>
						</div>
						{#if item}
							<MoreHorizontal size={20} class="text-gray-300 group-hover:text-gray-500 transition-colors" />
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{:else}
		<!-- Weekly Grid View -->
		<div class="bg-white border border-border rounded-[24px] p-2 pb-4 shadow-sm" in:scale={{ duration: 300, start: 0.95 }}>
			<div class="grid grid-cols-[20px_repeat(6,1fr)] gap-1">
				<!-- Header row -->
				<div class="h-8"></div>
				{#each days as day, i}
					<div class="h-10 flex flex-col items-center justify-center {i === todayIndex ? 'text-white' : 'text-gray-400'}">
						<div class="w-7 h-7 flex items-center justify-center rounded-full transition-all {i === todayIndex ? 'bg-black shadow-lg scale-110' : ''}">
							<span class="text-[10px] font-bold uppercase tracking-tighter">{day}</span>
						</div>
					</div>
				{/each}

				<!-- Period rows -->
				{#each periods as period}
					<div class="h-14 flex flex-col items-center justify-center gap-0.5">
						<span class="text-[9px] font-black text-gray-500 leading-none">{period}</span>
						<div class="flex flex-col items-center leading-[1.1]">
							<span class="text-[8px] font-bold text-gray-500 tracking-tighter">{periodTimes[period].start}</span>
							<span class="text-[7px] font-bold text-gray-400 tracking-tighter opacity-60">↓</span>
							<span class="text-[8px] font-bold text-gray-500 tracking-tighter">{periodTimes[period].end}</span>
						</div>
					</div>
					{#each Array(6) as _, dayIdx}
						{@const item = getClass(dayIdx, period)}
						<button 
							type="button"
							class="h-14 rounded-lg flex items-center justify-center p-0.5 transition-all active:scale-95 border-none shadow-sm cursor-pointer {dayIdx === todayIndex ? 'bg-[#D0EFFF] ring-2 ring-blue-300 ring-inset' : ''} {item?.isPending ? 'ring-2 ring-accent ring-offset-2' : ''}"
							style="background-color: {item?.color || (dayIdx === todayIndex ? '#D0EFFF' : 'transparent')}"
							onclick={() => item ? openEditModal(item) : openAddModal(dayIdx, period)}
						>
							{#if item}
								<div class="flex flex-col items-center justify-center gap-0.5 w-full relative">
									{#if item.isPending}
										<div class="absolute -top-1 -right-1 w-1.5 h-1.5 bg-accent rounded-full animate-ping"></div>
										<div class="absolute -top-1 -right-1 w-1.5 h-1.5 bg-accent rounded-full"></div>
									{/if}
									<span class="text-[7px] font-bold leading-none text-center line-clamp-3 px-0.5 text-black/70 {dayIdx === todayIndex ? 'text-blue-900 saturate-150' : ''}">
										{item.Classes.name}
									</span>
									{#if item.Classes.room}
										<span class="bg-blue-600 text-white text-[7px] px-1.5 py-0.5 rounded-sm font-bold scale-[0.9] origin-center shadow-sm">
											{item.Classes.room}
										</span>
									{/if}
								</div>
							{/if}
						</button>
					{/each}
				{/each}
			</div>
		</div>
		<p class="text-[10px] text-gray-400 text-center font-medium mt-4">※各コマをタップすると詳細を表示します</p>
	{/if}
</section>

<!-- Class Editor Modal -->
{#if isEditMode}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div 
		class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end justify-center"
		transition:fade={{ duration: 200 }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={() => { isEditMode = false; selectedClass = null; }}
		onkeydown={(e) => e.key === 'Escape' && (isEditMode = false)}
	>
		<div 
			class="bg-white w-full max-w-xl rounded-t-[40px] p-8 pb-12 flex flex-col gap-6 shadow-2xl max-h-[90vh] overflow-y-auto"
			transition:slide={{ axis: 'y', duration: 300 }}
			onclick={e => e.stopPropagation()}
			role="presentation"
		>
			<div class="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-2"></div>
			
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-bold">{selectedClass ? '授業を編集' : '新しい授業を追加'}</h2>
				{#if selectedClass}
					<button class="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full" onclick={deleteClass}>
						この授業を削除
					</button>
				{/if}
			</div>

			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="className">授業名</label>
					<input 
						id="className"
						type="text" 
						placeholder="授業名を入力" 
						class={inputClass}
						bind:value={editData.name}
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="flex flex-col gap-1.5">
						<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="day">曜日</label>
						<select id="day" class={inputClass} bind:value={editData.day_of_week}>
							{#each days as day, i}
								<option value={i}>{day}曜日</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="period">時限</label>
						<select id="period" class={inputClass} bind:value={editData.period}>
							{#each periods as p}
								<option value={p}>{p}限</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="flex flex-col gap-1.5">
						<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="room">教室</label>
						<input id="room" type="text" placeholder="例：1-201" class={inputClass} bind:value={editData.room} />
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="teacher">教員名</label>
						<input id="teacher" type="text" placeholder="例：桃山 太郎" class={inputClass} bind:value={editData.teacher} />
					</div>
				</div>

				<div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
					<div class="flex flex-col">
						<span class="text-sm font-bold text-gray-700">遠隔授業</span>
						<span class="text-[10px] text-gray-400 font-medium">オンライン講義の場合はオンにします</span>
					</div>
					<button 
						class="w-12 h-6 rounded-full transition-colors relative {editData.is_remote ? 'bg-black' : 'bg-gray-200'}"
						onclick={() => editData.is_remote = !editData.is_remote}
						aria-label="遠隔授業切り替え"
					>
						<div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform {editData.is_remote ? 'translate-x-6' : ''}"></div>
					</button>
				</div>

				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="color">ラベル色</label>
					<div class="flex gap-2 flex-wrap">
						{#each ['#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#f3e8ff', '#fae8ff', '#f1f1f1'] as color}
							<button 
								class="w-10 h-10 rounded-full border-2 transition-all {editData.color === color ? 'border-black scale-110 shadow-md' : 'border-transparent'}"
								style="background-color: {color}"
								onclick={() => editData.color = color}
								aria-label="Color {color}"
							></button>
						{/each}
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-3 mt-4">
				<button class="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm shadow-lg shadow-black/10 active:scale-95 transition-transform" onclick={saveClass}>
					保存する
				</button>
				<button 
					class="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-200 active:scale-95 transition-transform"
					onclick={() => { isEditMode = false; selectedClass = null; }}
				>
					キャンセル
				</button>
			</div>
		</div>
	</div>
{/if}

<ImageUpload userId={userId ?? ''} onUploadComplete={onOCRSuccess} />

<style>
	:global(.bg-secondary) {
		background-color: #fafafa;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
