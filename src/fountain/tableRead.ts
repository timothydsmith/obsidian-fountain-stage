/**
 * What a table read says, in order: each speech in its character's voice,
 * and the scene headings and stage directions in a narrator's voice, or
 * left out. Also which voice reads each part, chosen from the voices the
 * device has.
 */

import { cueName } from "./characters";
import { parseInline } from "./inline";
import type { ParsedScript } from "./parser";

export interface ReadItem {
  /** Source lines to show it's being read, counting from 0: a speech's first part takes in its cue. */
  line: number;
  endLine: number;
  /** The character speaking, upper case; none for the narrator. */
  speaker?: string;
  /** What's said, without markup. */
  text: string;
}

/** Text as it's heard: no emphasis or link markup, no overlap slashes, single spaces. */
export function spokenText(text: string): string {
  let out = "";
  let pos = 0;
  for (const m of parseInline(text).markers) {
    out += text.slice(pos, m.from);
    pos = m.to;
  }
  out += text.slice(pos);
  // An overlap slash, where the next speaker comes in, isn't between two letters or digits.
  return out
    .replace(/(^|[^\p{L}\p{N}])\/+(?=[^\p{L}\p{N}]|$)/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The table read from `fromLine` on. A speech is read as one item from its
 * first dialogue line to its last; a parenthetical in it ends one part and
 * is read by the narrator, with stage directions, or left out.
 */
export function readItems(script: ParsedScript, options: { directions: boolean; fromLine?: number }): ReadItem[] {
  const items: ReadItem[] = [];
  let speaker: string | undefined;
  /** The cue's line, until the first part of its speech takes it in. */
  let cueLine: number | undefined;
  /** The speech being gathered, if any. */
  let speech: ReadItem | undefined;
  const endSpeech = () => {
    if (speech?.text) items.push(speech);
    speech = undefined;
  };
  for (const el of script.elements) {
    switch (el.type) {
      case "character":
        endSpeech();
        speaker = cueName(el.text).toUpperCase();
        cueLine = el.line;
        break;
      case "dialogue": {
        const text = spokenText(el.text);
        if (!speech) {
          speech = { line: cueLine ?? el.line, endLine: el.endLine, speaker, text };
          cueLine = undefined;
        }
        else {
          speech.endLine = el.endLine;
          speech.text = `${speech.text} ${text}`.trim();
        }
        break;
      }
      case "parenthetical":
        endSpeech();
        if (options.directions) items.push({ line: el.line, endLine: el.endLine, text: spokenText(el.text.replace(/^\(|\)$/g, "")) });
        break;
      case "scene_heading":
      case "action":
      case "centered":
      case "transition":
        endSpeech();
        speaker = undefined;
        if (options.directions) items.push({ line: el.line, endLine: el.endLine, text: spokenText(el.text) });
        break;
      default:
        endSpeech();
    }
  }
  endSpeech();
  const from = options.fromLine ?? 0;
  return items.filter((item) => item.text && item.endLine >= from);
}

/**
 * Text in pieces of at most `max` characters, broken after sentences where
 * it can be, since some speech engines stop partway through a long one.
 */
export function speechPieces(text: string, max = 200): string[] {
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["'”’)]*\s*|$)/gu) ?? [text];
  const pieces: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if (piece.trim()) pieces.push(piece.trim());
  };
  for (const sentence of sentences) {
    if ((current + sentence).length <= max) {
      current += sentence;
      continue;
    }
    push(current);
    current = "";
    // A sentence too long by itself breaks between words.
    let rest = sentence;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(" ", max);
      const at = cut > 0 ? cut : max;
      push(rest.slice(0, at));
      rest = rest.slice(at);
    }
    current = rest;
  }
  push(current);
  return pieces;
}

export interface VoiceChoice {
  /** The voice's URI, as the device names it. */
  voice: string;
  /** 1 is the voice as it is; lower or higher tells two parts in one voice apart. */
  pitch: number;
}

/** Pitches to tell apart parts that share a voice, in the order they're given out. */
const PITCHES = [1, 0.8, 1.2, 0.65, 1.35];

/**
 * A voice for each character: the one chosen before, if the device still
 * has it, or the next voice in turn, preferring voices in the device's own
 * language and keeping the narrator's voice for the narrator while there
 * are others to give out. Parts that share a voice get different pitches.
 */
export function assignVoices(
  characters: string[],
  voices: { uri: string; lang: string }[],
  saved: Record<string, VoiceChoice>,
  narrator: string | undefined,
  language: string,
): Record<string, VoiceChoice> {
  const out: Record<string, VoiceChoice> = {};
  if (voices.length === 0) return out;
  const base = language.toLowerCase().split("-")[0];
  const local = voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base);
  const pool = (local.length > 0 ? local : voices).map((v) => v.uri);
  const others = pool.length > 1 ? pool.filter((uri) => uri !== narrator) : pool;
  const uses = new Map<string, number>();
  const known = new Set(voices.map((v) => v.uri));
  for (const name of characters) {
    const before = saved[name];
    if (before && known.has(before.voice)) {
      out[name] = before;
      uses.set(before.voice, (uses.get(before.voice) ?? 0) + 1);
    }
  }
  let next = 0;
  for (const name of characters) {
    if (out[name]) continue;
    // The least used voice, taking them in turn.
    let voice = others[next % others.length];
    for (let k = 0; k < others.length; k++) {
      const candidate = others[(next + k) % others.length];
      if ((uses.get(candidate) ?? 0) < (uses.get(voice) ?? 0)) voice = candidate;
    }
    next++;
    const used = uses.get(voice) ?? 0;
    uses.set(voice, used + 1);
    out[name] = { voice, pitch: PITCHES[used % PITCHES.length] };
  }
  return out;
}
