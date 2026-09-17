import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { JobSnapshot, Palette } from './types';

// Names match `events` in `src-tauri/src/lib.rs`.
const EVENTS = {
  jobsUpdated: 'jobs:updated',
  fsChanged: 'fs:changed',
  themeChanged: 'theme:changed',
  folderIconsChanged: 'folder-icons:changed',
} as const;

export const onJobsUpdated = (handler: (snapshot: JobSnapshot) => void): Promise<UnlistenFn> =>
  listen<JobSnapshot>(EVENTS.jobsUpdated, (event) => handler(event.payload));

export const onFsChanged = (handler: (dirs: string[]) => void): Promise<UnlistenFn> =>
  listen<string[]>(EVENTS.fsChanged, (event) => handler(event.payload));

export const onThemeChanged = (handler: (palette: Palette) => void): Promise<UnlistenFn> =>
  listen<Palette>(EVENTS.themeChanged, (event) => handler(event.payload));

export const onFolderIconsChanged = (handler: (icons: Record<string, string>) => void): Promise<UnlistenFn> =>
  listen<Record<string, string>>(EVENTS.folderIconsChanged, (event) => handler(event.payload));
