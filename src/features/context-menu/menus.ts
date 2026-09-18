import { FolderOpen, PanelTop, PinOff } from 'lucide-react';

import { displayShortcut } from '@/shared/lib/keys';
import { type MenuEntry, separator } from '@/shared/ui/menu';

import { commandContext } from '../commands/context';
import { findCommand, runCommand } from '../commands/registry';
import { fileActions } from '../operations/actions';
import { useSettings } from '../settings/store';

/** A menu item backed by a command: same label, icon, shortcut, and enabled rule. */
function command(id: string, overrides: { label?: string; danger?: boolean } = {}): MenuEntry[] {
  const cmd = findCommand(id);
  if (!cmd) return [];
  const ctx = commandContext();
  const shortcut = cmd.shortcuts?.[0];
  return [
    {
      type: 'item',
      id,
      label: overrides.label ?? cmd.title,
      icon: cmd.icon,
      ...(shortcut ? { shortcut: displayShortcut(shortcut) } : {}),
      ...(overrides.danger ? { danger: true } : {}),
      disabled: cmd.enabled ? !cmd.enabled(ctx) : false,
      run: () => void runCommand(cmd),
    },
  ];
}

/** Right-click on one or more items. */
export function itemMenu(): MenuEntry[] {
  const ctx = commandContext();
  if (ctx.inTrash) {
    return [
      ...command('restore', { label: 'Restore' }),
      ...command('delete-permanently', { label: 'Delete forever', danger: true }),
      separator('s1'),
      ...command('properties'),
      ...command('empty-trash', { danger: true }),
    ];
  }

  const target = ctx.target;
  const isDir = target?.kind === 'dir';
  const pinned = isDir && useSettings.getState().settings.pinned.includes(target.path);

  return [
    ...command('open'),
    ...(isDir
      ? [
          {
            type: 'item',
            id: 'open-tab',
            label: 'Open in new tab',
            icon: PanelTop,
            run: () => fileActions.openInNewTab(target.path),
          } satisfies MenuEntry,
        ]
      : []),
    ...command('terminal', { label: isDir ? 'Open in terminal' : 'Open terminal here' }),
    separator('s1'),
    ...command('copy'),
    ...command('cut'),
    ...(isDir
      ? [
          {
            type: 'item',
            id: 'paste-into',
            label: 'Paste into folder',
            icon: FolderOpen,
            disabled: findCommand('paste')?.enabled?.(ctx) === false,
            run: () => fileActions.paste(target.path),
          } satisfies MenuEntry,
        ]
      : []),
    ...command('copy-path'),
    ...command('rename'),
    ...command('compress'),
    ...(isDir ? command('folder-icon', { label: 'Change icon…' }) : []),
    ...(isDir
      ? pinned
        ? [
            {
              type: 'item',
              id: 'unpin',
              label: 'Unpin from sidebar',
              icon: PinOff,
              run: () => fileActions.togglePin(target.path),
            } satisfies MenuEntry,
          ]
        : command('pin', { label: 'Pin to sidebar' })
      : []),
    separator('s2'),
    ...command('properties'),
    ...command('move-to-trash', { danger: true }),
  ];
}

/** Right-click on empty space in a folder. */
export function backgroundMenu(): MenuEntry[] {
  const ctx = commandContext();
  if (ctx.inTrash) {
    return [...command('select-all'), separator('s1'), ...command('empty-trash', { danger: true })];
  }
  return [
    ...command('new-folder'),
    ...command('paste'),
    separator('s1'),
    ...command('terminal'),
    ...command('copy-path', { label: 'Copy folder path' }),
    ...command('pin', { label: 'Pin this folder' }),
    ...command('folder-icon', { label: 'Change folder icon…' }),
    separator('s2'),
    ...command('select-all'),
    ...command('toggle-hidden', {
      label: useSettings.getState().settings.showHidden ? 'Hide hidden files' : 'Show hidden files',
    }),
    ...command('reload'),
    separator('s3'),
    ...command('properties', { label: 'Folder properties' }),
  ];
}
