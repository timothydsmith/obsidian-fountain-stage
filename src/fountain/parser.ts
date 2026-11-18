/**
 * Fountain parser (https://fountain.io/syntax/), ported from fountain2pdf's
 * parser.py. It turns script text into title-page entries and a flat list of
 * elements in reading order, each with its position in the source, so the
 * editor can format it and the PDF export can lay it out.
 *
 * Differences from parser.py:
 * - Boneyard (`/* *\/`) and notes (`[[ ]]`) are blanked out rather than cut,
 *   so positions stay true. A boneyard or note spanning several lines
 *   therefore keeps those lines apart, where parser.py would join them.
 * - The preface also ends at the first character cue, not only at the
 *   first section or scene heading, so a script with neither isn't all preface.
 * - Elements carry source offsets and line numbers, and the result lists the
 *   syntax characters (forcing marks, scene numbers, notes) for the editor.
 */

export type ElementType =
  | "page_break"
  | "section"
  | "centered"
  | "transition"
  | "scene_heading"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "action"
  | "preface"
  | "preface_list_item";

export interface ScriptElement {
  type: ElementType;
  /** The element's text, without forcing marks. Inline emphasis is left as written. */
  text: string;
  /** Source offsets from the element's first to just past its last visible character. */
  from: number;
  to: number;
  /** First and last source line, counting from 0. */
  line: number;
  endLine: number;
  /** Section depth: 1 for `#` (an act), 2 for `##` (a scene), and so on. */
  depth?: number;
  /** A forced scene number, from `#2A#` at the end of a scene heading. */
  sceneNumber?: string;
  /** Set on both character cues of a dual dialogue pair (`^`). */
  dual?: boolean;
  /** Set on lyric lines (`~`). */
  italic?: boolean;
  /** A list item's marker, such as "•" or "3.". */
  marker?: string;
}

export type SpanKind = "marker" | "scene-number" | "title-key" | "boneyard" | "note";

/** A run of source text the editor shows differently, such as a forcing mark or a note. */
export interface SyntaxSpan {
  kind: SpanKind;
  from: number;
  to: number;
}

export interface TitleEntry {
  /** The key in lower case, such as "title" or "draft date". */
  key: string;
  values: string[];
  line: number;
  endLine: number;
}

/** What a line that belongs to no element is for. */
export type LineRole = "title-page" | "breakdown-heading" | "breakdown" | "synopsis";

export interface ParsedScript {
  titlePage: TitleEntry[];
  /**
   * Title-page values by lower-case key, with any Characters, Setting, Time
   * or Scene Breakdown sections written in the body merged in.
   */
  titleValues: Record<string, string[]>;
  elements: ScriptElement[];
  /** Syntax spans, in source order within each kind. */
  spans: SyntaxSpan[];
  /** Roles of lines that belong to no element, by line number. */
  lineRoles: Map<number, LineRole>;
}

const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TITLE_PAGE_KEY_RE = /^([A-Za-z][A-Za-z0-9 _-]*):\s*(.*)$/;
const TRANSITION_RE = /^[A-Z0-9 .'-]+TO:$/;
const PAGE_BREAK_RE = /^={3,}$/;
const SECTION_RE = /^(#+)\s*(.*)$/;
const SCENE_NUMBER_RE = /\s*#([0-9A-Za-z][0-9A-Za-z.-]*)#\s*$/;
const LIST_BULLET_RE = /^[-*+]\s+(.+)$/;
const LIST_ORDERED_RE = /^(\d+)[.)]\s+(.+)$/;
const CHARACTER_EXTENSION_RE = /^(.*\S)\s*(\([^)]*\))\s*$/;
const MARKDOWN_HEADING_RE = /^(\*{1,3}|_)(.+)\1$/;
const HIDDEN_RE = /\/\*[\s\S]*?\*\/|\[\[[\s\S]*?\]\]/g;
const LETTER_RE = /\p{L}/u;
const SPACE_RE = /\s/;

/** Body headings, before the first scene, that start a preliminary section. */
const BREAKDOWN_HEADING_ALIASES: Record<string, string> = {
  characters: "characters",
  character: "characters",
  "cast of characters": "characters",
  setting: "setting",
  time: "time",
  "setting & time": "setting",
  "setting and time": "setting",
  "scene breakdown": "scene breakdown",
  scenes: "scene breakdown",
};

