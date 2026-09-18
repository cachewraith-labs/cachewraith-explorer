import { create } from 'zustand';

/**
 * The app's own copy/cut buffer for files. Copy and cut also offer the files on the
 * system clipboard (see `desktop/clipboard.rs`), so they paste into other apps too.
 */
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
