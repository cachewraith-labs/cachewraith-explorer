import { describe, expect, it } from 'vitest';

import type { Entry } from '@/ipc/types';

import { visibleEntries, type ViewOptions } from './visibleEntries';

function entry(name: string, patch: Partial<Entry> = {}): Entry {
  return {
    name,
    path: `/x/${name}`,
    kind: 'file',
    isSymlink: false,
    isHidden: name.startsWith('.'),
    size: 0,
    modified: 0,
    mode: 0o644,
    extension: name.includes('.') ? (name.split('.').pop() ?? null) : null,
    ...patch,
  };
}

const base: ViewOptions = { showHidden: false, filter: '', sortKey: 'name', sortDirection: 'asc', foldersFirst: true };
const names = (list: Entry[]) => list.map((e) => e.name);

describe('visibleEntries', () => {
  const list = [
    entry('file10.txt', { size: 5 }),
    entry('file2.txt', { size: 50 }),
    entry('.env'),
    entry('Zeta', { kind: 'dir' }),
    entry('alpha', { kind: 'dir' }),
  ];

  it('sorts folders first with natural name order', () => {
    expect(names(visibleEntries(list, base))).toEqual(['alpha', 'Zeta', 'file2.txt', 'file10.txt']);
  });

  it('shows hidden files and sorts by size descending', () => {
    const out = visibleEntries(list, { ...base, showHidden: true, sortKey: 'size', sortDirection: 'desc', foldersFirst: false });
    expect(names(out).slice(0, 2)).toEqual(['file2.txt', 'file10.txt']);
    expect(out).toHaveLength(5);
  });

  it('filters by every term', () => {
    expect(names(visibleEntries(list, { ...base, filter: 'FILE 10' }))).toEqual(['file10.txt']);
  });
});
