import { convertFileSrc } from '@tauri-apps/api/core';

import type { Entry } from './types';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff']);

export type ThumbnailSize = 256 | 512;

export function hasThumbnail(entry: Entry): boolean {
  return (
    entry.kind === 'file' && entry.trashId === undefined && entry.extension !== null && IMAGE_EXTENSIONS.has(entry.extension)
  );
}

/** `v` changes with the file, so an edited image never shows a stale cached thumbnail. */
export function thumbnailUrl(entry: Entry, size: ThumbnailSize = 256): string {
  return `${convertFileSrc(entry.path, 'thumb')}?s=${size}&v=${entry.modified ?? 0}`;
}
