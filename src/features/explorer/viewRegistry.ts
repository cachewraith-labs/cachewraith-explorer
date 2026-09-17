import type { Entry } from '@/ipc/types';

/**
 * What each tab's view currently shows, in display order, plus how to move the cursor
 * vertically in that view's layout. Views write it on render; keyboard commands read it.
 * It is deliberately not reactive state: nothing re-renders because of it.
 */
export interface ViewInfo {
  entries: readonly Entry[];
  /** The index `rows` visual rows below (negative: above) the item at `index`. */
  rowStep(index: number, rows: number): number;
}

const LINEAR: ViewInfo['rowStep'] = (index, rows) => index + rows;
const EMPTY: ViewInfo = { entries: [], rowStep: LINEAR };
const views = new Map<string, ViewInfo>();

export const viewRegistry = {
  set: (tabId: string, info: ViewInfo) => void views.set(tabId, info),
  get: (tabId: string): ViewInfo => views.get(tabId) ?? EMPTY,
  delete: (tabId: string) => void views.delete(tabId),
  linear: LINEAR,
};
