/** Every check on a script at once, for the Checks tab and the marks in the editor. */

import type { OutlineItem } from "../outline";
import type { ParsedScript } from "../parser";
import type { PauseWord } from "../pauses";
import { type SceneRange, scriptScenes } from "../report";
import { checkDirections } from "./directions";
import type { Finding } from "./findings";
import { checkNames } from "./names";
import { checkOverlaps } from "./overlaps";
import { checkPauses, checkPhrases, type Filler, fillers } from "./repetition";
import { type SpeechMap, speechMap } from "./speeches";
import { type Voice, voices } from "./voice";

export type { CheckKind, Finding } from "./findings";

export interface CheckOptions {
  /** Your own phrases for the stage direction check. */
  directionPhrases: readonly string[];
  pauseWords: readonly PauseWord[];
}

export interface CheckResults {
  findings: Finding[];
  scenes: SceneRange[];
  voices: Voice[];
  fillers: Filler[];
  speeches: SpeechMap;
}

export function runChecks(source: string, script: ParsedScript, outline: OutlineItem[], options: CheckOptions): CheckResults {
  const scenes = scriptScenes(script, outline);
  return {
    findings: [
      ...checkNames(source, script),
      ...checkDirections(source, script, options.directionPhrases),
      ...checkOverlaps(source, script),
      ...checkPhrases(script),
      ...checkPauses(script, scenes, options.pauseWords),
    ],
    scenes,
    voices: voices(script),
    fillers: fillers(script),
    speeches: speechMap(script, scenes, options.pauseWords),
  };
}
