import { create } from 'zustand';

import { desktopApi } from '@/ipc/api';
import type { DefaultAppStatus, DesktopInfo } from '@/ipc/types';

import { useSettings } from '../settings/store';
import { toast } from '../toasts/store';

interface DesktopStore {
  info: DesktopInfo;
  defaultApp: DefaultAppStatus | null;
  busy: boolean;
  load(): Promise<void>;
  refreshDefaultApp(): Promise<void>;
  makeDefault(): Promise<void>;
  restorePrevious(): Promise<void>;
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
    busy: false,

    async load() {
      const info = await desktopApi.info().catch(() => UNKNOWN);
      set({ info });
      await get().refreshDefaultApp();
    },

    async refreshDefaultApp() {
      const defaultApp = await desktopApi.defaultAppStatus().catch(() => null);
      set({ defaultApp });
    },

    makeDefault: () =>
      change(async () => {
        const { status, previousId } = await desktopApi.makeDefault();
        set({ defaultApp: status });
        const patch = previousId ? { previousFileManager: previousId } : {};
        useSettings.getState().update({ ...patch, defaultPromptDismissed: true });
        toast.success('Files is now your default file manager');
      }, "Couldn't set the default file manager"),

    restorePrevious: () =>
      change(async () => {
        const previous = useSettings.getState().settings.previousFileManager;
        if (!previous) return;
        const status = await desktopApi.restoreDefault(previous);
        set({ defaultApp: status });
        toast.success(`Folders open with ${status.currentName ?? previous} again`);
      }, "Couldn't restore the previous file manager"),
  };
});
