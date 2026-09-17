import { create } from 'zustand';

import { toIpcError } from '@/ipc/client';

export type ToastTone = 'error' | 'info' | 'success';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastStore {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

const LIFETIME_MS = { error: 6000, info: 3200, success: 2600 } satisfies Record<ToastTone, number>;
const MAX_VISIBLE = 4;
let nextId = 1;

export const useToasts = create<ToastStore>()((set, get) => ({
  toasts: [],
  push(toast) {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    setTimeout(() => get().dismiss(id), LIFETIME_MS[toast.tone]);
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

function push(tone: ToastTone, title: string, message?: string) {
  useToasts.getState().push(message === undefined ? { tone, title } : { tone, title, message });
}

export const toast = {
  info: (title: string, message?: string) => push('info', title, message),
  success: (title: string, message?: string) => push('success', title, message),
  /** Reports a failed action. The title says what failed; the message says why. */
  error(title: string, cause: unknown) {
    const error = toIpcError(cause);
    if (error.kind !== 'cancelled') push('error', title, error.message);
  },
};
