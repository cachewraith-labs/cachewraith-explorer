import { create } from 'zustand';

import type { Entry } from '@/ipc/types';

export type DialogRequest =
  | { type: 'rename'; entry: Entry }
  | { type: 'newFolder'; parent: string }
  | {
      type: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
      onConfirm: () => void;
    };

interface DialogStore {
  dialog: DialogRequest | null;
  open(dialog: DialogRequest): void;
  close(): void;
}

export const useDialogs = create<DialogStore>()((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
