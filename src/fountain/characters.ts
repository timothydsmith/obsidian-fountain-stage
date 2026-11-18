/**
 * Character names for completion: every character cue in the script, and
 * the names in its Characters list, most often speaking first.
 */

import type { ParsedScript } from "./parser";

/** A cue's name, without extensions such as (V.O.) or (CONT'D), or a dual dialogue mark. */
export function cueName(text: string): string {
  return text.replace(/\^\s*$/, "").replace(/\s*\(.*$/, "").trim();
}

/** What ends the name in a Characters list entry: a comma, a dash, or a run of spaces. */
const LIST_SEPARATOR_RE = /,|\s[-–—:]\s|\s{2,}|\t/;

/**
 * The name at the start of a Characters list entry, upper case, such as
 * MARGARET in "MARGARET, sixties" or "NORA     34. Student support officer".
 * A name in capitals counts on its own. One in mixed case ("Mrs Smith, a
 * neighbour") needs a description after it, and a capital starting each
 * of its few words, so a line of prose in the list ("The beats, pauses
 * and silences…") isn't taken for one.
 */
function listName(entry: string): string | undefined {
  const line = entry.trim();
  const separator = LIST_SEPARATOR_RE.exec(line);
  const name = (separator ? line.slice(0, separator.index) : line).replace(/\s*\(.*$/, "").trim();
  if (!name) return undefined;
  const capitals = !/\p{Ll}/u.test(name);
  const words = name.split(/\s+/);
  const titleCase = words.length <= 4 && words.every((w) => /^\p{Lu}/u.test(w));
  return capitals || (separator && titleCase) ? name.toUpperCase() : undefined;
}

/** A name worth offering: has letters, and no lower case once upper-cased. */
const isName = (name: string) => /\p{L}/u.test(name) && name.length <= 40;

/**
 * The script's character names, upper case, most cues first, then in
 * alphabetical order. A cue on `exceptLine` (the one being typed) doesn't count.
 */
export function characterNames(script: ParsedScript, exceptLine?: number): string[] {
  const counts = new Map<string, number>();
  for (const entry of script.titleValues.characters ?? []) {
    for (const line of entry.split("\n")) {
      const name = listName(line);
      if (name && isName(name) && !counts.has(name)) counts.set(name, 0);
    }
  }
  for (const el of script.elements) {
    if (el.type !== "character" || el.line === exceptLine) continue;
    const name = cueName(el.text).toUpperCase();
    if (isName(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

export interface NameCompletion {
  /** Where the replaced text starts, as an offset into the text before the cursor. */
  from: number;
  names: string[];
}

/** Upper-case words, which a name of several words ("MRS SMITH") is made of. */
const CAPS_RUN_RE = /(?:\p{Lu}[\p{Lu}\d'’.-]*\s)*\p{Lu}[\p{Lu}\d'’.-]*$/u;

/**
 * The names that complete what's just been typed, once it ends in two
 * capital letters in a row: anywhere in a line, so names in stage
 * directions complete too. The longest run of capitalised words before the
 * cursor that starts some name is completed, so "MRS SM" offers "MRS SMITH"
 * and "the DA" offers "DAVID". Nothing is offered once a whole name is typed.
 */
export function completeName(before: string, names: string[]): NameCompletion | null {
  const run = CAPS_RUN_RE.exec(before);
  if (!run || !/\p{Lu}{2}/u.test(run[0].split(/\s/).pop() ?? "")) return null;
  // Each word start in the run, longest suffix first.
  const starts = [run.index];
  for (let i = run.index; i < before.length; i++) if (/\s/.test(before[i])) starts.push(i + 1);
  for (const from of starts) {
    const typed = before.slice(from);
    // A name typed in full isn't completed further, so Enter after it
    // starts a new line rather than picking a longer name.
    if (names.includes(typed)) return null;
    const matches = names.filter((name) => name.startsWith(typed));
    if (matches.length > 0) return { from, names: matches };
  }
  return null;
}
