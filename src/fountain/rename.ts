/**
 * Renaming a character throughout a script: its cues, its entry in the
 * Characters list, and its name wherever else it's written, in the same
 * case it was written in ("MARGARET enters", "Margaret's coat").
 */

import { matchBreakdownHeading, type ParsedScript } from "./parser";

/** Where a name is written, so a rename can leave some places alone. */
export type RenamePlace = "cue" | "list" | "direction" | "dialogue";

export const RENAME_PLACES: RenamePlace[] = ["cue", "list", "direction", "dialogue"];

export interface RenameEdit {
  from: number;
  to: number;
  insert: string;
  place: RenamePlace;
  /** The line, counting from 0. */
  line: number;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The name's words, matched whole, in any case and with any spacing between them. */
function nameRe(name: string): RegExp {
  const words = name.trim().split(/\s+/).map(escape).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${words}(?![\\p{L}\\p{N}])`, "giu");
}

const hasLower = (text: string) => text !== text.toUpperCase();

/** "MRS SMITH" as "Mrs Smith". */
function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * The new name in the case the old one was written in: all capitals for
 * "MARGARET", otherwise as you typed it ("Jane", "McClane"), or in title
 * case if you typed it all in capitals or all in lower case.
 */
export function inCaseOf(written: string, newName: string): string {
  if (!hasLower(written)) return newName.toUpperCase();
  const mixed = hasLower(newName) && newName !== newName.toLowerCase();
  return mixed ? newName : titleCase(newName);
}

interface Line {
  text: string;
  start: number;
}

function linesOf(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const raw of source.split("\n")) {
    lines.push({ text: raw.replace(/\r$/, ""), start });
    start += raw.length + 1;
  }
  return lines;
}

/** Where each line's names count, or undefined for lines a rename leaves alone (the title page, but for its Characters). */
function placesOf(script: ParsedScript, lines: Line[]): (RenamePlace | undefined)[] {
  const places: (RenamePlace | undefined)[] = lines.map(() => "direction");
  for (const [line, role] of script.lineRoles) if (role === "title-page") places[line] = undefined;
  for (const entry of script.titlePage) {
    if (entry.key !== "characters") continue;
    for (let line = entry.line; line <= entry.endLine; line++) places[line] = "list";
  }
  // A breakdown line belongs to the section whose heading came last.
  let section: string | undefined;
  lines.forEach((line, i) => {
    const role = script.lineRoles.get(i);
    if (role === "breakdown-heading") section = matchBreakdownHeading(line.text);
    else if (role === "breakdown" && section === "characters") places[i] = "list";
  });
  for (const el of script.elements) {
    if (el.type === "dialogue") for (let line = el.line; line <= el.endLine; line++) places[line] = "dialogue";
    if (el.type === "character") places[el.line] = "cue";
  }
  return places;
}

/** The name part of a cue line: after any indent and `@`, before an extension such as (V.O.) or a `^`. */
function cueNameRange(text: string): { from: number; to: number } {
  const from = /^\s*@?\s*/.exec(text)![0].length;
  const end = text.slice(from).search(/\(|\^|$/);
  const to = from + text.slice(from, from + end).trimEnd().length;
  return { from, to };
}

/**
 * Every change that renames `oldName` to `newName`. Names are matched as
 * whole words in any case, but not all in lower case, so renaming WILL
 * leaves "will" alone. On a cue only the name is changed, and on the title
 * page only the Characters list.
 */
export function findRenames(source: string, script: ParsedScript, oldName: string, newName: string): RenameEdit[] {
  const name = newName.trim();
  if (!oldName.trim() || !name) return [];
  const re = nameRe(oldName);
  const lines = linesOf(source);
  const places = placesOf(script, lines);
  const edits: RenameEdit[] = [];
  lines.forEach((line, i) => {
    const place = places[i];
    if (!place) return;
    let from = 0;
    let text = line.text;
    if (place === "cue") {
      const range = cueNameRange(text);
      from = range.from;
      text = text.slice(range.from, range.to);
      // The whole name, not a name inside it: renaming ANN leaves ANNE's cues alone.
      const m = new RegExp(`^${re.source}$`, "iu").exec(text);
      if (!m) return;
    } else if (script.titlePage.some((e) => e.key === "characters" && e.line === i)) {
      // After the "Characters:" key.
      from = text.indexOf(":") + 1;
      text = text.slice(from);
    }
    for (const m of text.matchAll(re)) {
      if (!/\p{Lu}/u.test(m[0][0])) continue;
      const insert = inCaseOf(m[0], name);
      if (insert === m[0]) continue;
      const start = line.start + from + m.index;
      edits.push({ from: start, to: start + m[0].length, insert, place, line: i });
    }
  });
  return edits;
}

/**
 * The character name at a point in a line (counting from 0), if any: the
 * longest of `names` written there, not all in lower case.
 */
export function nameAt(lineText: string, ch: number, names: string[]): string | undefined {
  let found: string | undefined;
  for (const name of names) {
    for (const m of lineText.matchAll(nameRe(name))) {
      const capitalised = /\p{Lu}/u.test(m[0][0]);
      if (capitalised && m.index <= ch && ch <= m.index + m[0].length && (!found || name.length > found.length)) found = name;
    }
  }
  return found;
}
