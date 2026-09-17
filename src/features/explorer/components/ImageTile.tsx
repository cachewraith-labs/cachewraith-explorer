import { Check } from 'lucide-react';
import { memo, useState } from 'react';

import { thumbnailUrl } from '@/ipc/thumbnails';
import type { Entry } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';

import { FilePage } from './FilePage';

interface ImageTileProps {
  entry: Entry;
  /** Height of the photo area; the photo keeps its aspect ratio within the tile's width. */
  maxHeight: number;
  selected: boolean;
  focused: boolean;
}

/**
 * An image shown as a photo: its real proportions (never cropped), rounded, with a soft
 * shadow and a format badge. The selection ring hugs the photo. Falls back to a file page
 * if the image cannot be decoded.
 */
export const ImageTile = memo(function ImageTile({ entry, maxHeight, selected, focused }: ImageTileProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');

  if (state === 'failed') {
    return (
      <FilePage
        entry={entry}
        width={72}
        height={maxHeight}
        iconSize={34}
        selected={selected}
        focused={focused}
        hoverable
        thumbnail={false}
      />
    );
  }

  const loaded = state === 'loaded';
  return (
    <div className="relative flex w-full items-end justify-center" style={{ height: maxHeight }}>
      {!loaded && (
        <div className="skeleton absolute bottom-0 rounded-[10px]" style={{ width: '86%', height: maxHeight * 0.72 }} />
      )}
      <div
        className={cn(
          'relative max-w-full transition-[opacity,transform] duration-300 ease-emphasized group-hover:-translate-y-0.5',
          loaded ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
        )}
      >
        <img
          src={thumbnailUrl(entry, 256)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          style={{ maxHeight }}
          className={cn(
            'block h-auto w-auto max-w-full rounded-[10px] outline-offset-2 transition-[outline-color,box-shadow] duration-150',
            'shadow-[0_3px_10px_rgba(0,0,0,0.35)] group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.45)]',
            selected
              ? 'outline-2 outline-primary'
              : focused
                ? 'outline-2 outline-primary/60'
                : 'outline-1 outline-outline-variant/40',
          )}
        />
        {entry.extension && (
          <span className="absolute bottom-1 left-1 rounded-[5px] bg-surface-lowest/75 px-1 py-px font-mono text-[9px] leading-3 font-semibold text-on-surface uppercase backdrop-blur-sm">
            {entry.extension === 'jpeg' ? 'jpg' : entry.extension}
          </span>
        )}
        <div
          className={cn(
            'absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-primary text-on-primary shadow',
            'transition-[opacity,transform] duration-200 ease-emphasized',
            selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )}
        >
          <Check size={12} strokeWidth={2.6} />
        </div>
      </div>
    </div>
  );
});
