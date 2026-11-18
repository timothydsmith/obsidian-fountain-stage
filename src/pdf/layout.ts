/**
 * Lays out a parsed script in a house style. A port of fountain2pdf's
 * engine.py: it turns script elements into blocks (the "story"), flows them
 * onto pages, then adds page numbers and the running header. Every layout
 * choice comes from the style; nothing here knows about any one style.
 */

import type { LineNote, ParsedScript, ScriptElement } from "../fountain/parser";
import { parseInline } from "../fountain/inline";
import { PAGE_BREAK, Spacer, Speech, TableRow, type Block, type SpeechContext, type StoryItem } from "./blocks";
import { flow } from "./flow";
import type { FontSet } from "./fonts";
import type { LayoutDocument, LayoutPage, TextItem } from "./model";
import { BLACK, Paragraph, paraStyle, type ParaStyle, type Span } from "./paragraph";
import type { Face, PlayStyle, Rgb } from "./style";

/** Title-page keys that become preliminary pages, each with its heading and the keys it reads, in priority order. */
const PRELIMINARY_SECTIONS: { heading: string; keys: string[] }[] = [
  { heading: "CHARACTERS", keys: ["characters", "character"] },
  { heading: "SETTING & TIME", keys: ["setting", "time"] },
  { heading: "SCENE BREAKDOWN", keys: ["scene breakdown", "scenes", "scene_breakdown"] },
];
const PRELIMINARY_KEYS = new Set(PRELIMINARY_SECTIONS.flatMap((s) => s.keys));

/** Title-page keys with a place of their own, kept out of the contact block. `style` picks the export style and is never printed. */
const NOT_CONTACT = new Set(["title", "author", "authors", "credit", "style"]);

/** A "Name<two or more spaces>Description" line, or failing that "Name: Description". */
const NAME_DESCRIPTION_RE = /^(\S.*?)\s{2,}(\S.*)$/;
const NAME_DESCRIPTION_COLON_RE = /^(\S.*?):\s+(\S.*)$/;
/** Gap between the name and description columns on preliminary pages. */
const NAME_DESCRIPTION_GUTTER = 12;

/** About 6.5cm, as fountain2pdf has it. */
const TITLE_PAGE_GAP = 6.5 * 28.35;
const LINK_COLOR: Rgb = [0, 0, 1];

type StyleName =
  | "title"
  | "byline"
  | "contact"
  | "prelimHeading"
  | "prelimBody"
  | "act"
  | "scene"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "dialogueContinued"
  | "parentheticalContinued"
  | "more"
  | "action"
  | "preface"
  | "prefaceList"
  | "transition"
  | "centered"
  | "note"
  | "synopsis";

function faceOf(bold: boolean, italic: boolean): Face {
  return bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
}

function paragraphStyles(style: PlayStyle): Record<StyleName, ParaStyle> {
  const { size, leading } = style.text;
  const hanging = style.character.nameColumnWidth + style.character.gutter;
  const parenFace = style.parenthetical.italic ? "italic" : "regular";
  const tint = style.action.color;
  return {
    title: paraStyle({ face: "regular", size: style.titlePage.titleSize, leading: style.titlePage.titleSize * 1.2, alignment: "center", spaceAfter: 18 }),
    byline: paraStyle({ face: "regular", size: style.titlePage.bylineSize, leading: style.titlePage.bylineSize * 1.2, alignment: "center", spaceAfter: 6 }),
    contact: paraStyle({ face: "regular", size, leading }),
    prelimHeading: paraStyle({ face: style.prelims.headingBold ? "bold" : "regular", size, leading, alignment: "center", spaceAfter: 14 }),
    prelimBody: paraStyle({ face: "regular", size, leading, spaceAfter: 4 }),
    act: paraStyle({ face: faceOf(style.act.bold, style.act.italic), size: style.act.size, leading, alignment: style.act.alignment, spaceBefore: 6, spaceAfter: 18 }),
    scene: paraStyle({ face: faceOf(style.scene.bold, style.scene.italic), size: style.scene.size, leading, alignment: style.scene.alignment, spaceBefore: 6, spaceAfter: 18 }),
    character: paraStyle({ face: style.character.bold ? "bold" : "regular", size: style.character.size, leading, alignment: style.character.alignment }),
    dialogue: paraStyle({ face: "regular", size, leading }),
    parenthetical: paraStyle({ face: parenFace, size, leading, leftIndent: style.parenthetical.indent, color: tint }),
    dialogueContinued: paraStyle({ face: "regular", size, leading, leftIndent: hanging }),
    parentheticalContinued: paraStyle({ face: parenFace, size, leading, leftIndent: hanging, color: tint }),
    more: paraStyle({ face: "regular", size, leading, alignment: "center", spaceBefore: 6 }),
    action: paraStyle({
      face: style.action.italic ? "italic" : "regular",
      size: style.action.size,
      leading,
      alignment: style.action.alignment,
      leftIndent: style.action.leftIndent,
      rightIndent: style.action.rightIndent,
      color: tint,
      spaceBefore: 10,
      spaceAfter: 10,
    }),
    preface: paraStyle({ face: "regular", size, leading, spaceBefore: 10, spaceAfter: 10 }),
    prefaceList: paraStyle({ face: "regular", size, leading, leftIndent: 18, spaceBefore: 2, spaceAfter: 2 }),
    transition: paraStyle({ face: "bold", size, leading, alignment: "center", spaceBefore: 10, spaceAfter: 10 }),
    centered: paraStyle({ face: "regular", size, leading, alignment: "center", spaceBefore: 6, spaceAfter: 6 }),
    note: paraStyle({ face: style.notes.italic ? "italic" : "regular", size, leading, color: style.notes.color, spaceBefore: 10, spaceAfter: 10 }),
    synopsis: paraStyle({ face: style.synopses.italic ? "italic" : "regular", size, leading, color: style.synopses.color, spaceBefore: 10, spaceAfter: 10 }),
  };
}

