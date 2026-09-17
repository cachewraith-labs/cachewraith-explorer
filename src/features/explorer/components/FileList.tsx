import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';

import type { Entry, SortKey } from '@/ipc/types';
import { useElementWidth } from '@/shared/hooks/useElementWidth';
import { cn } from '@/shared/lib/cn';
import { formatBytes, formatDate, kindLabel } from '@/shared/lib/format';

import { EntryIcon } from '../../icons/EntryIcon';
import { useFileClipboard } from '../../operations/clipboard';
import { useSettings } from '../../settings/store';
import { dropTargetProps, useDrag } from '../dnd';
import { type ItemInteractions, useItemInteractions } from '../hooks/useItemInteractions';
import { EMPTY_SELECTION, type Selection } from '../selection';
import { useExplorer } from '../store';
import { viewRegistry } from '../viewRegistry';

const ROW_HEIGHT = 42;

interface Columns {
  template: string;
  showKind: boolean;
  showSize: boolean;
}

function columnsFor(width: number, inTrash: boolean): Columns {
  const showKind = width >= 720;
  const showSize = width >= 520;
  const parts = ['34px', 'minmax(0,1fr)', showSize && '100px', showKind && '130px', inTrash ? '150px' : '160px'];
  return { template: parts.filter(Boolean).join(' '), showKind, showSize };
}

interface FileListProps {
  tabId: string;
  entries: readonly Entry[];
  selection: Selection;
  inTrash: boolean;
}

export function FileList({ tabId, entries, selection, inTrash }: FileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  const columns = useMemo(() => columnsFor(width, inTrash), [width, inTrash]);
  const interactions = useItemInteractions(tabId, entries);
  const cutPaths = useFileClipboard((state) => (state.clip?.mode === 'cut' ? state.clip.paths : null));
  const cutSet = useMemo(() => new Set(cutPaths), [cutPaths]);

  useEffect(() => {
    viewRegistry.set(tabId, { entries, rowStep: viewRegistry.linear });
  }, [tabId, entries]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    paddingEnd: 96,
  });

  useEffect(() => {
    if (selection.focus === null) return;
    const index = entries.findIndex((entry) => entry.path === selection.focus);
    if (index !== -1) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [selection.focus, entries, virtualizer]);

  return (
    <div className="flex h-full flex-col px-[22px] pt-2.5">
      <ListHeader columns={columns} inTrash={inTrash} tabId={tabId} entries={entries} selection={selection} />
      <div ref={scrollRef} role="listbox" aria-multiselectable className="-mx-[22px] min-h-0 flex-1 overflow-y-auto px-[22px]">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index];
            if (!entry) return null;
            return (
              <FileRow
                key={entry.path}
                top={item.start}
                entry={entry}
                columns={columns}
                selected={selection.paths.has(entry.path)}
                focused={selection.focus === entry.path}
                cut={cutSet.has(entry.path)}
                interactions={interactions}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
  columns: Columns;
  inTrash: boolean;
  tabId: string;
  entries: readonly Entry[];
  selection: Selection;
}

function ListHeader({ columns, inTrash, tabId, entries, selection }: HeaderProps) {
  const sortKey = useSettings((s) => s.settings.sortKey);
  const direction = useSettings((s) => s.settings.sortDirection);
  const allSelected = entries.length > 0 && selection.paths.size === entries.length;

  const sortBy = (key: SortKey) => {
    const { update } = useSettings.getState();
    update(key === sortKey ? { sortDirection: direction === 'asc' ? 'desc' : 'asc' } : { sortKey: key, sortDirection: 'asc' });
  };

  const headerCell = (label: string, sort: SortKey) => (
    <button
      type="button"
      onClick={() => sortBy(sort)}
      className="section-label flex items-center gap-1 rounded text-left tracking-[0.04em] hover:text-on-surface-variant"
    >
      {label}
      {sortKey === sort && (direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );

  return (
    <div className="grid h-[34px] shrink-0 items-center px-2.5" style={{ gridTemplateColumns: columns.template }}>
      <Checkbox
        checked={allSelected}
        label={allSelected ? 'Clear selection' : 'Select all'}
        onChange={() =>
          useExplorer
            .getState()
            .setSelection(
              tabId,
              allSelected
                ? EMPTY_SELECTION
                : { paths: new Set(entries.map((e) => e.path)), anchor: null, focus: selection.focus },
            )
        }
      />
      {headerCell('Name', 'name')}
      {columns.showSize && headerCell('Size', 'size')}
      {columns.showKind && headerCell('Type', 'kind')}
      {headerCell(inTrash ? 'Deleted' : 'Modified', 'modified')}
    </div>
  );
}

interface FileRowProps {
  top: number;
  entry: Entry;
  columns: Columns;
  selected: boolean;
  focused: boolean;
  cut: boolean;
  interactions: ItemInteractions;
}

const FileRow = memo(function FileRow({ top, entry, columns, selected, focused, cut, interactions }: FileRowProps) {
  const isFolder = entry.kind === 'dir' && entry.trashId === undefined;
  const dragOver = useDrag((state) => isFolder && state.overPath === entry.path);
  const muted = selected ? '' : 'text-on-surface-variant';

  return (
    <div
      role="option"
      aria-selected={selected}
      draggable={entry.trashId === undefined}
      onClick={(event) => interactions.onClick(entry, event)}
      onDoubleClick={() => interactions.onDoubleClick(entry)}
      onAuxClick={(event) => interactions.onAuxClick(entry, event)}
      onContextMenu={(event) => interactions.onContextMenu(entry, event)}
      onDragStart={(event) => interactions.onDragStart(entry, event)}
      onDragEnd={interactions.onDragEnd}
      {...dropTargetProps(isFolder ? entry.path : null)}
      style={{ transform: `translateY(${top}px)`, gridTemplateColumns: columns.template, height: ROW_HEIGHT }}
      className={cn(
        'absolute left-0 grid w-full items-center rounded-[10px] px-2.5 transition-[background-color,outline-color] duration-100',
        dragOver
          ? 'bg-primary-container/40 outline-2 outline-dashed outline-primary'
          : selected
            ? 'bg-surface-highest'
            : 'hover:bg-surface-high',
        focused && 'outline-2 -outline-offset-2 outline-primary/60',
        cut && 'opacity-50',
      )}
    >
      <Checkbox checked={selected} label={`Select ${entry.name}`} onChange={() => interactions.onToggle(entry)} />
      <div className={cn('flex min-w-0 items-center gap-2.5', selected && 'font-semibold')}>
        <EntryIcon entry={entry} size={18} className="shrink-0" />
        <span className="truncate">{entry.name}</span>
      </div>
      {columns.showSize && <div className={muted}>{entry.kind === 'file' ? formatBytes(entry.size) : '—'}</div>}
      {columns.showKind && <div className={cn('truncate', 'text-on-surface-variant')}>{kindLabel(entry)}</div>}
      <div className={cn('font-mono text-[11.5px]', muted)}>{formatDate(entry.modified)}</div>
    </div>
  );
});

function Checkbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'flex size-[18px] items-center justify-center rounded-[5px] border-[1.6px] transition-[background-color,border-color] duration-150',
        checked ? 'border-primary bg-primary text-on-primary' : 'border-outline',
      )}
    >
      <Check size={11} strokeWidth={3} className={cn('transition-transform duration-150', checked ? 'scale-100' : 'scale-0')} />
    </button>
  );
}
