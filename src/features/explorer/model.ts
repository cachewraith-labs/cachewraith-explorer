import type { Drive } from '@/ipc/types';
import { basename } from '@/shared/lib/path';

/**
 * Where a tab is. A discriminated union, so a new kind of location (network share,
 * recent files…) is one more variant, and the compiler lists every place that must
 * handle it.
 */
export type Location = { type: 'dir'; path: string } | { type: 'trash' } | { type: 'search'; root: string; query: string };

export const dirLocation = (path: string): Location => ({ type: 'dir', path });
export const TRASH: Location = { type: 'trash' };

export function locationKey(location: Location): string {
  switch (location.type) {
    case 'dir':
      return `dir:${location.path}`;
    case 'trash':
      return 'trash';
    case 'search':
      // A path can contain almost any character, but never NUL.
      return `search:${location.root}${String.fromCharCode(0)}${location.query}`;
  }
}

/** The folder new items go into, or `null` where that makes no sense (trash, results). */
export function writableDir(location: Location): string | null {
  return location.type === 'dir' ? location.path : null;
}

/** The folder a terminal or "up" should start from. */
export function contextDir(location: Location): string | null {
  switch (location.type) {
    case 'dir':
      return location.path;
    case 'search':
      return location.root;
    case 'trash':
      return null;
  }
}

export function locationTitle(location: Location, home: string, drives: readonly Drive[]): string {
  switch (location.type) {
    case 'trash':
      return 'Trash';
    case 'search':
      return `"${location.query}"`;
    case 'dir': {
      if (location.path === home) return 'Home';
      const drive = drives.find((d) => d.mountPoint === location.path && d.mountPoint !== '/');
      return drive?.label ?? basename(location.path);
    }
  }
}