/** Spans put into a line of text at an offset, such as a note where it was written. */
export interface Insert {
  at: number;
  spans: Span[];
}

/**
 * Fountain emphasis and links as spans, with `extra` applied throughout,
 * and `inserts` put in at their offsets into `text`.
 */
export function inlineSpans(text: string, extra: Partial<Span> = {}, inserts: readonly Insert[] = []): Span[] {
  const pending = [...inserts].sort((a, b) => a.at - b.at);
  const out: Span[] = [];
  let next = 0;
  for (const run of parseInline(text).runs) {
    const piece = (from: number, to: number) => {
      if (from >= to) return;
      const span: Span = {
        text: text.slice(from, to),
        bold: run.bold || extra.bold,
        italic: run.italic || extra.italic,
        underline: run.underline || extra.underline,
        color: extra.color,
      };
      if (run.link) {
        span.link = run.link;
        span.color = LINK_COLOR;
        span.underline = true;
      }
      out.push(span);
    };
    let from = run.from;
    while (next < pending.length && pending[next].at < run.to) {
      const at = Math.max(pending[next].at, from);
      piece(from, at);
      out.push(...pending[next++].spans);
      from = at;
    }
    piece(from, run.to);
  }
  while (next < pending.length) out.push(...pending[next++].spans);
  return out;
}

/** What an export includes beyond the script itself. */
export interface LayoutOptions {
  /** Text across every page, such as DRAFT. Blank for none. */
  watermark?: string;
  /** Print notes (`[[ ]]`). */
  notes?: boolean;
  /** Print synopses (`= …`). */
  synopses?: boolean;
}

const join = (values: string[] | undefined) => (values ?? []).join(" ");

function firstPresent(values: Record<string, string[]>, keys: string[]): string[] | undefined {
  for (const k of keys) if (values[k]?.length) return values[k];
  return undefined;
}

function splitNameDescription(line: string): [string, string] | undefined {
  const m = NAME_DESCRIPTION_RE.exec(line) ?? NAME_DESCRIPTION_COLON_RE.exec(line);
  return m ? [m[1], m[2]] : undefined;
}

/** The inside of a one-word parenthetical such as "(laughing)", or undefined if it has more words. */
function shortParentheticalWord(text: string): string | undefined {
  let inner = text.trim();
  if (inner.startsWith("(") && inner.endsWith(")")) inner = inner.slice(1, -1);
  return inner.split(/\s+/).filter(Boolean).length <= 1 ? inner : undefined;
}

type SpeechLine = { kind: "parenthetical" | "dialogue"; text: string; line: number; notes: Insert[] };

class StoryBuilder {
  readonly styles: Record<StyleName, ParaStyle>;
  /** Width inside the margins. Tables span this, 12pt wider than the text frame, as in fountain2pdf. */
  readonly available: number;

