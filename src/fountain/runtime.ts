/**
 * How long a script runs on stage, estimated in one of two ways:
 *
 * - From the words spoken: dialogue at a speaking rate, stage directions
 *   at half that (business takes time too), and pauses the script asks
 *   for, such as "(beat)", "A long pause." or "Silence." (see ./pauses).
 * - From the pages: a number of minutes per page of the PDF layout.
 *
 * Either way it gives a timeline: the time before each line, from where the
 * play starts (after the title page and preface), so an act or scene's
 * runtime is the time between its heading and the next.
 */

import type { Placement } from "../pdf/model";
import type { OutlineItem } from "./outline";
import type { ParsedScript, ScriptElement } from "./parser";
import { DEFAULT_PAUSE_WORDS, type PauseWord, pauseSeconds } from "./pauses";

export type RuntimeMethod = "words" | "pages";

export interface RuntimeOptions {
  method: RuntimeMethod;
  wordsPerMinute: number;
  minutesPerPage: number;
  pauses: readonly PauseWord[];
}

export interface Timeline {
  /** Seconds of the play before a line (counting from 0). */
  at(line: number): number;
  /** Seconds the whole play runs. */
  total: number;
}

const WORD_RE =/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

/** Words in a piece of text. */
export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

/** Seconds one element takes on stage, going by words spoken. */
function elementSeconds(el: ScriptElement, wordsPerMinute: number, pauses: readonly PauseWord[]): number {
  const perWord = 60 / wordsPerMinute;
  switch (el.type) {
    case "dialogue":
      return countWords(el.text) * perWord;
    case "parenthetical":
      return pauseSeconds(el.text, true, pauses);
    case "action":
      // Sung lyrics run as dialogue does; stage directions at half the rate.
      if (el.italic) return countWords(el.text) * perWord;
      return countWords(el.text) * perWord * 0.5 + pauseSeconds(el.text, false, pauses);
    default:
      return 0;
  }
}

export const isPreface = (el: ScriptElement) => el.type === "preface" || el.type === "preface_list_item";

/** The line the play starts on: its first element after the preface. */
function bodyStartLine(script: ParsedScript): number | undefined {
  return script.elements.find((el) => !isPreface(el))?.line;
}

/** Index of the first item whose key is at least `line`, by binary search. */
function firstAtLeast<T>(items: T[], key: (item: T) => number, line: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) < line) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The timeline going by the words spoken. */
export function wordsTimeline(script: ParsedScript, wordsPerMinute: number, pauses: readonly PauseWord[] = DEFAULT_PAUSE_WORDS): Timeline {
  const elements = script.elements.filter((el) => !isPreface(el));
  // before[i] is the time before elements[i]; before[n] is the total.
  const before = [0];
  for (const el of elements) before.push(before[before.length - 1] + elementSeconds(el, wordsPerMinute, pauses));
  return {
    at: (line) => before[firstAtLeast(elements, (el) => el.line, line)],
    total: before[before.length - 1],
  };
}

/** The timeline going by pages, from where each line landed in the layout. */
/** How far into the pages a line starts, in pages (page index plus the fraction down it), and where the last page's text ends. */
export interface PagePositions {
  at(line: number): number;
  end: number;
}

export function pagePositions(placements: Placement[]): PagePositions | undefined {
  const last = placements[placements.length - 1];
  if (!last) return undefined;
  const end = last.page + last.end;
  // Placements run in line order (a continuation repeats its element's line).
  const at = (line: number) => {
    const i = firstAtLeast(placements, (p) => p.line, line);
    return i < placements.length ? placements[i].page + placements[i].at : end;
  };
  return { at, end };
}

export function pagesTimeline(script: ParsedScript, placements: Placement[], minutesPerPage: number): Timeline {
  const positions = pagePositions(placements);
  if (!positions) return { at: () => 0, total: 0 };
  const { at: position, end } = positions;
  const bodyLine = bodyStartLine(script);
  const start = bodyLine === undefined ? end : position(bodyLine);
  const seconds = (pos: number) => Math.max(pos - start, 0) * minutesPerPage * 60;
  return { at: (line) => seconds(position(line)), total: seconds(end) };
}

export function timeline(script: ParsedScript, placements: Placement[] | undefined, options: RuntimeOptions): Timeline | undefined {
  if (options.method === "words") return wordsTimeline(script, options.wordsPerMinute, options.pauses);
  return placements ? pagesTimeline(script, placements, options.minutesPerPage) : undefined;
}

/**
 * Seconds each outline item runs: from its heading to the next heading
 * that isn't inside it, or the end of the play.
 */
export function outlineRuntimes(outline: OutlineItem[], timeline: Timeline): Map<OutlineItem, number> {
  const runtimes = new Map<OutlineItem, number>();
  const visit = (items: OutlineItem[], endLine: number | undefined) => {
    items.forEach((item, i) => {
      const next = items[i + 1]?.line ?? endLine;
      const end = next === undefined ? timeline.total : timeline.at(next);
      runtimes.set(item, Math.max(end - timeline.at(item.line), 0));
      visit(item.children, next);
    });
  };
  visit(outline, undefined);
  return runtimes;
}

/** "45 s", "12 min" or "1 h 32 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 59.5) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
