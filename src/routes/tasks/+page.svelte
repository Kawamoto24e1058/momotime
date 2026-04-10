<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { toasts } from '$lib/stores/toasts';
	import { CheckCircle2, Circle, Clock, Tag, ChevronRight, Plus } from 'lucide-svelte';
	import { fade, slide, fly } from 'svelte/transition';

	let userId = $state<string | null>(null);
	let activeTab = $state<'incomplete' | 'completed'>('incomplete');
	let tasks = $state<any[]>([]);
	let userClasses = $state<any[]>([]);
	let isLoading = $state(true);
	let isCreateModalOpen = $state(false);

	let newTask = $state({
		title: '',
		class_id: '',
		deadline: '',
		is_completed: false
	});

	async function fetchData() {
		isLoading = true;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) return;
			userId = user.id;

			// Fetch Classes
			const { data: classesData } = await supabase
				.from('User_Classes')
				.select('color, class_id, Classes(name)')
				.eq('user_id', userId);
			userClasses = classesData || [];

			// Fetch Tasks
			const { data: tasksData, error } = await supabase
				.from('Tasks')
				.select(`
					*,
					Classes (*)
				`)
				.eq('user_id', userId)
				.order('deadline', { ascending: true });

			if (error) throw error;
			tasks = tasksData || [];
		} catch (error: any) {
			toasts.add('データの取得に失敗しました', 'error');
		} finally {
			isLoading = false;
		}
	}

	async function createTask() {
		if (!newTask.title) {
			toasts.add('タイトルを入力してください', 'error');
			return;
		}
		try {
			const { error } = await (supabase.from('Tasks') as any).insert({
				user_id: userId,
				title: newTask.title,
				class_id: newTask.class_id || null,
				deadline: newTask.deadline || null,
				is_completed: false
			});
			if (error) throw error;
			
			toasts.add('タスクを作成しました', 'success');
			isCreateModalOpen = false;
			newTask = { title: '', class_id: '', deadline: '', is_completed: false };
			await fetchData();
		} catch (error) {
			toasts.add('作成に失敗しました', 'error');
		}
	}

	let pendingToggles = new Map<string, any>();

	async function toggleTask(task: any) {
		const originalState = task.is_completed;
		const newState = !originalState;

		// 1. Optimistic UI update
		task.is_completed = newState;

		// 2. If undoing an already pending toggle, clear it and return
		if (pendingToggles.has(task.id)) {
			clearTimeout(pendingToggles.get(task.id));
			pendingToggles.delete(task.id);
			return;
		}

		// 3. Set a timeout for DB update
		const timeout = setTimeout(async () => {
			try {
				const { error } = await (supabase.from('Tasks') as any)
					.update({ is_completed: newState })
					.eq('id', task.id);

				if (error) throw error;
				pendingToggles.delete(task.id);
				await fetchData();
			} catch (error: any) {
				toasts.add('情報の更新に失敗しました', 'error');
				task.is_completed = originalState; // Rollback on error
			}
		}, 4000);

		pendingToggles.set(task.id, timeout);

		// 4. Show Undo Toast
		toasts.add(
			newState ? 'タスクを完了しました' : 'タスクを未完了に戻しました',
			'success',
			4000,
			'取り消す',
			() => {
				clearTimeout(timeout);
				pendingToggles.delete(task.id);
				task.is_completed = originalState; // Undo the change
			}
		);
	}

	function getTaskColor(classId: string | null) {
		if (!classId) return '#f3f4f6';
		const uc = userClasses.find(c => c.class_id === classId);
		return uc?.color || '#f3f4f6';
	}

	function getTimeStatus(deadline: string | null) {
		if (!deadline) return { text: '期限なし', urgent: false };
		const diff = new Date(deadline).getTime() - new Date().getTime();
		const hours = diff / (1000 * 60 * 60);
		const days = Math.ceil(hours / 24);
		
		if (hours < 0) return { text: '期限切れ', urgent: true };
		if (hours <= 24) return { text: 'まもなく期限', urgent: true };
		return { text: `あと ${days} 日`, urgent: false };
	}

	onMount(fetchData);

	let filteredTasks = $derived(tasks.filter(t => 
		activeTab === 'completed' ? t.is_completed : !t.is_completed
	));
</script>

