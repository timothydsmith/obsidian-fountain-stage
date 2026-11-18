/**
 * Paragraphs: styled text broken into lines. Follows reportlab's Paragraph,
 * which fountain2pdf used, so pages break in the same places: whitespace
 * collapses, lines break greedily between words (a line may run over by up to
 * 5% of its spaces' width), and a paragraph splits across pages only if at
 * least two lines stay behind.
 */

import type { Block } from "./blocks";
import type { FontSet } from "./fonts";
import type { LayoutPage } from "./model";
import type { Alignment, Face, Rgb } from "./style";

/** A run of text with inline emphasis. */
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: Rgb;
  link?: string;
}

export interface ParaStyle {
  face: Face;
  size: number;
  leading: number;
  alignment: Alignment;
  leftIndent: number;
  rightIndent: number;
  spaceBefore: number;
  spaceAfter: number;
  color: Rgb;
}

export const BLACK: Rgb = [0, 0, 0];

export function paraStyle(style: Pick<ParaStyle, "face" | "size" | "leading"> & Partial<ParaStyle>): ParaStyle {
  return { alignment: "left", leftIndent: 0, rightIndent: 0, spaceBefore: 0, spaceAfter: 0, color: BLACK, ...style };
}

/** reportlab's spaceShrinkage: how far a line may overrun, as a fraction of its spaces' width. */
const SPACE_SHRINKAGE = 0.05;
/** reportlab's underline position, as a fraction of the font size below the baseline. */
const UNDERLINE_OFFSET = 0.125;
const UNDERLINE_WIDTH = 1;
/** reportlab's fuzz for layout arithmetic. */
export const FUZZ = 1e-6;

interface Piece {
  text: string;
  face: Face;
  color: Rgb;
  underline: boolean;
  link?: string;
  width: number;
}

interface Word {
  pieces: Piece[];
  width: number;
  /** Width of the space after the word, in the font of its last piece. */
  spaceWidth: number;
}

interface Line {
  words: Word[];
  width: number;
}

export function combineFace(base: Face, bold = false, italic = false): Face {
  const b = bold || base === "bold" || base === "boldItalic";
  const i = italic || base === "italic" || base === "boldItalic";
  return b && i ? "boldItalic" : b ? "bold" : i ? "italic" : "regular";
}

function sameLook(a: Piece, b: Piece): boolean {
  return a.face === b.face && a.underline === b.underline && a.link === b.link && a.color.every((c, i) => c === b.color[i]);
}

/** Splits spans into words. Whitespace separates words and is otherwise dropped. */
function toWords(spans: Span[], style: ParaStyle, fonts: FontSet): Word[] {
  const words: Word[] = [];
  let pieces: Piece[] = [];
  const endWord = () => {
    if (pieces.length === 0) return;
    const last = pieces[pieces.length - 1];
    words.push({
      pieces,
      width: pieces.reduce((sum, p) => sum + p.width, 0),
      spaceWidth: fonts.width(" ", last.face, style.size),
    });
    pieces = [];
  };
  for (const span of spans) {
    const face = combineFace(style.face, span.bold, span.italic);
    const look = { face, color: span.color ?? style.color, underline: !!span.underline, link: span.link };
    for (const token of fonts.clean(span.text).split(/(\s+)/)) {
      if (token === "") continue;
      if (/^\s/.test(token)) endWord();
      else pieces.push({ ...look, text: token, width: fonts.width(token, face, style.size) });
    }
  }
  endWord();
  return words;
}

