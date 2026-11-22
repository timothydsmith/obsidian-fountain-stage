/**
 * Pass checklists: a Markdown note beside the script, "Play - Passes.md",
 * with a checklist of scenes for each rewrite pass ("Dialogue pass",
 * "Act two structure"). Each pass is a `##` heading; the last one is the
 * current pass, whose ticks show in the outline.
 *
 * Scenes are known by their heading, and by which of the scenes with
 * that heading they are, counting from the top, so two scenes called
 * "INT. KITCHEN" keep their own ticks.
 */

import { safeFileName } from "./titlePage";

export interface PassItem {
  title: string;
  done: boolean;
  /** The item's line in the note, counting from 0. */
  line: number;
}

export interface Pass {
  name: string;
  /** The heading's line in the note, counting from 0. */
  line: number;
  /** The last line of the pass, before the next heading. */
  endLine: number;
  items: PassItem[];
}

const HEADING_RE = /^##\s+(.+?)\s*#*\s*$/;
const ITEM_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*?)\s*$/;

/** The name of the passes note for a play, without the extension. */
export function passesName(title: string): string {
  return `${safeFileName(title)} - Passes`;
}

const normal = (title: string) => title.trim().replace(/\s+/g, " ");

/** The passes in a note, oldest first. */
export function parsePasses(text: string): Pass[] {
  const lines = text.split("\n");
  const passes: Pass[] = [];
  lines.forEach((line, i) => {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const last = passes[passes.length - 1];
      if (last) last.endLine = i - 1;
      passes.push({ name: heading[1], line: i, endLine: lines.length - 1, items: [] });
      return;
    }
    const item = ITEM_RE.exec(line);
    if (item && passes.length > 0) passes[passes.length - 1].items.push({ title: normal(item[4]), done: item[2] !== " ", line: i });
  });
  return passes;
}

/** Each scene's key: its heading and which of the scenes with that heading it is, as "INT. KITCHEN#2". */
export function sceneKeys(titles: string[]): string[] {
  const seen = new Map<string, number>();
  return titles.map((title) => {
    const t = normal(title);
    const n = (seen.get(t) ?? 0) + 1;
    seen.set(t, n);
    return `${t}#${n}`;
  });
}

/** The pass's items by scene key. */
function itemsByKey(pass: Pass): Map<string, PassItem> {
  const keys = sceneKeys(pass.items.map((i) => i.title));
  return new Map(keys.map((key, k) => [key, pass.items[k]]));
}

/** Which scenes (by key) a pass has ticked. */
export function tickedKeys(pass: Pass): Set<string> {
  return new Set([...itemsByKey(pass)].filter(([, item]) => item.done).map(([key]) => key));
}

/** A note with a new pass added at the end, listing every scene, none ticked. A new note if text is empty. */
export function addPass(text: string, play: string, name: string, scenes: string[], since?: string): string {
  const intro = `# Passes for ${play}\n\nOne checklist of scenes for each pass. The last pass is the current one: tick scenes here or in the script outline. A scene you change in the script ticks itself.\n`;
  const body = text.trim() === "" ? intro : `${text.replace(/\s*$/, "")}\n`;
  const lines = [`## ${name.trim()}`, ""];
  if (since) lines.push(`Started after ${since}.`, "");
  lines.push(...scenes.map((s) => `- [ ] ${normal(s)}`));
  return `${body}\n${lines.join("\n")}\n`;
}

/**
 * The note with a scene ticked or unticked in a pass, given the scene's key.
 * A scene the pass doesn't list yet, such as one written since, is added
 * at the end of its list.
 */
export function setTicked(text: string, pass: Pass, key: string, done: boolean): string {
  const lines = text.split("\n");
  const item = itemsByKey(pass).get(key);
  if (item) {
    const m = ITEM_RE.exec(lines[item.line]);
    if (!m || item.done === done) return text;
    lines[item.line] = `${m[1]}${done ? "x" : " "}${m[3]}${m[4]}`;
    return lines.join("\n");
  }
  const title = key.replace(/#\d+$/, "");
  const last = pass.items[pass.items.length - 1];
  let at = last ? last.line + 1 : pass.line + 1;
  // Past the blank line under a heading with no items.
  if (!last && lines[at]?.trim() === "") at++;
  lines.splice(at, 0, `- [${done ? "x" : " "}] ${title}`);
  return lines.join("\n");
}
