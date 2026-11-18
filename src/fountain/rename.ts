/**
 * Renaming a character throughout a script: its cues, its entry in the
 * Characters list, and its name wherever else it's written, in the same
 * case it was written in ("MARGARET enters", "Margaret's coat").
 */

import { matchBreakdownHeading, type ParsedScript } from "./parser";
import { escapeRe, wholeWordRe, wholeWords } from "./wholeWords";

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

/** The name's words, in any case and with any spacing between them, as a pattern. */
function nameSource(name: string): string {
  return name.trim().split(/\s+/).map(escapeRe).join("\\s+");
}

/** The name, matched whole. */
function nameRe(name: string): RegExp {
  return wholeWordRe(nameSource(name));
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
      if (!new RegExp(`^(?:${nameSource(oldName)})$`, "iu").test(text)) return;
    } else if (script.titlePage.some((e) => e.key === "characters" && e.line === i)) {
      // After the "Characters:" key.
      from = text.indexOf(":") + 1;
      text = text.slice(from);
    }
    for (const m of wholeWords(text, re)) {
      if (!/\p{Lu}/u.test(m.text[0])) continue;
      const insert = inCaseOf(m.text, name);
      if (insert === m.text) continue;
      const start = line.start + from + m.index;
      edits.push({ from: start, to: start + m.text.length, insert, place, line: i });
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
    for (const m of wholeWords(lineText, nameRe(name))) {
      const capitalised = /\p{Lu}/u.test(m.text[0]);
      if (capitalised && m.index <= ch && ch <= m.index + m.text.length && (!found || name.length > found.length)) found = name;
    }
  }
  return found;
}
