import { create } from 'zustand';

import { dirname } from '@/shared/lib/path';

import { type Location, locationKey } from './model';
import { EMPTY_SELECTION, type Selection } from './selection';

export type PaneId = 'primary' | 'secondary';

export interface Tab {
  id: string;
  history: Location[];
  index: number;
}

export interface Pane {
  id: PaneId;
  tabIds: string[];
  activeTabId: string;
}

interface ExplorerStore {
  tabs: Record<string, Tab>;
  panes: Pane[];
  activePaneId: PaneId;
  selections: Record<string, Selection>;
  /** Live filter text per tab (the toolbar search field). */
  filters: Record<string, string>;

  init(location: Location): void;
  navigate(location: Location, tabId?: string): void;
  goBack(tabId?: string): void;
  goForward(tabId?: string): void;
  goUp(tabId?: string): void;
  openTab(location: Location, paneId?: PaneId): void;
  closeTab(tabId?: string): void;
  activateTab(tabId: string): void;
  cycleTab(delta: number): void;
  toggleSplit(): void;
  focusPane(paneId: PaneId): void;
  setSelection(tabId: string, selection: Selection): void;
  setFilter(tabId: string, filter: string): void;
}

const MAX_HISTORY = 100;
let tabCounter = 0;

function newTab(location: Location): Tab {
  tabCounter += 1;
  return { id: `tab-${tabCounter}`, history: [location], index: 0 };
}

export function currentLocation(tab: Tab): Location {
  // `index` is always within `history`; the fallback only satisfies the type checker.
  return tab.history[tab.index] ?? tab.history[0] ?? { type: 'trash' };
}

