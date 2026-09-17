import type { Entry } from '@/ipc/types';

import { type Location, contextDir, writableDir } from '../explorer/model';
import { EMPTY_SELECTION, type Selection } from '../explorer/selection';
import { currentLocation, selectActiveTabId, useExplorer } from '../explorer/store';
import { viewRegistry } from '../explorer/viewRegistry';

/** A snapshot of "what the user is looking at", taken when a command runs. */
export interface CommandContext {
  tabId: string;
  location: Location | undefined;
  selection: Selection;
  entries: readonly Entry[];
  rowStep: (index: number, rows: number) => number;
  selected: Entry[];
  /** The focused entry, or the only selected one. */
  target: Entry | undefined;
  writableDir: string | null;
  contextDir: string | null;
  inTrash: boolean;
}

export function commandContext(): CommandContext {
  const state = useExplorer.getState();
  const tabId = selectActiveTabId(state);
  const tab = state.tabs[tabId];
  const location = tab && currentLocation(tab);
  const selection = state.selections[tabId] ?? EMPTY_SELECTION;
  const { entries, rowStep } = viewRegistry.get(tabId);
  const selected = entries.filter((entry) => selection.paths.has(entry.path));
  const focused = entries.find((entry) => entry.path === selection.focus);
  return {
    tabId,
    location,
    selection,
    entries,
    rowStep,
    selected,
    target: selected.length === 1 ? selected[0] : focused && selection.paths.has(focused.path) ? focused : undefined,
    writableDir: location ? writableDir(location) : null,
    contextDir: location ? contextDir(location) : null,
    inTrash: location?.type === 'trash',
  };
}
