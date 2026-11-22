/**
 * Alternate lines: other versions of a speech or an action paragraph,
 * kept in notes straight under it, `[[alt: …]]`, one note for each.
 * Notes never print, so the file stays valid Fountain and the PDF shows
 * only the live version.
 *
 * A note on a line of its own reads as a blank line, so the notes go after
 * the whole speech, not between its lines, where they'd end it early.
 */

import type { ParsedScript, ScriptElement } from "./parser";

const ALT_START_RE = /^\s*\[\[\s*alt\s*:/i;

/** Whether a note's text (inside the brackets) is an alternate. */
export function isAlternateNote(text: string): boolean {
  return /^\s*alt\s*:/i.test(text);
}

export interface Alternates {
  /** First and last line of the live version, counting from 0. */
  line: number;
  endLine: number;
  /** The last line of its alternates' notes, or endLine if it has none. */
  altEndLine: number;
  /** The live version, as written. */
  live: string;
  /** The other versions, in the order they come round. */
  alternates: string[];
  /** Source offsets from the start of `line` to the end of `altEndLine`. */
  from: number;
  to: number;
}

export interface AlternateEdit {
  from: number;
  to: number;
  insert: string;
  /** Where the cursor goes after: the start of the live version. */
  cursor: number;
}

/** The lines of a speech (not its cue) or an action paragraph that an element is part of. */
function blockOf(elements: ScriptElement[], index: number): { line: number; endLine: number } | undefined {
  const el = elements[index];
  if (el.type === "action" || el.type === "centered") return { line: el.line, endLine: el.endLine };
  if (el.type !== "character" && el.type !== "dialogue" && el.type !== "parenthetical") return undefined;
  let cue = index;
  while (cue >= 0 && elements[cue].type !== "character") cue--;
  if (cue < 0) return undefined;
  let last = cue;
  while (last + 1 < elements.length && (elements[last + 1].type === "dialogue" || elements[last + 1].type === "parenthetical")) last++;
  return last === cue ? undefined : { line: elements[cue + 1].line, endLine: elements[last].endLine };
}

/** The alternates' notes straight after a line: their text, and the last line they take. */
function readAlternates(lines: string[], after: number): { texts: string[]; end: number } {
  const texts: string[] = [];
  let end = after;
  let i = after + 1;
  while (i < lines.length) {
    const start = ALT_START_RE.exec(lines[i]);
    if (!start) break;
    let j = i;
    let text = lines[i].slice(start[0].length);
    while (!text.includes("]]") && j + 1 < lines.length) text += `\n${lines[++j]}`;
    const close = text.indexOf("]]");
    // Unclosed, or something else on the line after it: not ours to change.
    if (close < 0 || text.slice(close + 2).trim() !== "") break;
    texts.push(text.slice(0, close).replace(/^ /, "").trimEnd());
    end = j;
    i = j + 1;
  }
  return { texts, end };
}

/** The speech or action paragraph at a line (its cue, its lines or its alternates' notes) and its alternates. */
export function alternatesAt(source: string, script: ParsedScript, line: number): Alternates | undefined {
  const lines = source.split("\n");
  const { elements } = script;
  let index = elements.findIndex((e) => e.line <= line && line <= e.endLine);
  // On an alternate's note, which belongs to the element above it.
  if (index < 0) {
    for (let k = elements.length - 1; k >= 0; k--) {
      if (elements[k].endLine < line) {
        index = k;
        break;
      }
    }
  }
  if (index < 0) return undefined;
  const block = blockOf(elements, index);
  if (!block) return undefined;
  const { texts, end } = readAlternates(lines, block.endLine);
  if (line > end) return undefined;

  let from = 0;
  for (let i = 0; i < block.line; i++) from += lines[i].length + 1;
  let to = from;
  for (let i = block.line; i <= end; i++) to += lines[i].length + 1;
  return {
    ...block,
    altEndLine: end,
    live: lines.slice(block.line, block.endLine + 1).join("\n"),
    alternates: texts,
    from,
    to: to - 1,
  };
}

/** Whether a version can go in a note: not if it has a note of its own, whose brackets would end it. */
export function canBeAlternate(text: string): boolean {
  return !text.includes("[[") && !text.includes("]]");
}

function rewrite(a: Alternates, live: string, alternates: string[]): AlternateEdit {
  const insert = [live, ...alternates.map((t) => `[[alt: ${t}]]`)].join("\n");
  return { from: a.from, to: a.to, insert, cursor: a.from };
}

/** Keeps a copy of the live version as the first alternate, to rewrite the live one. */
export function keepAlternate(a: Alternates): AlternateEdit {
  return rewrite(a, a.live, [a.live, ...a.alternates]);
}

/**
 * Makes an alternate live. The versions keep their order, as if round a
 * circle, so switching to the first one again and again comes back round.
 */
export function switchAlternate(a: Alternates, index: number): AlternateEdit {
  const alts = a.alternates;
  return rewrite(a, alts[index], [...alts.slice(index + 1), a.live, ...alts.slice(0, index)]);
}
