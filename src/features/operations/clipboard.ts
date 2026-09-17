import { create } from 'zustand';

/** The app's own copy/cut buffer for files (the system clipboard only gets text paths). */
export interface FileClip {
  mode: 'copy' | 'cut';
  paths: string[];
}

interface ClipboardStore {
  clip: FileClip | null;
  put(clip: FileClip): void;
  clear(): void;
}

export const useFileClipboard = create<ClipboardStore>()((set) => ({
  clip: null,
  put: (clip) => set({ clip }),
  clear: () => set({ clip: null }),
}));
