import { create } from 'zustand';

import type { MenuEntry } from '@/shared/ui/menu';

interface ContextMenuStore {
  menu: { x: number; y: number; items: MenuEntry[] } | null;
  show(x: number, y: number, items: MenuEntry[]): void;
  close(): void;
}

export const useContextMenu = create<ContextMenuStore>()((set) => ({
  menu: null,
  show: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}));
