import { Check } from 'lucide-react';
import { memo } from 'react';

import { hasThumbnail } from '@/ipc/thumbnails';
import type { Entry } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';

import { dropTargetProps, useDrag } from '../dnd';
import type { ItemInteractions } from '../hooks/useItemInteractions';
import { GRID } from '../gridLayout';
import { FilePage } from './FilePage';
import { ImageTile } from './ImageTile';
import { Thumbnail } from './Thumbnail';

interface FileTileProps {
  entry: Entry;
  selected: boolean;
  focused: boolean;
  cut: boolean;
  interactions: ItemInteractions;
  /** Height of the icon area, shared by the row so labels line up when folders and files mix. */
  boxHeight: number;
}

export const FileTile = memo(function FileTile({ entry, selected, focused, cut, interactions, boxHeight }: FileTileProps) {
  const isFolder = entry.kind === 'dir' && entry.trashId === undefined;
  const dragOver = useDrag((state) => isFolder && state.overPath === entry.path);

  return (
    <div
      role="option"
      aria-selected={selected}
      title={entry.name}
      draggable={entry.trashId === undefined}
      onClick={(event) => interactions.onClick(entry, event)}
      onDoubleClick={() => interactions.onDoubleClick(entry)}
      onAuxClick={(event) => interactions.onAuxClick(entry, event)}
      onContextMenu={(event) => interactions.onContextMenu(entry, event)}
      onDragStart={(event) => interactions.onDragStart(entry, event)}
      onDragEnd={interactions.onDragEnd}
      {...dropTargetProps(isFolder ? entry.path : null)}
      className={cn('group flex min-w-0 flex-col items-center', cut && 'opacity-50')}
    >
      {entry.kind === 'dir' ? (
        <div className="flex w-full items-end" style={{ height: boxHeight }}>
          <FolderCard entry={entry} selected={selected} focused={focused} dragOver={dragOver} />
        </div>
      ) : (
        <div
          className="flex w-full items-end justify-center transition-transform duration-150 ease-emphasized group-active:scale-[0.97]"
          style={{ height: boxHeight }}
        >
          {hasThumbnail(entry) ? (
            <ImageTile entry={entry} maxHeight={boxHeight} selected={selected} focused={focused} />
          ) : (
            <FilePage
              entry={entry}
              width={GRID.fileWidth}
              height={GRID.fileHeight}
              iconSize={34}
              selected={selected}
              focused={focused}
              hoverable
            />
          )}
        </div>
      )}
      <div
        className={cn(
          'mt-1.5 line-clamp-2 h-8 w-full text-center text-[12px] leading-4 break-words',
          selected ? 'font-semibold text-on-surface' : 'text-on-surface',
          entry.isHidden && 'text-on-surface-variant',
        )}
      >
        {entry.name}
      </div>
    </div>
  );
});

/** Folders keep the wide card from the design. */
function FolderCard({
  entry,
  selected,
  focused,
  dragOver,
}: {
  entry: Entry;
  selected: boolean;
  focused: boolean;
  dragOver: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex h-[84px] w-full items-center justify-center overflow-hidden rounded-[14px] outline-offset-2',
        'transition-[background-color,outline-color,transform] duration-150 ease-emphasized group-active:scale-[0.97]',
        dragOver
          ? 'border-2 border-dashed border-primary bg-primary-container/40'
          : selected
            ? 'bg-primary-container outline-2 outline-primary'
            : 'bg-surface-high group-hover:bg-surface-highest',
        focused && !selected && 'outline-2 outline-primary/60',
      )}
    >
      <Thumbnail entry={entry} iconSize={38} />
      <div
        className={cn(
          'absolute top-1.5 right-1.5 flex size-[18px] items-center justify-center rounded-full bg-primary text-on-primary',
          'transition-[opacity,transform] duration-200 ease-emphasized',
          selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Check size={12} strokeWidth={2.6} />
      </div>
    </div>
  );
}
