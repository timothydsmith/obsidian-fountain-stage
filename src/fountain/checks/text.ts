/** Words, speeches and scenes, shared by the checks. */

import { cueName } from "../characters";
import type { ParsedScript, ScriptElement } from "../parser";
import type { SceneRange } from "../report";
import { countWords, isPreface } from "../runtime";

/** Common English words, left out when looking for a character's own words or a repeated phrase. */
export const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being below between both but by " +
    "can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has " +
    "hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in " +
    "into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours " +
    "ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them " +
    "themselves then there there's these they they'd they'll they're they've this those through to too under until up us very was " +
    "wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will " +
    "with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves oh yes yeah get got go going just one"
  ).split(" "),
);

/** The words of a text, lower case, without emphasis marks or punctuation. Apostrophes inside words stay. */
export function wordsOf(text: string): string[] {
  const words = text.toLowerCase().replace(/[’‘]/g, "'").match(/\p{L}[\p{L}\p{M}\p{N}'-]*/gu) ?? [];
  return words.map((w) => w.replace(/['-]+$/, ""));
}

/** A short, steady fingerprint of a text, so a dismissed finding comes back when the text changes. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  const t = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface Speech {
  /** The speaker, upper case, without extensions such as (V.O.). */
  name: string;
  /** The cue's line, and the speech's last line. */
  line: number;
  endLine: number;
  /** The dialogue lines, without parentheticals. */
  dialogue: ScriptElement[];
  /** The dialogue's text, joined with spaces. */
  text: string;
  words: number;
}

/** Every speech in the play, after the preface, in order. A cue with no dialogue isn't one. */
export function speechesOf(script: ParsedScript): Speech[] {
  const speeches: Speech[] = [];
  let current: Speech | undefined;
  for (const el of script.elements) {
    if (isPreface(el)) continue;
    if (el.type === "character") {
      current = { name: cueName(el.text).toUpperCase(), line: el.line, endLine: el.line, dialogue: [], text: "", words: 0 };
      speeches.push(current);
    } else if (current && (el.type === "dialogue" || el.type === "parenthetical")) {
      current.endLine = el.endLine;
      if (el.type === "dialogue") current.dialogue.push(el);
    } else current = undefined;
  }
  for (const s of speeches) {
    s.text = s.dialogue.map((d) => d.text).join(" ");
    s.words = countWords(s.text);
  }
  return speeches.filter((s) => s.dialogue.length > 0);
}

/** Finds the scene a line is in: the one it falls inside, else the next, else the last. -1 with no scenes. */
export function sceneFinder(scenes: SceneRange[]): (line: number) => number {
  return (line) => {
    let next = -1;
    for (let i = 0; i < scenes.length; i++) {
      const { line: start, endLine } = scenes[i];
      if (start <= line && (endLine === undefined || line < endLine)) return i;
      if (next < 0 && start > line) next = i;
    }
    return next >= 0 ? next : scenes.length - 1;
  };
}

/**
 * Where a phrase comes in a text, as whole words, ignoring case, with any
 * run of spaces between its words. (No lookbehind, which older iPhones lack.)
 */
export function findPhrase(text: string, phrase: string): { from: number; to: number }[] {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, "giu");
  const found: { from: number; to: number }[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const from = m.index + m[1].length;
    found.push({ from, to: from + m[2].length });
    // Let the next match start at the phrase, so "a b a b" finds both.
    re.lastIndex = from + m[2].length;
  }
  return found;
}
