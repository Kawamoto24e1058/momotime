import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	message: string;
	type: ToastType;
	actionLabel?: string;
	onAction?: () => void;
}

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = {
	subscribe,
	add: (message: string, type: ToastType = 'info', duration = 3000, actionLabel?: string, onAction?: () => void) => {
		const id = Date.now();
		update((all) => [...all, { id, message, type, actionLabel, onAction }]);
		if (duration > 0) {
			setTimeout(() => {
				update((all) => all.filter((t) => t.id !== id));
			}, duration);
		}
		return id;
	},
	remove: (id: number) => {
		update((all) => all.filter((t) => t.id !== id));
	}
};
