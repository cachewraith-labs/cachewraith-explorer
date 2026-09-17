import { useState } from 'react';

import { hasThumbnail, type ThumbnailSize, thumbnailUrl } from '@/ipc/thumbnails';
import type { Entry } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';

import { EntryIcon } from '../../icons/EntryIcon';

interface ThumbnailProps {
  entry: Entry;
  iconSize: number;
  size?: ThumbnailSize;
  fit?: 'cover' | 'contain';
}

/** An image thumbnail that fades in once decoded, or the file-type icon. */
export function Thumbnail({ entry, iconSize, size = 256, fit = 'cover' }: ThumbnailProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const src = hasThumbnail(entry) ? thumbnailUrl(entry, size) : null;

  if (!src || state === 'failed') return <EntryIcon entry={entry} size={iconSize} />;

  return (
    <>
      {state === 'loading' && <div className="skeleton absolute inset-0" />}
      <img
        key={src}
        src={src}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
        className={cn(
          'absolute inset-0 size-full transition-opacity duration-300 ease-emphasized',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          state === 'loaded' ? 'opacity-100' : 'opacity-0',
        )}
      />
    </>
  );
}
