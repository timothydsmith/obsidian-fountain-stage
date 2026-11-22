/**
 * A script's outline: its act headings, sections and scene headings, nested.
 * Act headings are scene headings that the style's act pattern picks out
 * (`.ACT ONE`), and each holds what follows it until the next act. Sections
 * (`#`, `##` and deeper) never print; they group what follows them by depth,
 * inside the act they're in. Scene headings sit inside the innermost section
 * or act before them.
 */

import { actMatcher, type IsAct } from "./acts";
import { parseInline } from "./inline";
import { parseFountain } from "./parser";

export interface OutlineItem {
  kind: "act" | "section" | "scene";
  /** The heading as it reads, without forcing marks or emphasis marks. */
  text: string;
  /** 0 for an act, the number of `#`s for a section, and one more than the item it's in for a scene. */
  depth: number;
  /** A scene heading's forced number, from `#2A#`. */
  sceneNumber?: string;
  /** The synopsis (`= …`) written straight after the heading, if any. */
  synopsis?: string;
  /** Source line, counting from 0. */
  line: number;
  children: OutlineItem[];
}

/** Text with its emphasis marks and link syntax taken out. */
function plain(text: string): string {
  let out = "";
  let pos = 0;
  for (const m of parseInline(text).markers) {
    out += text.slice(pos, m.from);
    pos = m.to;
  }
  return (out + text.slice(pos)).trim();
}

/** A runtime target's note on a line of its own, which can sit between a heading and its synopsis. */
const TARGET_NOTE_LINE_RE = /^\s*\[\[\s*target\s*:[^\]]*\]\]\s*$/i;

/** The outline of a script, as a tree of top-level items. */
export function buildOutline(source: string, isAct: IsAct = actMatcher()): OutlineItem[] {
  const script = parseFountain(source);
  const lines = source.split("\n");
  const roots: OutlineItem[] = [];
  // The open act and sections, outermost first.
  const stack: OutlineItem[] = [];
  const items: OutlineItem[] = [];

  for (const el of script.elements) {
    if (el.type !== "section" && el.type !== "scene_heading") continue;
    let item: OutlineItem;
    if (el.type === "section") {
      const depth = el.depth ?? 1;
      // An act (depth 0) stays open until the next act.
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      item = { kind: "section", text: plain(el.text), depth, line: el.line, children: [] };
    } else if (isAct(el.text)) {
      stack.length = 0;
      item = { kind: "act", text: plain(el.text), depth: 0, line: el.line, children: [] };
    } else {
      const parent = stack[stack.length - 1];
      item = { kind: "scene", text: plain(el.text), depth: (parent?.depth ?? 0) + 1, line: el.line, children: [] };
      if (el.sceneNumber) item.sceneNumber = el.sceneNumber;
    }
    (stack[stack.length - 1]?.children ?? roots).push(item);
    if (item.kind !== "scene") stack.push(item);
    items.push(item);
  }

  // A synopsis belongs to the heading it follows, with only blank lines between.
  for (const item of items) {
    const synopsis: string[] = [];
    for (let n = item.line + 1; n < lines.length; n++) {
      if (script.lineRoles.get(n) === "synopsis") synopsis.push(plain(lines[n].trim().replace(/^=\s*/, "")));
      else if (TARGET_NOTE_LINE_RE.test(lines[n])) continue;
      else if (lines[n].trim() !== "" || synopsis.length > 0) break;
    }
    if (synopsis.length > 0) item.synopsis = synopsis.join(" ");
  }
  return roots;
}

/** The deepest item at or before `line`: the part of the script that line is in. */
export function itemAt(outline: OutlineItem[], line: number): OutlineItem | undefined {
  let found: OutlineItem | undefined;
  const walk = (items: OutlineItem[]) => {
    for (const item of items) {
      if (item.line > line) return;
      found = item;
      walk(item.children);
    }
  };
  walk(outline);
  return found;
}
