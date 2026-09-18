import { create } from 'zustand';

import { desktopApi } from '@/ipc/api';
import type { DefaultAppStatus, DesktopInfo, FolderHandler } from '@/ipc/types';

import { useSettings } from '../settings/store';
import { toast } from '../toasts/store';

interface DesktopStore {
  info: DesktopInfo;
  defaultApp: DefaultAppStatus | null;
  /** Other installed apps that can take folders back. */
  handlers: FolderHandler[];
  busy: boolean;
  load(): Promise<void>;
  refreshDefaultApp(): Promise<void>;
  makeDefault(): Promise<void>;
  /** Stops being the default: folders go to `id`. */
  handBack(id: string): Promise<void>;
}

/** Until the backend answers, assume a desktop that needs window buttons. */
const UNKNOWN: DesktopInfo = { name: '', wayland: false, windowControls: true };

export const useDesktop = create<DesktopStore>()((set, get) => {
  /** Runs one default-app change with a busy flag and error toast. */
  const change = async (work: () => Promise<void>, failure: string) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await work();
    } catch (err) {
      toast.error(failure, err);
    } finally {
      set({ busy: false });
    }
  };

  return {
    info: UNKNOWN,
    defaultApp: null,
    handlers: [],
    busy: false,

    async load() {
      const info = await desktopApi.info().catch(() => UNKNOWN);
      set({ info });
      await get().refreshDefaultApp();
    },

    async refreshDefaultApp() {
      const [defaultApp, handlers] = await Promise.all([
        desktopApi.defaultAppStatus().catch(() => null),
        desktopApi.folderHandlers().catch((): FolderHandler[] => []),
      ]);
      set({ defaultApp, handlers });
    },

    handBack: (id) =>
      change(async () => {
        const status = await desktopApi.restoreDefault(id);
        set({ defaultApp: status });
        const name = get().handlers.find((h) => h.id === id)?.name ?? status.currentName ?? id;
        toast.success(`Folders open with ${name} again`);
      }, "Couldn't switch the default file manager"),

    makeDefault: () =>
      change(async () => {
        const { status, previousId } = await desktopApi.makeDefault();
        set({ defaultApp: status });
        const patch = previousId ? { previousFileManager: previousId } : {};
        useSettings.getState().update({ ...patch, defaultPromptDismissed: true });
        toast.success('Files is now your default file manager');
      }, "Couldn't set the default file manager"),
  };
});
