/**
 * Comparing two versions of a script, such as a frozen draft and the
 * working script: which scenes were added, cut, moved or changed, and which
 * lines of the later version are new or changed.
 *
 * Scenes are matched first, by how much of their text they share. A heading
 * helps only when it's unique in both versions once scene numbers are taken
 * out, so renumbering can't pair the wrong scenes. Lines are then compared
 * within each pair of scenes, never across the whole script, which keeps it
 * quick on a phone. Blank lines and the title page aren't compared, so
 * freezing a draft (which changes `Draft:`) isn't a change.
 */

import { isAlternateNote } from "./alternates";
import type { OutlineItem } from "./outline";
import type { ParsedScript } from "./parser";
import { type SceneRange, scriptScenes } from "./report";

export interface ScriptVersion {
  source: string;
  script: ParsedScript;
  outline: OutlineItem[];
}

export interface SceneComparison {
  /** Same text, changed text, only in the later version, or only in the earlier. */
  status: "same" | "changed" | "added" | "cut";
  /** Out of order compared with the scenes around it. */
  moved: boolean;
  /** The scene in the earlier version; none for an added scene. */
  before?: SceneRange;
  /** The scene in the later version; none for a cut scene. */
  after?: SceneRange;
  /** Lines, not counting blank ones, new in the later version or gone from the earlier. */
  linesAdded: number;
  linesRemoved: number;
}

export interface Comparison {
  /** In the later version's order, with each cut scene after the one it used to follow. */
  scenes: SceneComparison[];
  /** Lines of the later version, counting from 0, that are new or changed. */
  changedLines: number[];
  /** The line in the earlier version that a line of the later one matches, or the nearest above it. */
  earlierLine(line: number): number;
  /** The line in the later version that a line of the earlier one matches, or the nearest above it. */
  laterLine(line: number): number;
  /** Lines with the same text in both versions, from the earlier line to the later. Blank lines and headings that changed aren't in it. */
  matchedLines: Map<number, number>;
}

/** Scenes that share at least this much of their text are the same scene. */
const MATCH_THRESHOLD = 0.4;
/** Above this many line pairs, a scene's lines are matched by text alone, not in order. */
const ORDERED_LIMIT = 250_000;

interface Line {
  line: number;
  text: string;
}

interface Scene {
  range: SceneRange;
  lines: Line[];
  /** Its lines other than the heading, for matching. */
  body: Set<string>;
  key: string;
}

const normal = (text: string) => text.trim().replace(/\s+/g, " ");

/** The heading with any scene number taken out, so a renumbered scene keeps its key. */
function headingKey(title: string): string {
  return title
    .replace(/\bscene\s+(?:\d+[a-z]?|[a-z]+(?:-[a-z]+)?)\b/gi, "scene")
    .replace(/^\d+[a-z]?[.:)]?\s+/i, "")
    .toLowerCase()
    .trim();
}

/** The lines taken up by alternates' notes, which aren't the play. */
function alternateLines(source: string, script: ParsedScript): Set<number> {
  const lines = new Set<number>();
  const notes = script.spans.filter((s) => s.kind === "note" && isAlternateNote(source.slice(s.from + 2, s.to - 2)));
  if (notes.length === 0) return lines;
  const starts = [0];
  for (let i = source.indexOf("\n"); i >= 0; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineAt = (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  for (const note of notes) for (let n = lineAt(note.from); n <= lineAt(note.to - 1); n++) lines.add(n);
  return lines;
}

function scenesOf(version: ScriptVersion): Scene[] {
  const lines = version.source.split("\n");
  const alternates = alternateLines(version.source, version.script);
  return scriptScenes(version.script, version.outline).map((range) => {
    const own: Line[] = [];
    const end = range.endLine ?? lines.length;
    for (let n = range.line; n < end; n++) {
      const text = normal(lines[n] ?? "");
      if (text && version.script.lineRoles.get(n) !== "title-page" && !alternates.has(n)) own.push({ line: n, text });
    }
    return { range, lines: own, body: new Set(own.filter((l) => l.line !== range.line).map((l) => l.text)), key: headingKey(range.title) };
  });
}

/** How much text two scenes share, from 0 to 1. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let common = 0;
  for (const text of small) if (large.has(text)) common++;
  return (2 * common) / (a.size + b.size);
}

/** Pairs of scenes, earlier index to later index, best matches first. */
function matchScenes(before: Scene[], after: Scene[]): Map<number, number> {
  const count = (scenes: Scene[]) => {
    const keys = new Map<string, number>();
    for (const s of scenes) keys.set(s.key, (keys.get(s.key) ?? 0) + 1);
    return keys;
  };
  const beforeKeys = count(before);
  const afterKeys = count(after);
  const candidates: { i: number; j: number; score: number }[] = [];
  before.forEach((a, i) => {
    after.forEach((b, j) => {
      const sim = similarity(a.body, b.body);
      const sameHeading = a.key !== "" && a.key === b.key && beforeKeys.get(a.key) === 1 && afterKeys.get(b.key) === 1;
      if (sim >= MATCH_THRESHOLD || sameHeading) candidates.push({ i, j, score: sim + (sameHeading ? 0.5 : 0) });
    });
  });
  // Best first; ties go to scenes in the same place.
  candidates.sort((x, y) => y.score - x.score || Math.abs(x.i - x.j) - Math.abs(y.i - y.j));
  const pairs = new Map<number, number>();
  const taken = new Set<number>();
  for (const { i, j } of candidates) {
    if (pairs.has(i) || taken.has(j)) continue;
    pairs.set(i, j);
    taken.add(j);
  }
  return pairs;
}

/** The indexes of a longest increasing run within `values`. */
function longestIncreasing(values: number[]): Set<number> {
  const tails: number[] = [];
  const previous: number[] = new Array<number>(values.length).fill(-1);
  values.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const kept = new Set<number>();
  for (let i = tails.length > 0 ? tails[tails.length - 1] : -1; i >= 0; i = previous[i]) kept.add(i);
  return kept;
}

/** Lines that are the same in both scenes, in order, as pairs of earlier and later line numbers. */
function matchLines(a: Line[], b: Line[]): [number, number][] {
  if (a.length * b.length > ORDERED_LIMIT) {
    // Too long to compare in order: match equal lines as they come.
    const unused = new Map<string, number[]>();
    for (const l of a) unused.set(l.text, [...(unused.get(l.text) ?? []), l.line]);
    const pairs: [number, number][] = [];
    for (const l of b) {
      const lines = unused.get(l.text);
      if (lines?.length) pairs.push([lines.shift()!, l.line]);
    }
    return pairs;
  }
  // The longest common run of lines, by dynamic programming from the end.
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] = a[i].text === b[j].text ? table[at(i + 1, j + 1)] + 1 : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }
  // Lines that can go unmatched without shortening the run are passed over first, so a cut or
  // added run of lines stays together, rather than a line that repeats (a cue, say) pairing with
  // the first of its kind.
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const here = table[at(i, j)];
    if (table[at(i + 1, j)] === here) i++;
    else if (table[at(i, j + 1)] === here) j++;
    else {
      pairs.push([a[i].line, b[j].line]);
      i++;
      j++;
    }
  }
  return pairs;
}

