import { describe, expect, it } from 'vitest';

import { EMPTY_SELECTION, clickSelect, moveFocus, pruneSelection, selectAll } from './selection';

const items = ['a', 'b', 'c', 'd', 'e'];
const paths = (s: { paths: ReadonlySet<string> }) => [...s.paths].sort();

describe('selection', () => {
  it('replaces, toggles and extends with clicks', () => {
    const one = clickSelect(EMPTY_SELECTION, items, 'b', 'replace');
    expect(paths(one)).toEqual(['b']);
    const two = clickSelect(one, items, 'd', 'toggle');
    expect(paths(two)).toEqual(['b', 'd']);
    const ranged = clickSelect(one, items, 'd', 'range');
    expect(paths(ranged)).toEqual(['b', 'c', 'd']);
    expect(ranged.anchor).toBe('b');
  });

  it('moves focus with clamping and extends ranges', () => {
    const start = moveFocus(EMPTY_SELECTION, items, 1, false);
    expect(start.focus).toBe('a');
    const down = moveFocus(start, items, 3, true);
    expect(paths(down)).toEqual(['a', 'b', 'c', 'd']);
    expect(moveFocus(down, items, 99, false).focus).toBe('e');
    expect(moveFocus(EMPTY_SELECTION, items, -1, false).focus).toBe('e');
  });

  it('selects all and prunes vanished paths', () => {
    const all = selectAll(items, null);
    expect(all.paths.size).toBe(5);
    const pruned = pruneSelection(all, new Set(['a', 'c']));
    expect(paths(pruned)).toEqual(['a', 'c']);
    expect(pruneSelection(pruned, new Set(['a', 'c']))).toBe(pruned);
  });
});
