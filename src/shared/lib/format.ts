import type { Entry } from '@/ipc/types';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Binary units (1 KB = 1024 B) with short labels, the way `df -h` and `ls -lh` count, so
 * a drive shows the same size here as in the terminal: `469 GB`, `4.2 MB`.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, '')} ${UNITS[exponent]}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Today → time; otherwise → `Sep 12, 2026`. */
export function formatDate(millis: number | null, now: Date = new Date()): string {
  if (millis === null) return '—';
  const date = new Date(millis);
  return date.toDateString() === now.toDateString() ? timeFormat.format(date) : dateFormat.format(date);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s left`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m left`;
  return `~${(seconds / 3600).toFixed(1).replace(/\.0$/, '')}h left`;
}

/** `0o644` → `rw-r--r--`. */
export function formatPermissions(mode: number): string {
  const bits = ['r', 'w', 'x'];
  let out = '';
  for (let shift = 6; shift >= 0; shift -= 3) {
    for (let i = 0; i < 3; i++) {
      out += (mode >> (shift + 2 - i)) & 1 ? bits[i] : '-';
    }
  }
  return out;
}

const KIND_LABELS: Record<string, string> = {
  jpg: 'JPEG image',
  jpeg: 'JPEG image',
  png: 'PNG image',
  gif: 'GIF image',
  webp: 'WebP image',
  svg: 'SVG image',
  bmp: 'Bitmap image',
  ico: 'Icon',
  tif: 'TIFF image',
  tiff: 'TIFF image',
  mp4: 'Video',
  mkv: 'Video',
  webm: 'Video',
  mov: 'Video',
  avi: 'Video',
  mp3: 'Audio',
  flac: 'Audio',
  ogg: 'Audio',
  wav: 'Audio',
  m4a: 'Audio',
  opus: 'Audio',
  zip: 'Archive',
  tar: 'Archive',
  gz: 'Archive',
  zst: 'Archive',
  xz: 'Archive',
  bz2: 'Archive',
  '7z': 'Archive',
  rar: 'Archive',
  iso: 'Disk image',
  img: 'Disk image',
  pdf: 'PDF document',
  md: 'Markdown',
  txt: 'Text',
  doc: 'Document',
  docx: 'Document',
  odt: 'Document',
  xls: 'Spreadsheet',
  xlsx: 'Spreadsheet',
  ods: 'Spreadsheet',
  csv: 'CSV',
  sh: 'Shell script',
  py: 'Python',
  rs: 'Rust',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  go: 'Go',
  java: 'Java',
  json: 'JSON',
  toml: 'TOML',
  yaml: 'YAML',
  yml: 'YAML',
  html: 'HTML',
  css: 'CSS',
  conf: 'Config',
  key: 'Key file',
  deb: 'Package',
  rpm: 'Package',
  appimage: 'AppImage',
};

export function kindLabel(entry: Entry): string {
  if (entry.kind === 'dir') return 'Folder';
  if (entry.kind === 'other') return entry.isSymlink ? 'Broken link' : 'Special file';
  if (entry.extension === null) return 'File';
  return KIND_LABELS[entry.extension] ?? `${entry.extension.toUpperCase()} file`;
}