/** Maps a line through anchors (sorted by their first line), keeping its distance from the nearest anchor above. */
function mapper(anchors: [number, number][]): (line: number) => number {
  return (line) => {
    let lo = 0;
    let hi = anchors.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid][0] <= line) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return line;
    const [from, to] = anchors[found];
    const next = anchors[found + 1];
    const offset = line - from;
    // Not past the next anchor's line, so the line stays in its own part of the script.
    return next && next[1] > to ? Math.min(to + offset, next[1] - 1) : to + offset;
  };
}

/** Compares an earlier version of a script with a later one. */
export function compareScripts(earlier: ScriptVersion, later: ScriptVersion): Comparison {
  const before = scenesOf(earlier);
  const after = scenesOf(later);
  const pairs = matchScenes(before, after);
  const byLater = new Map([...pairs].map(([i, j]) => [j, i]));

  // Moved: matched scenes outside the longest run that keeps its order.
  const matchedLater = [...byLater.keys()].sort((x, y) => x - y);
  const inOrder = longestIncreasing(matchedLater.map((j) => byLater.get(j)!));
  const moved = new Set(matchedLater.filter((_, k) => !inOrder.has(k)));

  const changedLines: number[] = [];
  const anchors: [number, number][] = [];
  const matchedLines = new Map<number, number>();
  const scenes: SceneComparison[] = after.map((scene, j) => {
    const i = byLater.get(j);
    if (i === undefined) {
      changedLines.push(...scene.lines.map((l) => l.line));
      return { status: "added", moved: false, after: scene.range, linesAdded: scene.lines.length, linesRemoved: 0 };
    }
    const old = before[i];
    const same = matchLines(old.lines, scene.lines);
    const matched = new Set(same.map(([, line]) => line));
    changedLines.push(...scene.lines.filter((l) => !matched.has(l.line)).map((l) => l.line));
    anchors.push([old.range.line, scene.range.line], ...same);
    for (const [a, b] of same) matchedLines.set(a, b);
    const linesAdded = scene.lines.length - same.length;
    const linesRemoved = old.lines.length - same.length;
    return {
      status: linesAdded + linesRemoved > 0 ? "changed" : "same",
      moved: moved.has(j),
      before: old.range,
      after: scene.range,
      linesAdded,
      linesRemoved,
    };
  });

  // Each cut scene goes after the scene it used to follow (already placed, whether kept or cut), or first.
  before.forEach((scene, i) => {
    if (pairs.has(i)) return;
    const cut: SceneComparison = { status: "cut", moved: false, before: scene.range, linesAdded: 0, linesRemoved: scene.lines.length };
    const previous = i > 0 ? scenes.findIndex((s) => s.before === before[i - 1].range) : -1;
    scenes.splice(previous + 1, 0, cut);
  });

  const forward = [...anchors].sort((x, y) => x[1] - y[1]).map(([a, b]): [number, number] => [b, a]);
  const backward = [...anchors].sort((x, y) => x[0] - y[0]);
  return {
    scenes,
    changedLines: [...new Set(changedLines)].sort((x, y) => x - y),
    earlierLine: mapper(forward),
    laterLine: mapper(backward),
    matchedLines,
  };
}
