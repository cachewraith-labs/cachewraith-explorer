import { cn } from '@/shared/lib/cn';

import type { FolderIcon } from './folderIcons';
import { FOLDER_PATH, folderColors, MOTIVE_BOX } from './folderShape';
import { iconUrl } from './material';

interface FolderIconViewProps {
  icon: FolderIcon;
  size: number;
  className?: string;
  onError?: () => void;
}

/** Material Icon Theme folder colors (its 600 shades), one per symbol by name. */
const SYMBOL_COLORS = [
  '#e53935',
  '#d81b60',
  '#8e24aa',
  '#5e35b1',
  '#3949ab',
  '#1e88e5',
  '#00897b',
  '#43a047',
  '#f4511e',
  '#6d4c41',
];

function symbolColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return SYMBOL_COLORS[Math.abs(hash) % SYMBOL_COLORS.length] ?? '#1e88e5';
}

/**
 * Draws any custom folder icon in the Material Icon Theme's style: theme folders and logo
 * folders are prebuilt SVGs; symbol folders are drawn here, the theme's folder shape with
 * the symbol as its emblem.
 */
export function FolderIconView({ icon, size, className, onError }: FolderIconViewProps) {
  if (icon.kind === 'symbol') {
    const { folder, motive } = folderColors(symbolColor(icon.id));
    const { x, y, size: box } = MOTIVE_BOX;
    return (
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        aria-hidden
        className={cn('shrink-0 select-none', className)}
        style={{ width: size, height: size }}
      >
        <path fill={folder} d={FOLDER_PATH} />
        <icon.Glyph x={x} y={y} width={box} height={box} size={box} color={motive} strokeWidth={2.6} />
      </svg>
    );
  }

  return (
    <img
      src={icon.kind === 'theme' ? iconUrl(icon.name) : icon.url}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={onError}
      className={cn('shrink-0 select-none', className)}
      style={{ width: size, height: size }}
    />
  );
}
