/**
 * Revised pages for a locked rehearsal script. The locked draft's pages are
 * fixed: each later version of the script is laid out page by page against
 * them, so text that grows runs onto 23A and 23B, a page that loses text
 * ends short, and a page that loses all of it is numbered with the page
 * before ("23–24"). Only pages whose text changed are issued.
 *
 * Pages are matched by their blocks (a speech, a stage direction, a heading),
 * each assigned to the page its matching text was on. Pages joined by a block
 * that runs from one onto the next are revised together. Each revision is
 * laid out against the pages of the one before, so 23A stays 23A.
 */

import { type Comparison, compareScripts, type ScriptVersion } from "../fountain/compare";
import type { ParsedScript } from "../fountain/parser";
import { longestRun } from "../fountain/sequence";
import { PAGE_BREAK, type StoryItem } from "./blocks";
import { flow } from "./flow";
import type { FontSet } from "./fonts";
import { furnishPage, storyFor, strapTitle, textFrame } from "./layout";
import type { LayoutDocument, LayoutPage, Placement } from "./model";
import { BLACK } from "./paragraph";
import type { PlayStyle } from "./style";

/** A page of the rehearsal script as it stands. */
export interface RehearsalPage {
  /** Its printed number, such as "23A" or "23–24", or "" for none (the title page). */
  label: string;
  /** Where blocks landed on it, in the version these pages are of. `page` is this page's index. */
  placements: Placement[];
  /** The title page or a page of front matter, which is never revised. */
  front: boolean;
}

/** The pages of the rehearsal script, laid over one version of it. */
export interface RehearsalPages {
  version: ScriptVersion;
  pages: RehearsalPage[];
}

/** A page issued in a revision. */
export interface IssuedPage {
  label: string;
  page: LayoutPage;
}

export interface Revision {
  /** The pages after the revision, over the later version. */
  pages: RehearsalPages;
  /** The revised pages, in order: numbered, with their running header and a mark beside each changed line. */
  issued: IssuedPage[];
}

/** The locked draft's pages, as laid out. */
export function lockedPages(layout: LayoutDocument, version: ScriptVersion): RehearsalPages {
  const firstBody = layout.placements.length > 0 ? layout.placements[0].page : layout.pages.length;
  const pages: RehearsalPage[] = layout.pages.map((_, i) => ({ label: layout.pageNumbers[i] ?? "", placements: [], front: i < firstBody }));
  for (const p of layout.placements) pages[p.page]?.placements.push({ ...p });
  return { version, pages };
}

const normal = (text: string) => text.replace(/\s+/g, " ").trim();

/** Each block's printed text, by its first line: the elements from it up to the next block. */
function blockTexts(script: ParsedScript, blockLines: number[]): string[] {
  const elements = script.elements.filter((el) => el.type !== "section");
  const texts: string[] = [];
  let e = 0;
  blockLines.forEach((line, i) => {
    const next = blockLines[i + 1] ?? Infinity;
    while (e < elements.length && elements[e].line < line) e++;
    const parts: string[] = [];
    while (e < elements.length && elements[e].line < next) {
      const text = normal(elements[e].text);
      if (text) parts.push(`${elements[e].type}:${text}`);
      e++;
    }
    texts.push(parts.join("\n"));
  });
  return texts;
}

/** The last index whose value is at most `value` in a sorted list, or -1. */
function lastAtMost(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** "23" from "23–24", for a range label's first page. */
const firstOf = (label: string) => label.split("–")[0];
/** "24" from "23–24", for a range label's last page. */
const lastOf = (label: string) => label.split("–").pop() ?? label;

function rangeLabel(from: string, to: string): string {
  const a = firstOf(from);
  const b = lastOf(to);
  return a === b ? a : `${a}–${b}`;
}

/** The label for a page added after `label`: 23A after 23, 23B after 23A, and a letter more where that's taken. */
function labelAfter(label: string, taken: Set<string>): string {
  const last = lastOf(label);
  let candidate = /[A-Y]$/.test(last) ? last.slice(0, -1) + String.fromCharCode(last.charCodeAt(last.length - 1) + 1) : `${last}A`;
  while (taken.has(candidate)) candidate += "A";
  taken.add(candidate);
  return candidate;
}

/** Lines whose element has a changed line, for marking: an element's lines, by its first. */
function changedElementLines(script: ParsedScript, changed: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const el of script.elements) {
    for (let l = el.line; l <= el.endLine; l++) {
      if (changed.has(l)) {
        out.add(el.line);
        break;
      }
    }
  }
  return out;
}