  constructor(
    readonly style: PlayStyle,
    readonly fonts: FontSet,
    readonly options: LayoutOptions = {},
  ) {
    this.styles = paragraphStyles(style);
    this.available = style.page.width - style.page.margins.left - style.page.margins.right;
  }

  para(spans: Span[], name: StyleName, bullet?: string): Paragraph {
    return Paragraph.of(spans, this.styles[name], this.fonts, bullet);
  }

  plain(text: string, name: StyleName, underline = false, notes: readonly Insert[] = []): Paragraph {
    const spans: Span[] = [];
    let from = 0;
    for (const { at, spans: inserted } of [...notes].sort((a, b) => a.at - b.at)) {
      if (at > from) spans.push({ text: text.slice(from, at), underline });
      spans.push(...inserted);
      from = Math.max(from, at);
    }
    if (from < text.length || spans.length === 0) spans.push({ text: text.slice(from), underline });
    return this.para(spans, name);
  }

  /**
   * The notes written in an element, to insert into `text` (its text as
   * printed, which starts `shift` characters later than the element's own),
   * if the export includes notes.
   */
  notesIn(el: ScriptElement, text: string, shift = 0): Insert[] {
    if (!this.options.notes || !el.notes) return [];
    const { italic, color } = this.style.notes;
    return el.notes.map(({ at, text: note }) => {
      const p = Math.min(at + shift, text.length);
      const before = p > 0 && !/\s/.test(text[p - 1]) ? " " : "";
      const after = p < text.length && !/\s/.test(text[p]) ? " " : "";
      return { at: p, spans: [{ text: `${before}[${note}]${after}`, italic: italic || undefined, color }] };
    });
  }

  titlePage(values: Record<string, string[]>): Block[] {
    const blocks: Block[] = [new Spacer(TITLE_PAGE_GAP)];
    blocks.push(this.para(inlineSpans(join(values.title) || "Untitled"), "title"));
    const credit = join(values.credit);
    const author = join(values.author ?? values.authors);
    if (credit) blocks.push(this.para(inlineSpans(credit), "byline"));
    if (author) blocks.push(this.para(inlineSpans(author), "byline"));

    const contact = Object.entries(values)
      .filter(([key]) => !NOT_CONTACT.has(key) && !PRELIMINARY_KEYS.has(key))
      .flatMap(([, lines]) => lines);
    if (contact.length > 0) {
      blocks.push(new Spacer(TITLE_PAGE_GAP));
      for (const line of contact) blocks.push(this.para(inlineSpans(line), "contact"));
    }
    return blocks;
  }

  /** Characters, Setting & Time and Scene Breakdown pages, one list of blocks per page. */
  preliminaryPages(values: Record<string, string[]>): Block[][] {
    const pages: Block[][] = [];
    for (const { heading, keys } of PRELIMINARY_SECTIONS) {
      const lines =
        heading === "SETTING & TIME"
          ? [...(firstPresent(values, ["setting"]) ?? []), ...(firstPresent(values, ["time"]) ?? [])]
          : (firstPresent(values, keys) ?? []);
      if (lines.length === 0) continue;

      const splits = lines.map(splitNameDescription);
      const names = splits.filter((s) => s !== undefined).map(([name]) => name);
      const { size } = this.style.text;
      const nameColumn =
        names.length > 0 ? Math.max(...names.map((n) => this.fonts.width(this.fonts.clean(n), "regular", size))) + NAME_DESCRIPTION_GUTTER : 0;

      const blocks: Block[] = [this.plain(heading, "prelimHeading", this.style.prelims.headingUnderline)];
      lines.forEach((line, i) => {
        const split = splits[i];
        if (line === "") {
          blocks.push(new Spacer(this.style.text.leading, true));
        } else if (split) {
          const [name, description] = split;
          const nameSpans = inlineSpans(name, { underline: this.style.prelims.nameUnderline || undefined });
          blocks.push(
            new TableRow(
              [
                { content: this.para(nameSpans, "prelimBody"), width: nameColumn, paddingLeft: 0 },
                { content: this.para(inlineSpans(description), "prelimBody"), width: this.available - nameColumn, paddingLeft: NAME_DESCRIPTION_GUTTER },
              ],
              4,
            ),
          );
        } else {
          blocks.push(this.para(inlineSpans(line), "prelimBody"));
        }
      });
      pages.push(blocks);
    }
    return pages;
  }

  private lineSpans(line: SpeechLine): Span[] {
    return inlineSpans(line.text, { italic: line.kind === "parenthetical" && this.style.parenthetical.italic }, line.notes);
  }

