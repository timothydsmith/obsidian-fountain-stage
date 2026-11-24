/**
 * Planning a play in its outline: adding beats, scenes and action beats,
 * writing their synopses and linking their notes. Each goes straight into
 * the script as a section or scene heading, so the plan is the script from
 * the start and can't drift from it.
 */

import type { IsAct } from "./acts";
import { insertionText } from "./insert";
import { eolOf, lineStarts } from "./lines";
import type { ParsedScript } from "./parser";
import { headingLine } from "./scenes";
import { headingNotes } from "./storyOutline";
import type { TextEdit } from "./titlePage";

/** An edit, and where the cursor goes after it. */
export interface PlanEdit extends TextEdit {
  cursor: number;
}

export type PlanKind = "act" | "section" | "scene" | "action";

interface Heading {
  line: number;
  kind: PlanKind;
  depth: number;
}

/** The script's headings in order: acts, story beats, scenes and action beats. */
function headings(script: ParsedScript, isAct: IsAct, actionDepth: number): Heading[] {
  const out: Heading[] = [];
  for (const el of script.elements) {
    if (el.type === "section") {
      const depth = el.depth ?? 1;
      out.push({ line: el.line, kind: depth >= actionDepth ? "action" : "section", depth });
    } else if (el.type === "scene_heading") {
      out.push({ line: el.line, kind: isAct(el.text) ? "act" : "scene", depth: 0 });
    }
  }
  return out;
}

/**
 * The line after the end of what the heading on `line` holds, or the line
 * count at the end of the script. A story beat holds what follows it until
 * a beat as deep or shallower; an act, until the next act; a scene, until
 * the next scene, act or story beat (its action beats are part of it); an
 * action beat, until the next heading of any kind.
 */
export function blockEnd(source: string, script: ParsedScript, isAct: IsAct, line: number, actionDepth: number): number {
  const all = headings(script, isAct, actionDepth);
  const i = all.findIndex((h) => h.line === line);
  const lineCount = lineStarts(source).length;
  if (i < 0) return lineCount;
  const self = all[i];
  const ends = (h: Heading): boolean => {
    switch (self.kind) {
      case "section":
        return h.kind === "section" && h.depth <= self.depth;
      case "act":
        return h.kind === "act";
      case "scene":
        return h.kind !== "action";
      case "action":
        return true;
    }
  };
  const next = all.slice(i + 1).find(ends);
  return next ? next.line : lineCount;
}

/**
 * Puts lines in as a paragraph of their own at the start of `line` (or at
 * the end of the script, for a line past the last), with blank lines around
 * them. The cursor goes to the end of the first line put in.
 */
export function insertParagraph(source: string, line: number, text: string[]): PlanEdit {
  const eol = eolOf(source);
  const starts = lineStarts(source);
  const body = text.join(eol);
  if (line >= starts.length) {
    // At the end: after a blank line, starting a new line if the last has text.
    const trailing = /(\r?\n)*[ \t]*$/.exec(source)?.[0] ?? "";
    const from = source.length - trailing.length;
    const insert = from === 0 ? body + eol : eol + eol + body + eol;
    return { from, to: source.length, insert, cursor: from + insert.indexOf(text[0]) + text[0].length };
  }
  const at = starts[line];
  let insert = insertionText(source, at, at, body);
  if (eol === "\r\n") insert = insert.replace(/\r?\n/g, "\r\n");
  return { from: at, to: at, insert, cursor: at + insert.indexOf(text[0]) + text[0].length };
}

/** A section heading of a depth, such as `## Name`. */
export function sectionLine(name: string, depth: number): string {
  return `${"#".repeat(Math.max(depth, 1))} ${name.trim()}`;
}

/** A synopsis line for each line of text, or none for blank text. */
export function synopsisLines(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => `= ${line}`);
}

/** Adds a story beat or action beat (a section of `depth`), with its synopsis, at the start of `line`. */
export function addSection(source: string, line: number, name: string, depth: number, synopsis?: string): PlanEdit {
  return insertParagraph(source, line, [sectionLine(name, depth), ...synopsisLines(synopsis)]);
}

/** Adds a scene, with its synopsis, at the start of `line`. The heading is forced with a full stop unless it starts like INT. or EXT. */
export function addScene(source: string, line: number, heading: string, synopsis?: string): PlanEdit {
  return insertParagraph(source, line, [headingLine(heading), ...synopsisLines(synopsis)]);
}

/**
 * Sets the synopsis under the heading on `line`, in place of the one there,
 * or takes it out for blank text. A new synopsis goes straight under the
 * heading.
 */
export function synopsisEdits(source: string, script: ParsedScript, line: number, text: string): TextEdit[] {
  const eol = eolOf(source);
  const starts = lineStarts(source);
  const lines = source.split("\n");
  const notes = headingNotes(lines, script, line);
  const written = synopsisLines(text);
  const lineEnd = (n: number) => starts[n] + lines[n].replace(/\r$/, "").length;
  if (notes.synopsisLines.length === 0) {
    if (written.length === 0) return [];
    const at = lineEnd(line);
    return [{ from: at, to: at, insert: eol + written.join(eol) }];
  }
  const first = notes.synopsisLines[0];
  const last = notes.synopsisLines[notes.synopsisLines.length - 1];
  if (written.length > 0) return [{ from: starts[first], to: lineEnd(last), insert: written.join(eol) }];
  // Taking it out: its lines and the line breaks before them.
  return [{ from: lineEnd(first - 1), to: lineEnd(last), insert: "" }];
}

/** Puts a link to a note under the heading on `line`, after its synopsis. None if there's a link there already. */
export function linkEdits(source: string, script: ParsedScript, line: number, target: string): TextEdit[] {
  const eol = eolOf(source);
  const lines = source.split("\n");
  const notes = headingNotes(lines, script, line);
  if (notes.link !== undefined) return [];
  const starts = lineStarts(source);
  const after = notes.lastLine;
  const at = starts[after] + lines[after].replace(/\r$/, "").length;
  return [{ from: at, to: at, insert: `${eol}[[>${target}]]` }];
}

/** A framework's beats as the lines of a script: a section for each, with its description as the synopsis. */
export function frameworkLines(beats: { name: string; description: string }[], depth = 1): string[] {
  const out: string[] = [];
  beats.forEach((beat, i) => {
    if (i > 0) out.push("");
    out.push(sectionLine(beat.name, depth), ...synopsisLines(beat.description.replace(/\s+/g, " ")));
  });
  return out;
}
