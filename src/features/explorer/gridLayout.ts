import type { Entry } from '@/ipc/types';

export type GridRow =
  { type: 'header'; key: string; label: string } | { type: 'items'; key: string; start: number; items: readonly Entry[] };

export interface GridLayout {
  rows: GridRow[];
  rowStep(index: number, delta: number): number;
}

export const GRID = {
  tileMin: 100,
  gap: 16,
  paddingX: 22,
  tileBox: 84,
  /** Files are portrait pages, so their rows are taller than folder rows. */
  fileWidth: 72,
  fileHeight: 96,
  rowHeight: 84 + 6 + 32 + 16, // folder card + label gap + two label lines + row gap
  fileRowHeight: 96 + 6 + 32 + 16,
  headerHeight: 30,
} as const;

/** Height of one virtual row: a header, a row of folders, or a row with any file. */
export function rowHeight(row: GridRow | undefined): number {
  if (!row || row.type === 'header') return GRID.headerHeight;
  return row.items.some((entry) => entry.kind !== 'dir') ? GRID.fileRowHeight : GRID.rowHeight;
}

export function columnsFor(width: number): number {
  const usable = width - GRID.paddingX * 2 + GRID.gap;
  return Math.max(1, Math.floor(usable / (GRID.tileMin + GRID.gap)));
}

/**
 * Splits entries into virtual rows. With `sections`, folders and files get their own
 * headed blocks, as in the design. `rowStep` moves straight up/down across those blocks.
 */
export function buildGridLayout(entries: readonly Entry[], columns: number, sections: boolean): GridLayout {
  const rows: GridRow[] = [];
  const folderCount = sections ? countLeadingFolders(entries) : 0;
  const blocks =
    sections && folderCount > 0 && folderCount < entries.length
      ? [
          { label: 'Folders', start: 0, end: folderCount },
          { label: 'Files', start: folderCount, end: entries.length },
        ]
      : sections && entries.length > 0
        ? [{ label: folderCount > 0 ? 'Folders' : 'Files', start: 0, end: entries.length }]
        : [{ label: '', start: 0, end: entries.length }];

  // For each entry: which item-row it sits in, and its column.
  const itemRowOf: number[] = new Array<number>(entries.length);
  const itemRows: Array<{ start: number; length: number }> = [];

  for (const block of blocks) {
    if (block.label) rows.push({ type: 'header', key: `h-${block.label}`, label: block.label });
    for (let start = block.start; start < block.end; start += columns) {
      const length = Math.min(columns, block.end - start);
      for (let i = 0; i < length; i++) itemRowOf[start + i] = itemRows.length;
      itemRows.push({ start, length });
      rows.push({ type: 'items', key: `r-${start}`, start, items: entries.slice(start, start + length) });
    }
  }

  return {
    rows,
    rowStep(index, delta) {
      const row = itemRowOf[index];
      if (row === undefined) return index;
      const column = index - (itemRows[row]?.start ?? 0);
      const target = itemRows[Math.max(0, Math.min(itemRows.length - 1, row + delta))];
      return target ? target.start + Math.min(column, target.length - 1) : index;
    },
  };
}

function countLeadingFolders(entries: readonly Entry[]): number {
  let count = 0;
  while (count < entries.length && entries[count]?.kind === 'dir') count++;
  return count;
}
