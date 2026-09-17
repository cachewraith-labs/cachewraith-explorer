import { File, Folder, FolderSymlink } from 'lucide-react';
import { memo, useState } from 'react';

import type { Entry } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';

import { useSetting } from '../settings/store';
import { useAppliedScheme } from '../theme/palette';
import { DEFAULT_FOLDER_ICON, fileIconName, folderIconByName, iconUrl, isFolderIcon } from './material';
import { useFolderIcons } from './store';

interface EntryIconProps {
  entry: Entry;
  size: number;
  className?: string;
}

/**
 * The icon for a file or folder:
 * - files: VS Code's Material Icon Theme, detected from the name and extension;
 * - folders: the user's custom icon, else the theme-tinted glyph (or Material icons by
 *   folder name, if chosen in Settings).
 */
export const EntryIcon = memo(function EntryIcon({ entry, size, className }: EntryIconProps) {
  const isFolder = entry.kind === 'dir';
  const custom = useFolderIcons((s) => (isFolder ? s.icons[entry.path] : undefined));
  const style = useSetting('folderIconStyle');
  const light = useAppliedScheme((s) => !s.dark);
  const [failedIcon, setFailedIcon] = useState<string | null>(null);

  const icon = isFolder
    ? custom && isFolderIcon(custom)
      ? custom
      : style === 'material'
        ? (folderIconByName(entry.name, light) ?? DEFAULT_FOLDER_ICON)
        : null
    : fileIconName(entry.name, light);

  if (icon === null || icon === failedIcon) {
    const Glyph = isFolder ? (entry.isSymlink ? FolderSymlink : Folder) : File;
    return (
      <Glyph
        size={size}
        strokeWidth={1.7}
        aria-hidden
        className={cn(isFolder ? 'text-tertiary' : 'text-on-surface-variant', className)}
      />
    );
  }

  return (
    <img
      src={iconUrl(icon)}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      onError={() => setFailedIcon(icon)}
      className={cn('shrink-0 select-none', entry.isHidden && 'opacity-70', className)}
      style={{ width: size, height: size }}
    />
  );
});
