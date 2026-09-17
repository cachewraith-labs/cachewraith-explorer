import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef } from 'react';

import type { Entry } from '@/ipc/types';
import { useElementWidth } from '@/shared/hooks/useElementWidth';

import { useFileClipboard } from '../../operations/clipboard';
import { buildGridLayout, columnsFor, GRID, rowHeight } from '../gridLayout';
import { useItemInteractions } from '../hooks/useItemInteractions';
import type { Selection } from '../selection';
import { viewRegistry } from '../viewRegistry';
import { FileTile } from './FileTile';

interface FileGridProps {
  tabId: string;
  entries: readonly Entry[];
  selection: Selection;
  sections: boolean;
}

/** Virtualized grid: only the rows on screen (plus a few) are in the DOM. */
export function FileGrid({ tabId, entries, selection, sections }: FileGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scrollRef);
  const columns = columnsFor(width);
  const layout = useMemo(() => buildGridLayout(entries, columns, sections), [entries, columns, sections]);
  const interactions = useItemInteractions(tabId, entries);
  const cutPaths = useFileClipboard((state) => (state.clip?.mode === 'cut' ? state.clip.paths : null));
  const cutSet = useMemo(() => new Set(cutPaths), [cutPaths]);

  useEffect(() => {
    viewRegistry.set(tabId, { entries, rowStep: layout.rowStep });
  }, [tabId, entries, layout]);

  const virtualizer = useVirtualizer({
    count: layout.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => rowHeight(layout.rows[index]),
    overscan: 4,
    paddingStart: 20,
    paddingEnd: 96,
  });

  // Keep the keyboard cursor on screen.
  useEffect(() => {
    if (selection.focus === null) return;
    const index = entries.findIndex((entry) => entry.path === selection.focus);
    const row = layout.rows.findIndex((r) => r.type === 'items' && index >= r.start && index < r.start + r.items.length);
    if (row !== -1) virtualizer.scrollToIndex(row, { align: 'auto' });
  }, [selection.focus, entries, layout, virtualizer]);

  return (
    <div ref={scrollRef} role="listbox" aria-multiselectable className="h-full overflow-y-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = layout.rows[item.index];
          if (!row) return null;
          return (
            <div
              key={row.key}
              className="absolute left-0 w-full"
              style={{ transform: `translateY(${item.start}px)`, paddingInline: GRID.paddingX }}
            >
              {row.type === 'header' ? (
                <div className="section-label pt-1">{row.label}</div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                  {row.items.map((entry) => (
                    <FileTile
                      key={entry.path}
                      entry={entry}
                      selected={selection.paths.has(entry.path)}
                      focused={selection.focus === entry.path}
                      cut={cutSet.has(entry.path)}
                      interactions={interactions}
                      boxHeight={rowHeight(row) === GRID.fileRowHeight ? GRID.fileHeight : GRID.tileBox}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
