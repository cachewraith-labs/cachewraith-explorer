import {
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CircleCheck,
  ClipboardPaste,
  Columns2,
  Command,
  Copy,
  Eye,
  FileArchive,
  FolderOpen,
  FolderPen,
  FolderPlus,
  LayoutGrid,
  Info,
  Link,
  List,
  type LucideIcon,
  PanelLeft,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Settings,
  SquareTerminal,
  TextCursorInput,
  Trash,
  X,
} from 'lucide-react';

import type { SortKey } from '@/ipc/types';

import { useListings } from '../explorer/listings';
import { dirLocation, TRASH } from '../explorer/model';
import { clickSelect, EMPTY_SELECTION, focusIndex, jumpFocus, selectAll } from '../explorer/selection';
import { useExplorer } from '../explorer/store';
import { useFolderIcons } from '../icons/store';
import { fileActions } from '../operations/actions';
import { useProperties } from '../properties/store';
import { useFileClipboard } from '../operations/clipboard';
import { usePlaces } from '../places/store';
import { useSettings } from '../settings/store';
import { useUi } from '../shell/ui';
import { type CommandContext, commandContext } from './context';

export type CommandGroup = 'Go' | 'File' | 'View' | 'Tabs' | 'Selection';

/**
 * One user action. Pattern: **Command** — the same object backs the keyboard shortcut,
 * the command palette entry, and the shortcut hint shown in menus.
 */
export interface AppCommand {
  id: string;
  title: string;
  group: CommandGroup;
  icon: LucideIcon;
  /** The first shortcut is the one displayed; the rest are aliases. */
  shortcuts?: readonly string[];
  /** Keyboard-only commands (arrow keys…) stay out of the palette. */
  hidden?: boolean;
  enabled?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void;
}

const hasSelection = (ctx: CommandContext) => ctx.selected.length > 0;
const hasWritableDir = (ctx: CommandContext) => ctx.writableDir !== null;
const notTrash = (ctx: CommandContext) => !ctx.inTrash && hasSelection(ctx);

function setSort(sortKey: SortKey) {
  const { settings, update } = useSettings.getState();
  update(
    settings.sortKey === sortKey
      ? { sortDirection: settings.sortDirection === 'asc' ? 'desc' : 'asc' }
      : { sortKey, sortDirection: sortKey === 'name' || sortKey === 'kind' ? 'asc' : 'desc' },
  );
}

/** Moves the keyboard cursor to the index `target` computes from the current one. */
function focusBy(target: (ctx: CommandContext, current: number) => number, extend: boolean) {
  return (ctx: CommandContext) => {
    const paths = ctx.entries.map((e) => e.path);
    const current = ctx.selection.focus === null ? -1 : paths.indexOf(ctx.selection.focus);
    const next = current === -1 ? 0 : target(ctx, current);
    useExplorer.getState().setSelection(ctx.tabId, focusIndex(ctx.selection, paths, next, extend));
  };
}

const rows = (count: number) => (ctx: CommandContext, current: number) => ctx.rowStep(current, count);
const items = (count: number) => (_ctx: CommandContext, current: number) => current + count;

const PAGE = 8;

