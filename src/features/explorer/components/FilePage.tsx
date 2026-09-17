import { Check } from 'lucide-react';
import { memo } from 'react';

import type { Entry } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';

import { EntryIcon } from '../../icons/EntryIcon';
import { Thumbnail } from './Thumbnail';

interface FilePageProps {
  entry: Entry;
  width: number;
  height: number;
  iconSize: number;
  selected?: boolean;
  focused?: boolean;
  /** Lighten on hover of the nearest `group` ancestor (grid tiles). */
  hoverable?: boolean;
  /** `false` shows only the type icon, e.g. for an image that failed to decode. */
  thumbnail?: boolean;
}

const STROKE = 2;

/**
 * A file drawn as a page: portrait, rounded, with a folded top-right corner, so files read
 * differently from folders' wide cards. Drawn as SVG so the selection outline follows the
 * fold (a CSS outline would be clipped away by `clip-path`). Image thumbnails are clipped
 * to the same shape.
 */
export const FilePage = memo(function FilePage({
  entry,
  width,
  height,
  iconSize,
  selected = false,
  focused = false,
  hoverable = false,
  thumbnail = true,
}: FilePageProps) {
  const radius = Math.round(width * 0.14);
  const fold = Math.round(width * 0.26);
  const body = pagePath(width, height, radius, fold, STROKE / 2);
  const corner = foldPath(width, fold, STROKE / 2);

  return (
    <div className="relative shrink-0" style={{ width, height }}>
      <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0">
        <path
          d={body}
          className={cn(
            'transition-[fill] duration-150 ease-emphasized',
            selected ? 'fill-primary-container' : cn('fill-surface-high', hoverable && 'group-hover:fill-surface-highest'),
          )}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center pt-[12%]" style={{ clipPath: `path('${body}')` }}>
        {thumbnail ? <Thumbnail entry={entry} iconSize={iconSize} /> : <EntryIcon entry={entry} size={iconSize} />}
      </div>

      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        <path d={corner} className={cn('transition-[fill] duration-150', selected ? 'fill-primary' : 'fill-surface-highest')} />
        <path
          d={body}
          fill="none"
          strokeWidth={STROKE}
          strokeLinejoin="round"
          className={cn(
            'transition-[stroke] duration-150 ease-emphasized',
            selected ? 'stroke-primary' : focused ? 'stroke-primary/60' : 'stroke-outline-variant/60',
          )}
        />
      </svg>

      <div
        className={cn(
          'absolute right-1.5 bottom-1.5 flex size-[18px] items-center justify-center rounded-full bg-primary text-on-primary',
          'transition-[opacity,transform] duration-200 ease-emphasized',
          selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Check size={12} strokeWidth={2.6} />
      </div>
    </div>
  );
});

/** Outline of the page: rounded corners, with the top-right corner cut for the fold. */
export function pagePath(width: number, height: number, radius: number, fold: number, inset: number): string {
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  return [
    `M${left + radius} ${top}`,
    `H${right - fold}`,
    `L${right} ${top + fold}`,
    `V${bottom - radius}`,
    `A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H${left + radius}`,
    `A${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `V${top + radius}`,
    `A${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
    'Z',
  ].join(' ');
}

/** The folded-over corner: a triangle with a softened inner corner. */
function foldPath(width: number, fold: number, inset: number): string {
  const right = width - inset;
  const top = inset;
  const soft = Math.min(4, fold / 3);
  return `M${right - fold} ${top} V${top + fold - soft} Q${right - fold} ${top + fold} ${right - fold + soft} ${top + fold} H${right} Z`;
}
