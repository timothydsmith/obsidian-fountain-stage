/**
 * Runtime targets: how long the play, an act, a scene or a section should
 * run. They live in the script, so they move with a scene and survive a
 * renamed heading, and they never print:
 *
 * - the play's is a title-page key, `Target: 1 h 30 min`;
 * - a heading's is a note on a line of its own under it (after any
 *   synopsis), `[[target: 10 min]]`.
 *
 * Durations are written with units ("90 min", "1 h 30 min", "45 s"), as a
 * plain number of minutes ("90"), or with colons: minutes and seconds
 * ("12:30") or hours, minutes and seconds ("1:30:00").
 */

import { eolOf, lineStarts } from "./lines";
import type { ParsedScript } from "./parser";
import { type TextEdit, titleKeyEdits } from "./titlePage";

const TARGET_NOTE_RE = /^\s*\[\[\s*target\s*:([^\]]*)\]\]\s*$/i;

/** Whether a note's text (inside the brackets) is a runtime target. */
export function isTargetNote(text: string): boolean {
  return /^\s*target\s*:/i.test(text);
}

const UNITS: [RegExp, number][] = [
  [/^(h|hr|hrs|hour|hours)$/, 3600],
  [/^(m|min|mins|minute|minutes)$/, 60],
  [/^(s|sec|secs|second|seconds)$/, 1],
];

/** A duration in seconds, or undefined if it can't be read. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t) * 60;
  const colons = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (colons) {
    const [a, b, c] = [colons[1], colons[2], colons[3]].map((n) => (n === undefined ? undefined : parseInt(n, 10)));
    return c === undefined ? a! * 60 + b! : a! * 3600 + b! * 60 + c;
  }
  let seconds = 0;
  let found = false;
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let rest = t;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const word = m[2];
    const unit = UNITS.find(([u]) => u.test(word));
    if (!unit) return undefined;
    seconds += parseFloat(m[1]) * unit[1];
    found = true;
    rest = rest.replace(m[0], "");
  }
  // Nothing but numbers with units, and the odd "and" or comma between.
  if (!found || rest.replace(/\band\b|,/g, "").trim()) return undefined;
  return seconds;
}

/** A duration as a target is written: "10 min", "1 h 30 min", "45 s", "2 min 30 s". */
export function formatTarget(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return parts.join(" ");
}

/** The play's target, from its `Target:` key. */
export function playTarget(script: ParsedScript): number | undefined {
  const value = script.titleValues.target;
  return value ? parseDuration(value.join(" ")) : undefined;
}

export interface HeadingTarget {
  seconds: number;
  /** The line of its note, counting from 0. */
  line: number;
}

/**
 * The target note under a heading: the lines after it are passed over while
 * they're blank, a synopsis or a note, and the first target note is it.
 */
export function headingTarget(lines: string[], script: ParsedScript, headingLine: number): HeadingTarget | undefined {
  for (let n = headingLine + 1; n < lines.length; n++) {
    const text = lines[n];
    const m = TARGET_NOTE_RE.exec(text);
    if (m) {
      const seconds = parseDuration(m[1]);
      return seconds === undefined ? undefined : { seconds, line: n };
    }
    if (text.trim() === "" || script.lineRoles.get(n) === "synopsis" || /^\s*\[\[[^\]]*\]\]\s*$/.test(text)) continue;
    return undefined;
  }
  return undefined;
}

/** Targets of the headings on these lines, by line. */
export function headingTargets(source: string, script: ParsedScript, headingLines: number[]): Map<number, number> {
  const lines = source.split("\n");
  const out = new Map<number, number>();
  for (const line of headingLines) {
    const target = headingTarget(lines, script, line);
    if (target) out.set(line, target.seconds);
  }
  return out;
}

/** Edits that set a heading's target, or take it out with null. */
export function headingTargetEdits(source: string, script: ParsedScript, headingLine: number, seconds: number | null): TextEdit[] {
  const lines = source.split("\n");
  const starts = lineStarts(source);
  const eol = eolOf(source);
  /** Where a line's text ends, before any \r. */
  const textEnd = (n: number) => starts[n] + lines[n].replace(/\r$/, "").length;
  const existing = headingTarget(lines, script, headingLine);
  if (existing) {
    const n = existing.line;
    if (seconds !== null) return [{ from: starts[n], to: textEnd(n), insert: `[[target: ${formatTarget(seconds)}]]` }];
    // The line goes, with the line break before it.
    return [{ from: textEnd(n - 1), to: textEnd(n), insert: "" }];
  }
  if (seconds === null) return [];
  // After the heading and any synopsis straight under it.
  let after = headingLine;
  for (let n = headingLine + 1; n < lines.length; n++) {
    if (script.lineRoles.get(n) === "synopsis") after = n;
    else if (lines[n].trim() !== "") break;
  }
  return [{ from: textEnd(after), to: textEnd(after), insert: `${eol}[[target: ${formatTarget(seconds)}]]` }];
}

/** Edits that set the play's target, or take it out with null. */
export function playTargetEdits(source: string, script: ParsedScript, seconds: number | null, title: string): TextEdit[] {
  return titleKeyEdits(source, script, [["Target", seconds === null ? null : formatTarget(seconds)]], title);
}

/** How a runtime compares with its target: "2 min over", "3 min under" or "on target" (within 15 seconds, or 5 % of a long one). */
export function targetDelta(runtime: number, target: number): { over: boolean; on: boolean; seconds: number } {
  const seconds = runtime - target;
  const on = Math.abs(seconds) < Math.max(15, target * 0.05);
  return { over: !on && seconds > 0, on, seconds: Math.abs(seconds) };
}
