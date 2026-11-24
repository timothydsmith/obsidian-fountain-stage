/**
 * Writing a script's cast list and scene breakdown from the script itself,
 * keeping what's already written.
 *
 * The Characters list gains whoever speaks but isn't in it, after its last
 * entry; entries and their descriptions stay as they are, and so do notes
 * in the list, such as who doubles whom. Names in the list the script
 * never uses stay too, and are reported.
 *
 * The Scene Breakdown is written again from the scene headings, numbered,
 * under each act. An entry that starts with a scene's title keeps what
 * follows it ("3. The Kitchen, the next morning"), and an entry for a
 * scene's number that names no scene is kept as it is, as your own words
 * for that scene. Notes in the section stay.
 *
 * Either is written where the script already has it: as a title-page key,
 * or as a section such as `***Characters***` before the play. A script
 * with neither gets sections just before the play starts.
 */

import { cueName, listName } from "./characters";
import { matchBreakdownHeading, type ParsedScript } from "./parser";
import type { SceneRange } from "./report";
import { isPreface } from "./runtime";
import type { TextEdit } from "./titlePage";

export interface BreakdownResult {
  edits: TextEdit[];
  /** Characters added to the list. */
  added: string[];
  /** Names in the list the script never uses. */
  unused: string[];
  /** Scenes in the breakdown, or 0 if the script has no scene headings. */
  scenes: number;
  /** Whether the breakdown changed. */
  breakdownChanged: boolean;
}

type Kind = "characters" | "scene breakdown";

/** Where a list is written: its lines, the first line of its entries, and how its entries are written. */
interface Section {
  kind: Kind;
  /** A title-page key, or a section in the body. */
  form: "title-page" | "body";
  /** Every line of the section's content, by line number. In a title page, the key's own line counts as its first. */
  lines: number[];
  /** For a body section, its heading's line. */
  heading?: number;
  /** For a title-page key, how continuation lines are indented. */
  indent: string;
}

const TITLE_KEYS: Record<Kind, string[]> = {
  characters: ["characters", "character", "cast of characters", "cast"],
  "scene breakdown": ["scene breakdown", "scenes", "scene_breakdown"],
};

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  return starts;
}

/** The sections a script already has. */
function findSections(source: string, script: ParsedScript): Section[] {
  const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));
  const sections: Section[] = [];
  for (const kind of ["characters", "scene breakdown"] as Kind[]) {
    const entry = script.titlePage.find((e) => TITLE_KEYS[kind].includes(e.key));
    if (entry) {
      const range = Array.from({ length: entry.endLine - entry.line + 1 }, (_, i) => entry.line + i);
      const indent = entry.endLine > entry.line ? (/^[ \t]+/.exec(lines[entry.line + 1])?.[0] ?? "    ") : "    ";
      sections.push({ kind, form: "title-page", lines: range, indent });
    }
  }
  for (const [line, role] of script.lineRoles) {
    if (role !== "breakdown-heading") continue;
    const heading = matchBreakdownHeading(lines[line]);
    const kind: Kind | undefined = heading === "characters" ? "characters" : heading === "scene breakdown" ? "scene breakdown" : undefined;
    if (!kind || sections.some((s) => s.kind === kind)) continue;
    const content: number[] = [];
    for (let i = line + 1; i < lines.length; i++) {
      const role = script.lineRoles.get(i);
      if (role === "breakdown") content.push(i);
      else if (lines[i].trim() === "" && role === undefined) content.push(i);
      else break;
    }
    // Blank lines at the end belong between it and what comes next.
    while (content.length > 0 && lines[content[content.length - 1]].trim() === "") content.pop();
    sections.push({ kind, form: "body", lines: content, heading: line, indent: "" });
  }
  return sections;
}

/** The text of a title-page line without its key, or a body line as it is. */
function valueOf(text: string, section: Section, line: number): string {
  if (section.form === "title-page" && line === section.lines[0]) return text.replace(/^[^:]*:\s*/, "");
  return text.trim();
}

/** A scene's entry: "3. Alex's Apartment". */
const ENTRY_RE = /^(\d+[A-Za-z]?)[.)]\s+(.*)$/;
/** An act's line in a breakdown: *Act One* or _Act One_, or the act's own title. */
const ACT_LINE_RE = /^([*_]{1,3})([^*_].*?)\1:?$/;

