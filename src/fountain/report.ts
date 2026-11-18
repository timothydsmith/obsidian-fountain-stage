/**
 * A script's report: totals, each character's share of it, each scene's
 * length and cast, who is in which scene, and who could double with whom.
 *
 * Scenes are the smallest parts of the outline: scene headings, or `##`
 * scenes (or `#` acts) with none inside. Text before the first heading is
 * a scene of its own. A character is in a scene if they speak in it or are
 * named in a stage direction or parenthetical there ("MARGARET enters",
 * "(to David)").
 */

import { characterNames, cueName } from "./characters";
import type { OutlineItem } from "./outline";
import type { ParsedScript } from "./parser";
import { countWords, isPreface, type PagePositions, type Timeline } from "./runtime";

export interface SceneReport {
  /** Counting from 1. */
  number: number;
  title: string;
  /** A scene heading's forced number, from `#2A#`. */
  sceneNumber?: string;
  /** The act it's in. */
  act?: string;
  line: number;
  /** Where the next heading starts, or undefined for the last scene. */
  endLine?: number;
  /** Length in pages, once the script is laid out. */
  pages?: number;
  /** Runtime, by the method in settings. */
  seconds?: number;
  speeches: number;
  words: number;
  /** Characters in it, in the order they first appear. */
  characters: string[];
}

export interface CharacterReport {
  name: string;
  speeches: number;
  /** Words spoken. */
  words: number;
  /** Of all the words spoken, from 0 to 1. */
  share: number;
  /** Time speaking, at the speaking rate. */
  seconds: number;
  /** The scenes they're in, as indexes into the report's scenes. */
  scenes: number[];
  /** Their first speech or mention, counting from 0. */
  firstLine?: number;
  /** Characters who are never in a scene with them, so one actor could play both. */
  couldDouble: string[];
}

export interface ScriptReport {
  totals: {
    pages?: number;
    seconds?: number;
    words: number;
    speeches: number;
    acts: number;
    scenes: number;
    characters: number;
  };
  /** Most words first. Characters only in the Characters list come last, with nothing. */
  characters: CharacterReport[];
  scenes: SceneReport[];
}

export interface ReportOptions {
  wordsPerMinute: number;
  timeline?: Timeline;
  positions?: PagePositions;
  pageCount?: number;
}

/** Every outline item, in order, with the act each is in. */
function flatten(items: OutlineItem[], act?: string): { item: OutlineItem; act?: string }[] {
  return items.flatMap((item) => {
    const own = item.kind === "section" && item.depth === 1 ? item.text : act;
    return [{ item, act: own }, ...flatten(item.children, own)];
  });
}

