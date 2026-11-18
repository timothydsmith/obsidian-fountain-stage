/**
 * Pauses a script asks for, such as "(beat)", "A long pause." or
 * "Silence.", and how long each runs, for the runtime estimate.
 *
 * Each pause word has three times: its own, a short one ("a short pause",
 * "a brief silence") and a long one ("a long pause"). A number before it
 * multiplies it ("two beats"). Plurals count too. The words are a list you
 * can change and add to in settings.
 */

export interface PauseWord {
  /** The word or phrase, such as "beat" or "lights fade". */
  word: string;
  seconds: number;
  /** After "short", "brief" and the like. */
  short: number;
  /** After "long", "longer" and the like. */
  long: number;
}

/**
 * Pause and silence follow the Author's Note to Annie Baker's "Circle
 * Mirror Transformation": a pause is about two seconds, a long pause four
 * and a short pause one; a silence is about five and a long silence at
 * least seven. She has a beat as less than a pause, so it's one second.
 * She doesn't time a moment, taken as a pause, or a short silence, taken
 * as half a silence.
 */
export const DEFAULT_PAUSE_WORDS: readonly PauseWord[] = [
  { word: "beat", seconds: 1, short: 0.5, long: 2 },
  { word: "moment", seconds: 2, short: 1, long: 4 },
  { word: "pause", seconds: 2, short: 1, long: 4 },
  { word: "silence", seconds: 5, short: 2.5, long: 7 },
];

/** A fresh copy of the defaults, to edit. */
export function defaultPauseWords(): PauseWord[] {
  return DEFAULT_PAUSE_WORDS.map((w) => ({ ...w }));
}

/** Words before a pause that give its short time. */
export const SHORT_WORDS = ["short", "shorter", "brief", "slight", "tiny", "little", "quick"];
/** Words before a pause that give its long time. */
export const LONG_WORDS = ["long", "longer", "lengthy", "extended", "endless", "interminable"];
/** Numbers before a pause that multiply it. */
const COUNTS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, few: 3, several: 3 };

const SHORT = new Set(SHORT_WORDS);
const LONG = new Set(LONG_WORDS);

/** Words that can come before a pause and still leave it standing on its own: "A long pause." */
const LEADS = new Set(["a", "an", "the", "one", "another", "then", "and", "very", ...SHORT_WORDS, ...LONG_WORDS, ...Object.keys(COUNTS)]);

/** After a pause word, these make it a time rather than a pause: "a moment later", "a moment of". */
const NOT_A_PAUSE_RE = /^\s+(later|of|ago|when|while|that|to|before|after)\b/i;

/** A word as it's matched: lower case, single spaces. */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

interface Matcher {
  re: RegExp;
  byWord: Map<string, PauseWord>;
}

const matchers = new WeakMap<readonly PauseWord[], Matcher | null>();

/** A pattern matching any of the words (and their plurals), made once for each list. */
function matcherFor(words: readonly PauseWord[]): Matcher | null {
  let matcher = matchers.get(words);
  if (matcher !== undefined) return matcher;
  const byWord = new Map<string, PauseWord>();
  for (const w of words) {
    const key = normalizeWord(w.word);
    if (key) byWord.set(key, w);
  }
  if (byWord.size === 0) {
    matcher = null;
  } else {
    // Longer phrases first, so "long silence" as a word of its own wins over "silence".
    const alternatives = [...byWord.keys()]
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
    matcher = { re: new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives.join("|")})(?:e?s)?(?![\\p{L}\\p{N}])`, "giu"), byWord };
  }
  matchers.set(words, matcher);
  return matcher;
}

/**
 * Seconds of pauses a direction asks for. In a parenthetical every pause
 * word counts. In a stage direction, only a pause that stands on its own
 * ("Beat.", "A long silence.", "After a pause, she…", "Silence falls."):
 * one that starts its sentence, give or take "a long", or comes before
 * punctuation. So "a moment later" and "she pauses at the door" don't.
 */
export function pauseSeconds(text: string, parenthetical: boolean, words: readonly PauseWord[] = DEFAULT_PAUSE_WORDS): number {
  const matcher = matcherFor(words);
  if (!matcher) return 0;
  let seconds = 0;
  for (const m of text.matchAll(matcher.re)) {
    const pause = matcher.byWord.get(normalizeWord(m[1]));
    if (!pause) continue;
    // The words before it in the same sentence or bracket.
    const clause = text.slice(0, m.index).split(/[.!?:;()]/).pop()!;
    const lead = clause.toLowerCase().split(/[^\p{L}\d]+/u).filter(Boolean);
    if (!parenthetical) {
      const after = text.slice(m.index + m[0].length);
      const startsSentence = lead.every((w) => LEADS.has(w)) && !NOT_A_PAUSE_RE.test(after);
      const beforePunctuation = /^\s*([.,!?;:)—–]|-\s|$)/.test(after);
      if (!startsSentence && !beforePunctuation) continue;
    }
    const near = lead.slice(-2);
    const time = near.some((w) => LONG.has(w)) ? pause.long : near.some((w) => SHORT.has(w)) ? pause.short : pause.seconds;
    const count = near.reduce((n, w) => n * (COUNTS[w] ?? 1), 1);
    seconds += time * count;
  }
  return seconds;
}

/** Pause words read back from saved settings: entries that make sense, with defaults for missing times. */
export function readPauseWords(saved: unknown): PauseWord[] {
  if (!Array.isArray(saved)) return defaultPauseWords();
  const time = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback);
  return saved
    .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null && typeof (w as { word?: unknown }).word === "string")
    .map((w) => {
      const seconds = time(w.seconds, 0);
      return { word: w.word as string, seconds, short: time(w.short, seconds / 2), long: time(w.long, seconds * 2) };
    });
}
