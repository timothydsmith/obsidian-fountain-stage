/**
 * The story outline: a script's structure seen two ways, by act or by beat.
 *
 * Story beats are sections shallower than the action beat depth (`#` by
 * default), and hold the scenes after them until the next beat as deep or
 * shallower. Action beats are sections at that depth or deeper (`##` and
 * deeper by default), and belong to the scene they're in: units of action
 * that can start partway through it. Story beats needn't line up with act
 * breaks, so the two views are separate trees over the same headings:
 *
 * - **By act:** acts, then scenes, then action beats. Story beats are left out.
 * - **By beat:** story beats (nested by depth), then scenes, then action
 *   beats. Acts show where they fall, as items with no children.
 *
 * Each heading can have a synopsis (`= …`) and a link to a note
 * (`[[>Beat - Catalyst]]`) under it.
 */

import { actMatcher, type IsAct } from "./acts";
import { plain, TARGET_NOTE_LINE_RE, type OutlineItem } from "./outline";
import { type ParsedScript, parseFountain } from "./parser";

export type OutlineBy = "act" | "beat";

/** By default, `##` and deeper sections are action beats, and `#` sections story beats. */
export const DEFAULT_ACTION_DEPTH = 2;

/** A link to a note on a line of its own: `[[>Target]]` or `[[>Target|text]]`. */
const LINK_LINE_RE = /^\s*\[\[>\s*([^\]|]*?)\s*(?:\|[^\]]*)?\]\]\s*$/;

/** What's written under a heading: its synopsis and a link to a note, and the lines they're on. */
export interface HeadingNotes {
  synopsis?: string;
  synopsisLines: number[];
  link?: string;
  linkLine?: number;
  /** The last line of the heading and what's under it, counting from 0. */
  lastLine: number;
}

/**
 * The synopsis and linked note under the heading on `line`. Blank lines
 * can come before the synopsis, and a runtime target's note can sit
 * between; a link goes after the synopsis, or straight under the heading.
 */
export function headingNotes(lines: string[], script: ParsedScript, line: number): HeadingNotes {
  const synopsis: string[] = [];
  const synopsisLines: number[] = [];
  let link: string | undefined;
  let linkLine: number | undefined;
  let lastLine = line;
  for (let n = line + 1; n < lines.length; n++) {
    const text = lines[n];
    if (link === undefined && script.lineRoles.get(n) === "synopsis") {
      synopsis.push(plain(text.trim().replace(/^=\s*/, "")));
      synopsisLines.push(n);
      lastLine = n;
    } else if (TARGET_NOTE_LINE_RE.test(text)) {
      lastLine = n;
    } else if (link === undefined && LINK_LINE_RE.test(text)) {
      link = LINK_LINE_RE.exec(text)?.[1];
      linkLine = n;
      lastLine = n;
    } else if (text.trim() !== "" || synopsis.length > 0 || link !== undefined) {
      break;
    }
  }
  return { synopsis: synopsis.length > 0 ? synopsis.join(" ") : undefined, synopsisLines, link, linkLine, lastLine };
}

/** The story outline of a script, by act or by beat. */
export function buildStoryOutline(source: string, by: OutlineBy, isAct: IsAct = actMatcher(), actionDepth = DEFAULT_ACTION_DEPTH): OutlineItem[] {
  const script = parseFountain(source);
  const lines = source.split("\n");
  const roots: OutlineItem[] = [];
  /** Acts (by act) or story beats (by beat) that are open, outermost first. */
  const stack: OutlineItem[] = [];
  let scene: OutlineItem | null = null;
  const items: OutlineItem[] = [];
  const add = (item: OutlineItem, parent: OutlineItem | null | undefined) => {
    (parent?.children ?? roots).push(item);
    items.push(item);
  };
  const top = () => stack[stack.length - 1];

  for (const el of script.elements) {
    if (el.type === "section") {
      const depth = el.depth ?? 1;
      const text = plain(el.text);
      if (depth >= actionDepth) {
        const parent = scene ?? top();
        add({ kind: "action", text, depth: (parent?.depth ?? 0) + 1, line: el.line, children: [] }, parent);
      } else if (by === "beat") {
        while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
        const item: OutlineItem = { kind: "section", text, depth, line: el.line, children: [] };
        add(item, top());
        stack.push(item);
        scene = null;
      }
    } else if (el.type === "scene_heading") {
      const text = plain(el.text);
      if (isAct(el.text)) {
        if (by === "act") {
          stack.length = 0;
          const item: OutlineItem = { kind: "act", text, depth: 0, line: el.line, children: [] };
          add(item, null);
          stack.push(item);
        } else {
          add({ kind: "act", text, depth: (top()?.depth ?? 0) + 1, line: el.line, children: [] }, top());
        }
        scene = null;
      } else {
        const parent = top();
        const item: OutlineItem = { kind: "scene", text, depth: (parent?.depth ?? 0) + 1, line: el.line, children: [] };
        if (el.sceneNumber) item.sceneNumber = el.sceneNumber;
        add(item, parent);
        scene = item;
      }
    }
  }

  for (const item of items) {
    const notes = headingNotes(lines, script, item.line);
    if (notes.synopsis) item.synopsis = notes.synopsis;
    if (notes.link) item.link = notes.link;
  }
  return roots;
}

/** Every item in an outline, in order through the script. */
export function flattenOutline(outline: OutlineItem[]): OutlineItem[] {
  const out: OutlineItem[] = [];
  const walk = (items: OutlineItem[]) => items.forEach((item) => (out.push(item), walk(item.children)));
  walk(outline);
  return out.sort((a, b) => a.line - b.line);
}

/** Whether a script has any story beats, at the given action beat depth. */
export function hasBeats(script: ParsedScript, actionDepth = DEFAULT_ACTION_DEPTH): boolean {
  return script.elements.some((el) => el.type === "section" && (el.depth ?? 1) < actionDepth);
}
