/**
 * Lays out a parsed script in a house style. A port of fountain2pdf's
 * engine.py: it turns script elements into blocks (the "story"), flows them
 * onto pages, then adds page numbers and the running header. Every layout
 * choice comes from the style; nothing here knows about any one style.
 */

import type { ParsedScript, ScriptElement } from "../fountain/parser";
import { parseInline } from "../fountain/inline";
import { PAGE_BREAK, Spacer, Speech, TableRow, type Block, type SpeechContext, type StoryItem } from "./blocks";
import { flow } from "./flow";
import type { FontSet } from "./fonts";
import type { LayoutDocument, LayoutPage } from "./model";
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
  | "centered";

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
  };
}

/** Fountain emphasis and links as spans, with `extra` applied throughout. */
export function inlineSpans(text: string, extra: Partial<Span> = {}): Span[] {
  return parseInline(text).runs.map((run) => {
    const span: Span = {
      text: text.slice(run.from, run.to),
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
    return span;
  });
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

type SpeechLine = { kind: "parenthetical" | "dialogue"; text: string };

class StoryBuilder {
  readonly styles: Record<StyleName, ParaStyle>;
  /** Width inside the margins. Tables span this, 12pt wider than the text frame, as in fountain2pdf. */
  readonly available: number;

  constructor(
    readonly style: PlayStyle,
    readonly fonts: FontSet,
  ) {
    this.styles = paragraphStyles(style);
    this.available = style.page.width - style.page.margins.left - style.page.margins.right;
  }

  para(spans: Span[], name: StyleName, bullet?: string): Paragraph {
    return Paragraph.of(spans, this.styles[name], this.fonts, bullet);
  }

  plain(text: string, name: StyleName, underline = false): Paragraph {
    return this.para([{ text, underline }], name);
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
    return inlineSpans(line.text, { italic: line.kind === "parenthetical" && this.style.parenthetical.italic });
  }

  /** Name and first line side by side in a table row, later lines indented to match. */
  private sharedLineParts(name: string, lines: SpeechLine[]): Block[] {
    const nameBlock = this.para(inlineSpans(name), "character");
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
    const parts: Block[] = [
      new TableRow([
        { content: nameBlock, width: nameColumnWidth, paddingLeft: 0 },
        { content: this.para(first, "dialogue"), width: this.available - nameColumnWidth, paddingLeft: gutter },
      ]),
    ];
    for (const line of lines.slice(consumed)) {
      parts.push(this.para(this.lineSpans(line), line.kind === "parenthetical" ? "parentheticalContinued" : "dialogueContinued"));
    }
    return parts;
  }

  /** Name on a line of its own, then each line of the speech. */
  private ownLineParts(name: string, lines: SpeechLine[]): Block[] {
    let nameSpans = inlineSpans(name);
    let consumed = 0;
    if (this.style.character.shortParentheticalInline && lines[0]?.kind === "parenthetical") {
      const word = shortParentheticalWord(lines[0].text);
      if (word !== undefined) {
        nameSpans = [...nameSpans, { text: " (" }, ...inlineSpans(word), { text: ")" }];
        consumed = 1;
      }
    }
    const parts: Block[] = [this.para(nameSpans, "character")];
    for (const line of lines.slice(consumed)) {
      parts.push(this.para(inlineSpans(line.text), line.kind === "parenthetical" ? "parenthetical" : "dialogue"));
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

  speech(name: string, lines: SpeechLine[]): Block[] {
    const ownLine = this.style.character.ownLine;
    const parts = ownLine ? this.ownLineParts(name, lines) : this.sharedLineParts(name, lines);
    const gap = this.style.speech.gap;
    if (this.style.speech.moreContinued) {
      return [new Speech(name, parts, this.speechContext(), ownLine ? 2 : 1, gap)];
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
    let lines: SpeechLine[] = [];
    let bodyMarked = false;
    const flush = () => {
      if (speaker === undefined) return;
      story.push(...this.speech(speaker, lines));
      speaker = undefined;
      lines = [];
      fresh = false;
    };
    const heading = (block: Block, scene: string) => {
      block.marks = { scene, bodyStart: !bodyMarked || undefined };
      bodyMarked = true;
      story.push(block);
      fresh = false;
    };
    const add = (block: Block) => {
      story.push(block);
      fresh = false;
    };

    for (const el of script.elements) {
      if (el.type === "character") {
        flush();
        speaker = el.text.toUpperCase();
        if (el.dual && this.style.speech.dualLabel) speaker += ` ${this.style.speech.dualLabel}`;
        continue;
      }
      if (el.type === "parenthetical" || el.type === "dialogue") {
        // A stray line with no character before it is dropped, as in fountain2pdf.
        if (speaker !== undefined) lines.push({ kind: el.type, text: el.text });
        continue;
      }
      flush();

      switch (el.type) {
        case "section": {
          const act = (el.depth ?? 1) === 1;
          const upper = act || this.style.scene.uppercaseSections;
          const underline = act ? this.style.act.underline : this.style.scene.underline;
          const block = this.plain(upper ? el.text.toUpperCase() : el.text, act ? "act" : "scene", underline);
          if (act && story.length > 0 && !fresh) story.push(PAGE_BREAK);
          heading(block, el.text.toUpperCase());
          break;
        }
        case "scene_heading":
          heading(...this.sceneHeading(el));
          break;
        case "action":
          add(this.para(inlineSpans(el.text), "action"));
          break;
        case "preface":
          add(this.para(inlineSpans(el.text), "preface"));
          break;
        case "preface_list_item":
          add(this.para(inlineSpans(el.text), "prefaceList", el.marker ?? "•"));
          break;
        case "transition":
          add(this.para(inlineSpans(el.text.toUpperCase()), "transition"));
          break;
        case "centered":
          add(this.para(inlineSpans(el.text), "centered"));
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
    return story;
  }

  private sceneHeading(el: ScriptElement): [Block, string] {
    const heading = el.text.toUpperCase();
    const { position, format, inHeader } = this.style.sceneNumbers;
    let display = heading;
    if (el.sceneNumber && position !== "hide") {
      const number = format.split("{n}").join(el.sceneNumber);
      display = position === "before" ? `${number} ${heading}` : `${heading} ${number}`;
    }
    const spans = inlineSpans(display, { underline: this.style.scene.underline || undefined });
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

export function layoutScript(script: ParsedScript, style: PlayStyle, fonts: FontSet): LayoutDocument {
  const builder = new StoryBuilder(style, fonts);
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

  return {
    width,
    height,
    title: join(values.title) || "Untitled",
    author: join(values.author),
    pages: result.pages,
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
