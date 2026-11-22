/**
 * Overused words and pauses: phrases repeated across the script, filler
 * words in the dialogue, and scenes heavy with beats and pauses.
 */

import type { ParsedScript } from "../parser";
import { DEFAULT_PAUSE_WORDS, type PauseWord, pauseSeconds } from "../pauses";
import type { SceneRange } from "../report";
import { countWords, isPreface } from "../runtime";
import type { Finding } from "./findings";
import { findPhrase, sceneFinder, speechesOf, STOPWORDS, wordsOf } from "./text";

/** A phrase this many times or more is repeated. */
export const REPEATS = 3;
const SHORTEST_PHRASE = 3;
const LONGEST_PHRASE = 8;
/** How many repeated phrases to show, most repeated first. */
const MOST_PHRASES = 20;

/** Words and phrases that pad out dialogue. */
export const FILLER_WORDS = ["just", "really", "actually", "very", "quite", "literally", "basically", "totally", "honestly", "sort of", "kind of", "I mean", "you know", "I suppose", "I guess"];

export interface Filler {
  word: string;
  count: number;
  /** Who says it most, and how often. */
  most: string;
  mostCount: number;
}

export interface Occurrence {
  doc: number;
  at: number;
}

/**
 * Phrases of three words or more said or written three times or more, in
 * dialogue and stage directions. A phrase inside a longer repeated one
 * isn't counted again where the longer one is. Phrases of only common
 * words ("and then I did") don't count.
 */
export function checkPhrases(script: ParsedScript): Finding[] {
  const docs = script.elements
    .filter((el) => (el.type === "dialogue" || el.type === "action") && !isPreface(el))
    .map((el) => ({ line: el.line, words: wordsOf(el.text) }));
  return repeatedPhrases(docs, SHORTEST_PHRASE, LONGEST_PHRASE)
    .sort((a, b) => b.occurrences.length * b.phrase.length - a.occurrences.length * a.phrase.length)
    .slice(0, MOST_PHRASES)
    .map(({ phrase, occurrences }) => {
      const lines = occurrences.map((o) => docs[o.doc].line);
      return {
        check: "phrases" as const,
        key: `phrases:${phrase}`,
        line: lines[0],
        lines,
        message: `"${phrase}" comes ${occurrences.length} times.`,
      };
    });
}

/**
 * Phrases of `shortest` to `longest` words repeated at least REPEATS times
 * in a list of texts (as words), each phrase within one text. Where a
 * longer phrase repeats, the shorter phrases inside it don't count there.
 */
export function repeatedPhrases(docs: { words: string[] }[], shortest: number, longest: number): { phrase: string; occurrences: Occurrence[] }[] {
  const covered = docs.map((d) => new Uint8Array(d.words.length));
  const found: { phrase: string; occurrences: Occurrence[] }[] = [];

  for (let n = longest; n >= shortest; n--) {
    const grams = new Map<string, Occurrence[]>();
    docs.forEach((d, doc) => {
      for (let at = 0; at + n <= d.words.length; at++) {
        const words = d.words.slice(at, at + n);
        if (words.every((w) => STOPWORDS.has(w))) continue;
        const phrase = words.join(" ");
        const list = grams.get(phrase);
        if (list) list.push({ doc, at });
        else grams.set(phrase, [{ doc, at }]);
      }
    });
    const candidates = [...grams].filter(([, list]) => list.length >= REPEATS).sort((a, b) => b[1].length - a[1].length);
    for (const [phrase, list] of candidates) {
      const fresh: Occurrence[] = [];
      for (const o of list) {
        const last = fresh[fresh.length - 1];
        // Not overlapping the one before, as in "no no no no", nor a longer phrase already found.
        if (last && last.doc === o.doc && o.at < last.at + n) continue;
        if (covered[o.doc].subarray(o.at, o.at + n).some((c) => c === 1)) continue;
        fresh.push(o);
      }
      if (fresh.length < REPEATS) continue;
      for (const o of fresh) covered[o.doc].fill(1, o.at, o.at + n);
      found.push({ phrase, occurrences: fresh });
    }
  }
  return found;
}

/** How often each filler word comes in the dialogue, most first, leaving out any not used. */
export function fillers(script: ParsedScript): Filler[] {
  const speeches = speechesOf(script);
  const result: Filler[] = [];
  for (const word of FILLER_WORDS) {
    const bySpeaker = new Map<string, number>();
    let count = 0;
    for (const s of speeches) {
      const n = findPhrase(s.text, word).length;
      if (n === 0) continue;
      count += n;
      bySpeaker.set(s.name, (bySpeaker.get(s.name) ?? 0) + n);
    }
    if (count === 0) continue;
    const [most, mostCount] = [...bySpeaker].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    result.push({ word, count, most, mostCount });
  }
  return result.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** At least this many pauses, at twice the play's rate or more, makes a scene heavy with them. */
const HEAVY_PAUSES = 4;

/** Scenes with many more beats and pauses for their dialogue than the play as a whole. */
export function checkPauses(script: ParsedScript, scenes: SceneRange[], pauseWords: readonly PauseWord[] = DEFAULT_PAUSE_WORDS): Finding[] {
  if (scenes.length === 0) return [];
  const sceneAt = sceneFinder(scenes);
  const counts = scenes.map(() => ({ pauses: 0, words: 0 }));
  for (const el of script.elements) {
    if (isPreface(el)) continue;
    const c = counts[sceneAt(el.line)];
    if (!c) continue;
    if (el.type === "dialogue") c.words += countWords(el.text);
    else if ((el.type === "parenthetical" || (el.type === "action" && !el.italic)) && pauseSeconds(el.text, el.type === "parenthetical", pauseWords) > 0) c.pauses++;
  }
  const pauses = counts.reduce((n, c) => n + c.pauses, 0);
  const words = counts.reduce((n, c) => n + c.words, 0);
  if (pauses === 0) return [];
  const rate = pauses / Math.max(words, 1);
  const findings: Finding[] = [];
  counts.forEach((c, i) => {
    if (c.pauses < HEAVY_PAUSES) return;
    const times = c.pauses / Math.max(c.words, 1) / rate;
    if (times < 2) return;
    const scene = scenes[i];
    findings.push({
      check: "pauses",
      key: `pauses:${scene.title}:${c.pauses}`,
      line: scene.line,
      message: `${scene.title}: ${c.pauses} beats and pauses in ${c.words} words of dialogue, ${times.toFixed(1)} times the play's rate.`,
    });
  });
  return findings;
}
