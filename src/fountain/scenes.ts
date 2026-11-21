/**
 * Working with a script scene by scene: finding the scene or speech you're
 * in, moving to the next one, moving scenes about, splitting and merging
 * them, and renumbering them.
 *
 * A script is a run of units, each starting at a scene heading (an act
 * heading is a scene heading too) or a section, and running to the next.
 * Anything before the first is the front matter, which never moves.
 */

import { cueName } from "./characters";
import type { IsAct } from "./acts";
import { insertionText } from "./insert";
import type { ParsedScript } from "./parser";
import type { TextEdit } from "./titlePage";

export interface Unit {
  kind: "act" | "scene" | "section";
  /** Its first line, counting from 0, and the line after its last. */
  line: number;
  endLine: number;
  from: number;
  to: number;
}

const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  return starts;
}

/** The script's units, in order. */
export function scriptUnits(source: string, script: ParsedScript, isAct: IsAct): Unit[] {
  const starts = lineStarts(source);
  const heads = script.elements
    .filter((el) => el.type === "scene_heading" || el.type === "section")
    .map((el) => ({ line: el.line, kind: el.type === "section" ? ("section" as const) : isAct(el.text) ? ("act" as const) : ("scene" as const) }));
  return heads.map((head, i) => {
    const endLine = i + 1 < heads.length ? heads[i + 1].line : starts.length;
    return { ...head, endLine, from: starts[head.line], to: endLine < starts.length ? starts[endLine] : source.length };
  });
}

/** The index of the unit a line is in, or -1 in the front matter. */
function unitIndexAt(units: Unit[], line: number): number {
  let found = -1;
  units.forEach((unit, i) => {
    if (unit.line <= line) found = i;
  });
  return found;
}

/** A change to the script, and where the cursor goes after it. */
export interface ScriptEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

/** Moves unit `i` to just before unit `j` (or to the end, for `j` past the last), as one change. */
function moveUnit(source: string, units: Unit[], i: number, j: number): ScriptEdit | undefined {
  if (j === i || j === i + 1) return undefined;
  const first = Math.min(i, j);
  const last = Math.max(i, j - 1);
  const from = units[first].from;
  const to = units[last].to;
  const region = source.slice(from, to);
  let suffix = /\s*$/.exec(region)?.[0] ?? "";
  if (to < source.length && !/\n[ \t]*\n/.test(suffix)) suffix = "\n\n";
  const order: number[] = [];
  for (let k = first; k <= last; k++) if (k !== i) order.push(k);
  order.splice(j > i ? order.length : 0, 0, i);
  const texts = order.map((k) => source.slice(units[k].from, units[k].to).trimEnd());
  const insert = texts.join("\n\n") + suffix;
  const cursor = from + texts.slice(0, order.indexOf(i)).reduce((sum, text) => sum + text.length + 2, 0);
  return { from, to, insert, cursor };
}

/** Moves the scene a line is in up past the unit before it, or down past the one after. Undefined if it isn't in a scene or can't go further. */
export function moveScene(source: string, script: ParsedScript, isAct: IsAct, line: number, direction: -1 | 1): ScriptEdit | undefined {
  const units = scriptUnits(source, script, isAct);
  const i = unitIndexAt(units, line);
  if (i < 0 || units[i].kind !== "scene") return undefined;
  if (direction < 0) return i === 0 ? undefined : moveUnit(source, units, i, i - 1);
  return i === units.length - 1 ? undefined : moveUnit(source, units, i, i + 2);
}

/** Moves the scene whose heading is on `sceneLine` to just before, or after, the unit whose heading is on `targetLine`. */
export function moveSceneTo(source: string, script: ParsedScript, isAct: IsAct, sceneLine: number, targetLine: number, after: boolean): ScriptEdit | undefined {
  const units = scriptUnits(source, script, isAct);
  const i = units.findIndex((unit) => unit.line === sceneLine);
  const target = units.findIndex((unit) => unit.line === targetLine);
  if (i < 0 || target < 0 || units[i].kind !== "scene") return undefined;
  return moveUnit(source, units, i, target + (after ? 1 : 0));
}