interface SourceLine {
  /** Offset of the line's first character. */
  start: number;
  /** The line with boneyard and notes removed. */
  text: string;
  /** Offsets of the first visible character and just past the last. */
  contentFrom: number;
  contentTo: number;
}

/** Splits a forced scene number ("INT. HOUSE - DAY #2A#") off a scene heading. */
export function splitSceneNumber(text: string): { heading: string; number?: string } {
  const m = SCENE_NUMBER_RE.exec(text);
  if (!m) return { heading: text };
  return { heading: text.slice(0, m.index).trimEnd(), number: m[1] };
}

/** True if every letter in `line` is upper case, and it has at least one. */
export function isAllCapsName(line: string): boolean {
  let seen = false;
  for (const c of line) {
    if (!LETTER_RE.test(c)) continue;
    seen = true;
    if (c === c.toLowerCase()) return false;
  }
  return seen;
}

/** "MARGARET (V.O.)" → "MARGARET". Only the name needs to be in capitals. */
export function stripCharacterExtension(name: string): string {
  const m = CHARACTER_EXTENSION_RE.exec(name);
  return m ? m[1] : name;
}

function isVisible(c: string): boolean {
  return c !== "\0" && !SPACE_RE.test(c);
}

function sourceLines(masked: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (const raw of masked.split("\n")) {
    let a = 0;
    while (a < raw.length && !isVisible(raw[a])) a++;
    let b = raw.length;
    while (b > a && !isVisible(raw[b - 1])) b--;
    lines.push({
      start,
      text: raw.includes("\0") ? raw.replace(/\0/g, "") : raw,
      contentFrom: start + a,
      contentTo: start + b,
    });
    start += raw.length + 1;
  }
  return lines;
}

/** True if a non-blank line starts some element other than more of an action paragraph. */
function startsNewElement(line: string): boolean {
  if (!line) return false;
  if ("#!~>@".includes(line[0])) return true;
  if (line.startsWith(".") && !line.startsWith("..")) return true;
  if (line.startsWith("=")) return true;
  if (SCENE_HEADING_RE.test(line)) return true;
  if (TRANSITION_RE.test(line) && line === line.toUpperCase()) return true;
  if (LIST_BULLET_RE.test(line) || LIST_ORDERED_RE.test(line)) return true;
  return isAllCapsName(stripCharacterExtension(line));
}

/** The preliminary section a body heading such as `***Characters***` names, if any. */
function matchBreakdownHeading(line: string): string | undefined {
  let s = line.trim();
  if (s.endsWith(":")) s = s.slice(0, -1).trim();
  const m = MARKDOWN_HEADING_RE.exec(s);
  if (!m) return undefined;
  let inner = m[2].trim();
  if (inner.endsWith(":")) inner = inner.slice(0, -1).trim();
  return BREAKDOWN_HEADING_ALIASES[inner.toLowerCase()];
}

/** The first line at or after `start` that begins the script proper: a section or a scene heading. */
/** Whether the block starting at line `i` is a character cue, as the main loop would read it. */
function startsSpeech(body: string[], i: number): boolean {
  const s = body[i];
  if (/^[!~>=]/.test(s)) return false;
  if (TRANSITION_RE.test(s) && s === s.toUpperCase()) return false;
  const forced = s.startsWith("@");
  const candidate = forced ? s.slice(1).trim() : s;
  if (!candidate || candidate.startsWith("(")) return false;
  return forced || (isAllCapsName(stripCharacterExtension(candidate)) && i + 1 < body.length && body[i + 1] !== "");
}

/**
 * Where the preface ends: at the first section, scene heading or character
 * cue. parser.py ends it only at a section or scene heading, so a script
 * with neither would be all preface; a speech shows the play has begun.
 */
function frontMatterEnd(body: string[], start: number): number {
  for (let i = start; i < body.length; i++) {
    const s = body[i];
    if (!s) continue;
    if (s.startsWith("#")) return i;
    if (s.startsWith(".") && !s.startsWith("..")) return i;
    if (SCENE_HEADING_RE.test(s)) return i;
    if (startsSpeech(body, i)) return i;
  }
  return body.length;
}

