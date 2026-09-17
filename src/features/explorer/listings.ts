import { create } from 'zustand';

import { fsApi, searchApi, trashApi } from '@/ipc/api';
import { type IpcError, toIpcError } from '@/ipc/client';
import type { Entry } from '@/ipc/types';

import { useSettings } from '../settings/store';
import { type Location, locationKey } from './model';

export interface ListingState {
  status: 'loading' | 'ready' | 'error';
  entries: Entry[];
  error: IpcError | null;
  /** Search only: results are still streaming in. */
  streaming: boolean;
  /** Search only: stopped at the result cap. */
  truncated: boolean;
}

interface ListingsStore {
  byKey: Record<string, ListingState>;
  /** Loads a location unless it is already loaded or loading. */
  ensure(location: Location): void;
  reload(location: Location): void;
  reloadDirs(paths: readonly string[]): void;
  /** Forgets every listing not shown by some tab, and stops their searches. */
  retain(locations: readonly Location[]): void;
}

const LOADING: ListingState = { status: 'loading', entries: [], error: null, streaming: false, truncated: false };

/** Latest request per key; responses from older requests are dropped. */
const generations = new Map<string, number>();
const runningSearches = new Map<string, number>();

export const useListings = create<ListingsStore>()((set, get) => {
  const patch = (key: string, generation: number, change: (current: ListingState) => ListingState) => {
    if (generations.get(key) !== generation) return;
    set((state) => ({ byKey: { ...state.byKey, [key]: change(state.byKey[key] ?? LOADING) } }));
  };

  const load = (location: Location) => {
    const key = locationKey(location);
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);

    // Keep showing the previous entries while refreshing, so a watcher-triggered reload
    // never flashes an empty view.
    set((state) => {
      const previous = state.byKey[key];
      const next = previous?.status === 'ready' ? previous : LOADING;
      return { byKey: { ...state.byKey, [key]: next } };
    });

    const settle = (entries: Entry[]) =>
      patch(key, generation, () => ({ status: 'ready', entries, error: null, streaming: false, truncated: false }));
    const fail = (err: unknown) => patch(key, generation, () => ({ ...LOADING, status: 'error', error: toIpcError(err) }));

    switch (location.type) {
      case 'dir':
        fsApi.listDir(location.path).then((listing) => settle(listing.entries), fail);
        break;
      case 'trash':
        trashApi.list().then(settle, fail);
        break;
      case 'search': {
        stopSearch(key);
        patch(key, generation, () => ({ ...LOADING, status: 'ready', streaming: true }));
        const { showHidden } = useSettings.getState().settings;
        searchApi
          .start(location.root, location.query, showHidden, (event) => {
            if (event.type === 'batch') {
              patch(key, generation, (s) => ({ ...s, entries: [...s.entries, ...event.entries] }));
            } else {
              runningSearches.delete(key);
              patch(key, generation, (s) => ({ ...s, streaming: false, truncated: event.truncated }));
            }
          })
          .then((id) => {
            if (generations.get(key) === generation) runningSearches.set(key, id);
            else void searchApi.cancel(id);
          }, fail);
        break;
      }
    }
  };

  return {
    byKey: {},

    ensure(location) {
      if (!get().byKey[locationKey(location)]) load(location);
    },

    reload: load,

    reloadDirs(paths) {
      const loaded = get().byKey;
      for (const path of paths) {
        if (loaded[`dir:${path}`]) load({ type: 'dir', path });
      }
    },

    retain(locations) {
      const keep = new Set(locations.map(locationKey));
      const byKey = get().byKey;
      const drop = Object.keys(byKey).filter((key) => !keep.has(key));
      if (drop.length === 0) return;
      for (const key of drop) {
        stopSearch(key);
        generations.delete(key);
      }
      set({ byKey: Object.fromEntries(Object.entries(byKey).filter(([key]) => keep.has(key))) });
    },
  };
});

function stopSearch(key: string) {
  const id = runningSearches.get(key);
  if (id !== undefined) {
    runningSearches.delete(key);
    void searchApi.cancel(id);
  }
}

export function useListing(location: Location | undefined): ListingState | undefined {
  return useListings((state) => (location ? state.byKey[locationKey(location)] : undefined));
}