/** The line of the next scene heading after `line`, or the previous one before it, acts included. */
export function nextSceneLine(script: ParsedScript, line: number, direction: -1 | 1): number | undefined {
  const lines = script.elements.filter((el) => el.type === "scene_heading").map((el) => el.line);
  return direction > 0 ? lines.find((l) => l > line) : lines.reverse().find((l) => l < line);
}

/** The speech a line is in: its cue's line and the character's name, or undefined outside a speech. */
export function speechAt(script: ParsedScript, line: number): { line: number; name: string } | undefined {
  const { elements } = script;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "character") continue;
    if (el.line > line) break;
    let end = el.endLine;
    for (let k = i + 1; k < elements.length && (elements[k].type === "dialogue" || elements[k].type === "parenthetical"); k++) end = elements[k].endLine;
    if (line <= end) return { line: el.line, name: cueName(el.text).toUpperCase() };
  }
  return undefined;
}

/** The line of the next speech, or previous, by the character speaking at `line`. */
export function nextSpeechLine(script: ParsedScript, line: number, direction: -1 | 1): { name: string; line?: number } | undefined {
  const speech = speechAt(script, line);
  if (!speech) return undefined;
  const cues = script.elements.filter((el) => el.type === "character" && cueName(el.text).toUpperCase() === speech.name).map((el) => el.line);
  const next = direction > 0 ? cues.find((l) => l > speech.line) : cues.reverse().find((l) => l < speech.line);
  return { name: speech.name, line: next };
}

/** The heading line of the scene a line is in, as written, or undefined outside a scene. */
export function sceneHeadingAt(source: string, script: ParsedScript, isAct: IsAct, line: number): { line: number; text: string } | undefined {
  const units = scriptUnits(source, script, isAct);
  const i = unitIndexAt(units, line);
  if (i < 0 || units[i].kind !== "scene") return undefined;
  return { line: units[i].line, text: source.split("\n")[units[i].line].trim() };
}

/** A heading line for `text`, forced with a full stop unless it starts like INT. or EXT. */
export function headingLine(text: string): string {
  const heading = text.trim();
  return heading.startsWith(".") || SCENE_HEADING_RE.test(heading) ? heading : `.${heading}`;
}

/** Starts a new scene at the start of a line, with a heading. Undefined on a scene heading, which already starts one. */
export function splitScene(source: string, script: ParsedScript, line: number, heading: string): ScriptEdit | undefined {
  if (script.elements.some((el) => el.type === "scene_heading" && el.line === line)) return undefined;
  const starts = lineStarts(source);
  const at = starts[Math.min(line, starts.length - 1)];
  const insert = insertionText(source, at, at, headingLine(heading));
  return { from: at, to: at, insert, cursor: at + insert.length };
}

/**
 * Joins the scene a line is in to the scene before it, taking out its
 * heading. A synopsis written under that heading moves up to join the
 * earlier scene's. Undefined unless both are scenes.
 */
