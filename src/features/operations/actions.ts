// Facade over the IPC layer for everything a user can do to files. Components, menus,
// the command palette and shortcuts all call these, so behaviour (confirmation, toasts,
// selection after the action) is identical no matter where an action starts.

import { writeText } from '@tauri-apps/plugin-clipboard-manager';

import { desktopApi, fsApi, jobsApi, launcherApi, trashApi } from '@/ipc/api';
import type { ArchiveFormat, Entry, JobKind } from '@/ipc/types';
import { basename, dirname, isInside } from '@/shared/lib/path';

import { useDialogs } from '../dialogs/store';
import { useListings } from '../explorer/listings';
import { dirLocation, TRASH } from '../explorer/model';
import { useExplorer } from '../explorer/store';
import { useSettings } from '../settings/store';
import { toast } from '../toasts/store';
import { useFileClipboard } from './clipboard';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

async function enqueue(kind: JobKind, sources: string[], destination?: string, format?: ArchiveFormat) {
  if (sources.length === 0) return;
  try {
    await jobsApi.enqueue({
      kind,
      sources,
      ...(destination === undefined ? {} : { destination }),
      ...(format === undefined ? {} : { format }),
    });
  } catch (err) {
    toast.error("Couldn't start the operation", err);
  }
}

export const fileActions = {
  /** Folders open in place; files open in their default application. */
  open(entry: Entry, tabId?: string) {
    if (entry.trashId !== undefined) return;
    if (entry.kind === 'dir') {
      useExplorer.getState().navigate(dirLocation(entry.path), tabId);
    } else {
      launcherApi.open(entry.path).catch((err: unknown) => toast.error(`Couldn't open ${entry.name}`, err));
    }
  },

  openInNewTab(path: string) {
    useExplorer.getState().openTab(dirLocation(path));
  },

  openTerminal(dir: string) {
    launcherApi.openTerminal(dir).catch((err: unknown) => toast.error("Couldn't open a terminal", err));
  },

  copy(paths: string[]) {
    if (paths.length === 0) return;
    useFileClipboard.getState().put({ mode: 'copy', paths });
    offerToSystemClipboard(paths, false);
    toast.info(`Copied ${plural(paths.length, 'item')}`);
  },

  cut(paths: string[]) {
    if (paths.length === 0) return;
    useFileClipboard.getState().put({ mode: 'cut', paths });
    offerToSystemClipboard(paths, true);
    toast.info(`Cut ${plural(paths.length, 'item')}`, 'Paste to move them');
  },

  paste(destination: string) {
    const { clip, clear } = useFileClipboard.getState();
    if (!clip) return;
    void enqueue(clip.mode === 'cut' ? 'move' : 'copy', clip.paths, destination);
    if (clip.mode === 'cut') clear();
  },

  transfer(kind: 'copy' | 'move', sources: string[], destination: string) {
    const valid = sources.filter((source) => !isInside(destination, source) && dirname(source) !== destination);
    void enqueue(kind, valid, destination);
  },

  trash(paths: string[]) {
    if (paths.length === 0) return;
    if (!useSettings.getState().settings.confirmTrash) {
      void enqueue('trash', paths);
      return;
    }
    const what = paths.length === 1 ? `"${basename(paths[0] ?? '')}"` : plural(paths.length, 'item');
    useDialogs.getState().open({
      type: 'confirm',
      title: `Move ${what} to Trash?`,
      message: 'You can restore it from Trash later.',
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: () => void enqueue('trash', paths),
    });
  },

  deletePermanently(paths: string[]) {
    if (paths.length === 0) return;
    const what = paths.length === 1 ? `"${basename(paths[0] ?? '')}"` : plural(paths.length, 'item');
    useDialogs.getState().open({
      type: 'confirm',
      title: `Delete ${what} permanently?`,
      message: 'This cannot be undone. The items will not go to Trash.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => void enqueue('delete', paths),
    });
  },

  async copyPaths(paths: string[]) {
    if (paths.length === 0) return;
    try {
      await writeText(paths.join('\n'));
      toast.success(paths.length === 1 ? 'Path copied' : `${plural(paths.length, 'path')} copied`);
    } catch (err) {
      toast.error("Couldn't copy to the clipboard", err);
    }
  },

  requestCompress(paths: string[]) {
    if (paths.length > 0) useDialogs.getState().open({ type: 'compress', paths });
  },

  /** Packs `paths` into one archive next to the first of them. */
  compress(paths: string[], format: ArchiveFormat) {
    const first = paths[0];
    if (first === undefined) return;
    useSettings.getState().update({ archiveFormat: format });
    void enqueue('compress', paths, dirname(first), format);
  },

  requestRename(entry: Entry) {
    if (entry.trashId === undefined) useDialogs.getState().open({ type: 'rename', entry });
  },

  async rename(entry: Entry, newName: string, tabId: string): Promise<boolean> {
    try {
      const renamed = await fsApi.rename(entry.path, newName);
      selectAfterReload(tabId, dirname(entry.path), renamed.path);
      return true;
    } catch (err) {
      toast.error(`Couldn't rename ${entry.name}`, err);
      return false;
    }
  },

  requestNewFolder(parent: string) {
    useDialogs.getState().open({ type: 'newFolder', parent });
  },

  async createFolder(parent: string, name: string, tabId: string): Promise<boolean> {
    try {
      const created = await fsApi.createDir(parent, name);
      selectAfterReload(tabId, parent, created.path);
      return true;
    } catch (err) {
      toast.error("Couldn't create the folder", err);
      return false;
    }
  },

  togglePin(path: string) {
    const { settings, update } = useSettings.getState();
    const pinned = settings.pinned.includes(path) ? settings.pinned.filter((p) => p !== path) : [...settings.pinned, path];
    update({ pinned });
  },

  async restore(entries: Entry[]) {
    const ids = trashIds(entries);
    if (ids.length === 0) return;
    try {
      await trashApi.restore(ids);
      toast.success(`Restored ${plural(ids.length, 'item')}`);
    } catch (err) {
      toast.error("Couldn't restore", err);
    }
    useListings.getState().reload(TRASH);
  },

  purge(entries: Entry[]) {
    const ids = trashIds(entries);
    if (ids.length === 0) return;
    useDialogs.getState().open({
      type: 'confirm',
      title: `Delete ${plural(ids.length, 'item')} forever?`,
      message: 'They will be removed from Trash and cannot be recovered.',
      confirmLabel: 'Delete forever',
      danger: true,
      onConfirm: () => {
        trashApi
          .purge(ids)
          .catch((err: unknown) => toast.error("Couldn't delete from Trash", err))
          .finally(() => useListings.getState().reload(TRASH));
      },
    });
  },

  emptyTrash() {
    useDialogs.getState().open({
      type: 'confirm',
      title: 'Empty Trash?',
      message: 'Everything in Trash will be permanently deleted.',
      confirmLabel: 'Empty Trash',
      danger: true,
      onConfirm: () => {
        trashApi
          .empty()
          .catch((err: unknown) => toast.error("Couldn't empty Trash", err))
          .finally(() => useListings.getState().reload(TRASH));
      },
    });
  },
};

/** Pasting inside this app works without it, so a failure only warns. */
function offerToSystemClipboard(paths: string[], cut: boolean) {
  desktopApi
    .copyFilesToClipboard(paths, cut)
    .catch((err: unknown) => toast.error("Couldn't put the files on the system clipboard", err));
}

function trashIds(entries: Entry[]): string[] {
  return entries.flatMap((entry) => (entry.trashId === undefined ? [] : [entry.trashId]));
}

/** Reloads a folder, then puts the keyboard cursor on the item that was just created. */
function selectAfterReload(tabId: string, dir: string, path: string) {
  useListings.getState().reload(dirLocation(dir));
  useExplorer.getState().setSelection(tabId, { paths: new Set([path]), anchor: path, focus: path });
}
