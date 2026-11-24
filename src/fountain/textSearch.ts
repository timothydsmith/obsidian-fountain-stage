/** Plain-text search through a script's lines, for the Search scripts panel. */

export interface SearchOptions {
  matchCase?: boolean;
  /** Only matches that aren't part of a longer word. */
  wholeWord?: boolean;
}

export interface LineMatch {
  /** The line, counting from 0. */
  line: number;
  /** The line's text. */
  text: string;
  /** Where each match starts and ends in the line. */
  matches: [number, number][];
}

const WORD_CHAR = /[\p{L}\p{N}_']/u;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

/**
 * The lines of `text` that contain `query`, each with where it's found.
 * Matches don't overlap. Stops after `limit` matches in all.
 */
export function searchText(text: string, query: string, options: SearchOptions = {}, limit = Infinity): LineMatch[] {
  if (!query) return [];
  const needle = options.matchCase ? query : query.toLowerCase();
  const results: LineMatch[] = [];
  let count = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && count < limit; i++) {
    const line = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
    const hay = options.matchCase ? line : line.toLowerCase();
    // Lower-casing can change a line's length (rarely), which would put matches in the wrong place.
    if (hay.length !== line.length) continue;
    const matches: [number, number][] = [];
    let at = hay.indexOf(needle);
    while (at >= 0 && count < limit) {
      const end = at + needle.length;
      if (!options.wholeWord || (!isWordChar(line[at - 1]) && !isWordChar(line[end]))) {
        matches.push([at, end]);
        count++;
        at = hay.indexOf(needle, end);
      } else {
        at = hay.indexOf(needle, at + 1);
      }
    }
    if (matches.length) results.push({ line: i, text: line, matches });
  }
  return results;
}

/**
 * A long line cut down to about `max` characters around its first match,
 * with an ellipsis where it's cut. Returns the shown text and the matches
 * moved to fit it.
 */
export function excerpt(match: LineMatch, max = 160): { text: string; matches: [number, number][] } {
  const { text, matches } = match;
  if (text.length <= max) return { text, matches };
  const [first] = matches;
  let start = Math.max(0, first[0] - Math.floor(max / 4));
  const end = Math.min(text.length, start + max);
  start = Math.max(0, end - max);
  const before = start > 0 ? "…" : "";
  const after = end < text.length ? "…" : "";
  const shift = before.length - start;
  return {
    text: before + text.slice(start, end) + after,
    matches: matches
      .filter(([from, to]) => from >= start && to <= end)
      .map(([from, to]) => [from + shift, to + shift] as [number, number]),
  };
}
