import { create } from 'zustand';

import { drivesApi, fsApi } from '@/ipc/api';
import type { Drive, Place } from '@/ipc/types';

interface PlacesStore {
  home: string;
  places: Place[];
  drives: Drive[];
  load(): Promise<void>;
  refreshDrives(): Promise<void>;
}

export const usePlaces = create<PlacesStore>()((set) => ({
  home: '',
  places: [],
  drives: [],
  async load() {
    const [places, drives] = await Promise.all([fsApi.places(), drivesApi.list().catch(() => [])]);
    set({ places, drives, home: places.find((p) => p.id === 'home')?.path ?? '' });
  },
  async refreshDrives() {
    try {
      set({ drives: await drivesApi.list() });
    } catch {
      // Keep the last known list; a transient /proc read failure should not blank the sidebar.
    }
  },
}));