export function mergeWithPrevious(source: string, script: ParsedScript, isAct: IsAct, line: number): TextEdit[] | undefined {
  const units = scriptUnits(source, script, isAct);
  const i = unitIndexAt(units, line);
  if (i < 1 || units[i].kind !== "scene" || units[i - 1].kind !== "scene") return undefined;
  const lines = source.split("\n");
  const starts = lineStarts(source);
  const isSynopsis = (n: number) => script.lineRoles.get(n) === "synopsis";
  const blank = (n: number) => n < lines.length && lines[n].trim() === "";

  // The heading, the blank lines and synopsis under it, up to the scene's first text.
  const synopsis: string[] = [];
  let n = units[i].line + 1;
  while (n < units[i].endLine && (blank(n) || isSynopsis(n))) {
    if (isSynopsis(n)) synopsis.push(lines[n].replace(/\r$/, ""));
    n++;
  }
  const edits: TextEdit[] = [{ from: starts[units[i].line], to: n < starts.length ? starts[n] : source.length, insert: "" }];

  if (synopsis.length > 0) {
    // After the earlier scene's heading and any synopsis of its own.
    let at = units[i - 1].line;
    for (let k = at + 1; k < units[i - 1].endLine && (blank(k) || isSynopsis(k)); k++) if (isSynopsis(k)) at = k;
    const end = starts[at] + lines[at].replace(/\r$/, "").length;
    edits.push({ from: end, to: end, insert: synopsis.map((s) => `\n${s}`).join("") });
  }
  return edits;
}

// --- Renumbering ----------------------------------------------------------

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A number from 1 to 99 in words, such as "twenty-one". */
export function numberWord(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

const WORD_VALUES = new Map<string, number>(Array.from({ length: 99 }, (_, k) => [numberWord(k + 1), k + 1]));

/** "SCENE 3", "Scene Three" or "SCENE TWENTY-ONE" in a heading. */
const SCENE_NUMBER_RE = /\b(SCENE[ \t]+)(\d+|[A-Za-z]+(?:-[A-Za-z]+)?)\b/i;
/** A forced scene number at the end of a heading, "#3#". */
const FORCED_NUMBER_RE = /#([0-9A-Za-z][0-9A-Za-z.-]*)#\s*$/;

/** The number written the way `like` was: digits, or words in its case. */
function writeLike(like: string, n: number): string {
  if (/^\d+$/.test(like)) return String(n);
  const word = numberWord(n);
  if (like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

export interface Renumbering {
  line: number;
  before: string;
  after: string;
}

/**
 * The scene headings whose numbers change, counting the scenes (not acts)
 * either from 1 in each act or straight through the play. A heading's
 * number is "SCENE 3" or "SCENE THREE", kept in digits or words, and any
 * "#3#" forced number. Headings without a number count but don't change.
 */
export function renumberScenes(source: string, script: ParsedScript, isAct: IsAct, restartEachAct: boolean): Renumbering[] {
  const lines = source.split("\n");
  const changes: Renumbering[] = [];
  let count = 0;
  for (const el of script.elements) {
    if (el.type !== "scene_heading") continue;
    if (isAct(el.text)) {
      if (restartEachAct) count = 0;
      continue;
    }
    count++;
    const before = lines[el.line].replace(/\r$/, "");
    let after = before.replace(SCENE_NUMBER_RE, (whole, word: string, number: string) => {
      const isNumber = /^\d+$/.test(number) || WORD_VALUES.has(number.toLowerCase());
      return isNumber ? word + writeLike(number, count) : whole;
    });
    after = after.replace(FORCED_NUMBER_RE, (whole) => whole.replace(/#[^#]*#/, `#${count}#`));
    if (after !== before) changes.push({ line: el.line, before, after });
  }
  return changes;
}

/** The edits that make renumberings. */
export function renumberEdits(source: string, changes: Renumbering[]): TextEdit[] {
  const starts = lineStarts(source);
  return changes.map(({ line, before, after }) => ({ from: starts[line], to: starts[line] + before.length, insert: after }));
}

/** A heading with its scene number one on, for the heading a split scene starts with: "SCENE 3" becomes "SCENE 4". */
export function nextHeading(heading: string): string {
  return heading
    .replace(SCENE_NUMBER_RE, (whole, word: string, number: string) => {
      const value = /^\d+$/.test(number) ? parseInt(number, 10) : WORD_VALUES.get(number.toLowerCase());
      return value === undefined || value >= 99 ? whole : word + writeLike(number, value + 1);
    })
    .replace(FORCED_NUMBER_RE, "")
    .trim();
}