export function parseFountain(source: string): ParsedScript {
  const text = source.includes("\r") ? source.replace(/\r\n?/g, "\n") : source;
  const spans: SyntaxSpan[] = [];
  const lineRoles = new Map<number, LineRole>();

  // Blank out boneyard and notes, keeping line breaks, so offsets stay true.
  const masked = text.replace(HIDDEN_RE, (match: string, offset: number) => {
    spans.push({ kind: match.startsWith("/*") ? "boneyard" : "note", from: offset, to: offset + match.length });
    return match.replace(/[^\n]/g, "\0");
  });
  const lines = sourceLines(masked);
  // Each line's visible text, trimmed. Lines taken up by breakdown sections are blanked.
  const body = lines.map((l) => l.text.trim());
  const n = lines.length;

  const marker = (from: number, to: number, kind: SpanKind = "marker") => spans.push({ kind, from, to });

  // --- Title page: a block of "Key: value" lines at the very top. ---------
  const titlePage: TitleEntry[] = [];
  const titleValues: Record<string, string[]> = {};
  let idx = 0;
  let blockEnd = 0;
  while (blockEnd < n && body[blockEnd] !== "") blockEnd++;
  const isTitlePage =
    blockEnd > 0 &&
    TITLE_PAGE_KEY_RE.test(lines[0].text) &&
    lines.slice(0, blockEnd).every((l) => TITLE_PAGE_KEY_RE.test(l.text) || /^[ \t]/.test(l.text));
  if (isTitlePage) {
    let current: TitleEntry | undefined;
    for (let i = 0; i < blockEnd; i++) {
      lineRoles.set(i, "title-page");
      const m = TITLE_PAGE_KEY_RE.exec(lines[i].text);
      if (m) {
        current = { key: m[1].trim().toLowerCase(), values: [m[2].trim()], line: i, endLine: i };
        titlePage.push(current);
        (titleValues[current.key] ??= []).push(m[2].trim());
        marker(lines[i].start, lines[i].start + m[1].length + 1, "title-key");
      } else if (current) {
        current.values.push(body[i]);
        current.endLine = i;
        titleValues[current.key].push(body[i]);
      }
    }
    idx = blockEnd;
    while (idx < n && body[idx] === "") idx++;
  }

  // --- Breakdown sections written in the body, before the first scene. ----
  const extracted: Record<string, string[]> = {};
  const frontEnd = frontMatterEnd(body, idx);
  let active: string | undefined;
  for (let i = idx; i < frontEnd; i++) {
    const s = body[i];
    if (!s) {
      const list = active ? extracted[active] : undefined;
      if (list && list.length > 0 && list[list.length - 1] !== "") list.push("");
      continue;
    }
    if (PAGE_BREAK_RE.test(s)) {
      active = undefined;
      continue;
    }
    const heading = matchBreakdownHeading(s);
    if (heading) {
      active = heading;
      body[i] = "";
      lineRoles.set(i, "breakdown-heading");
      continue;
    }
    if (active) {
      (extracted[active] ??= []).push(s);
      body[i] = "";
      lineRoles.set(i, "breakdown");
    }
  }
  if (Object.keys(extracted).length > 0) {
    // A page break left with nothing after it only separated a section that
    // was taken out; drop it so it doesn't make a blank page.
    for (let i = idx; i < frontEnd; i++) {
      if (!PAGE_BREAK_RE.test(body[i])) continue;
      let hasContent = false;
      for (let j = i + 1; j < frontEnd && !PAGE_BREAK_RE.test(body[j]); j++) {
        if (body[j]) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) body[i] = "";
    }
    for (const [key, values] of Object.entries(extracted)) {
      titleValues[key] = (titleValues[key] ?? []).concat(values);
    }
  }

  // Anything before the first section, scene heading or cue is preface text.
  const prefaceEnd = frontMatterEnd(body, idx);

  // --- The script. ---------------------------------------------------------
  const elements: ScriptElement[] = [];
  const single = (type: ElementType, i: number, elementText: string, extra: Partial<ScriptElement> = {}) => {
    elements.push({ type, text: elementText, from: lines[i].contentFrom, to: lines[i].contentTo, line: i, endLine: i, ...extra });
  };

  while (idx < n) {
    const s = body[idx];
    const line = lines[idx];

    if (s === "") {
      idx++;
      continue;
    }

    if (PAGE_BREAK_RE.test(s)) {
      single("page_break", idx, "");
      idx++;
      continue;
    }

    if (s.startsWith("#")) {
      const m = SECTION_RE.exec(s)!;
      const depth = m[1].length;
      single("section", idx, m[2].trim(), { depth });
      marker(line.contentFrom, line.contentFrom + depth);
      idx++;
      continue;
    }

    if (s.startsWith("=")) {
      // A synopsis: not part of the script.
      lineRoles.set(idx, "synopsis");
      idx++;
      continue;
    }

    if (s.startsWith(">") && s.endsWith("<") && s.length > 2) {
      single("centered", idx, s.slice(1, -1).trim());
      marker(line.contentFrom, line.contentFrom + 1);
      marker(line.contentTo - 1, line.contentTo);
      idx++;
      continue;
    }

    if (s.startsWith(">")) {
      single("transition", idx, s.slice(1).trim());
      marker(line.contentFrom, line.contentFrom + 1);
      idx++;
      continue;
    }

    if (TRANSITION_RE.test(s) && s === s.toUpperCase()) {
      single("transition", idx, s);
      idx++;
      continue;
    }

    const forcedHeading = s.startsWith(".") && !s.startsWith("..");
    if (forcedHeading || SCENE_HEADING_RE.test(s)) {
      const { heading, number } = splitSceneNumber(forcedHeading ? s.slice(1).trim() : s);
      single("scene_heading", idx, heading, number ? { sceneNumber: number } : {});
      if (forcedHeading) marker(line.contentFrom, line.contentFrom + 1);
      if (number) marker(line.contentTo - number.length - 2, line.contentTo, "scene-number");
      idx++;
      continue;
    }

    // A character cue: forced with "@", or an all-caps line with dialogue under it.
    const forcedCharacter = s.startsWith("@");
    const candidate = forcedCharacter ? s.slice(1).trim() : s;
    const nextHasContent = idx + 1 < n && body[idx + 1] !== "";
    if (
      candidate &&
      !candidate.startsWith("(") &&
      (forcedCharacter || (isAllCapsName(stripCharacterExtension(candidate)) && nextHasContent))
    ) {
      // A trailing "^" pairs this speech with the one just before it.
      const hasDualMark = candidate.endsWith("^");
      const name = hasDualMark ? candidate.slice(0, -1).trim() : candidate;
      let dual = false;
      if (hasDualMark) {
        let back = elements.length - 1;
        while (back >= 0 && (elements[back].type === "dialogue" || elements[back].type === "parenthetical")) back--;
        if (back >= 0 && elements[back].type === "character") {
          elements[back].dual = true;
          dual = true;
        }
      }
      single("character", idx, name, dual ? { dual: true } : {});
      if (forcedCharacter) marker(line.contentFrom, line.contentFrom + 1);
      if (hasDualMark) marker(line.contentTo - 1, line.contentTo);
      idx++;
      // The speech runs to the next blank line.
      while (idx < n && body[idx] !== "") {
        const d = body[idx];
        single(d.startsWith("(") && d.endsWith(")") ? "parenthetical" : "dialogue", idx, d);
        idx++;
      }
      continue;
    }

    if (s.startsWith("~")) {
      single("action", idx, s.slice(1).trim(), { italic: true });
      marker(line.contentFrom, line.contentFrom + 1);
      idx++;
      continue;
    }

    if (s.startsWith("!")) {
      single("action", idx, s.slice(1).trim());
      marker(line.contentFrom, line.contentFrom + 1);
      idx++;
      continue;
    }

    // List items only count as lists in the preface.
    if (idx < prefaceEnd) {
      const ordered = LIST_ORDERED_RE.exec(s);
      if (ordered) {
        single("preface_list_item", idx, ordered[2].trim(), { marker: `${ordered[1]}.` });
        idx++;
        continue;
      }
      const bullet = LIST_BULLET_RE.exec(s);
      if (bullet) {
        single("preface_list_item", idx, bullet[1].trim(), { marker: "•" });
        idx++;
        continue;
      }
    }

    // An action paragraph (or preface text): lines up to a blank line or
    // anything that starts a different element, joined with spaces.
    const first = idx;
    const parts = [s];
    idx++;
    while (idx < n && body[idx] !== "" && !startsNewElement(body[idx])) {
      parts.push(body[idx]);
      idx++;
    }
    elements.push({
      type: first < prefaceEnd ? "preface" : "action",
      text: parts.join(" "),
      from: lines[first].contentFrom,
      to: lines[idx - 1].contentTo,
      line: first,
      endLine: idx - 1,
    });
  }

  return { titlePage, titleValues, elements, spans, lineRoles };
}
