import { describe, expect, it } from 'vitest';

import { fuzzyMatch, highlightRuns } from './fuzzy';

describe('fuzzyMatch', () => {
  it('ranks word-start consecutive matches first', () => {
    const storage = fuzzyMatch('sto', 'Storage');
    const desktop = fuzzyMatch('sto', 'Desktop');
    expect(storage && desktop && storage.score > desktop.score).toBe(true);
  });

  it('rejects non-subsequences', () => {
    expect(fuzzyMatch('xyz', 'Storage')).toBeNull();
  });

  it('builds highlight runs', () => {
    expect(highlightRuns('Storage', [0, 1, 2])).toEqual([
      { text: 'Sto', hit: true },
      { text: 'rage', hit: false },
    ]);
  });
});
