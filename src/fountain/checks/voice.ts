/**
 * The voice check: for each character with a few speeches, how long they
 * typically speak, words only they use, phrases they keep coming back to,
 * and whose words theirs are closest to. Characters who've started to
 * sound alike show up as close.
 */

import type { ParsedScript } from "../parser";
import { repeatedPhrases } from "./repetition";
import { speechesOf, STOPWORDS, wordsOf } from "./text";

/** Characters with fewer speeches than this aren't profiled: too little to go on. */
export const VOICE_MIN_SPEECHES = 5;
const OWN_WORDS = 5;
const REPEATED_PHRASES = 3;
/** A word they use this often, and no one else at all, is theirs. */
const OWN_WORD_USES = 3;

export interface Voice {
  name: string;
  speeches: number;
  words: number;
  /** The middle speech length, in words. */
  typical: number;
  longest: number;
  /** Words only they use, most used first. */
  own: string[];
  /** Phrases of two to four words they say three times or more. */
  repeats: string[];
  /** The character whose words are most like theirs, and how alike (0 to 1). */
  closest?: { name: string; similarity: number };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function voices(script: ParsedScript): Voice[] {
  const speeches = speechesOf(script);
  // Characters' names aren't anyone's own words.
  const nameWords = new Set(speeches.flatMap((s) => wordsOf(s.name)));
  const content = (w: string) => w.length >= 3 && !STOPWORDS.has(w) && !nameWords.has(w);

  const byName = new Map<string, { lengths: number[]; texts: string[][]; counts: Map<string, number> }>();
  for (const s of speeches) {
    let c = byName.get(s.name);
    if (!c) byName.set(s.name, (c = { lengths: [], texts: [], counts: new Map() }));
    const words = wordsOf(s.text);
    c.lengths.push(s.words);
    c.texts.push(words);
    for (const w of words) if (content(w)) c.counts.set(w, (c.counts.get(w) ?? 0) + 1);
  }

  // Who uses each word.
  const users = new Map<string, number>();
  for (const c of byName.values()) for (const w of c.counts.keys()) users.set(w, (users.get(w) ?? 0) + 1);

  const profiled = [...byName].filter(([, c]) => c.lengths.length >= VOICE_MIN_SPEECHES);
  const result: Voice[] = profiled.map(([name, c]) => ({
    name,
    speeches: c.lengths.length,
    words: c.lengths.reduce((n, l) => n + l, 0),
    typical: median(c.lengths),
    longest: Math.max(...c.lengths),
    own: [...c.counts]
      .filter(([w, n]) => n >= OWN_WORD_USES && users.get(w) === 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, OWN_WORDS)
      .map(([w]) => w),
    repeats: repeatedPhrases(c.texts.map((words) => ({ words })), 2, 4)
      .sort((a, b) => b.occurrences.length - a.occurrences.length || a.phrase.localeCompare(b.phrase))
      .slice(0, REPEATED_PHRASES)
      .map((p) => p.phrase),
  }));

  // How alike two characters' words are: the cosine of their word counts.
  const norms = new Map(profiled.map(([name, c]) => [name, Math.sqrt([...c.counts.values()].reduce((n, v) => n + v * v, 0))]));
  for (const voice of result) {
    const mine = byName.get(voice.name)!.counts;
    let best: Voice["closest"];
    for (const [other, c] of profiled) {
      if (other === voice.name) continue;
      let dot = 0;
      for (const [w, n] of mine) dot += n * (c.counts.get(w) ?? 0);
      const norm = (norms.get(voice.name) ?? 0) * (norms.get(other) ?? 0);
      const similarity = norm > 0 ? dot / norm : 0;
      if (!best || similarity > best.similarity) best = { name: other, similarity };
    }
    voice.closest = best;
  }
  return result.sort((a, b) => b.words - a.words || a.name.localeCompare(b.name));
}
