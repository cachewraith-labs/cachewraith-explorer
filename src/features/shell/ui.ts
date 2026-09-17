import { create } from 'zustand';

/**
 * Transient UI state that several unrelated components react to. Focus requests are
 * counters: bumping one tells the active pane's field to focus, even if it already
 * had the same value.
 */
interface UiStore {
  paletteOpen: boolean;
  settingsOpen: boolean;
  searchFocusRequest: number;
  pathEditRequest: number;
  setPaletteOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  requestSearchFocus(): void;
  requestPathEdit(): void;
}

export const useUi = create<UiStore>()((set) => ({
  paletteOpen: false,
  settingsOpen: false,
  searchFocusRequest: 0,
  pathEditRequest: 0,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  requestSearchFocus: () => set((s) => ({ searchFocusRequest: s.searchFocusRequest + 1 })),
  requestPathEdit: () => set((s) => ({ pathEditRequest: s.pathEditRequest + 1 })),
}));