  /** Name and first line side by side in a table row, later lines indented to match. */
  private sharedLineParts(name: string, lines: SpeechLine[], cueLine: number, nameNotes: Insert[]): Block[] {
    const nameBlock = this.para(inlineSpans(name, {}, nameNotes), "character");
    nameBlock.source = { line: cueLine };
    if (lines.length === 0) return [nameBlock];

    let first = this.lineSpans(lines[0]);
    let consumed = 1;
    if (lines[0].kind === "parenthetical") {
      // A leading parenthetical is tinted and runs straight into the line after it.
      first = first.map((s) => ({ ...s, color: s.color ?? this.style.action.color }));
      if (lines.length > 1 && lines[1].kind !== "parenthetical") {
        first = [...first, { text: " " }, ...this.lineSpans(lines[1])];
        consumed = 2;
      }
    }
    const { nameColumnWidth, gutter } = this.style.character;
    const row = new TableRow([
      { content: nameBlock, width: nameColumnWidth, paddingLeft: 0 },
      { content: this.para(first, "dialogue"), width: this.available - nameColumnWidth, paddingLeft: gutter },
    ]);
    row.source = { line: cueLine };
    const parts: Block[] = [row];
    for (const line of lines.slice(consumed)) {
      const para = this.para(this.lineSpans(line), line.kind === "parenthetical" ? "parentheticalContinued" : "dialogueContinued");
      para.source = { line: line.line };
      parts.push(para);
    }
    return parts;
  }

  /** Name on a line of its own, then each line of the speech. */
  private ownLineParts(name: string, lines: SpeechLine[], cueLine: number, nameNotes: Insert[]): Block[] {
    let nameSpans = inlineSpans(name, {}, nameNotes);
    let consumed = 0;
    if (this.style.character.shortParentheticalInline && lines[0]?.kind === "parenthetical" && lines[0].notes.length === 0) {
      const word = shortParentheticalWord(lines[0].text);
      if (word !== undefined) {
        nameSpans = [...nameSpans, { text: " (" }, ...inlineSpans(word), { text: ")" }];
        consumed = 1;
      }
    }
    const nameBlock = this.para(nameSpans, "character");
    nameBlock.source = { line: cueLine };
    const parts: Block[] = [nameBlock];
    for (const line of lines.slice(consumed)) {
      const para = this.para(inlineSpans(line.text, {}, line.notes), line.kind === "parenthetical" ? "parenthetical" : "dialogue");
      para.source = { line: line.line };
      parts.push(para);
    }
    return parts;
  }

  speechContext(): SpeechContext {
    const { moreContinued, moreText, continuedText } = this.style.speech;
    return {
      more: () => this.plain(moreText, "more"),
      continued: (name) => (moreContinued ? this.para(inlineSpans(`${name} ${continuedText}`), "character") : undefined),
    };
  }

  /** A speech, its blocks marked with the script lines they come from: `cueLine` for the name. */
  speech(name: string, lines: SpeechLine[], cueLine: number, nameNotes: Insert[] = []): Block[] {
    const ownLine = this.style.character.ownLine;
    const parts = ownLine ? this.ownLineParts(name, lines, cueLine, nameNotes) : this.sharedLineParts(name, lines, cueLine, nameNotes);
    const gap = this.style.speech.gap;
    if (this.style.speech.moreContinued) {
      const speech = new Speech(name, parts, this.speechContext(), ownLine ? 2 : 1, gap);
      speech.source = { line: cueLine };
      return [speech];
    }
    // Without break cues the parts flow on their own, and paragraphs can split mid-speech.
    parts[parts.length - 1].spaceAfter = gap;
    return parts;
  }