/**
 * Lines of the later version that follow a cut: text of the earlier version
 * that matches nothing, with nothing new in its place, marks the line now
 * after it (or before it, at the end).
 */
function cutLines(earlier: ScriptVersion, comparison: Comparison): number[] {
  const source = earlier.source.split("\n");
  const { matchedLines } = comparison;
  const changed = comparison.changedLines;
  // The earlier version's printed lines, in order, and whether each matched.
  const lines: number[] = [];
  for (const el of earlier.script.elements) {
    for (let l = el.line; l <= el.endLine; l++) {
      if ((source[l] ?? "").trim() && earlier.script.lineRoles.get(l) !== "title-page") lines.push(l);
    }
  }
  const out: number[] = [];
  let previous: number | undefined;
  let cut = false;
  const close = (next: number | undefined) => {
    if (!cut) return;
    cut = false;
    const after = next === undefined ? Infinity : matchedLines.get(next)!;
    const before = previous === undefined ? -1 : matchedLines.get(previous)!;
    if (after <= before) return;
    // Something new in its place is a change, marked already.
    if (changed.some((l) => l > before && l < after)) return;
    if (after !== Infinity) out.push(after);
    else if (before >= 0) out.push(before);
  };
  for (const l of [...new Set(lines)].sort((a, b) => a - b)) {
    if (matchedLines.has(l)) {
      close(l);
      previous = l;
    } else cut = true;
  }
  close(undefined);
  return out;
}

interface Group {
  /** Indexes of its pages. */
  pages: number[];
  /** First lines of the blocks that start on its pages. */
  blocks: number[];
}

/**
 * Lays a later version over the rehearsal pages: which pages its text
 * changed, laid out afresh, and the pages as they now stand.
 */
