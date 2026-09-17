import { describe, expect, it } from 'vitest';

import type { Entry } from '@/ipc/types';

import { buildGridLayout, columnsFor, GRID, rowHeight } from './gridLayout';

const make = (kind: Entry['kind'], i: number): Entry => ({
  name: `${kind}${i}`,
  path: `/x/${kind}${i}`,
  kind,
  isSymlink: false,
  isHidden: false,
  size: 0,
  modified: null,
  mode: 0,
  extension: null,
});

describe('grid layout', () => {
  const entries = [...[0, 1, 2].map((i) => make('dir', i)), ...[0, 1, 2, 3, 4, 5, 6].map((i) => make('file', i))];

  it('splits folders and files into headed sections', () => {
    const layout = buildGridLayout(entries, 4, true);
    expect(layout.rows.map((r) => (r.type === 'header' ? r.label : r.items.length))).toEqual(['Folders', 3, 'Files', 4, 3]);
  });

  it('moves straight down across sections, clamping the column', () => {
    const layout = buildGridLayout(entries, 4, true);
    expect(layout.rowStep(2, 1)).toBe(5); // folder col 2 → files row 0 col 2
    expect(layout.rowStep(6, 1)).toBe(9); // files col 3 → last row has 3 items → col 2
    expect(layout.rowStep(0, -1)).toBe(0);
    expect(layout.rowStep(9, -2)).toBe(2);
  });

  it('computes columns from width', () => {
    expect(columnsFor(0)).toBe(1);
    expect(columnsFor(760)).toBe(6);
  });

  it('gives rows with files the taller page height', () => {
    const layout = buildGridLayout(entries, 4, true);
    expect(layout.rows.map(rowHeight)).toEqual([
      GRID.headerHeight,
      GRID.rowHeight,
      GRID.headerHeight,
      GRID.fileRowHeight,
      GRID.fileRowHeight,
    ]);
  });
});
