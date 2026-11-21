/**
 * What Tab does to a line of a script.
 *
 * - On an empty line that starts a block (after a blank line), it asks for
 *   the character name list, since a new block is a stage direction unless
 *   you pick a name.
 * - On a line of text outside a speech, it changes the line's type: action
 *   → character → scene heading → transition → action (Shift+Tab goes
 *   back). Each type is made from the line as it was before the first Tab,
 *   so cycling round gives the original back.
 * - Inside a speech, it switches a line between dialogue and parenthetical,
 *   and on an empty line there, starts a parenthetical.
 *
 * The parser decides what a line is, before and after, so a change only
 * adds a forcing mark (`!`, `@`, `.`, `>`) when the text alone wouldn't do.
 */

import { actMatcher, type IsAct } from "./acts";
import { type ElementType, parseFountain, type ParsedScript } from "./parser";

export type CycleType = "action" | "character" | "scene_heading" | "transition";
export const CYCLE: CycleType[] = ["action", "character", "scene_heading", "transition"];

/** Where a line is in the cycle, so further Tabs carry on from the original text. */
export interface CycleMemory {
  line: number;
  /** The line's text before the first Tab, without its marks. */
  base: string;
  step: number;
  /** The text Tab last left on the line. If it's changed since, the cycle starts again. */
  text: string;
}

export type TabResult =
  | { kind: "names" }
  | { kind: "replace"; text: string; cursor: number; memory?: CycleMemory }
  | { kind: "none" };

function elementAt(script: ParsedScript, line: number): ElementType | undefined {
  return script.elements.find((el) => el.line <= line && line <= el.endLine)?.type;
}

/** What the line would be with different text. */
function typeWith(lines: string[], line: number, text: string): ElementType | undefined {
  const changed = lines.slice();
  changed[line] = text;
  return elementAt(parseFountain(changed.join("\n")), line);
}

/** The text without the mark that forces its type. */
function strip(type: CycleType, text: string): string {
  switch (type) {
    case "action":
      return text.replace(/^!/, "");
    case "character":
      return text.replace(/^@/, "");
    case "scene_heading":
      return text.replace(/^\.(?!\.)/, "");
    case "transition":
      return text.replace(/^>\s*/, "");
  }
}

/** The line's text as the given type, made from its text without marks. */
function asType(type: CycleType, base: string, lines: string[], line: number, indent: string): string {
  const is = (text: string) => typeWith(lines, line, indent + text);
  switch (type) {
    case "action":
      return is(base) === "action" ? base : `!${base}`;
    case "character": {
      // A cue is only a cue once dialogue follows, so until then it reads as action.
      const upper = base.toUpperCase();
      const t = is(upper);
      return t === "character" || t === "action" ? upper : `@${upper}`;
    }
    case "scene_heading":
      return is(base) === "scene_heading" ? base : `.${base}`;
    case "transition":
      return is(base) === "transition" ? base : `> ${base}`;
  }
}

/** What Tab (direction 1) or Shift+Tab (-1) does on a line, counting from 0. */
export function tabOnLine(source: string, line: number, direction: 1 | -1, memory?: CycleMemory): TabResult {
  const lines = source.split("\n");
  const text = lines[line] ?? "";
  const indent = /^\s*/.exec(text)![0];
  const body = text.slice(indent.length);
  const prevBlank = line === 0 || lines[line - 1].trim() === "";
  const script = parseFountain(source);
  if (script.lineRoles.get(line) === "title-page") return { kind: "none" };

  if (body === "") {
    if (prevBlank) return direction === 1 ? { kind: "names" } : { kind: "none" };
    // Under a cue or dialogue, an empty line can start a parenthetical.
    if (typeWith(lines, line, `${indent}(x)`) === "parenthetical") {
      return { kind: "replace", text: `${indent}()`, cursor: indent.length + 1 };
    }
    return { kind: "none" };
  }

  const type = elementAt(script, line);
  if (type === "dialogue") {
    const changed = `${indent}(${body})`;
    return { kind: "replace", text: changed, cursor: changed.length };
  }
  if (type === "parenthetical") {
    const changed = indent + body.replace(/^\(\s*/, "").replace(/\s*\)$/, "");
    return { kind: "replace", text: changed, cursor: changed.length };
  }

  let base: string;
  let step: number;
  if (memory && memory.line === line && memory.text === text) {
    ({ base, step } = memory);
  } else {
    step = CYCLE.indexOf(type as CycleType);
    if (step < 0) return { kind: "none" };
    base = strip(CYCLE[step], body);
  }
  // Each press changes the line: a type that would leave it as it is (an
  // all-caps line is already a cue in waiting) is skipped.
  let next = step;
  let changed = text;
  for (let i = 0; i < CYCLE.length - 1 && changed === text; i++) {
    next = (next + direction + CYCLE.length) % CYCLE.length;
    changed = indent + asType(CYCLE[next], base, lines, line, indent);
  }
  return { kind: "replace", text: changed, cursor: changed.length, memory: { line, base, step: next, text: changed } };
}

/** What a line is, in words, for the status bar: "Character", "Stage direction", "Act" and so on. */
export function describeLine(script: ParsedScript, line: number, text: string, isAct: IsAct = actMatcher()): string {
  const role = script.lineRoles.get(line);
  if (role === "title-page") return "Title page";
  if (role === "synopsis") return "Synopsis";
  if (role === "breakdown-heading" || role === "breakdown") return "Breakdown";
  const el = script.elements.find((e) => e.line <= line && line <= e.endLine);
  if (!el) return text.trim() === "" ? "Blank line" : "Note or boneyard";
  switch (el.type) {
    case "action":
      return el.italic ? "Lyric" : "Stage direction";
    case "character":
      return el.dual ? "Character (dual dialogue)" : "Character";
    case "dialogue":
      return el.italic ? "Lyric" : "Dialogue";
    case "parenthetical":
      return "Parenthetical";
    case "scene_heading":
      return isAct(el.text) ? "Act" : "Scene heading";
    case "transition":
      return "Transition";
    case "centered":
      return "Centred";
    case "section":
      return "Section";
    case "page_break":
      return "Page break";
    case "preface":
    case "preface_list_item":
      return "Preface";
  }
}