export function revise(base: RehearsalPages, later: ScriptVersion, style: PlayStyle, fonts: FontSet, comparison: Comparison = compareScripts(base.version, later)): Revision {
  const { pages } = base;
  const firstBody = pages.findIndex((p) => !p.front);

  // The base pages in groups, joined where a block runs from one page onto the next.
  const groups: Group[] = [];
  if (firstBody >= 0) {
    for (let i = firstBody; i < pages.length; i++) {
      const starts = pages[i].placements.filter((p) => !p.continues).map((p) => p.line);
      const joined = pages[i].placements.length === 0 || pages[i].placements[0].continues;
      if (groups.length === 0 || !joined) groups.push({ pages: [i], blocks: starts });
      else {
        groups[groups.length - 1].pages.push(i);
        groups[groups.length - 1].blocks.push(...starts);
      }
    }
  }
  const baseBlocks = groups.flatMap((g) => g.blocks);
  const baseGroupOf = groups.flatMap((g, gi) => g.blocks.map(() => gi));
  const baseTexts = blockTexts(base.version.script, baseBlocks);

  // The later version's blocks, from its story.
  const story = storyFor(later.script, style, fonts);
  const storyIndex = new Map<number, number>();
  story.forEach((item, i) => {
    if (item !== PAGE_BREAK && item.source && !item.source.continues && !storyIndex.has(item.source.line)) storyIndex.set(item.source.line, i);
  });
  const laterBlocks = [...storyIndex.keys()].sort((a, b) => a - b);
  const laterTexts = blockTexts(later.script, laterBlocks);

  // Each later block goes on the page of the base block its text matches.
  const earlierOf = new Map<number, number>();
  for (const [a, b] of comparison.matchedLines) earlierOf.set(b, a);
  const elementsByLine = later.script.elements;
  let e = 0;
  const matched: (number | undefined)[] = laterBlocks.map((line, i) => {
    const next = laterBlocks[i + 1] ?? Infinity;
    while (e < elementsByLine.length && elementsByLine[e].line < line) e++;
    for (let k = e; k < elementsByLine.length && elementsByLine[k].line < next; k++) {
      for (let l = elementsByLine[k].line; l <= elementsByLine[k].endLine; l++) {
        const b = earlierOf.get(l);
        if (b === undefined) continue;
        const at = lastAtMost(baseBlocks, b);
        return at >= 0 ? baseGroupOf[at] : 0;
      }
    }
    return undefined;
  });
  // Text that moved against the order of the pages counts as new where it is now.
  const inOrder = longestRun(matched, false);
  const assigned: number[] = [];
  for (let i = 0; i < matched.length; i++) {
    if (matched[i] !== undefined && inOrder.has(i)) {
      assigned.push(matched[i]!);
      continue;
    }
    // New text goes on the page before, unless a whole page between was replaced.
    const before = assigned.length > 0 ? assigned[assigned.length - 1] : -1;
    let after: number | undefined;
    for (let j = i + 1; j < matched.length; j++) {
      if (matched[j] !== undefined && inOrder.has(j)) {
        after = matched[j];
        break;
      }
    }
    if (before < 0) assigned.push(0);
    else assigned.push(after !== undefined && after > before + 1 ? before + 1 : before);
  }

  // Groups that lost all their text join the group before (or after, at the start).
  interface Segment {
    groups: number[];
    blocks: number[];
  }
  const segments: Segment[] = [];
  let pendingEmpty: number[] = [];
  groups.forEach((_, gi) => {
    const blocks = laterBlocks.filter((_, i) => assigned[i] === gi);
    if (blocks.length === 0) {
      if (segments.length > 0) segments[segments.length - 1].groups.push(gi);
      else pendingEmpty.push(gi);
      return;
    }
    segments.push({ groups: [...pendingEmpty, gi], blocks });
    pendingEmpty = [];
  });
  if (pendingEmpty.length > 0) segments.push({ groups: pendingEmpty, blocks: [] });

  const changed = changedElementLines(later.script, new Set([...comparison.changedLines, ...cutLines(base.version, comparison)]));
  const taken = new Set(pages.map((p) => p.label));
  const frame = textFrame(style);
  const title = strapTitle(later.script);
  const laterTextOf = new Map(laterBlocks.map((line, i) => [line, laterTexts[i]]));
  const baseTextOf = new Map(baseBlocks.map((line, i) => [line, baseTexts[i]]));

  const out: RehearsalPage[] = pages.slice(0, firstBody < 0 ? pages.length : firstBody).map((p) => ({ ...p, placements: [] }));
  const issued: IssuedPage[] = [];
  let scene = "";
  let storyAt = 0;
  const sceneUpTo = (index: number) => {
    for (; storyAt < index; storyAt++) {
      const item = story[storyAt];
      if (item !== PAGE_BREAK && item.marks?.scene !== undefined) scene = item.marks.scene;
    }
  };

  segments.forEach((segment, si) => {
    const groupBlocks = segment.groups.flatMap((gi) => groups[gi].blocks);
    const labels = segment.groups.flatMap((gi) => groups[gi].pages.map((i) => pages[i].label));
    const same =
      segment.groups.length === 1 &&
      groupBlocks.length === segment.blocks.length &&
      groupBlocks.every((line, i) => baseTextOf.get(line) === laterTextOf.get(segment.blocks[i]));
    if (same) {
      // Unchanged: the same pages, over the later version's lines.
      const lineOf = new Map(groupBlocks.map((line, i) => [line, segment.blocks[i]]));
      for (const i of groups[segment.groups[0]].pages) {
        const index = out.length;
        out.push({
          label: pages[i].label,
          front: false,
          placements: pages[i].placements.map((p) => ({ ...p, page: index, line: lineOf.get(p.line) ?? p.line })),
        });
      }
      return;
    }

    // Changed: laid out afresh from where the segment starts to where the next one does.
    const from = segment.blocks.length > 0 ? storyIndex.get(segment.blocks[0])! : story.length;
    const nextStart = segments.slice(si + 1).find((s) => s.blocks.length > 0)?.blocks[0];
    const to = nextStart !== undefined ? storyIndex.get(nextStart)! : story.length;
    let slice: StoryItem[] = story.slice(from, to);
    while (slice[0] === PAGE_BREAK) slice = slice.slice(1);
    sceneUpTo(from);
    const result = flow(slice, frame);
    const n = result.pages.length;
    const k = labels.length;
    let newLabels: string[];
    if (n >= k) {
      newLabels = [...labels];
      while (newLabels.length < n) newLabels.push(labelAfter(newLabels[newLabels.length - 1], taken));
    } else {
      newLabels = [...labels.slice(0, n - 1), rangeLabel(labels[n - 1], labels[k - 1])];
    }
    // Running header scene for each page: as the story stood at its start, then as headings come on it.
    const scenesOnPage = new Map<number, string>();
    for (const { page, marks } of result.marks) if (marks.scene !== undefined && !scenesOnPage.has(page)) scenesOnPage.set(page, marks.scene);
    let pageScene = scene;
    result.pages.forEach((page, i) => {
      if (scenesOnPage.has(i)) pageScene = scenesOnPage.get(i)!;
      furnishPage(page, style, fonts, newLabels[i], { title, scene: pageScene });
      markChanges(page, style, fonts, changed);
      issued.push({ label: newLabels[i], page });
      const index = out.length;
      out.push({ label: newLabels[i], front: false, placements: result.placements.filter((p) => p.page === i).map((p) => ({ ...p, page: index })) });
    });
  });

  return { pages: { version: later, pages: out }, issued };
}