  build(script: ParsedScript): StoryItem[] {
    const story: StoryItem[] = [];
    const values = titleValues(script);
    let fresh = false;

    if (Object.keys(values).length > 0) {
      story.push(...this.titlePage(values), PAGE_BREAK);
      fresh = true;
    }
    for (const page of this.preliminaryPages(values)) {
      story.push(...page, PAGE_BREAK);
      fresh = true;
    }

    let speaker: string | undefined;
    let cueLine = 0;
    let nameNotes: Insert[] = [];
    let lines: SpeechLine[] = [];
    let bodyMarked = false;
    const flush = () => {
      if (speaker === undefined) return;
      story.push(...this.speech(speaker, lines, cueLine, nameNotes));
      speaker = undefined;
      lines = [];
      fresh = false;
    };
    const heading = (block: Block, scene: string, line: number) => {
      block.source = { line };
      block.marks = { scene, bodyStart: !bodyMarked || undefined };
      bodyMarked = true;
      story.push(block);
      fresh = false;
    };
    const add = (block: Block, line: number) => {
      block.source = { line };
      story.push(block);
      fresh = false;
    };
    // Notes on lines of their own and synopses, if included, go in where they were written.
    const extras: (LineNote & { name: StyleName })[] = [
      ...(this.options.notes ? script.lineNotes.map((n) => ({ line: n.line, text: `[${n.text}]`, name: "note" as const })) : []),
      ...(this.options.synopses ? script.synopses.map((n) => ({ ...n, name: "synopsis" as const })) : []),
    ].sort((a, b) => a.line - b.line);
    let nextExtra = 0;
    const extrasBefore = (line: number) => {
      while (nextExtra < extras.length && extras[nextExtra].line < line) {
        const extra = extras[nextExtra++];
        add(this.para(inlineSpans(extra.text), extra.name), extra.line);
      }
    };

    for (const el of script.elements) {
      if (el.type === "character") {
        flush();
        extrasBefore(el.line);
        speaker = el.text.toUpperCase();
        cueLine = el.line;
        nameNotes = this.notesIn(el, speaker);
        if (el.dual && this.style.speech.dualLabel) speaker += ` ${this.style.speech.dualLabel}`;
        continue;
      }
      if (el.type === "parenthetical" || el.type === "dialogue") {
        // A stray line with no character before it is dropped, as in fountain2pdf.
        if (speaker !== undefined) lines.push({ kind: el.type, text: el.text, line: el.line, notes: this.notesIn(el, el.text) });
        continue;
      }
      flush();
      extrasBefore(el.line);

      switch (el.type) {
        case "section": {
          const act = (el.depth ?? 1) === 1;
          const upper = act || this.style.scene.uppercaseSections;
          const underline = act ? this.style.act.underline : this.style.scene.underline;
          const title = upper ? el.text.toUpperCase() : el.text;
          const block = this.plain(title, act ? "act" : "scene", underline, this.notesIn(el, title));
          if (act && story.length > 0 && !fresh) story.push(PAGE_BREAK);
          heading(block, el.text.toUpperCase(), el.line);
          break;
        }
        case "scene_heading":
          heading(...this.sceneHeading(el), el.line);
          break;
        case "action":
          add(this.para(inlineSpans(el.text, {}, this.notesIn(el, el.text)), "action"), el.line);
          break;
        case "preface":
          add(this.para(inlineSpans(el.text, {}, this.notesIn(el, el.text)), "preface"), el.line);
          break;
        case "preface_list_item":
          add(this.para(inlineSpans(el.text, {}, this.notesIn(el, el.text)), "prefaceList", el.marker ?? "•"), el.line);
          break;
        case "transition": {
          const upper = el.text.toUpperCase();
          add(this.para(inlineSpans(upper, {}, this.notesIn(el, upper)), "transition"), el.line);
          break;
        }
        case "centered":
          add(this.para(inlineSpans(el.text, {}, this.notesIn(el, el.text)), "centered"), el.line);
          break;
        case "page_break":
          if (!fresh) {
            story.push(PAGE_BREAK);
            fresh = true;
          }
          break;
      }
    }
    flush();
    extrasBefore(Infinity);
    return story;
  }

  private sceneHeading(el: ScriptElement): [Block, string] {
    const heading = el.text.toUpperCase();
    const { position, format, inHeader } = this.style.sceneNumbers;
    let display = heading;
    let shift = 0;
    if (el.sceneNumber && position !== "hide") {
      const number = format.split("{n}").join(el.sceneNumber);
      display = position === "before" ? `${number} ${heading}` : `${heading} ${number}`;
      if (position === "before") shift = number.length + 1;
    }
    const notes = this.notesIn(el, display, shift);
    const spans = inlineSpans(display, { underline: this.style.scene.underline || undefined }, notes);
    return [this.para(spans, "scene"), inHeader ? display : heading];
  }
}

/** The title-page values that print. */
function titleValues(script: ParsedScript): Record<string, string[]> {
  const values = { ...script.titleValues };
  delete values.style;
  return values;
}

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