/** Splits a word too wide for any line into pieces, the first filling `firstRoom`, the rest `room`. */
function splitLongWord(word: Word, firstRoom: number, room: number, style: ParaStyle, fonts: FontSet): Word[] {
  const out: Word[] = [];
  let pieces: Piece[] = [];
  let width = 0;
  let limit = firstRoom;
  const flush = () => {
    out.push({ pieces, width, spaceWidth: 0 });
    pieces = [];
    width = 0;
    limit = room;
  };
  for (const piece of word.pieces) {
    let text = "";
    let textWidth = 0;
    for (const ch of piece.text) {
      const w = fonts.width(ch, piece.face, style.size);
      if (width + textWidth + w > limit && (width + textWidth > 0 || limit < room)) {
        if (text) pieces.push({ ...piece, text, width: textWidth });
        width += textWidth;
        flush();
        text = "";
        textWidth = 0;
      }
      text += ch;
      textWidth += w;
    }
    if (text) pieces.push({ ...piece, text, width: textWidth });
    width += textWidth;
  }
  out.push({ pieces, width, spaceWidth: word.spaceWidth });
  return out.filter((w) => w.pieces.length > 0);
}

/** Greedy line breaking, as reportlab does it. `maxWidths[i]` is line i's width; the last repeats. */
function breakLines(input: Word[], maxWidths: number[], style: ParaStyle, fonts: FontSet): Line[] {
  const words = input.slice();
  const lines: Line[] = [];
  const widthOf = (n: number) => maxWidths[Math.min(n, maxWidths.length - 1)];
  let line: Word[] = [];
  let lineWidth = 0;
  let spaces = 0;
  const forced = new Set<Word>();
  const endLine = () => {
    lines.push({ words: line, width: lineWidth });
    line = [];
    lineWidth = 0;
    spaces = 0;
  };

  while (words.length > 0) {
    const word = words.shift()!;
    const maxWidth = widthOf(lines.length);
    const gap = line.length > 0 ? line[line.length - 1].spaceWidth : 0;
    const newWidth = line.length > 0 ? lineWidth + gap + word.width : word.width;
    const limit = maxWidth + SPACE_SHRINKAGE * (spaces + gap);
    if (newWidth > limit && !forced.has(word)) {
      if (word.width > maxWidth) {
        const room = line.length > 0 ? maxWidth - lineWidth - gap : maxWidth;
        const parts = splitLongWord(word, room, widthOf(lines.length + 1), style, fonts);
        // Every part but the last ends its line.
        parts.slice(0, -1).forEach((p) => forced.add(p));
        words.unshift(...parts);
        forced.add(parts[parts.length - 1]);
        continue;
      }
      if (line.length > 0) endLine();
      line = [word];
      lineWidth = word.width;
      continue;
    }
    const breakAfter = forced.has(word) && word.spaceWidth === 0;
    line.push(word);
    lineWidth = newWidth;
    spaces += line.length > 1 ? gap : 0;
    if (breakAfter) endLine();
  }
  if (line.length > 0) endLine();
  return lines;
}

export class Paragraph implements Block {
  spaceBefore: number;
  spaceAfter: number;
  private lines?: Line[];
  private wrappedWidth = -1;
  private width = 0;

  constructor(
    private readonly words: Word[],
    readonly style: ParaStyle,
    private readonly fonts: FontSet,
    /** A list marker hung to the left of the first line. */
    private readonly bullet?: string,
    /** Lines already broken, for the first half of a split paragraph. */
    fixedLines?: Line[],
  ) {
    this.spaceBefore = style.spaceBefore;
    this.spaceAfter = style.spaceAfter;
    if (fixedLines) this.lines = fixedLines;
  }

  static of(spans: Span[], style: ParaStyle, fonts: FontSet, bullet?: string): Paragraph {
    return new Paragraph(toWords(spans, style, fonts), style, fonts, bullet ? fonts.clean(bullet) : undefined);
  }

  /** How far a bullet overruns the left indent, which pushes the first line right. */
  private bulletOverrun(): number {
    if (!this.bullet) return 0;
    const { face, size, leftIndent } = this.style;
    const end = this.fonts.width(this.bullet, combineFace(face), size) + 0.6 * size;
    return Math.max(0, end - leftIndent);
  }

  private maxWidth(availWidth: number): number {
    return availWidth - this.style.leftIndent - this.style.rightIndent;
  }

