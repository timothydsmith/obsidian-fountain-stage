/**
 * Matching words whole: not touching a letter or digit on either side.
 * Written without lookbehind, which some iOS versions can't parse: the
 * character before a match is matched too, and left out of what's reported.
 */

/** A pattern matched only as whole words, in any case. `source` may have groups of its own. */
export function wholeWordRe(source: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "giu");
}

export interface WordMatch {
  /** Where the match starts in the text. */
  index: number;
  text: string;
  /** The pattern's own groups. */
  groups: (string | undefined)[];
}

/** Every whole-word match of a pattern from wholeWordRe. */
export function wholeWords(text: string, re: RegExp): WordMatch[] {
  return [...text.matchAll(re)].map((m) => ({
    index: m.index + m[1].length,
    text: m[0].slice(m[1].length),
    groups: m.slice(2),
  }));
}

/** Escapes text to match itself in a pattern. */
export function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