/** A mark in the right margin beside each printed line of a changed element. */
function markChanges(page: LayoutPage, style: PlayStyle, fonts: FontSet, changed: Set<number>): void {
  const { mark, markGap } = style.revision;
  const text = fonts.clean(mark);
  if (!text) return;
  const x = style.page.width - style.page.margins.right + markGap;
  const seen = new Set<number>();
  for (const drawn of page.drawn) {
    if (!changed.has(drawn.line)) continue;
    for (const y of drawn.baselines) {
      const key = Math.round(y * 100);
      if (seen.has(key)) continue;
      seen.add(key);
      page.texts.push({ x, y, text, face: "regular", size: style.text.size, color: BLACK });
    }
  }
}

/** The revision header on an issued page, such as "Rev. 2 · 22 November 2026". */
export function addRevisionHeader(page: LayoutPage, style: PlayStyle, fonts: FontSet, revision: number, date: string): void {
  const { format, face, size, position, alignment } = style.revision;
  const { width, height, margins } = style.page;
  const text = fonts.clean(format.split("{n}").join(String(revision)).split("{date}").join(date).trim());
  if (!text) return;
  const w = fonts.width(text, face, size);
  const x = alignment === "left" ? margins.left : alignment === "right" ? width - margins.right - w : width / 2 - w / 2;
  let y = position === "top" ? height - margins.top / 2 : margins.bottom / 2;
  // Clear of the page number where they'd share a corner.
  const { pagination } = style;
  if (pagination.position === position && pagination.alignment === alignment) y += (position === "top" ? 1 : -1) * 1.4 * Math.max(size, pagination.size);
  page.texts.push({ x, y, text, face, size, color: BLACK });
}

/** The rehearsal pages after each revision in turn, from the locked draft's layout. */
export function rehearsalPages(locked: RehearsalPages, revisions: ScriptVersion[], style: PlayStyle, fonts: FontSet): RehearsalPages {
  let pages = locked;
  for (const version of revisions) pages = revise(pages, version, style, fonts).pages;
  return pages;
}