export function toRoman(n: number): string {
  let out = "";
  for (const [value, symbol] of ROMAN) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

export function layoutScript(script: ParsedScript, style: PlayStyle, fonts: FontSet, options: LayoutOptions = {}): LayoutDocument {
  const builder = new StoryBuilder(style, fonts, options);
  const { width, height, margins } = style.page;
  const result = flow(builder.build(script), {
    left: margins.left,
    bottom: margins.bottom,
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom,
  });

  const values = titleValues(script);
  const hasTitlePage = Object.keys(values).length > 0;

  // Page furniture, from where the body starts and which scene each page is in. Pages count from 1 here.
  let bodyStart: number | undefined;
  const sceneEvents: { page: number; scene: string }[] = [];
  for (const { page, marks } of result.marks) {
    if (marks.bodyStart && bodyStart === undefined) bodyStart = page + 1;
    if (marks.scene !== undefined) sceneEvents.push({ page: page + 1, scene: marks.scene });
  }
  const playTitle = join(values.title).toUpperCase();
  const { pagination } = style;
  let scene = "";
  let event = 0;
  const pageNumbers: (string | undefined)[] = [];

  result.pages.forEach((page, i) => {
    const n = i + 1;
    while (event < sceneEvents.length && sceneEvents[event].page <= n) scene = sceneEvents[event++].scene;

    let number: string | undefined;
    if (pagination.fromBody) {
      if (bodyStart !== undefined && n >= bodyStart) number = String(n - bodyStart + 1);
      else if (pagination.prefaceRoman && (n > 1 || !hasTitlePage)) number = toRoman(n - (hasTitlePage ? 2 : 1) + 1);
    } else if (n > 1 || !hasTitlePage) {
      number = String(n);
    }
    pageNumbers.push(number);
    if (number !== undefined) {
      const text = fonts.clean(pagination.format.split("{n}").join(number));
      const w = fonts.width(text, pagination.face, pagination.size);
      const y = pagination.position === "top" ? height - margins.top / 2 : margins.bottom / 2;
      const x = pagination.alignment === "left" ? margins.left : pagination.alignment === "right" ? width - margins.right - w : width / 2 - w / 2;
      page.texts.push({ x, y, text, face: pagination.face, size: pagination.size, color: BLACK });
    }

    if (style.header.strap && playTitle && bodyStart !== undefined && n >= bodyStart) {
      drawCentered(page, fonts, width, height - margins.top + margins.top / 3, [
        [playTitle, "bold"],
        ...(scene ? ([[" | ", "regular"], [scene, "regular"]] as [string, Face][]) : []),
      ], style.text.size);
    }
  });

  const watermark = options.watermark?.trim();
  if (watermark) {
    const item = watermarkItem(watermark, style, fonts);
    for (const page of result.pages) page.texts.unshift({ ...item });
  }

  return {
    width,
    height,
    title: join(values.title) || "Untitled",
    author: join(values.author),
    pages: result.pages,
    placements: result.placements,
    pageNumbers,
  };
}

/** Watermark text, as large as fits the page (up to the style's largest size) and centred on it. */
function watermarkItem(watermark: string, style: PlayStyle, fonts: FontSet): TextItem {
  const { face, color, opacity, angle, maxSize } = style.watermark;
  const { width, height } = style.page;
  const text = fonts.clean(watermark);
  const unit = fonts.width(text, face, 1);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // The rotated text's bounding box fits within the middle 80% of the page.
  const fit = Math.min((0.8 * width) / (unit * Math.abs(cos) + Math.abs(sin)), (0.8 * height) / (unit * Math.abs(sin) + Math.abs(cos)));
  const size = Math.min(maxSize, fit);
  // The text is drawn from the left end of its baseline: step back from the
  // page's centre by half its length, and down by about half a capital's height.
  const half = (unit * size) / 2;
  const lift = 0.35 * size;
  return {
    x: width / 2 - (half * cos - lift * sin),
    y: height / 2 - (half * sin + lift * cos),
    text,
    face,
    size,
    color,
    rotate: angle,
    opacity,
  };
}

function drawCentered(page: LayoutPage, fonts: FontSet, pageWidth: number, y: number, segments: [string, Face][], size: number) {
  const cleaned = segments.map(([text, face]) => [fonts.clean(text), face] as const);
  const total = cleaned.reduce((sum, [text, face]) => sum + fonts.width(text, face, size), 0);
  let x = (pageWidth - total) / 2;
  for (const [text, face] of cleaned) {
    page.texts.push({ x, y, text, face, size, color: BLACK });
    x += fonts.width(text, face, size);
  }
}
