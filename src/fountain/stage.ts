/**
 * Who's on stage when, from the entrances and exits in the stage directions.
 *
 * Entrances and exits are found from phrases: "ANNA enters", "Enter TOM",
 * "She goes out", "Exit.", "Exeunt", "They all leave", and in a speech
 * "(entering)" or "(leaving)". Whoever a scene's opening stage direction
 * names is on from the start ("ANNA is at the table."). Someone who speaks
 * with no entrance before it is taken to have been on from the start of
 * the scene, as most scripts don't write every entrance. Speaking off
 * (O.S., V.O., OFF) doesn't put anyone on stage. Each scene starts with
 * the stage empty.
 *
 * A pronoun ("She leaves.") is whoever was last the subject of a stage
 * direction or last spoke. "They" is the group last named together, or
 * everyone on stage.
 */

import { characterNames, cueName } from "./characters";
import type { ParsedScript, ScriptElement } from "./parser";
import { nameMatcher, type NameMatch, type SceneRange } from "./report";
import { countWords, isPreface } from "./runtime";

export type MoveKind = "enter" | "exit";

/** An entrance or exit found in the script. */
export interface StageMove {
  kind: MoveKind;
  name: string;
  /** The line it's written on, counting from 0. */
  line: number;
  /** The scene it's in, as an index into the scenes. */
  scene: number;
}

/** A stretch of time a character is on stage. */
export interface StageSpan {
  name: string;
  scene: number;
  /** The first line they're on for, and the line they're off from (or the scene's end). */
  from: number;
  to: number;
}

export type StageIssueKind = "speaks-after-exit" | "speaks-before-entrance" | "enters-twice" | "exits-twice" | "silent";

export interface StageIssue {
  kind: StageIssueKind;
  name: string;
  line: number;
  /** The line the issue is about, such as where they left. */
  otherLine?: number;
  /** For a silence, about how many words others speak meanwhile. */
  words?: number;
}

export interface StagePlot {
  scenes: SceneRange[];
  moves: StageMove[];
  spans: StageSpan[];
  issues: StageIssue[];
}

/** Being on stage this many words of others' dialogue without speaking or being named (about five minutes) is worth a look. */
export const SILENT_WORDS = 750;

// --- Phrases ---------------------------------------------------------------

/** Verbs of moving that make an entrance with "in" or "on", and an exit with "out" or "off": both forms, "walks" and "walk". */
const MOTION = [
  "come", "walk", "run", "rush", "burst", "step", "hurry", "wander", "stride", "storm", "creep", "slip", "sneak", "march",
  "limp", "stagger", "stumble", "race", "dash", "bustle", "shuffle", "stroll", "saunter", "tiptoe", "dance", "sweep", "crawl",
  "stomp", "trudge", "glide", "head", "go", "hobble", "amble", "barge", "charge", "file", "float", "skip", "sidle", "slink",
].flatMap((verb) => [verb, thirdPerson(verb)]);

function thirdPerson(verb: string): string {
  if (verb === "go") return "goes";
  if (/(s|sh|ch|x|z)$/.test(verb)) return verb + "es";
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + "ies";
  return verb + "s";
}

/** Words that can follow a verb such as "leaves" or "returns" and keep it a move, rather than leaving or returning something. */
const MOVE_FOLLOWERS = new Set([
  "with", "from", "carrying", "holding", "followed", "again", "later", "quickly", "slowly", "hurriedly", "quietly", "silently",
  "too", "together", "alone", "through", "by", "and", "at", "without", "in", "on", "home", "upstairs", "downstairs", "first",
  "briskly", "abruptly", "angrily", "sadly", "now", "then", "immediately", "eventually", "finally", "for",
]);
/** Words after "comes back" that keep it an entrance. */
const BACK_FOLLOWERS = new Set(["with", "from", "carrying", "holding", "later", "again", "quickly", "slowly", "inside"]);
/** Places "leaves the …" can name and still be an exit. */
const PLACES = new Set([
  "room", "stage", "house", "kitchen", "flat", "office", "building", "bar", "shop", "garden", "party", "hall", "church",
  "apartment", "bedroom", "classroom", "scene", "space", "table", "restaurant", "cafe", "café", "pub", "studio", "ward",
]);
/** After a particle such as "in" or "out", these make it a preposition: "walks in a circle", "runs out the clock". */
const NOT_PARTICLE_FOLLOWERS = new Set(["a", "an", "his", "her", "their", "its", "my", "our", "your", "circles", "circle", "place", "of", "the"]);
/** Before "exit", these make it a noun: "heads for the exit". */
const NOUN_LEADS = new Set(["the", "an", "a", "fire", "emergency", "her", "his", "their", "my", "our", "your", "its", "this", "that"]);