/** Who speaks in the script, in the order they first do. */
function speakers(script: ParsedScript): string[] {
  const names: string[] = [];
  for (const el of script.elements) {
    if (el.type !== "character" || isPreface(el)) continue;
    const name = cueName(el.text).toUpperCase();
    if (/\p{L}/u.test(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The edits that bring the Characters list and Scene Breakdown up to date.
 * `scenes` are the script's scenes, as the report finds them.
 */
export function breakdownEdits(source: string, script: ParsedScript, scenes: SceneRange[], headingLines: Set<number>): BreakdownResult {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));
  const starts = lineStarts(source);
  const lineEnd = (line: number) => starts[line] + lines[line].length;
  const sections = findSections(source, script);
  const edits: TextEdit[] = [];
  /** New sections, written together just before the play. */
  const fresh: string[] = [];

  // --- Characters ----------------------------------------------------------
  const cast = sections.find((s) => s.kind === "characters");
  const listed: string[] = [];
  let lastEntry: number | undefined;
  let inlineList = false;
  if (cast) {
    for (const line of cast.lines) {
      const value = valueOf(lines[line], cast, line);
      // "Characters: ANNA, TOM, MRS PIKE" on one line is a list of names.
      const items = value.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean);
      if (cast.form === "title-page" && cast.lines.length === 1 && items.length > 1 && items.every((i) => !/\p{Ll}/u.test(i))) {
        inlineList = true;
        listed.push(...items.map((i) => i.toUpperCase()));
        lastEntry = line;
        continue;
      }
      const name = value ? listName(value) : undefined;
      if (name) {
        listed.push(name);
        lastEntry = line;
      }
    }
  }
  const added = speakers(script).filter((n) => !listed.includes(n));
  // A name the script uses anywhere outside the list, such as in a stage direction, is used.
  const body = script.elements.filter((el) => !isPreface(el)).map((el) => el.text.toUpperCase()).join("\n");
  const unused = listed.filter((n) => !new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(body));

  if (added.length > 0) {
    if (cast && inlineList && lastEntry !== undefined) {
      edits.push({ from: lineEnd(lastEntry), to: lineEnd(lastEntry), insert: `, ${added.join(", ")}` });
    } else if (cast) {
      const indent = cast.form === "title-page" ? cast.indent : "";
      const after = lastEntry ?? (cast.form === "title-page" ? cast.lines[0] : cast.heading!);
      edits.push({ from: lineEnd(after), to: lineEnd(after), insert: added.map((n) => eol + indent + n).join("") });
    } else {
      fresh.push(["***Characters***", ...added].join(eol));
    }
  }

  // --- Scene breakdown -----------------------------------------------------
  const real = scenes.filter((s) => headingLines.has(s.line));
  const breakdown = sections.find((s) => s.kind === "scene breakdown");
  let breakdownChanged = false;
  if (real.length > 0) {
    // What's written now: each entry's number and text, and where the entries are.
    const old = new Map<string, string>();
    const entryLines: number[] = [];
    for (const line of breakdown?.lines ?? []) {
      const value = valueOf(lines[line], breakdown!, line);
      const entry = ENTRY_RE.exec(value);
      if (entry) old.set(entry[1], entry[2].trim());
      if (entry || ACT_LINE_RE.test(value) || real.some((s) => s.act && s.act.toLowerCase() === value.replace(/:$/, "").toLowerCase())) entryLines.push(line);
    }
    const oldTexts = [...old.values()];
    const titleStarts = (text: string, title: string) => text.toLowerCase().startsWith(title.toLowerCase());
    const written: string[] = [];
    let act: string | undefined;
    real.forEach((scene, i) => {
      if (scene.act !== act) {
        if (written.length > 0) written.push("");
        if (scene.act) written.push(`*${scene.act}*`);
        act = scene.act;
      }
      const number = scene.sceneNumber ?? String(i + 1);
      const byNumber = old.get(number);
      const sameScene = byNumber !== undefined && titleStarts(byNumber, scene.title) ? byNumber : undefined;
      // An entry naming no scene at all is your own words for the scene with its number.
      const own = byNumber !== undefined && !real.some((s) => titleStarts(byNumber, s.title)) ? byNumber : undefined;
      const byTitle = oldTexts.find((t) => titleStarts(t, scene.title));
      written.push(`${number}. ${sameScene ?? own ?? byTitle ?? scene.title}`);
    });

    if (!breakdown) {
      fresh.push(["***Scene Breakdown***", ...written].join(eol));
      breakdownChanged = true;
    } else {
      const indent = breakdown.form === "title-page" ? breakdown.indent : "";
      const block = written.map((l) => (l ? indent + l : "")).join(eol);
      if (breakdown.form === "title-page") {
        // The key's own line keeps its key, with the entries below it.
        const first = breakdown.lines[0];
        const last = breakdown.lines[breakdown.lines.length - 1];
        const key = lines[first].split(":")[0];
        const insert = `${key}:${eol}${block}`;
        if (source.slice(starts[first], lineEnd(last)) !== insert.replace(/\r\n/g, "\n").split("\n").join(eol)) {
          edits.push({ from: starts[first], to: lineEnd(last), insert });
          breakdownChanged = true;
        }
      } else if (entryLines.length > 0) {
        const from = starts[entryLines[0]];
        const to = lineEnd(entryLines[entryLines.length - 1]);
        if (source.slice(from, to).replace(/\r\n/g, "\n") !== block.replace(/\r\n/g, "\n")) {
          edits.push({ from, to, insert: block });
          breakdownChanged = true;
        }
      } else {
        edits.push({ from: lineEnd(breakdown.heading!), to: lineEnd(breakdown.heading!), insert: eol + block + (breakdown.lines.length > 0 ? eol : "") });
        breakdownChanged = true;
      }
    }
  }

  if (fresh.length > 0) {
    // Just before the play: its first element after the preface, or the end.
    const first = script.elements.find((el) => !isPreface(el));
    const at = first ? starts[first.line] : source.length;
    const before = source.slice(0, at);
    const lead = before === "" || /\n[ \t]*\r?\n$/.test(before) || /^[ \t]*\r?\n?$/.test(before) ? "" : before.endsWith("\n") ? eol : eol + eol;
    const text = fresh.join(eol + eol);
    edits.push({ from: at, to: at, insert: first ? `${lead}${text}${eol}${eol}` : `${lead}${text}${eol}` });
  }

  return { edits, added, unused, scenes: real.length, breakdownChanged };
}
