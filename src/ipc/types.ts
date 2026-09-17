// Mirrors the serde types in `src-tauri/src`. Keep the two in sync.

export type ErrorKind = 'notFound' | 'permissionDenied' | 'alreadyExists' | 'invalidInput' | 'io' | 'trash' | 'cancelled';

export interface AppErrorPayload {
  kind: ErrorKind;
  message: string;
}

export type EntryKind = 'dir' | 'file' | 'other';

export interface Entry {
  name: string;
  path: string;
  kind: EntryKind;
  isSymlink: boolean;
  isHidden: boolean;
  size: number;
  /** Milliseconds since the Unix epoch. */
  modified: number | null;
  mode: number;
  extension: string | null;
  trashId?: string;
}

export interface Listing {
  path: string;
  entries: Entry[];
}

export type PlaceId = 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos';

export interface Place {
  id: PlaceId;
  label: string;
  path: string;
}

export interface Drive {
  label: string;
  mountPoint: string;
  device: string;
  model: string | null;
  fsType: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  removable: boolean;
  inHome: boolean;
}

export type JobKind = 'copy' | 'move' | 'trash' | 'delete';
export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface JobRequest {
  kind: JobKind;
  sources: string[];
  destination?: string;
}

export interface JobSnapshot {
  id: number;
  kind: JobKind;
  status: JobStatus;
  sources: string[];
  destination: string | null;
  bytesTotal: number;
  bytesDone: number;
  itemsTotal: number;
  itemsDone: number;
  bytesPerSecond: number;
  current: string | null;
  error: string | null;
}

export type ViewMode = 'grid' | 'list';
export type SortKey = 'name' | 'size' | 'modified' | 'kind';
export type SortDirection = 'asc' | 'desc';

export type ThemeSource = 'wallpaper' | 'color';
export type ThemeMode = 'system' | 'dark' | 'light';

export type FolderIconStyle = 'theme' | 'material';

export interface Settings {
  viewMode: ViewMode;
  showHidden: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  foldersFirst: boolean;
  sidebarCollapsed: boolean;
  previewOpen: boolean;
  pinned: string[];
  terminal: string | null;
  themeSource: ThemeSource;
  /** `#rrggbb` seed for `themeSource: 'color'`. */
  themeColor: string;
  themeMode: ThemeMode;
  reduceMotion: boolean;
  folderIconStyle: FolderIconStyle;
  confirmTrash: boolean;
  previousFileManager: string | null;
  defaultPromptDismissed: boolean;
}

export interface DesktopInfo {
  /** e.g. "GNOME", "KDE", "Hyprland"; empty when unknown. */
  name: string;
  wayland: boolean;
  /** The compositor draws no title bar controls, so the app must. */
  windowControls: boolean;
}

export interface DefaultAppStatus {
  isDefault: boolean;
  currentId: string | null;
  currentName: string | null;
}

/** Material token name (`surface_container_high`) → `#rrggbb`. */
export type Palette = Record<string, string>;

export type SearchEvent = { type: 'batch'; entries: Entry[] } | { type: 'done'; truncated: boolean; scanned: number };

export interface Properties {
  entry: Entry;
  created: number | null;
  accessed: number | null;
  owner: string;
  group: string;
  readable: boolean;
  writable: boolean;
  symlinkTarget: string | null;
}

export interface Usage {
  bytes: number;
  diskBytes: number;
  files: number;
  folders: number;
  unreadable: number;
}

export type UsageEvent = { type: 'progress'; usage: Usage } | { type: 'done'; usage: Usage };

export interface UpdateStatus {
  current: string;
  latest: string;
  updateAvailable: boolean;
  /** How this copy was installed; `manual` cannot update itself. */
  method: 'appimage' | 'deb' | 'rpm' | 'pacman' | 'manual';
  releaseUrl: string;
}
