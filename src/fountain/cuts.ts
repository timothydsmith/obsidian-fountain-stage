/**
 * Cuts files: text cut from a draft, kept in a Fountain file of its own,
 * one per draft. Each cut sits under a `#` section heading saying where it
 * came from, and the cuts are kept in the order of where they came from in
 * the play.
 *
 *     # 7. INT. KITCHEN, line 3 · 22 November 2026
 *
 *     NORA
 *     I never liked this house.
 */

import type { ParsedScript } from "./parser";
import { formatDraftDate } from "./titlePage";

/** One cut: its heading line and its text. */
export interface Cut {
  heading: string;
  body: string;
}

/** Where a cut came from: the scene heading it was under (0 for before the first), and the line in that scene, counting the heading as 0. */
export interface CutPlace {
  scene: number;
  line: number;
}

interface CutsFile {
  /** Anything before the first cut. */
  preamble: string;
  cuts: (Cut & { line: number; endLine: number })[];
}

/** A cut's heading. The scene number and line keep cuts in play order; the date is when it was cut. */
const HEADING_RE = /^#[ \t]+(?:(\d+)\.[ \t]+.*?|Start), line (\d+) · \S.*$/;

/** The heading for text cut from a script, starting at `from`. */
export function cutHeading(script: ParsedScript, source: string, from: number, date: Date): Cut["heading"] {
  const line = lineAt(source, from);
  let scene = 0;
  let title = "";
  let headingLine = 0;
  for (const el of script.elements) {
    if (el.line > line) break;
    if (el.type !== "scene_heading") continue;
    scene++;
    title = el.text.replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
    headingLine = el.line;
  }
  const where = scene === 0 ? "Start" : `${scene}. ${title}`;
  return `# ${where}, line ${line - headingLine} · ${formatDraftDate(date)}`;
}

/** Where a cut came from, read from its heading, or undefined for a heading that's been changed out of shape. */
export function cutPlace(heading: string): CutPlace | undefined {
  const m = HEADING_RE.exec(heading.trim());
  if (!m) return undefined;
  return { scene: m[1] ? parseInt(m[1], 10) : 0, line: parseInt(m[2], 10) };
}

const before = (a: CutPlace, b: CutPlace) => a.scene < b.scene || (a.scene === b.scene && a.line < b.line);

/** The text cut from a selection: as selected, without blank lines at either end. */
export function cutBody(selected: string): string {
  return selected.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, "").replace(/\s+$/, "");
}

/** A cuts file's cuts. A cut runs from its heading to the next cut's heading. */
export function parseCutsFile(source: string): CutsFile {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const starts: number[] = [];
  lines.forEach((text, i) => {
    if (cutPlace(text)) starts.push(i);
  });
  const trimBlank = (part: string[]) => part.join("\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
  const cuts = starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
    return { heading: lines[start].trim(), body: trimBlank(lines.slice(start + 1, end)), line: start, endLine: end - 1 };
  });
  return { preamble: trimBlank(lines.slice(0, starts[0] ?? lines.length)), cuts };
}

function printCutsFile({ preamble, cuts }: { preamble: string; cuts: Cut[] }): string {
  const parts = [preamble, ...cuts.map((cut) => (cut.body ? `${cut.heading}\n\n${cut.body}` : cut.heading))].filter(Boolean);
  return parts.length === 0 ? "" : parts.join("\n\n") + "\n";
}

/** A cuts file with a cut added in play order: after the cuts from before it, and before those from after it. */
export function addCut(source: string, cut: Cut): string {
  const file = parseCutsFile(source);
  const place = cutPlace(cut.heading);
  let at = file.cuts.length;
  if (place) {
    const next = file.cuts.findIndex((other) => {
      const otherPlace = cutPlace(other.heading);
      return otherPlace !== undefined && before(place, otherPlace);
    });
    if (next >= 0) at = next;
  }
  const cuts: Cut[] = file.cuts.slice();
  cuts.splice(at, 0, { heading: cut.heading, body: cutBody(cut.body) });
  return printCutsFile({ preamble: file.preamble, cuts });
}

/** A cuts file without a cut, matched by heading and text. Unchanged if it isn't there, such as after it's been edited. */
export function removeCut(source: string, cut: Cut): string {
  const file = parseCutsFile(source);
  const body = cutBody(cut.body);
  const i = file.cuts.findIndex((other) => other.heading === cut.heading.trim() && other.body === body);
  if (i < 0) return source;
  const cuts: Cut[] = file.cuts.slice();
  cuts.splice(i, 1);
  return printCutsFile({ preamble: file.preamble, cuts });
}

/** The cut a line of a cuts file is in, counting from 0, or undefined before the first. */
export function cutAtLine(source: string, line: number): Cut | undefined {
  const cut = parseCutsFile(source).cuts.find((c) => line >= c.line && line <= c.endLine);
  return cut && { heading: cut.heading, body: cut.body };
}

/**
 * The text to put in for a cut restored in place of the selection from
 * `from` to `to`. Partway along a line it goes in as it is, such as a
 * phrase back in a speech. At the start of a line of text, or on a blank
 * line, it goes in as a paragraph of its own, with blank lines around it,
 * so a cue after it is still a cue.
 */
export function restoreText(source: string, from: number, to: number, body: string): string {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const end = source.indexOf("\n", to);
  const lineEnd = end < 0 ? source.length : end;
  if (source.slice(lineStart, from).trim() !== "") return body;
  if (source.slice(to, lineEnd).trim() !== "") return `${body}\n\n`;
  const lineOf = (start: number) => {
    const stop = source.indexOf("\n", start);
    return source.slice(start, stop < 0 ? source.length : stop);
  };
  const previous = lineStart > 0 ? lineOf(source.lastIndexOf("\n", lineStart - 2) + 1) : "";
  const next = lineEnd < source.length ? lineOf(lineEnd + 1) : "";
  return (previous.trim() !== "" ? "\n" : "") + body + (next.trim() !== "" ? "\n" : "");
}

/** The file name, without extension, of a draft's cuts file, such as "Play - Draft 04 - Cuts". */
export function cutsFileName(draftName: string): string {
  // The frozen draft's name, "Play - Draft 04 - 2026-11-22", without its date.
  return draftName.replace(/ - \d{4}-\d{2}-\d{2}$/, "") + " - Cuts";
}

const CUTS_NAME_RE = /^(.*) - Draft (\d+) - Cuts$/;

/** Whether a file name (without extension) is a cuts file's, and if so which draft's: the frozen draft names start with `prefix`. */
export function parseCutsFileName(basename: string): { prefix: string } | undefined {
  const m = CUTS_NAME_RE.exec(basename);
  return m ? { prefix: `${m[1]} - Draft ${m[2]} - ` } : undefined;
}

/** Whether a file name (without extension) is that of the frozen draft a cuts file belongs to. */
export function isFrozenDraftOf(basename: string, prefix: string): boolean {
  return basename.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}(?: \d+)?$/.test(basename.slice(prefix.length));
}

function lineAt(source: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}