  private layoutLines(availWidth: number): Line[] {
    if (this.lines && (this.wrappedWidth === availWidth || this.wrappedWidth === -1)) {
      this.wrappedWidth = availWidth;
      return this.lines;
    }
    const max = this.maxWidth(availWidth);
    this.lines = breakLines(this.words, [max - this.bulletOverrun(), max], this.style, this.fonts);
    this.wrappedWidth = availWidth;
    return this.lines;
  }

  wrap(availWidth: number): number {
    this.width = availWidth;
    return this.layoutLines(availWidth).length * this.style.leading;
  }

  split(availWidth: number, availHeight: number): Block[] {
    if (this.words.length === 0 || availWidth < FUZZ || availHeight < FUZZ) return [];
    const lines = this.layoutLines(availWidth);
    const s = Math.floor(availHeight / this.style.leading);
    // No orphans: at least two lines must stay on this page. Widows are allowed.
    if (s <= 1) return [];
    if (lines.length <= s) return [this];
    const head = new Paragraph(lines.slice(0, s).flatMap((l) => l.words), this.style, this.fonts, this.bullet, lines.slice(0, s));
    head.wrappedWidth = availWidth;
    const tail = new Paragraph(lines.slice(s).flatMap((l) => l.words), this.style, this.fonts);
    return [head, tail];
  }

  draw(page: LayoutPage, x: number, y: number): void {
    const lines = this.layoutLines(this.width);
    const { size, leading, alignment, leftIndent, face, color } = this.style;
    const top = y + lines.length * leading;
    const max = this.maxWidth(this.width);
    const overrun = this.bulletOverrun();

    if (this.bullet && lines.length > 0) {
      page.texts.push({ x, y: top - size, text: this.bullet, face: combineFace(face), size, color });
    }

    lines.forEach((line, i) => {
      const baseline = top - size - i * leading;
      const lineMax = i === 0 ? max - overrun : max;
      const extra = lineMax - line.width;
      let cx = x + leftIndent + (i === 0 ? overrun : 0);
      // A line that runs over (by at most 5% of its spaces) has its spaces narrowed to fit.
      const spaces = line.words.length - 1;
      const tighten = extra < -1e-8 && spaces > 0 ? extra / spaces : 0;
      if (tighten === 0) {
        if (alignment === "center") cx += extra / 2;
        else if (alignment === "right") cx += extra;
      }

      // Runs of words that look the same are drawn as one piece of text, spaces included.
      interface Run extends Omit<Piece, "width"> {
        x: number;
        width: number;
        trailing: number;
      }
      const runs: Run[] = [];
      line.words.forEach((word, wi) => {
        const last = wi === line.words.length - 1;
        word.pieces.forEach((piece, pi) => {
          const prev = runs[runs.length - 1];
          // Narrowed spaces can't be drawn as part of the text, so each word is placed on its own.
          const newWord = pi === 0 && wi > 0 && tighten !== 0;
          if (prev && !newWord && sameLook(prev, piece)) {
            prev.text += piece.text;
            prev.width += piece.width;
            prev.trailing = 0;
          } else {
            runs.push({ ...piece, x: cx, trailing: 0 });
          }
          cx += piece.width;
          if (!last && pi === word.pieces.length - 1) {
            const run = runs[runs.length - 1];
            const space = word.spaceWidth + tighten;
            run.text += " ";
            run.width += space;
            run.trailing = space;
            cx += space;
          }
        });
      });

      for (const run of runs) {
        page.texts.push({ x: run.x, y: baseline, text: run.text.trimEnd(), face: run.face, size, color: run.color });
        const inkWidth = run.width - run.trailing;
        if (run.underline) {
          const uy = baseline - UNDERLINE_OFFSET * size;
          page.rules.push({ x1: run.x, x2: run.x + inkWidth, y: uy, width: UNDERLINE_WIDTH, color: run.color });
        }
        if (run.link) {
          page.links.push({ x: run.x, y: baseline - 0.2 * size, width: inkWidth, height: size * 1.2, url: run.link });
        }
      }
    });
  }
}
