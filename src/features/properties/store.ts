import { create } from 'zustand';

import { fsApi } from '@/ipc/api';
import type { Entry } from '@/ipc/types';

import { toast } from '../toasts/store';

interface PropertiesStore {
  /** The items the dialog describes; `null` when closed. */
  entries: Entry[] | null;
  open(entries: Entry[]): void;
  /** Opens properties for a folder that is not in any listing (e.g. the current one). */
  openPath(path: string): Promise<void>;
  close(): void;
}

export const useProperties = create<PropertiesStore>()((set) => ({
  entries: null,
  open: (entries) => set({ entries: entries.length > 0 ? entries : null }),
  async openPath(path) {
    try {
      set({ entries: [await fsApi.stat(path)] });
    } catch (err) {
      toast.error("Couldn't read properties", err);
    }
  },
  close: () => set({ entries: null }),
}));
