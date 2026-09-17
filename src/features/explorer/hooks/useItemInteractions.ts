import type React from 'react';
import { useMemo } from 'react';

import type { Entry } from '@/ipc/types';

import { itemMenu } from '../../context-menu/menus';
import { useContextMenu } from '../../context-menu/store';
import { fileActions } from '../../operations/actions';
import { endDrag, startDrag } from '../dnd';
import { clickSelect, EMPTY_SELECTION } from '../selection';
import { useExplorer } from '../store';

export interface ItemInteractions {
  onClick(entry: Entry, event: React.MouseEvent): void;
  /** Checkbox: add or remove one item without touching the rest. */
  onToggle(entry: Entry): void;
  onDoubleClick(entry: Entry): void;
  onAuxClick(entry: Entry, event: React.MouseEvent): void;
  onContextMenu(entry: Entry, event: React.MouseEvent): void;
  onDragStart(entry: Entry, event: React.DragEvent): void;
  onDragEnd(): void;
}

/** Mouse behaviour shared by grid tiles and list rows. Stable across renders. */
export function useItemInteractions(tabId: string, entries: readonly Entry[]): ItemInteractions {
  return useMemo(() => {
    const ordered = entries.map((entry) => entry.path);
    const selectionNow = () => useExplorer.getState().selections[tabId] ?? EMPTY_SELECTION;
    const selectOnly = (path: string) =>
      useExplorer.getState().setSelection(tabId, clickSelect(selectionNow(), ordered, path, 'replace'));

    return {
      onClick(entry, event) {
        event.stopPropagation();
        const mode = event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace';
        useExplorer.getState().setSelection(tabId, clickSelect(selectionNow(), ordered, entry.path, mode));
      },
      onToggle(entry) {
        useExplorer.getState().setSelection(tabId, clickSelect(selectionNow(), ordered, entry.path, 'toggle'));
      },
      onDoubleClick(entry) {
        fileActions.open(entry, tabId);
      },
      onAuxClick(entry, event) {
        if (event.button === 1 && entry.kind === 'dir' && entry.trashId === undefined) {
          event.preventDefault();
          fileActions.openInNewTab(entry.path);
        }
      },
      onContextMenu(entry, event) {
        event.preventDefault();
        event.stopPropagation();
        if (!selectionNow().paths.has(entry.path)) selectOnly(entry.path);
        useContextMenu.getState().show(event.clientX, event.clientY, itemMenu());
      },
      onDragStart(entry, event) {
        if (entry.trashId !== undefined) {
          event.preventDefault();
          return;
        }
        const selection = selectionNow();
        if (!selection.paths.has(entry.path)) selectOnly(entry.path);
        startDrag(event, selection.paths.has(entry.path) ? [...selection.paths] : [entry.path]);
      },
      onDragEnd: endDrag,
    };
  }, [tabId, entries]);
}
