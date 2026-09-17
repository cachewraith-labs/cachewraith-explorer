// Pure selection logic, shared by grid and list views and covered by unit tests.

export interface Selection {
  paths: ReadonlySet<string>;
  /** Where a Shift range starts. */
  anchor: string | null;
  /** The keyboard cursor. */
  focus: string | null;
}

export const EMPTY_SELECTION: Selection = { paths: new Set(), anchor: null, focus: null };

export type ClickMode = 'replace' | 'toggle' | 'range';

export function clickSelect(selection: Selection, ordered: readonly string[], path: string, mode: ClickMode): Selection {
  switch (mode) {
    case 'replace':
      return { paths: new Set([path]), anchor: path, focus: path };
    case 'toggle': {
      const paths = new Set(selection.paths);
      if (paths.has(path)) paths.delete(path);
      else paths.add(path);
      return { paths, anchor: path, focus: path };
    }
    case 'range': {
      const anchor = selection.anchor ?? path;
      return { paths: new Set(range(ordered, anchor, path)), anchor, focus: path };
    }
  }
}

/** Puts the keyboard cursor on `index` (clamped); with `extend`, selects anchor…cursor. */
export function focusIndex(selection: Selection, ordered: readonly string[], index: number, extend: boolean): Selection {
  const next = ordered[Math.max(0, Math.min(ordered.length - 1, index))];
  if (next === undefined) return selection;
  if (!extend) return { paths: new Set([next]), anchor: next, focus: next };
  const anchor = selection.anchor ?? next;
  return { paths: new Set(range(ordered, anchor, next)), anchor, focus: next };
}

/** Moves the cursor by `delta` items. With no cursor yet, starts from the first/last item. */
export function moveFocus(selection: Selection, ordered: readonly string[], delta: number, extend: boolean): Selection {
  const current = selection.focus === null ? -1 : ordered.indexOf(selection.focus);
  const index = current === -1 ? (delta > 0 ? 0 : ordered.length - 1) : current + delta;
  return focusIndex(selection, ordered, index, extend);
}

export function jumpFocus(selection: Selection, ordered: readonly string[], to: 'first' | 'last', extend: boolean): Selection {
  return focusIndex(selection, ordered, to === 'first' ? 0 : ordered.length - 1, extend);
}

export function selectAll(ordered: readonly string[], focus: string | null): Selection {
  return { paths: new Set(ordered), anchor: ordered[0] ?? null, focus: focus ?? ordered[0] ?? null };
}

/** Drops paths that are no longer listed (deleted, filtered out). */
export function pruneSelection(selection: Selection, visible: ReadonlySet<string>): Selection {
  let changed = false;
  const paths = new Set<string>();
  for (const path of selection.paths) {
    if (visible.has(path)) paths.add(path);
    else changed = true;
  }
  const focus = selection.focus !== null && visible.has(selection.focus) ? selection.focus : null;
  if (!changed && focus === selection.focus) return selection;
  return { paths, anchor: selection.anchor !== null && visible.has(selection.anchor) ? selection.anchor : null, focus };
}

function range(ordered: readonly string[], from: string, to: string): string[] {
  const a = ordered.indexOf(from);
  const b = ordered.indexOf(to);
  if (a === -1 || b === -1) return [to];
  return ordered.slice(Math.min(a, b), Math.max(a, b) + 1);
}
