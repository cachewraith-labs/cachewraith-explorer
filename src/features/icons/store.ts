import { create } from 'zustand';

import { folderIconsApi } from '@/ipc/api';
import { onFolderIconsChanged } from '@/ipc/events';

import { toast } from '../toasts/store';

interface FolderIconsStore {
  /** Absolute folder path → icon name. */
  icons: Record<string, string>;
  /** The folder whose icon picker is open. */
  pickerFor: string | null;
  load(): Promise<void>;
  set(path: string, icon: string | null): Promise<void>;
  openPicker(path: string): void;
  closePicker(): void;
}

export const useFolderIcons = create<FolderIconsStore>()((set) => ({
  icons: {},
  pickerFor: null,

  async load() {
    set({ icons: await folderIconsApi.list().catch(() => ({})) });
  },

  async set(path, icon) {
    // Optimistic: the backend echoes the stored map through an event anyway.
    set((state) => {
      const icons = { ...state.icons };
      if (icon) icons[path] = icon;
      else delete icons[path];
      return { icons };
    });
    try {
      await folderIconsApi.set(path, icon);
    } catch (err) {
      toast.error("Couldn't change the folder icon", err);
      set({ icons: await folderIconsApi.list().catch(() => ({})) });
    }
  },

  openPicker: (pickerFor) => set({ pickerFor }),
  closePicker: () => set({ pickerFor: null }),
}));

/** Keeps the store in step with renames and moves made by the backend. */
export function followFolderIconChanges(): Promise<() => void> {
  return onFolderIconsChanged((icons) => useFolderIcons.setState({ icons }));
}