const STATIC_COMMANDS: AppCommand[] = [
  // ---- Go ----
  {
    id: 'palette',
    title: 'Command palette',
    group: 'Go',
    icon: Command,
    shortcuts: ['Ctrl+K'],
    hidden: true,
    run: () => useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen),
  },
  {
    id: 'back',
    title: 'Back',
    group: 'Go',
    icon: ArrowLeft,
    shortcuts: ['Alt+ArrowLeft', 'BrowserBack'],
    run: (ctx) => useExplorer.getState().goBack(ctx.tabId),
  },
  {
    id: 'forward',
    title: 'Forward',
    group: 'Go',
    icon: ArrowRight,
    shortcuts: ['Alt+ArrowRight', 'BrowserForward'],
    run: (ctx) => useExplorer.getState().goForward(ctx.tabId),
  },
  {
    id: 'up',
    title: 'Parent folder',
    group: 'Go',
    icon: ArrowUp,
    shortcuts: ['Alt+ArrowUp', 'Backspace'],
    run: (ctx) => useExplorer.getState().goUp(ctx.tabId),
  },
  {
    id: 'reload',
    title: 'Reload',
    group: 'Go',
    icon: RotateCcw,
    shortcuts: ['F5', 'Ctrl+R'],
    run: (ctx) => ctx.location && useListings.getState().reload(ctx.location),
  },
  {
    id: 'edit-path',
    title: 'Go to path…',
    group: 'Go',
    icon: TextCursorInput,
    shortcuts: ['Ctrl+L'],
    run: () => useUi.getState().requestPathEdit(),
  },
  {
    id: 'search',
    title: 'Search',
    group: 'Go',
    icon: Search,
    shortcuts: ['Ctrl+F'],
    run: () => useUi.getState().requestSearchFocus(),
  },
  {
    id: 'trash',
    title: 'Trash',
    group: 'Go',
    icon: Trash,
    shortcuts: ['Alt+8'],
    run: (ctx) => useExplorer.getState().navigate(TRASH, ctx.tabId),
  },

  // ---- File ----
  {
    id: 'open',
    title: 'Open',
    group: 'File',
    icon: FolderOpen,
    shortcuts: ['Enter'],
    hidden: true,
    enabled: (ctx) => ctx.selected.length > 0 && !ctx.inTrash,
    run: (ctx) => {
      const [first, ...rest] = ctx.selected;
      if (!first) return;
      if (rest.length === 0 || first.kind === 'dir') return fileActions.open(first, ctx.tabId);
      ctx.selected
        .filter((e) => e.kind === 'file')
        .slice(0, 12)
        .forEach((e) => fileActions.open(e));
    },
  },
  {
    id: 'new-folder',
    title: 'New folder',
    group: 'File',
    icon: FolderPlus,
    shortcuts: ['Ctrl+Shift+N'],
    enabled: hasWritableDir,
    run: (ctx) => ctx.writableDir && fileActions.requestNewFolder(ctx.writableDir),
  },
  {
    id: 'rename',
    title: 'Rename',
    group: 'File',
    icon: Pencil,
    shortcuts: ['F2'],
    enabled: (ctx) => ctx.target !== undefined && !ctx.inTrash,
    run: (ctx) => ctx.target && fileActions.requestRename(ctx.target),
  },
  {
    id: 'copy',
    title: 'Copy',
    group: 'File',
    icon: Copy,
    shortcuts: ['Ctrl+C'],
    enabled: notTrash,
    run: (ctx) => fileActions.copy(ctx.selected.map((e) => e.path)),
  },
  {
    id: 'cut',
    title: 'Cut',
    group: 'File',
    icon: Scissors,
    shortcuts: ['Ctrl+X'],
    enabled: notTrash,
    run: (ctx) => fileActions.cut(ctx.selected.map((e) => e.path)),
  },
  {
    id: 'paste',
    title: 'Paste',
    group: 'File',
    icon: ClipboardPaste,
    shortcuts: ['Ctrl+V'],
    enabled: (ctx) => hasWritableDir(ctx) && useFileClipboard.getState().clip !== null,
    run: (ctx) => ctx.writableDir && fileActions.paste(ctx.writableDir),
  },
  {
    id: 'copy-path',
    title: 'Copy path',
    group: 'File',
    icon: Link,
    shortcuts: ['Ctrl+Shift+C'],
    enabled: (ctx) => hasSelection(ctx) || ctx.contextDir !== null,
    run: (ctx) => {
      const paths = ctx.selected.length > 0 ? ctx.selected.map((e) => e.path) : [ctx.contextDir ?? ''];
      void fileActions.copyPaths(paths.filter(Boolean));
    },
  },
  {
    id: 'compress',
    title: 'Compress…',
    group: 'File',
    icon: FileArchive,
    enabled: notTrash,
    run: (ctx) => fileActions.requestCompress(ctx.selected.map((e) => e.path)),
  },
  {
    id: 'move-to-trash',
    title: 'Move to Trash',
    group: 'File',
    icon: Trash,
    shortcuts: ['Delete'],
    enabled: notTrash,
    run: (ctx) => fileActions.trash(ctx.selected.map((e) => e.path)),
  },
  {
    id: 'delete-permanently',
    title: 'Delete permanently',
    group: 'File',
    icon: X,
    shortcuts: ['Shift+Delete'],
    enabled: hasSelection,
    run: (ctx) =>
      ctx.inTrash ? fileActions.purge(ctx.selected) : fileActions.deletePermanently(ctx.selected.map((e) => e.path)),
  },
  {
    id: 'restore',
    title: 'Restore from Trash',
    group: 'File',
    icon: ArchiveRestore,
    shortcuts: ['Ctrl+Z'],
    enabled: (ctx) => ctx.inTrash && hasSelection(ctx),
    run: (ctx) => void fileActions.restore(ctx.selected),
  },
  {
    id: 'empty-trash',
    title: 'Empty Trash',
    group: 'File',
    icon: Trash,
    enabled: (ctx) => ctx.inTrash,
    run: () => fileActions.emptyTrash(),
  },
  {
    id: 'terminal',
    title: 'Open terminal here',
    group: 'File',
    icon: SquareTerminal,
    shortcuts: ['Ctrl+Alt+T'],
    enabled: (ctx) => ctx.contextDir !== null,
    run: (ctx) => {
      const target = ctx.target?.kind === 'dir' ? ctx.target.path : ctx.contextDir;
      if (target) fileActions.openTerminal(target);
    },
  },
  {
    id: 'folder-icon',
    title: 'Change folder icon…',
    group: 'File',
    icon: FolderPen,
    enabled: (ctx) => (ctx.target?.kind === 'dir' && !ctx.inTrash) || ctx.writableDir !== null,
    run: (ctx) => {
      const path = ctx.target?.kind === 'dir' ? ctx.target.path : ctx.writableDir;
      if (path) useFolderIcons.getState().openPicker(path);
    },
  },
  {
    id: 'pin',
    title: 'Pin folder to sidebar',
    group: 'File',
    icon: Pin,
    enabled: (ctx) => (ctx.target?.kind === 'dir' && !ctx.inTrash) || ctx.writableDir !== null,
    run: (ctx) => {
      const path = ctx.target?.kind === 'dir' ? ctx.target.path : ctx.writableDir;
      if (path) fileActions.togglePin(path);
    },
  },

  // ---- Selection (keyboard) ----
  {
    id: 'select-all',
    title: 'Select all',
    group: 'Selection',
    icon: CircleCheck,
    shortcuts: ['Ctrl+A'],
    run: (ctx) =>
      useExplorer.getState().setSelection(
        ctx.tabId,
        selectAll(
          ctx.entries.map((e) => e.path),
          ctx.selection.focus,
        ),
      ),
  },
  {
    id: 'clear-selection',
    title: 'Clear selection',
    group: 'Selection',
    icon: X,
    shortcuts: ['Escape'],
    hidden: true,
    run: (ctx) => useExplorer.getState().setSelection(ctx.tabId, EMPTY_SELECTION),
  },
  {
    id: 'toggle-focused',
    title: 'Toggle selection',
    group: 'Selection',
    icon: CircleCheck,
    shortcuts: ['Space', 'Ctrl+Space'],
    hidden: true,
    run: (ctx) => {
      if (ctx.selection.focus === null) return;
      const paths = ctx.entries.map((e) => e.path);
      useExplorer.getState().setSelection(ctx.tabId, clickSelect(ctx.selection, paths, ctx.selection.focus, 'toggle'));
    },
  },
  {
    id: 'focus-down',
    title: 'Next row',
    group: 'Selection',
    icon: ArrowDown,
    shortcuts: ['ArrowDown'],
    hidden: true,
    run: focusBy(rows(1), false),
  },
  {
    id: 'focus-up',
    title: 'Previous row',
    group: 'Selection',
    icon: ArrowUp,
    shortcuts: ['ArrowUp'],
    hidden: true,
    run: focusBy(rows(-1), false),
  },
  {
    id: 'focus-right',
    title: 'Next item',
    group: 'Selection',
    icon: ArrowRight,
    shortcuts: ['ArrowRight'],
    hidden: true,
    run: focusBy(items(1), false),
  },
  {
    id: 'focus-left',
    title: 'Previous item',
    group: 'Selection',
    icon: ArrowLeft,
    shortcuts: ['ArrowLeft'],
    hidden: true,
    run: focusBy(items(-1), false),
  },
  {
    id: 'extend-down',
    title: 'Extend down',
    group: 'Selection',
    icon: ArrowDown,
    shortcuts: ['Shift+ArrowDown'],
    hidden: true,
    run: focusBy(rows(1), true),
  },
  {
    id: 'extend-up',
    title: 'Extend up',
    group: 'Selection',
    icon: ArrowUp,
    shortcuts: ['Shift+ArrowUp'],
    hidden: true,
    run: focusBy(rows(-1), true),
  },
  {
    id: 'extend-right',
    title: 'Extend right',
    group: 'Selection',
    icon: ArrowRight,
    shortcuts: ['Shift+ArrowRight'],
    hidden: true,
    run: focusBy(items(1), true),
  },
  {
    id: 'extend-left',
    title: 'Extend left',
    group: 'Selection',
    icon: ArrowLeft,
    shortcuts: ['Shift+ArrowLeft'],
    hidden: true,
    run: focusBy(items(-1), true),
  },
  {
    id: 'page-down',
    title: 'Page down',
    group: 'Selection',
    icon: ArrowDown,
    shortcuts: ['PageDown'],
    hidden: true,
    run: focusBy(rows(PAGE), false),
  },
  {
    id: 'page-up',
    title: 'Page up',
    group: 'Selection',
    icon: ArrowUp,
    shortcuts: ['PageUp'],
    hidden: true,
    run: focusBy(rows(-PAGE), false),
  },
  {
    id: 'first',
    title: 'First item',
    group: 'Selection',
    icon: ArrowUp,
    shortcuts: ['Home'],
    hidden: true,
    run: (ctx) =>
      useExplorer.getState().setSelection(
        ctx.tabId,
        jumpFocus(
          ctx.selection,
          ctx.entries.map((e) => e.path),
          'first',
          false,
        ),
      ),
  },
  {
    id: 'last',
    title: 'Last item',
    group: 'Selection',
    icon: ArrowDown,
    shortcuts: ['End'],
    hidden: true,
    run: (ctx) =>
      useExplorer.getState().setSelection(
        ctx.tabId,
        jumpFocus(
          ctx.selection,
          ctx.entries.map((e) => e.path),
          'last',
          false,
        ),
      ),
  },

  // ---- View ----
  {
    id: 'view-grid',
    title: 'Grid view',
    group: 'View',
    icon: LayoutGrid,
    shortcuts: ['Ctrl+1'],
    run: () => useSettings.getState().update({ viewMode: 'grid' }),
  },
  {
    id: 'view-list',
    title: 'List view',
    group: 'View',
    icon: List,
    shortcuts: ['Ctrl+2'],
    run: () => useSettings.getState().update({ viewMode: 'list' }),
  },
  {
    id: 'toggle-hidden',
    title: 'Toggle hidden files',
    group: 'View',
    icon: Eye,
    shortcuts: ['Ctrl+H'],
    run: () => useSettings.getState().update({ showHidden: !useSettings.getState().settings.showHidden }),
  },
  {
    id: 'toggle-sidebar',
    title: 'Toggle sidebar',
    group: 'View',
    icon: PanelLeft,
    shortcuts: ['Ctrl+B'],
    run: () => useSettings.getState().update({ sidebarCollapsed: !useSettings.getState().settings.sidebarCollapsed }),
  },
  {
    id: 'properties',
    title: 'Properties',
    group: 'File',
    icon: Info,
    shortcuts: ['Alt+Enter', 'Ctrl+I'],
    enabled: (ctx) => ctx.selected.length > 0 || ctx.contextDir !== null,
    run: (ctx) => {
      if (ctx.selected.length > 0) useProperties.getState().open(ctx.selected);
      else if (ctx.contextDir) void useProperties.getState().openPath(ctx.contextDir);
    },
  },
  {
    id: 'toggle-preview',
    title: 'Toggle details panel',
    group: 'View',
    icon: PanelRight,
    shortcuts: ['F9'],
    run: () => useSettings.getState().update({ previewOpen: !useSettings.getState().settings.previewOpen }),
  },
  { id: 'sort-name', title: 'Sort by name', group: 'View', icon: ArrowUpDown, run: () => setSort('name') },
  { id: 'sort-size', title: 'Sort by size', group: 'View', icon: ArrowUpDown, run: () => setSort('size') },
  { id: 'sort-modified', title: 'Sort by modified date', group: 'View', icon: ArrowUpDown, run: () => setSort('modified') },
  { id: 'sort-kind', title: 'Sort by type', group: 'View', icon: ArrowUpDown, run: () => setSort('kind') },
  {
    id: 'folders-first',
    title: 'Toggle folders first',
    group: 'View',
    icon: ArrowUpDown,
    run: () => useSettings.getState().update({ foldersFirst: !useSettings.getState().settings.foldersFirst }),
  },

  {
    id: 'settings',
    title: 'Settings',
    group: 'View',
    icon: Settings,
    shortcuts: ['Ctrl+,'],
    run: () => useUi.getState().setSettingsOpen(true),
  },

  // ---- Tabs ----
  {
    id: 'new-tab',
    title: 'New tab',
    group: 'Tabs',
    icon: Plus,
    shortcuts: ['Ctrl+T'],
    run: (ctx) => useExplorer.getState().openTab(ctx.location ?? dirLocation(usePlaces.getState().home)),
  },
  {
    id: 'close-tab',
    title: 'Close tab',
    group: 'Tabs',
    icon: X,
    shortcuts: ['Ctrl+W'],
    run: (ctx) => useExplorer.getState().closeTab(ctx.tabId),
  },
  {
    id: 'next-tab',
    title: 'Next tab',
    group: 'Tabs',
    icon: ArrowRight,
    shortcuts: ['Ctrl+Tab', 'Ctrl+PageDown'],
    hidden: true,
    run: () => useExplorer.getState().cycleTab(1),
  },
  {
    id: 'previous-tab',
    title: 'Previous tab',
    group: 'Tabs',
    icon: ArrowLeft,
    shortcuts: ['Ctrl+Shift+Tab', 'Ctrl+PageUp'],
    hidden: true,
    run: () => useExplorer.getState().cycleTab(-1),
  },
  {
    id: 'split',
    title: 'Toggle split view',
    group: 'Tabs',
    icon: Columns2,
    shortcuts: ['F3'],
    run: () => useExplorer.getState().toggleSplit(),
  },
  {
    id: 'other-pane',
    title: 'Focus other pane',
    group: 'Tabs',
    icon: Columns2,
    shortcuts: ['F6'],
    enabled: () => useExplorer.getState().panes.length > 1,
    run: () => {
      const { activePaneId, focusPane } = useExplorer.getState();
      focusPane(activePaneId === 'primary' ? 'secondary' : 'primary');
    },
  },
];

/** Alt+1…7 jump to the standard places, in sidebar order. */
function placeCommands(): AppCommand[] {
  return usePlaces
    .getState()
    .places.slice(0, 7)
    .map((place, index) => ({
      id: `place-${place.id}`,
      title: place.label,
      group: 'Go',
      icon: FolderOpen,
      shortcuts: [`Alt+${index + 1}`],
      run: (ctx: CommandContext) => useExplorer.getState().navigate(dirLocation(place.path), ctx.tabId),
    }));
}

export function allCommands(): AppCommand[] {
  return [...placeCommands(), ...STATIC_COMMANDS];
}

export function findCommand(id: string): AppCommand | undefined {
  return allCommands().find((command) => command.id === id);
}

export function shortcutOf(id: string): string | undefined {
  return findCommand(id)?.shortcuts?.[0];
}

/** Runs a command if it is enabled right now. Returns whether it ran. */
export function runCommand(command: AppCommand, ctx: CommandContext = commandContext()): boolean {
  if (command.enabled && !command.enabled(ctx)) return false;
  command.run(ctx);
  return true;
}
