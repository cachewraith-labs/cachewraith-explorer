// Typed wrappers for every backend command, grouped by backend module.

import { Channel } from '@tauri-apps/api/core';

import { call } from './client';
import type {
  DefaultAppStatus,
  DesktopInfo,
  Drive,
  Entry,
  JobRequest,
  JobSnapshot,
  Listing,
  Palette,
  Place,
  SearchEvent,
  Properties,
  Settings,
  UpdateStatus,
  UsageEvent,
} from './types';

export const fsApi = {
  listDir: (path: string) => call<Listing>('list_dir', { path }),
  stat: (path: string) => call<Entry>('stat_path', { path }),
  childCount: (path: string) => call<number>('child_count', { path }),
  createDir: (parent: string, name: string) => call<Entry>('create_dir', { parent, name }),
  rename: (path: string, newName: string) => call<Entry>('rename_path', { path, newName }),
  places: () => call<Place[]>('get_places'),
  initialLocation: () => call<string | null>('initial_location'),
};

export const desktopApi = {
  info: () => call<DesktopInfo>('desktop_info'),
  defaultAppStatus: () => call<DefaultAppStatus>('default_app_status'),
  makeDefault: () => call<{ status: DefaultAppStatus; previousId: string | null }>('make_default_app'),
  restoreDefault: (id: string) => call<DefaultAppStatus>('restore_default_app', { id }),
};

export const folderIconsApi = {
  list: () => call<Record<string, string>>('list_folder_icons'),
  /** `icon: null` restores the default. */
  set: (path: string, icon: string | null) => call<void>('set_folder_icon', { path, icon }),
};

export const propertiesApi = {
  get: (path: string) => call<Properties>('path_properties', { path }),
  startUsage(paths: string[], onEvent: (event: UsageEvent) => void) {
    const channel = new Channel<UsageEvent>();
    channel.onmessage = onEvent;
    return call<number>('start_folder_usage', { paths, onEvent: channel });
  },
  cancelUsage: (id: number) => call<void>('cancel_folder_usage', { id }),
};

export const updatesApi = {
  check: () => call<UpdateStatus>('check_update'),
};

export const drivesApi = {
  list: () => call<Drive[]>('list_drives'),
};

export const jobsApi = {
  enqueue: (request: JobRequest) => call<JobSnapshot>('enqueue_job', { request }),
  pause: (id: number) => call<void>('pause_job', { id }),
  resume: (id: number) => call<void>('resume_job', { id }),
  cancel: (id: number) => call<void>('cancel_job', { id }),
  list: () => call<JobSnapshot[]>('list_jobs'),
};

export const trashApi = {
  list: () => call<Entry[]>('list_trash'),
  restore: (ids: string[]) => call<void>('restore_trash', { ids }),
  purge: (ids: string[]) => call<void>('purge_trash', { ids }),
  empty: () => call<void>('empty_trash'),
};

export const searchApi = {
  start(root: string, query: string, includeHidden: boolean, onEvent: (event: SearchEvent) => void) {
    const channel = new Channel<SearchEvent>();
    channel.onmessage = onEvent;
    return call<number>('start_search', { root, query, includeHidden, onEvent: channel });
  },
  cancel: (id: number) => call<void>('cancel_search', { id }),
};

export const watchApi = {
  watchDirs: (paths: string[]) => call<void>('watch_dirs', { paths }),
};

export const themeApi = {
  get: () => call<Palette | null>('get_theme'),
};

export const settingsApi = {
  load: () => call<Settings>('load_settings'),
  save: (settings: Settings) => call<Settings>('save_settings', { settings }),
};

export const launcherApi = {
  open: (path: string) => call<void>('open_path', { path }),
  openTerminal: (dir: string) => call<void>('open_terminal', { dir }),
};
