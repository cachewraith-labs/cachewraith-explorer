import type React from 'react';
import { create } from 'zustand';

import type { Drive } from '@/ipc/types';
import { basename, dirname, isInside, mountFor } from '@/shared/lib/path';

import { fileActions } from '../operations/actions';
import { usePlaces } from '../places/store';

/**
 * In-app drag and drop of files. The dragged paths live in a store rather than only in
 * `dataTransfer`, because browsers hide `dataTransfer` data until the drop, and targets
 * need them earlier to show "copy" vs "move".
 */
const MIME = 'application/x-cachewraith-paths';

interface DragStore {
  sources: string[] | null;
  /** The drop target under the pointer, for highlighting. */
  overPath: string | null;
  setOver(path: string | null): void;
}

export const useDrag = create<DragStore>()((set) => ({
  sources: null,
  overPath: null,
  setOver: (overPath) => set((state) => (state.overPath === overPath ? state : { overPath })),
}));

export function startDrag(event: React.DragEvent, paths: string[]) {
  event.dataTransfer.setData(MIME, JSON.stringify(paths));
  event.dataTransfer.effectAllowed = 'copyMove';
  const ghost = createGhost(paths);
  event.dataTransfer.setDragImage(ghost, 24, 24);
  requestAnimationFrame(() => ghost.remove());
  useDrag.setState({ sources: paths });
}

export function endDrag() {
  useDrag.setState({ sources: null, overPath: null });
}

export type DropEffect = 'copy' | 'move';

/** Ctrl forces copy, Shift forces move; otherwise move within a drive, copy across drives. */
export function dropEffectFor(
  event: React.DragEvent,
  sources: readonly string[],
  destination: string,
  drives: readonly Drive[],
): DropEffect {
  if (event.ctrlKey) return 'copy';
  if (event.shiftKey) return 'move';
  const target = mountFor(destination, drives)?.mountPoint;
  return sources.every((source) => mountFor(source, drives)?.mountPoint === target) ? 'move' : 'copy';
}

export function canDrop(sources: readonly string[] | null, destination: string): sources is string[] {
  return (
    sources !== null &&
    sources.length > 0 &&
    sources.every((source) => !isInside(destination, source) && dirname(source) !== destination)
  );
}

/** Props that make an element a drop target for `destination` (null = not droppable). */
export function dropTargetProps(destination: string | null) {
  if (destination === null) return {};
  return {
    onDragOver(event: React.DragEvent) {
      const { sources } = useDrag.getState();
      if (!canDrop(sources, destination)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = dropEffectFor(event, sources, destination, usePlaces.getState().drives);
      useDrag.getState().setOver(destination);
    },
    onDragLeave(event: React.DragEvent) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        if (useDrag.getState().overPath === destination) useDrag.getState().setOver(null);
      }
    },
    onDrop(event: React.DragEvent) {
      const { sources } = useDrag.getState();
      endDrag();
      if (!canDrop(sources, destination)) return;
      event.preventDefault();
      event.stopPropagation();
      const effect = dropEffectFor(event, sources, destination, usePlaces.getState().drives);
      fileActions.transfer(effect, sources, destination);
    },
  };
}

/** The floating card shown under the pointer while dragging (see the split-pane design). */
function createGhost(paths: string[]): HTMLElement {
  const ghost = document.createElement('div');
  ghost.className =
    'fixed -top-[200px] left-0 flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-primary bg-surface-highest py-2.5 pr-4 pl-3 text-on-surface shadow-[0_10px_30px_rgba(0,0,0,0.5)]';
  const title = document.createElement('div');
  title.className = 'text-[12.5px] font-semibold';
  // textContent, never innerHTML: file names are untrusted text.
  title.textContent = paths.length === 1 ? basename(paths[0] ?? '') : `${paths.length} items`;
  ghost.append(title);
  document.body.append(ghost);
  return ghost;
}