type MoveMatch = {
  kind: MoveKind;
  /** Where the verb is in the sentence. */
  from: number;
  to: number;
  /** "walk" rather than "walks", whose subject is the name just before it: "ANNA watches TOM leave". */
  base: boolean;
  /** An imperative, whose names come after it: "Enter TOM", "Exit ANNA", "Exeunt". */
  imperative: boolean;
  /** Everyone, as in "Exeunt". */
  all?: boolean;
};

/** Before "leave" or "go out", these leave it undone: "turns to leave", "won't go". */
const UNDONE_LEADS = new Set([
  "to", "not", "never", "cannot", "can't", "don't", "doesn't", "didn't", "won't", "will", "would", "could", "should", "might",
  "must", "may", "shall", "can", "let", "lets", "make", "makes", "about", "almost", "nearly",
]);

const ENTRANCE_PARTICLES = /^\s+(back\s+)?(in|on|onstage|on\s+stage|inside|back)\b/i;
const EXIT_PARTICLES = /^\s+(out|off|offstage|off\s+stage|away|outside)\b/i;

/** The next word after a place in a sentence, lower case, or "" at the end or before punctuation. */
function nextWord(text: string): string {
  const m = /^\s*([\p{L}'’-]+)/u.exec(text);
  return m && !/^\s*[,.;:!?)—–]/.test(text) ? m[1].toLowerCase() : "";
}

/** The word after `the`, if the text starts "the …". */
function afterThe(text: string): string | undefined {
  const m = /^\s*the\s+([\p{L}]+)/iu.exec(text);
  return m?.[1].toLowerCase();
}

/** Whether what follows an ambiguous verb ("leaves", "returns") keeps it a move. */
function movesOn(after: string, places = false): boolean {
  const next = nextWord(after);
  if (next === "") return true;
  if (MOVE_FOLLOWERS.has(next)) return true;
  if (places && next === "the") return PLACES.has(afterThe(after) ?? "");
  return false;
}

const WORD_RE = /[\p{L}'’-]+/gu;

/** The entrances and exits phrased in one sentence. */
function movesIn(sentence: string): MoveMatch[] {
  const found: MoveMatch[] = [];
  const words = [...sentence.matchAll(WORD_RE)];
  words.forEach((m, i) => {
    const word = m[0].toLowerCase();
    const from = m.index;
    const to = from + m[0].length;
    const after = sentence.slice(to);
    const before = i > 0 ? words[i - 1][0].toLowerCase() : "";
    const first = sentence.slice(0, from).trim().replace(/^[^\p{L}]+/u, "") === "";
    const push = (kind: MoveKind, base: boolean, extra: Partial<MoveMatch> = {}) => {
      // "does not leave", "turns to leave", "is about to go out": not a move, or not yet.
      if (base && !extra.imperative && UNDONE_LEADS.has(before)) return;
      if (/(\bnot|\bnever|n['’]t)\s+$/i.test(sentence.slice(Math.max(0, from - 12), from))) return;
      found.push({ kind, from, to, base, imperative: false, ...extra });
    };

    if (/^(re-?)?enter$/.test(word) && first) return push("enter", false, { imperative: true });
    if (/^(re-?)?enters$/.test(word)) return push("enter", false);
    if (/^(re-?)?enter$/.test(word) && !NOUN_LEADS.has(before)) return push("enter", true);
    if (word === "exeunt") return push("exit", false, { imperative: first, all: true });
    if (word === "exit" && first) return push("exit", false, { imperative: true });
    if (word === "exits") return push("exit", false);
    if (word === "exit" && !NOUN_LEADS.has(before) && before !== "to") return push("exit", true);
    if ((word === "returns" || word === "return") && movesOn(after)) return push("enter", word === "return");
    if ((word === "arrives" || word === "arrive") && movesOn(after)) return push("enter", word === "arrive");
    if ((word === "appears" || word === "appear") && (movesOn(after) || /^\s+(in|at|behind)\b/i.test(after)) && !/^\s+(to|as)\b/i.test(after)) {
      return push("enter", word === "appear");
    }
    if ((word === "leaves" || word === "leave") && movesOn(after, true)) return push("exit", word === "leave");
    if ((word === "departs" || word === "depart") && movesOn(after)) return push("exit", word === "depart");
    if ((word === "disappears" || word === "disappear") && (movesOn(after) || /^\s+(into|behind|out|off|inside)\b/i.test(after))) {
      return push("exit", word === "disappear");
    }
    if ((word === "follows" || word === "follow") && (nextWord(after) === "" || /^\s+(\S+\s+){0,2}(out|off)\b/i.test(after))) {
      return push("exit", word === "follow");
    }
    if (word === "goes" && nextWord(after) === "") return push("exit", false);
    if (/^(is|are)$/.test(word) && /^\s+(shown|led|brought|wheeled|ushered|carried|helped)\s+(in|on)\b/i.test(after)) return push("enter", word === "are");
    if (/^(is|are)$/.test(word) && /^\s+(led|carried|wheeled|helped|dragged|bundled|ushered)\s+(out|off|away)\b/i.test(after)) {
      return push("exit", word === "are");
    }
    if (/^lets?$/.test(word) && /^\s+(herself|himself|themselves|themself)\s+(in|out)\b/i.test(after)) {
      return push(/\bin\b/i.test(after.slice(0, 30)) ? "enter" : "exit", word === "let");
    }
    if (MOTION.includes(word)) {
      const base = !/s$/.test(word) || word === "dress";
      const particle = ENTRANCE_PARTICLES.exec(after) ?? EXIT_PARTICLES.exec(after);
      if (!particle) return;
      const rest = after.slice(particle[0].length);
      const next = nextWord(rest);
      const isExit = EXIT_PARTICLES.test(after);
      // "comes back to the table" is moving about the stage, and "steps back" is a step;
      // "comes back", "comes back with tea" and "runs back in" are entrances.
      if (/^back$/i.test(particle[2] ?? particle[1])) {
        if (word !== "come" && word !== "comes") return;
        if (next !== "" && !BACK_FOLLOWERS.has(next)) return;
      }
      if (NOT_PARTICLE_FOLLOWERS.has(next) && !(next === "the" && PLACES.has(afterThe(rest) ?? ""))) {
        if (!(isExit && next === "of" && /^\s*of\s+the\s+\p{L}+/iu.test(rest) && PLACES.has(/^\s*of\s+the\s+(\p{L}+)/iu.exec(rest)?.[1].toLowerCase() ?? ""))) return;
      }
      // Going "in" or "on" means coming in, except for "go", which means going into somewhere else.
      if (!isExit && (word === "go" || word === "goes" || word === "head" || word === "heads")) return;
      push(isExit ? "exit" : "enter", base);
    }
  });
  return found;
}

/** Whoever did the moving, when the sentence doesn't name them: he, she, they and the like. */
type Pronoun = "he" | "she" | "one" | "they" | "all";

const PRONOUNS: Record<string, Pronoun> = {
  he: "he", she: "she", they: "they", everyone: "all", everybody: "all", all: "all", both: "they",
};

/** Words that say who a character is: he, his, him; she, her. */
const GENDERED: Record<string, "he" | "she"> = {
  he: "he", him: "he", his: "he", himself: "he", she: "she", her: "she", hers: "she", herself: "she",
};

/** A parenthetical in a speech that has the speaker come in, or go when the speech ends. */
const PAREN_ENTER_RE = /(^|[^\p{L}])(enter(s|ing)?|com(es|ing) (back )?in|arriv(es|ing)|return(s|ing))(\s*$|\s*[,;)]|\s+from\b)/iu;
const PAREN_EXIT_RE = /(^|[^\p{L}])(exit(s|ing)?|leav(es|ing)|go(es|ing)( out| off)?|depart(s|ing)|as (he|she|they) (goes|go|leaves|leave|exits|exit))(\s*$|\s*[,;)]|\s+the (room|stage)\b)/iu;

/** A cue for speaking from off: (O.S.), (V.O.), (OFF), (offstage). */
const OFF_RE = /\(\s*(?:[^)]*[\s,])?(o\.?\s?s\.?|v\.?\s?o\.?|o\.?\s?c\.?|off|off[\s-]?stage|from off)\s*\)/i;

/** Whether a cue has its speaker speak from off stage. */
export function speaksFromOff(cue: string): boolean {
  return OFF_RE.test(cue);
}

// --- Sentences and subjects ------------------------------------------------

interface Sentence {
  text: string;
  /** Where it starts in the element's text. */
  at: number;
}

const ABBREVIATIONS = /(^|[^\p{L}])(mr|mrs|ms|dr|st|prof|rev|sgt|capt|col|lt|gen|no)$/iu;

/** Splits a stage direction into sentences, keeping names such as "MRS. SMITH" whole. */
function sentencesOf(text: string, names: NameMatch[]): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const inName = (i: number) => names.some((n) => n.from <= i && i < n.to);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!/[.!?;:\n]/.test(c) || inName(i)) continue;
    if (c === "." && ABBREVIATIONS.test(text.slice(start, i))) continue;
    if (c !== "\n" && i + 1 < text.length && !/[\s"'’”)\]*_]/.test(text[i + 1])) continue;
    if (c === "\n" && !/[.!?;:]\s*$/.test(text.slice(start, i))) continue;
    out.push({ text: text.slice(start, i + 1), at: start });
    start = i + 1;
  }
  if (start < text.length) out.push({ text: text.slice(start), at: start });
  return out.filter((s) => /\p{L}/u.test(s.text));
}

interface Run {
  names: string[];
  from: number;
  to: number;
}

/**
 * Names written together, "ANNA and TOM" or "ANNA, TOM and JO", as runs.
 * A name with 's, "YASMINE's voice", is no one doing anything, so isn't one.
 */
function runsOf(names: NameMatch[], text: string): Run[] {
  const runs: Run[] = [];
  for (const n of names) {
    if (/^[*_]*['’]s?(?![\p{L}])/u.test(text.slice(n.to))) continue;
    const last = runs[runs.length - 1];
    if (last && /^[\s*_]*(,\s*(and\s+)?|and\s+|&\s*|\s)[\s*_]*$/i.test(text.slice(last.to, n.from))) {
      if (!last.names.includes(n.name)) last.names.push(n.name);
      last.to = n.to;
    } else runs.push({ names: [n.name], from: n.from, to: n.to });
  }
  return runs;
}

/** The run of names a sentence or clause starts with, past words such as "then", if any. */
function leadRun(text: string, runs: Run[], from = 0): Run | undefined {
  const rest = text.slice(from).replace(LEADING_RE, "");
  const at = text.length - rest.length;
  return runs.find((r) => r.from >= at && /^[\s*_]*$/.test(text.slice(at, r.from)));
}

/** The pronoun a sentence or clause starts with, past words such as "then", if any. */
function leadPronoun(text: string): string | undefined {
  const word = /^[\p{L}]+/u.exec(text.replace(LEADING_RE, ""))?.[0].toLowerCase();
  return word && word in PRONOUNS ? word : undefined;
}

/**
 * Whether each character is "he" or "she", learnt from the stage
 * directions: "ALEX picks up his bag", "KATRINA enters. She sits." Only
 * where the script is clear about it; otherwise unknown.
 */
function pronounsOf(script: ParsedScript, match: (text: string) => NameMatch[]): Map<string, "he" | "she"> {
  const votes = new Map<string, { he: number; she: number }>();
  const vote = (name: string, pronoun: "he" | "she") => {
    const v = votes.get(name) ?? { he: 0, she: 0 };
    v[pronoun]++;
    votes.set(name, v);
  };
  for (const el of script.elements) {
    if (el.type !== "action" || isPreface(el)) continue;
    const names = match(el.text);
    let last: string | undefined;
    for (const sentence of sentencesOf(el.text, names)) {
      const inSentence = names.filter((n) => n.from >= sentence.at && n.to <= sentence.at + sentence.text.length);
      const local = inSentence.map((n) => ({ ...n, from: n.from - sentence.at, to: n.to - sentence.at }));
      const runs = runsOf(local, sentence.text);
      // "KATRINA enters. She sits.": the sentence after one about one character.
      const pronoun = leadPronoun(sentence.text);
      if (last && local.length === 0 && (pronoun === "he" || pronoun === "she")) vote(last, pronoun);
      const lead = leadRun(sentence.text, runs);
      const only = new Set(inSentence.map((n) => n.name)).size === 1;
      last = lead && only && lead.names.length === 1 ? lead.names[0] : undefined;
      if (!last || !lead) continue;
      // "ALEX picks up his bag": he, his and him in the same sentence.
      for (const m of sentence.text.slice(lead.to).matchAll(/[\p{L}]+/gu)) {
        const g = GENDERED[m[0].toLowerCase()];
        if (g) vote(last, g);
      }
    }
  }
  const known = new Map<string, "he" | "she">();
  for (const [name, { he, she }] of votes) {
    if (he >= 2 && he >= 3 * she) known.set(name, "he");
    else if (she >= 2 && she >= 3 * he) known.set(name, "she");
  }
  return known;
}

/** Where clauses start in a sentence: after a comma or dash, and at words such as "as" and "and", outside a run of names. */
function clauseStarts(text: string, runs: Run[]): number[] {
  const starts = [0];
  const re = /[,;—–(]|\s-\s|(^|[^\p{L}])(as|while|whilst|when|before|after|until|then|but|and|so|once)(?![\p{L}])/giu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index + (m[1]?.length ?? 0);
    if (runs.some((r) => r.from <= at && at < r.to)) continue;
    starts.push(at);
  }
  return starts;
}

/** The first word of a clause, skipping words like "then" and "slowly". */
const LEADING_RE = /^[\s,;—–(*_-]*(?:(?:as|while|whilst|when|before|after|until|then|but|and|so|once|now|finally|slowly|quickly|suddenly|quietly|at last|eventually|meanwhile)\s+)*/i;

interface Subject {
  names?: string[];
  pronoun?: Pronoun;
}

/** Who a move in a sentence is about. */
function subjectOf(move: MoveMatch, sentence: string, runs: Run[]): Subject {
  if (move.imperative) {
    // "Enter ANNA and TOM", "Exit ANNA", or on its own "Exit."
    const after = runs.find((r) => r.from >= move.to);
    if (after && /^[\s*_,]*$/.test(sentence.slice(move.to, after.from).replace(/\b(from|through|by)\b.*$/i, ""))) return { names: after.names };
    if (/^\s*(all|omnes)\b/i.test(sentence.slice(move.to)) || move.all) return { pronoun: "all" };
    return { pronoun: "one" };
  }
  const starts = clauseStarts(sentence, runs);
  const clauseAt = (pos: number) => starts.filter((s) => s <= pos).pop() ?? 0;
  const own = clauseAt(move.from);
  const ownRuns = runs.filter((r) => r.from >= own && r.to <= move.from);
  if (ownRuns.length > 0) {
    // "ANNA watches TOM leave": the name just before. "ANNA hands TOM the bag and leaves" is two clauses.
    if (move.base) return { names: ownRuns[ownRuns.length - 1].names };
    return { names: ownRuns[0].names };
  }
  // A pronoun in the clause: "she quietly leaves", "they all go out".
  const ownText = sentence.slice(own, move.from).toLowerCase();
  const pronoun = [...ownText.matchAll(/[\p{L}]+/gu)].map((m) => m[0]).find((w) => w in PRONOUNS);
  if (pronoun) {
    if (pronoun === "they" && /\bthey\s+(all|both)\b/.test(ownText)) return { pronoun: /\ball\b/.test(ownText) ? "all" : "they" };
    return { pronoun: PRONOUNS[pronoun] };
  }
  // Nothing in its own clause: the subject of an earlier clause, "ANNA picks up her bag and leaves".
  for (const start of starts.filter((s) => s < own).reverse()) {
    const run = leadRun(sentence, runs, start);
    if (run) return { names: run.names };
    const word = leadPronoun(sentence.slice(start));
    if (word) return { pronoun: PRONOUNS[word] };
  }
  // A sentence that starts with the verb, "Goes out.", is about whoever was last about.
  if (sentence.slice(0, move.from).replace(LEADING_RE, "").trim() === "") return { pronoun: "one" };
  return {};
}

// --- Following the play ----------------------------------------------------

type Event =
  | { kind: "enter" | "exit"; names: string[]; line: number; soft?: boolean }
  | { kind: "exit-all"; line: number }
  | { kind: "present"; names: string[]; line: number }
  | { kind: "speak"; name: string; line: number; endLine: number; words: number }
  | { kind: "mention"; names: string[]; line: number };

/** The line within an element that a place in its text is on. */
function lineOf(el: ScriptElement, at: number): number {
  let line = el.line;
  for (let i = 0; i < at && i < el.text.length; i++) if (el.text[i] === "\n") line++;
  return Math.min(line, el.endLine);
}

/** Finds the scene a line is in, as the report does: the one it falls inside, else the next, else the last. */
function sceneIndexAt(scenes: SceneRange[], line: number): number {
  let next = -1;
  for (let i = 0; i < scenes.length; i++) {
    const { line: start, endLine } = scenes[i];
    if (start <= line && (endLine === undefined || line < endLine)) return i;
    if (next < 0 && start > line) next = i;
  }
  return next >= 0 ? next : scenes.length - 1;
}

/** Each scene's events, in order. */
function sceneEvents(script: ParsedScript, scenes: SceneRange[]): Event[][] {
  const events: Event[][] = scenes.map(() => []);
  const match = nameMatcher(characterNames(script));
  const genders = pronounsOf(script, match);
  /** Who "she" or "he" might be: whoever last spoke or was last the subject of a direction, latest first. */
  let recent: string[] = [];
  const noteSubject = (name: string) => (recent = [name, ...recent.filter((n) => n !== name)].slice(0, 6));
  /** The latest of them it can be: one known to be "she" for "she", else one not known either way. */
  const resolve = (pronoun: "he" | "she" | "one"): string | undefined => {
    if (pronoun === "one") return recent[0];
    return recent.find((n) => genders.get(n) === pronoun) ?? recent.find((n) => !genders.has(n));
  };
  /** Who "they" are: the last names written together. */
  let group: string[] = [];
  let speech: { name: string; line: number; endLine: number; words: number; exits: boolean; event?: Event } | undefined;
  let scene = -1;
  /** Whether no one has spoken in the scene yet, so a direction is still its opening. */
  let opening = true;

  const endSpeech = () => {
    // Soft, as "(going)" may be followed by an exit written out, or by more from them.
    if (speech?.exits) events[scene].push({ kind: "exit", names: [speech.name], line: speech.endLine + 1, soft: true });
    speech = undefined;
  };

  for (const el of script.elements) {
    if (isPreface(el) || scenes.length === 0) continue;
    const at = sceneIndexAt(scenes, el.line);
    if (at !== scene) {
      endSpeech();
      scene = at;
      opening = true;
      recent = [];
      group = [];
    }
    const list = events[scene];

    if (el.type === "character") {
      endSpeech();
      const name = cueName(el.text).toUpperCase();
      noteSubject(name);
      if (speaksFromOff(el.text)) continue;
      opening = false;
      speech = { name, line: el.line, endLine: el.endLine, words: 0, exits: false };
      continue;
    }
    if (speech && (el.type === "dialogue" || el.type === "parenthetical")) {
      if (el.type === "parenthetical") {
        // A parenthetical before any dialogue that has them come in puts the entrance before the speech.
        if (PAREN_ENTER_RE.test(el.text) && !speech.event) list.push({ kind: "enter", names: [speech.name], line: el.line });
        if (PAREN_EXIT_RE.test(el.text)) speech.exits = true;
      } else {
        const words = countWords(el.text);
        if (!speech.event) {
          speech.event = { kind: "speak", name: speech.name, line: el.line, endLine: el.endLine, words };
          list.push(speech.event);
        } else if (speech.event.kind === "speak") {
          speech.event.words += words;
          speech.event.endLine = el.endLine;
        }
      }
      speech.endLine = el.endLine;
      continue;
    }
    endSpeech();
    if (el.type !== "action" || el.italic) continue;

    const names = match(el.text);
    for (const sentence of sentencesOf(el.text, names)) {
      const inSentence = names
        .filter((n) => n.from >= sentence.at && n.to <= sentence.at + sentence.text.length)
        .map((n) => ({ ...n, from: n.from - sentence.at, to: n.to - sentence.at }));
      const runs = runsOf(inSentence, sentence.text);
      const line = lineOf(el, sentence.at);
      const moves = movesIn(sentence.text);
      const moved = new Set<string>();
      for (const move of moves) {
        const moveLine = lineOf(el, sentence.at + move.from);
        const subject = subjectOf(move, sentence.text, runs);
        let who: string[] | "all" | undefined = subject.names;
        if (subject.pronoun === "he" || subject.pronoun === "she" || subject.pronoun === "one") {
          const one = resolve(subject.pronoun);
          who = one ? [one] : undefined;
        }
        if (subject.pronoun === "they") who = group.length > 1 ? group : move.kind === "exit" ? "all" : undefined;
        if (subject.pronoun === "all") who = move.kind === "exit" ? "all" : group.length > 1 ? group : undefined;
        if (move.all && !subject.names) who = "all";
        if (who === "all") {
          list.push({ kind: "exit-all", line: moveLine });
          continue;
        }
        if (!who) continue;
        // "ANNA leaves with TOM", "ANNA leaves, followed by TOM".
        const companions = runs.find((r) => r.from >= move.to && /^\s*(\p{L}+\s+){0,3}?(with|followed by|after)\s+[\s*_]*$/iu.test(sentence.text.slice(move.to, r.from)));
        const all = [...who, ...(companions?.names ?? [])];
        list.push({ kind: move.kind, names: all, line: moveLine });
        all.forEach((n) => moved.add(n));
        if (all.length === 1) noteSubject(all[0]);
        else group = all;
      }

      const named = [...new Set(inSentence.map((n) => n.name))].filter((n) => !moved.has(n));
      if (named.length > 0) list.push({ kind: opening ? "present" : "mention", names: named, line });
      // The subject of a clause is who "she" means next: "In THE CHATROOM, XANDER remains."
      for (const start of clauseStarts(sentence.text, runs)) {
        const first = leadRun(sentence.text, runs, start);
        if (!first) continue;
        if (first.names.length === 1) noteSubject(first.names[0]);
        else group = first.names;
        break;
      }
      for (const r of runs) if (r.names.length > 1) group = r.names;
    }
  }
  endSpeech();
  return events;
}

export function stagePlot(script: ParsedScript, scenes: SceneRange[]): StagePlot {
  const plot: StagePlot = { scenes, moves: [], spans: [], issues: [] };
  sceneEvents(script, scenes).forEach((events, scene) => {
    const start = scenes[scene].line;
    const end = scenes[scene].endLine ?? Number.MAX_SAFE_INTEGER;

    // Who is on from the start: whoever speaks or goes before coming in, or
    // is named in the opening direction (unless they come in before doing anything).
    const firstEvent = new Map<string, Event["kind"]>();
    const settled = new Set<string>();
    for (const e of events) {
      const names = e.kind === "speak" ? [e.name] : e.kind === "exit-all" || e.kind === "mention" ? [] : e.names;
      for (const n of names) {
        if (settled.has(n)) continue;
        if (e.kind === "present") {
          if (!firstEvent.has(n)) firstEvent.set(n, "present");
          continue;
        }
        firstEvent.set(n, e.kind);
        settled.add(n);
      }
    }

    interface State {
      on: boolean;
      /** How they came to be on: from the start, by an entrance, or taken to be there from speaking. */
      how?: "start" | "entered" | "implied";
      since: number;
      /** Where they first spoke since coming on. */
      spoke?: number;
      lastExit?: number;
      lastEntrance?: number;
      /** Whether they last went with a "(going)", which may not be the end of them. */
      soft?: boolean;
      /** Others' words since they last spoke, were named or moved. */
      quiet: number;
      quietFrom: number;
      flagged: boolean;
    }
    const states = new Map<string, State>();
    const state = (name: string): State => {
      let s = states.get(name);
      if (!s) {
        s = { on: false, since: start, quiet: 0, quietFrom: start, flagged: false };
        states.set(name, s);
      }
      return s;
    };
    for (const [name, kind] of firstEvent) {
      if (kind === "speak" || kind === "exit" || kind === "present") Object.assign(state(name), { on: true, how: kind === "present" ? "start" : "implied", since: start });
    }

    const goOn = (name: string, line: number, how: State["how"]) => {
      const s = state(name);
      if (!s.on) Object.assign(s, { on: true, since: line, spoke: undefined, soft: false });
      s.how = how;
      s.quiet = 0;
      s.quietFrom = line;
      s.flagged = false;
    };
    const goOff = (name: string, line: number) => {
      const s = state(name);
      if (s.on) plot.spans.push({ name, scene, from: s.since, to: Math.max(line, s.since) });
      s.on = false;
      s.lastExit = line;
    };

    for (const e of events) {
      if (e.kind === "enter") {
        for (const name of e.names) {
          const s = state(name);
          plot.moves.push({ kind: "enter", name, line: e.line, scene });
          if (s.on && s.how === "implied" && s.spoke !== undefined) {
            plot.issues.push({ kind: "speaks-before-entrance", name, line: s.spoke, otherLine: e.line });
          } else if (s.on && (s.how === "entered" || s.how === "start")) {
            plot.issues.push({ kind: "enters-twice", name, line: e.line, otherLine: s.lastEntrance ?? s.since });
          }
          goOn(name, e.line, "entered");
          s.lastEntrance = e.line;
        }
      } else if (e.kind === "exit") {
        for (const name of e.names) {
          const s = state(name);
          plot.moves.push({ kind: "exit", name, line: e.line, scene });
          if (!s.on && s.lastExit !== undefined && !s.soft) plot.issues.push({ kind: "exits-twice", name, line: e.line, otherLine: s.lastExit });
          goOff(name, e.line);
          s.soft = e.soft;
        }
      } else if (e.kind === "exit-all") {
        for (const [name, s] of states) {
          if (!s.on) continue;
          plot.moves.push({ kind: "exit", name, line: e.line, scene });
          goOff(name, e.line);
        }
      } else if (e.kind === "speak") {
        const s = state(e.name);
        if (!s.on && s.lastExit !== undefined && !s.soft) {
          plot.issues.push({ kind: "speaks-after-exit", name: e.name, line: e.line, otherLine: s.lastExit });
          goOn(e.name, e.line, "implied");
        } else if (!s.on) goOn(e.name, e.line, "implied");
        s.spoke ??= e.line;
        s.quiet = 0;
        s.quietFrom = e.endLine;
        s.flagged = false;
        for (const [name, other] of states) {
          if (name === e.name || !other.on) continue;
          other.quiet += e.words;
          if (other.quiet >= SILENT_WORDS && !other.flagged) {
            other.flagged = true;
            plot.issues.push({ kind: "silent", name, line: other.quietFrom, otherLine: e.endLine, words: other.quiet });
          }
        }
      } else {
        for (const name of e.names) {
          const s = state(name);
          if (e.kind === "present" && !s.on && firstEvent.get(name) !== "enter") goOn(name, start, "start");
          s.quiet = 0;
          s.quietFrom = e.line;
          s.flagged = false;
        }
      }
    }
    for (const [name, s] of states) if (s.on) plot.spans.push({ name, scene, from: s.since, to: end });
  });
  plot.spans.sort((a, b) => a.from - b.from || a.name.localeCompare(b.name));
  plot.issues.sort((a, b) => a.line - b.line);
  return plot;
}

/** Who is on stage at a line, in the order they came on. */
export function onStageAt(plot: StagePlot, line: number): string[] {
  return plot.spans.filter((s) => s.from <= line && line < s.to).map((s) => s.name);
}
