/** The speech length map: the longest speeches and monologues, and where they come in the play. */

import type { ParsedScript } from "../parser";
import { DEFAULT_PAUSE_WORDS, type PauseWord } from "../pauses";
import type { SceneRange } from "../report";
import { wordsTimeline } from "../runtime";
import { sceneFinder, speechesOf } from "./text";

/** A speech of this many words or more (about a minute) is a monologue. */
export const MONOLOGUE_WORDS = 150;
const LONGEST = 10;

export interface SpeechLength {
  name: string;
  line: number;
  words: number;
  /** The scene it's in, as an index into the scenes, or -1. */
  scene: number;
  /** How far into the play it starts, by running time, from 0 to 1. */
  at: number;
}

export interface SpeechMap {
  /** Every speech, in order. */
  speeches: SpeechLength[];
  /** The longest speeches, longest first. */
  longest: SpeechLength[];
  /** Where each scene starts, from 0 to 1, by running time. */
  sceneStarts: number[];
}

export function speechMap(script: ParsedScript, scenes: SceneRange[], pauseWords: readonly PauseWord[] = DEFAULT_PAUSE_WORDS): SpeechMap {
  const timeline = wordsTimeline(script, 150, pauseWords);
  const at = (line: number) => (timeline.total > 0 ? Math.min(timeline.at(line) / timeline.total, 1) : 0);
  const sceneAt = sceneFinder(scenes);
  const speeches = speechesOf(script).map((s) => ({ name: s.name, line: s.line, words: s.words, scene: scenes.length ? sceneAt(s.line) : -1, at: at(s.line) }));
  const longest = [...speeches].sort((a, b) => b.words - a.words || a.line - b.line).slice(0, LONGEST);
  return { speeches, longest, sceneStarts: scenes.map((s) => at(s.line)) };
}