export const useExplorer = create<ExplorerStore>()((set, get) => {
  const activeTabId = (): string => {
    const { panes, activePaneId } = get();
    const pane = panes.find((p) => p.id === activePaneId) ?? panes[0];
    return pane?.activeTabId ?? '';
  };

  /** Applies `change` to one tab's history and resets that tab's view state. */
  const updateHistory = (tabId: string, change: (tab: Tab) => Tab | null, focus: string | null = null) => {
    const tab = get().tabs[tabId];
    if (!tab) return;
    const next = change(tab);
    if (!next) return;
    set((state) => ({
      tabs: { ...state.tabs, [tabId]: next },
      selections: { ...state.selections, [tabId]: focus ? { paths: new Set([focus]), anchor: focus, focus } : EMPTY_SELECTION },
      filters: { ...state.filters, [tabId]: '' },
    }));
  };

  return {
    tabs: {},
    panes: [],
    activePaneId: 'primary',
    selections: {},
    filters: {},

    init(location) {
      const tab = newTab(location);
      set({
        tabs: { [tab.id]: tab },
        panes: [{ id: 'primary', tabIds: [tab.id], activeTabId: tab.id }],
        activePaneId: 'primary',
        selections: {},
        filters: {},
      });
    },

    navigate(location, tabId = activeTabId()) {
      updateHistory(tabId, (tab) => {
        if (locationKey(currentLocation(tab)) === locationKey(location)) return null;
        const history = [...tab.history.slice(0, tab.index + 1), location].slice(-MAX_HISTORY);
        return { ...tab, history, index: history.length - 1 };
      });
    },

    goBack(tabId = activeTabId()) {
      const tab = get().tabs[tabId];
      const leaving = tab && currentLocation(tab);
      updateHistory(
        tabId,
        (t) => (t.index > 0 ? { ...t, index: t.index - 1 } : null),
        leaving?.type === 'dir' ? leaving.path : null,
      );
    },

    goForward(tabId = activeTabId()) {
      updateHistory(tabId, (t) => (t.index < t.history.length - 1 ? { ...t, index: t.index + 1 } : null));
    },

    goUp(tabId = activeTabId()) {
      const tab = get().tabs[tabId];
      if (!tab) return;
      const location = currentLocation(tab);
      if (location.type === 'search') {
        get().navigate({ type: 'dir', path: location.root }, tabId);
      } else if (location.type === 'dir' && location.path !== '/') {
        const parent = dirname(location.path);
        updateHistory(
          tabId,
          (t) => {
            const history = [...t.history.slice(0, t.index + 1), { type: 'dir' as const, path: parent }];
            return { ...t, history, index: history.length - 1 };
          },
          location.path, // keep the folder we came from selected
        );
      }
    },

    openTab(location, paneId = get().activePaneId) {
      const tab = newTab(location);
      set((state) => ({
        tabs: { ...state.tabs, [tab.id]: tab },
        panes: state.panes.map((pane) => {
          if (pane.id !== paneId) return pane;
          const at = pane.tabIds.indexOf(pane.activeTabId) + 1;
          const tabIds = [...pane.tabIds.slice(0, at), tab.id, ...pane.tabIds.slice(at)];
          return { ...pane, tabIds, activeTabId: tab.id };
        }),
        activePaneId: paneId,
      }));
    },

    closeTab(tabId = activeTabId()) {
      const { panes } = get();
      const pane = panes.find((p) => p.tabIds.includes(tabId));
      if (!pane) return;

      if (pane.tabIds.length === 1) {
        // Closing a pane's last tab closes the split; the only pane always keeps one tab.
        if (panes.length > 1) {
          const remaining = panes.filter((p) => p.id !== pane.id).map((p) => ({ ...p, id: 'primary' as const }));
          set((state) => ({ panes: remaining, activePaneId: 'primary', ...withoutTabs(state, [tabId]) }));
        }
        return;
      }

      const index = pane.tabIds.indexOf(tabId);
      const tabIds = pane.tabIds.filter((id) => id !== tabId);
      const activeTab = pane.activeTabId === tabId ? (tabIds[Math.min(index, tabIds.length - 1)] ?? '') : pane.activeTabId;
      set((state) => ({
        panes: state.panes.map((p) => (p.id === pane.id ? { ...p, tabIds, activeTabId: activeTab } : p)),
        ...withoutTabs(state, [tabId]),
      }));
    },

    activateTab(tabId) {
      set((state) => {
        const pane = state.panes.find((p) => p.tabIds.includes(tabId));
        if (!pane) return state;
        return {
          panes: state.panes.map((p) => (p.id === pane.id ? { ...p, activeTabId: tabId } : p)),
          activePaneId: pane.id,
        };
      });
    },

    cycleTab(delta) {
      const { panes, activePaneId } = get();
      const pane = panes.find((p) => p.id === activePaneId);
      if (!pane || pane.tabIds.length < 2) return;
      const index = pane.tabIds.indexOf(pane.activeTabId);
      const next = pane.tabIds[(index + delta + pane.tabIds.length) % pane.tabIds.length];
      if (next) get().activateTab(next);
    },

    toggleSplit() {
      const state = get();
      if (state.panes.length > 1) {
        const secondary = state.panes.find((p) => p.id === 'secondary');
        set({
          panes: state.panes.filter((p) => p.id === 'primary'),
          activePaneId: 'primary',
          ...withoutTabs(state, secondary?.tabIds ?? []),
        });
        return;
      }
      const source = state.tabs[activeTabId()];
      const tab = newTab(source ? currentLocation(source) : { type: 'trash' });
      set({
        tabs: { ...state.tabs, [tab.id]: tab },
        panes: [...state.panes, { id: 'secondary', tabIds: [tab.id], activeTabId: tab.id }],
        activePaneId: 'secondary',
      });
    },

    focusPane(paneId) {
      if (get().activePaneId !== paneId) set({ activePaneId: paneId });
    },

    setSelection(tabId, selection) {
      set((state) => ({ selections: { ...state.selections, [tabId]: selection } }));
    },

    setFilter(tabId, filter) {
      set((state) => ({ filters: { ...state.filters, [tabId]: filter } }));
    },
  };
});

function withoutTabs(state: Pick<ExplorerStore, 'tabs' | 'selections' | 'filters'>, tabIds: readonly string[]) {
  const drop = new Set(tabIds);
  const keep = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([id]) => !drop.has(id)));
  return { tabs: keep(state.tabs), selections: keep(state.selections), filters: keep(state.filters) };
}

// ---- selectors -------------------------------------------------------------------------

export const selectActiveTabId = (state: ExplorerStore): string => {
  const pane = state.panes.find((p) => p.id === state.activePaneId) ?? state.panes[0];
  return pane?.activeTabId ?? '';
};

export function getActiveTab(): Tab | undefined {
  const state = useExplorer.getState();
  return state.tabs[selectActiveTabId(state)];
}

export function getActiveLocation(): Location | undefined {
  const tab = getActiveTab();
  return tab && currentLocation(tab);
}

export function useTabLocation(tabId: string): Location | undefined {
  return useExplorer((state) => {
    const tab = state.tabs[tabId];
    return tab ? currentLocation(tab) : undefined;
  });
}

export function useSelection(tabId: string): Selection {
  return useExplorer((state) => state.selections[tabId] ?? EMPTY_SELECTION);
}
