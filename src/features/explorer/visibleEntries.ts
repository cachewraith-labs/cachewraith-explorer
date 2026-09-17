import type { Entry, SortDirection, SortKey } from '@/ipc/types';

export interface ViewOptions {
  showHidden: boolean;
  filter: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  foldersFirst: boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

type Comparator = (a: Entry, b: Entry) => number;

// One comparator per sort key — a lookup table instead of a branching function.
const COMPARATORS: Record<SortKey, Comparator> = {
  name: (a, b) => collator.compare(a.name, b.name),
  size: (a, b) => a.size - b.size || collator.compare(a.name, b.name),
  modified: (a, b) => (a.modified ?? 0) - (b.modified ?? 0) || collator.compare(a.name, b.name),
  kind: (a, b) => collator.compare(a.extension ?? '', b.extension ?? '') || collator.compare(a.name, b.name),
};

/** Filters and sorts a listing for display. Pure, so views can memoize it. */
export function visibleEntries(entries: readonly Entry[], options: ViewOptions): Entry[] {
  const terms = options.filter.toLowerCase().split(/\s+/).filter(Boolean);
  const compare = COMPARATORS[options.sortKey];
  const direction = options.sortDirection === 'asc' ? 1 : -1;

  return entries
    .filter((entry) => options.showHidden || !entry.isHidden)
    .filter((entry) => terms.length === 0 || matchesAll(entry.name.toLowerCase(), terms))
    .sort((a, b) => {
      if (options.foldersFirst && (a.kind === 'dir') !== (b.kind === 'dir')) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return compare(a, b) * direction;
    });
}

function matchesAll(name: string, terms: readonly string[]): boolean {
  return terms.every((term) => name.includes(term));
}
