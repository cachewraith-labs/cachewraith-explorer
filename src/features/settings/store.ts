import { create } from 'zustand';

import { settingsApi } from '@/ipc/api';
import type { Settings } from '@/ipc/types';
import { debounce } from '@/shared/lib/debounce';

import { toast } from '../toasts/store';

export const DEFAULT_SETTINGS: Settings = {
  viewMode: 'grid',
  showHidden: false,
  sortKey: 'name',
  sortDirection: 'asc',
  foldersFirst: true,
  sidebarCollapsed: false,
  previewOpen: true,
  pinned: [],
  terminal: null,
  themeSource: 'wallpaper',
  themeColor: '#c07d73',
  themeMode: 'system',
  reduceMotion: false,
  folderIconStyle: 'theme',
  confirmTrash: false,
  previousFileManager: null,
  defaultPromptDismissed: false,
};

interface SettingsStore {
  settings: Settings;
  hydrate(settings: Settings): void;
  update(patch: Partial<Settings>): void;
}

const persist = debounce((settings: Settings) => {
  settingsApi.save(settings).catch((err: unknown) => toast.error("Couldn't save settings", err));
}, 400);

export const useSettings = create<SettingsStore>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrate(settings) {
    set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  },
  update(patch) {
    set({ settings: { ...get().settings, ...patch } });
    persist(get().settings);
  },
}));

/** Subscribe to one setting; re-renders only when that value changes. */
export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSettings((state) => state.settings[key]);
}
