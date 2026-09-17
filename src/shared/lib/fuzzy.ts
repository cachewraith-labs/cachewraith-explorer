export interface FuzzyMatch {
  score: number;
  /** Indices of matched characters in the candidate, for highlighting. */
  indices: number[];
}

/**
 * Subsequence match, case-insensitive. Consecutive runs and matches at word starts score
 * higher, so "sto" ranks "Storage" above "Desktop".
 */
export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (q === '') return { score: 0, indices: [] };
  const text = candidate.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of q) {
    if (char === ' ') continue;
    const index = text.indexOf(char, from);
    if (index === -1) return null;
    const atWordStart = index === 0 || /[\s\-_./]/.test(text[index - 1] ?? '');
    score += 1 + (index === previous + 1 ? 3 : 0) + (atWordStart ? 2 : 0);
    indices.push(index);
    previous = index;
    from = index + 1;
  }
  // Prefer shorter candidates and earlier first matches when scores tie.
  score -= (indices[0] ?? 0) * 0.05 + text.length * 0.01;
  return { score, indices };
}

/** Splits `text` into plain and highlighted runs for rendering. */
export function highlightRuns(text: string, indices: readonly number[]): Array<{ text: string; hit: boolean }> {
  const hits = new Set(indices);
  const runs: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    const last = runs[runs.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else runs.push({ text: text[i] ?? '', hit });
  }
  return runs;
}