<div class="flex flex-col gap-6">
	<header class="flex justify-between items-end">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Tasks</h1>
			<p class="text-gray-400 text-xs font-medium">Manage your assignments</p>
		</div>
		<button 
			class="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-transform"
			onclick={() => isCreateModalOpen = true}
		>
			<Plus size={20} />
		</button>
	</header>

	<div class="flex bg-white p-1 rounded-2xl border border-border shadow-sm">
		<button 
			class="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all {activeTab === 'incomplete' ? 'bg-gray-100 text-black' : 'text-gray-400'}"
			onclick={() => activeTab = 'incomplete'}
		>
			未完了
		</button>
		<button 
			class="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all {activeTab === 'completed' ? 'bg-gray-100 text-black' : 'text-gray-400'}"
			onclick={() => activeTab = 'completed'}
		>
			完了済み
		</button>
	</div>

	<div class="flex flex-col">
		{#if isLoading}
			{#each Array(3) as _}
				<div class="h-16 flex items-center gap-4 px-2 py-4 border-b border-gray-50 animate-pulse">
					<div class="w-10 h-10 rounded-full bg-gray-100"></div>
					<div class="flex-1 h-4 bg-gray-100 rounded"></div>
				</div>
			{/each}
		{:else if filteredTasks.length === 0}
			<div class="py-20 flex flex-col items-center justify-center text-gray-300 gap-4" in:fade>
				<CheckCircle2 size={48} strokeWidth={1} />
				<p class="text-sm font-medium">タスクはありません</p>
			</div>
		{:else}
			{#each filteredTasks as task (task.id)}
				{@const status = getTimeStatus(task.deadline)}
				<div 
					class="flex items-center gap-4 px-2 py-4 border-b border-gray-50 group hover:bg-gray-50/50 transition-colors"
					in:fly={{ x: -10, duration: 200 }}
					out:slide={{ duration: 200 }}
				>
					<!-- Icon / Class Color -->
					<button 
						class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-[10px] shadow-sm transition-transform active:scale-90"
						style="background-color: {getTaskColor(task.class_id)}"
						onclick={() => toggleTask(task)}
						aria-label="Toggle task completion"
					>
						{#if task.is_completed}
							<CheckCircle2 size={18} />
						{:else}
							<span>{task.Classes?.name?.substring(0, 1) || 'T'}</span>
						{/if}
					</button>

					<!-- Content -->
					<button 
						type="button"
						class="flex-1 min-w-0 text-left" 
						onclick={() => toggleTask(task)}
					>
						<div class="flex items-baseline gap-1.5 min-w-0">
							<h3 class="font-bold text-sm truncate {task.is_completed ? 'text-gray-300 line-through' : 'text-gray-900'}">
								{task.title}
							</h3>
							{#if task.Classes && !task.is_completed}
								<span class="text-[10px] text-gray-400 font-medium truncate shrink-0">
									· {task.Classes.name}
								</span>
							{/if}
						</div>
						<p class="text-[11px] {status.urgent && !task.is_completed ? 'text-red-500 font-bold' : 'text-gray-400'}">
							{status.text}
						</p>
					</button>

					<!-- Toggle Button -->
					{#if !task.is_completed}
						<button 
							class="px-4 py-1.5 bg-black text-white text-[11px] font-bold rounded-lg shadow-sm active:scale-95 transition-transform"
							onclick={() => toggleTask(task)}
						>
							完了
						</button>
					{:else}
						<button 
							class="px-4 py-1.5 bg-gray-100 text-gray-400 text-[11px] font-bold rounded-lg active:scale-95 transition-transform"
							onclick={() => toggleTask(task)}
						>
							未完了
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<!-- Task Creation Modal -->
{#if isCreateModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div 
		class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end justify-center"
		transition:fade={{ duration: 200 }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={() => isCreateModalOpen = false}
	>
		<div 
			class="bg-white w-full max-w-xl rounded-t-[40px] p-8 pb-12 flex flex-col gap-6 shadow-2xl"
			transition:slide={{ axis: 'y', duration: 300 }}
			onclick={e => e.stopPropagation()}
			role="presentation"
		>
			<div class="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-2"></div>
			<h2 class="text-xl font-bold">新しいタスクを追加</h2>

			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="taskTitle">タスクの内容</label>
					<input 
						id="taskTitle"
						type="text" 
						placeholder="課題や予定を入力" 
						class="w-full bg-gray-50 border border-border rounded-2xl py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5"
						bind:value={newTask.title}
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="taskClass">紐づける授業</label>
					<select id="taskClass" class="w-full bg-gray-50 border border-border rounded-2xl py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5" bind:value={newTask.class_id}>
						<option value="">授業を選択しない</option>
						{#each userClasses as uc}
							<option value={uc.class_id}>{uc.Classes.name}</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1.5">
					<label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1" for="taskDeadline">期限</label>
					<input 
						id="taskDeadline"
						type="datetime-local" 
						class="w-full bg-gray-50 border border-border rounded-2xl py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5"
						bind:value={newTask.deadline}
					/>
				</div>
			</div>

			<div class="flex gap-3 pt-4">
				<button 
					class="flex-1 py-4 rounded-2xl bg-gray-100 text-gray-500 font-bold text-sm"
					onclick={() => isCreateModalOpen = false}
				>
					キャンセル
				</button>
				<button 
					class="flex-[2] py-4 rounded-2xl bg-black text-white font-bold text-sm shadow-xl active:scale-95 transition-transform"
					onclick={createTask}
				>
					タスクを作成
				</button>
			</div>
		</div>
	</div>
{/if}