/** Finds names in text: whole words, capitalised, longest first so MRS SMITH isn't also SMITH. */
function nameFinder(names: string[]): (text: string) => string[] {
  const patterns = [...names]
    .sort((a, b) => b.length - a.length)
    .map((name) => {
      const words = name.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      return { name, re: new RegExp(`(?<![\\p{L}\\p{N}])${words.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu") };
    });
  return (text) => {
    const found: string[] = [];
    let rest = text;
    for (const { name, re } of patterns) {
      let seen = false;
      rest = rest.replace(re, (match) => {
        if (!/\p{Lu}/u.test(match[0])) return match;
        seen = true;
        return " ".repeat(match.length);
      });
      if (seen) found.push(name);
    }
    return found;
  };
}

export function buildReport(script: ParsedScript, outline: OutlineItem[], options: ReportOptions): ScriptReport {
  const all = flatten(outline);
  const body = script.elements.filter((el) => !isPreface(el));

  // The scenes: each leaf of the outline, up to the next heading.
  const scenes: SceneReport[] = [];
  all.forEach(({ item, act }, i) => {
    if (item.children.length > 0) return;
    scenes.push({
      number: 0,
      title: item.text,
      sceneNumber: item.sceneNumber,
      act,
      line: item.line,
      endLine: all[i + 1]?.item.line,
      speeches: 0,
      words: 0,
      characters: [],
    });
  });
  // Text before the first heading is a scene of its own.
  const firstHeading = all[0]?.item.line ?? Infinity;
  const opening = body.find((el) => el.line < firstHeading && el.type !== "page_break");
  if (opening) {
    scenes.unshift({
      number: 0,
      title: scenes.length === 0 ? "The whole script" : "Before the first scene",
      line: opening.line,
      endLine: all[0]?.item.line,
      speeches: 0,
      words: 0,
      characters: [],
    });
  }
  scenes.forEach((scene, i) => (scene.number = i + 1));

  /** The scene a line is in: the one it falls inside, else the next (text between an act's heading and its first scene), else the last. */
  const sceneAt = (line: number): number => {
    let next = -1;
    for (let i = 0; i < scenes.length; i++) {
      const { line: start, endLine } = scenes[i];
      if (start <= line && (endLine === undefined || line < endLine)) return i;
      if (next < 0 && start > line) next = i;
    }
    return next >= 0 ? next : scenes.length - 1;
  };

  const names = characterNames(script);
  const findNames = nameFinder(names);
  const characters = new Map<string, CharacterReport>();
  const character = (name: string): CharacterReport => {
    let c = characters.get(name);
    if (!c) {
      c = { name, speeches: 0, words: 0, share: 0, seconds: 0, scenes: [], couldDouble: [] };
      characters.set(name, c);
    }
    return c;
  };
  for (const name of names) character(name);

  const appear = (name: string, sceneIndex: number, line: number) => {
    const c = character(name);
    c.firstLine ??= line;
    if (sceneIndex < 0) return;
    if (!c.scenes.includes(sceneIndex)) c.scenes.push(sceneIndex);
    const cast = scenes[sceneIndex].characters;
    if (!cast.includes(name)) cast.push(name);
  };

  let speaker: string | undefined;
  for (const el of body) {
    const sceneIndex = scenes.length > 0 ? sceneAt(el.line) : -1;
    const scene = scenes[sceneIndex] as SceneReport | undefined;
    if (el.type === "character") {
      speaker = cueName(el.text).toUpperCase();
      appear(speaker, sceneIndex, el.line);
      character(speaker).speeches++;
      if (scene) scene.speeches++;
      continue;
    }
    if (el.type === "dialogue" && speaker !== undefined) {
      const words = countWords(el.text);
      character(speaker).words += words;
      if (scene) scene.words += words;
      continue;
    }
    if (el.type === "action" || el.type === "parenthetical") {
      for (const name of findNames(el.text)) appear(name, sceneIndex, el.line);
    }
    if (el.type !== "parenthetical") speaker = undefined;
  }

  // Lengths, once there's a timeline or a layout.
  const { timeline, positions } = options;
  for (const scene of scenes) {
    if (timeline) scene.seconds = Math.max((scene.endLine === undefined ? timeline.total : timeline.at(scene.endLine)) - timeline.at(scene.line), 0);
    if (positions) scene.pages = Math.max((scene.endLine === undefined ? positions.end : positions.at(scene.endLine)) - positions.at(scene.line), 0);
  }

  const list = [...characters.values()];
  const totalWords = list.reduce((n, c) => n + c.words, 0);
  const present = list.filter((c) => c.scenes.length > 0);
  for (const c of list) {
    c.share = totalWords > 0 ? c.words / totalWords : 0;
    c.seconds = (c.words / options.wordsPerMinute) * 60;
    c.scenes.sort((a, b) => a - b);
    if (c.scenes.length === 0) continue;
    c.couldDouble = present.filter((o) => o !== c && !o.scenes.some((s) => c.scenes.includes(s))).map((o) => o.name);
  }
  list.sort((a, b) => b.words - a.words || b.speeches - a.speeches || b.scenes.length - a.scenes.length || a.name.localeCompare(b.name));

  return {
    totals: {
      pages: options.pageCount,
      seconds: timeline?.total,
      words: totalWords,
      speeches: list.reduce((n, c) => n + c.speeches, 0),
      acts: all.filter(({ item }) => item.kind === "section" && item.depth === 1).length,
      scenes: scenes.length,
      characters: present.length,
    },
    characters: list,
    scenes,
  };
}
