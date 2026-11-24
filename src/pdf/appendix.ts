/**
 * Linked notes appended after the script: each note under its title, its
 * Markdown laid out in the script's font. The style's `appendix` group sets
 * the titles and whether each note starts a page.
 */

import { targetName } from "../fountain/links";
import { PAGE_BREAK, Spacer, TableRow, type Block, type Cell, type StoryItem } from "./blocks";
import type { FontSet } from "./fonts";
import type { MdAlign, MdBlock, MdSpan } from "./markdown";
import type { ImageData, LayoutPage } from "./model";
import { Paragraph, paraStyle, type ParaStyle, type Span } from "./paragraph";
import type { PlayStyle, Rgb } from "./style";

/** A note to append: its title and its Markdown, embeds already filled in and pictures found. */
export interface AppendixNote {
  title: string;
  blocks: MdBlock[];
}

export interface Appendix {
  notes: AppendixNote[];
  /** Pictures by the `src` their image blocks have. */
  images: Record<string, ImageData>;
}

const LINK_COLOR: Rgb = [0, 0, 1];
const MUTED: Rgb = [0.35, 0.35, 0.35];
const RULE_COLOR: Rgb = [0.6, 0.6, 0.6];
/** How far each level of a list or quote is indented. */
const INDENT = 18;
/** Heading sizes over the body size, for `#` to `######`. */
const HEADING_STEPS = [4, 3, 2, 1, 0, 0];
/** Space either side of a table cell's text. */
const CELL_PADDING = 6;
/** Points per pixel, taking pictures as 96 pixels to the inch. */
const POINTS_PER_PIXEL = 0.75;

/** A line across the text, for a Markdown rule or under a table's header. */
class RuleBlock implements Block {
  spaceBefore: number;
  spaceAfter: number;
  private width = 0;

  constructor(
    private readonly indent: number,
    private readonly height: number,
    space: number,
    /** How long the line is, if not across the text: under a table's header, the table's width. */
    private readonly length?: number,
  ) {
    this.spaceBefore = space;
    this.spaceAfter = space;
  }

  wrap(availWidth: number): number {
    this.width = Math.min(this.length ?? Infinity, availWidth - this.indent);
    return this.height;
  }

  split(): Block[] {
    return [];
  }

  draw(page: LayoutPage, x: number, y: number): void {
    page.rules.push({ x1: x + this.indent, x2: x + this.indent + this.width, y: y + this.height / 2, width: 0.5, color: RULE_COLOR });
  }
}

/** A picture, as wide as it asks to be (or its own size) but no wider than the text or taller than `maxHeight`. */
class ImageBlock implements Block {
  spaceBefore = 6;
  spaceAfter = 6;
  private w = 0;
  private h = 0;

  constructor(
    private readonly src: string,
    private readonly image: ImageData,
    private readonly indent: number,
    private readonly maxHeight: number,
    private readonly requested?: number,
  ) {}

  wrap(availWidth: number): number {
    const natural = (this.requested ?? this.image.width) * POINTS_PER_PIXEL;
    this.w = Math.max(1, Math.min(natural, availWidth - this.indent));
    this.h = (this.w * this.image.height) / this.image.width;
    if (this.h > this.maxHeight) {
      this.w *= this.maxHeight / this.h;
      this.h = this.maxHeight;
    }
    return this.h;
  }

  split(): Block[] {
    return [];
  }

  draw(page: LayoutPage, x: number, y: number): void {
    (page.images ??= []).push({ x: x + this.indent, y, width: this.w, height: this.h, src: this.src });
  }
}

const plainText = (spans: MdSpan[]) => spans.map((s) => s.text).join("");

class AppendixBuilder {
  private readonly size: number;
  private readonly leading: number;

  constructor(
    private readonly style: PlayStyle,
    private readonly fonts: FontSet,
    private readonly images: Record<string, ImageData>,
    /** The width blocks are laid out at. */
    private readonly width: number,
    private readonly maxHeight: number,
  ) {
    this.size = style.text.size;
    this.leading = style.text.leading;
  }

  private body(extra: Partial<ParaStyle> = {}): ParaStyle {
    return paraStyle({ face: "regular", size: this.size, leading: this.leading, ...extra });
  }

  private spans(md: MdSpan[], extra: Partial<Span> = {}): Span[] {
    return md.map((s) => {
      const span: Span = { text: s.text, bold: s.bold || extra.bold, italic: s.italic || extra.italic, color: extra.color };
      if (s.link) {
        span.link = s.link;
        span.color = LINK_COLOR;
        span.underline = true;
      }
      return span;
    });
  }

  title(text: string): Block {
    const { titleSize, titleBold, titleAlignment } = this.style.appendix;
    const style = paraStyle({
      face: titleBold ? "bold" : "regular",
      size: titleSize,
      leading: Math.max(this.leading, titleSize * 1.2),
      alignment: titleAlignment,
      spaceAfter: 12,
    });
    const block: Block = Paragraph.of([{ text }], style, this.fonts);
    // The running header shows no scene over the notes.
    block.marks = { scene: "" };
    return block;
  }

  /** Blocks for Markdown, `indent` in from the left. `color` tints the text, for quotes. */
  blocks(md: MdBlock[], indent: number, color?: Rgb, bullet?: { marker: string; at: number }): Block[] {
    const out: Block[] = [];
    md.forEach((block, i) => {
      // A list item's marker goes on its first paragraph.
      const marker = i === 0 ? bullet : undefined;
      switch (block.kind) {
        case "heading": {
          const size = this.size + HEADING_STEPS[block.level - 1];
          const style = this.body({ face: "bold", size, leading: Math.max(this.leading, size * 1.2), leftIndent: indent, spaceBefore: 12, spaceAfter: 6, color: color ?? [0, 0, 0] });
          out.push(Paragraph.of(this.spans(block.spans), style, this.fonts));
          break;
        }
        case "paragraph":
          block.lines.forEach((line, n) => {
            const last = n === block.lines.length - 1;
            const style = this.body({
              leftIndent: indent,
              color: color ?? [0, 0, 0],
              spaceAfter: last ? (bullet ? 2 : 6) : 0,
              bulletIndent: marker && n === 0 ? marker.at : 0,
            });
            out.push(Paragraph.of(this.spans(line), style, this.fonts, marker && n === 0 ? marker.marker : undefined));
          });
          break;
        case "list":
          for (const item of block.items) out.push(...this.blocks(item.blocks, indent + INDENT, color, { marker: item.marker, at: indent }));
          out.push(new Spacer(4, true));
          break;
        case "quote":
          if (block.title) out.push(Paragraph.of(this.spans(block.title, { bold: true }), this.body({ leftIndent: indent + INDENT, spaceAfter: 2, color: MUTED }), this.fonts));
          out.push(...this.blocks(block.blocks, indent + INDENT, MUTED));
          break;
        case "rule":
          out.push(new RuleBlock(indent, this.leading, 4));
          break;
        case "code":
          block.lines.forEach((line, n) => {
            if (line.trim() === "") {
              out.push(new Spacer(this.leading));
              return;
            }
            const lead = /^\s*/.exec(line)![0].replace(/\t/g, "    ").length * this.fonts.width(" ", "regular", this.size);
            const style = this.body({ leftIndent: indent + INDENT / 2 + lead, color: MUTED, spaceAfter: n === block.lines.length - 1 ? 6 : 0 });
            out.push(Paragraph.of([{ text: line.trim() }], style, this.fonts));
          });
          break;
        case "table":
          out.push(...this.table(block.align, block.header, block.rows, indent));
          break;
        case "image": {
          const image = block.src ? this.images[block.src] : undefined;
          if (image && block.src) out.push(new ImageBlock(block.src, image, indent, this.maxHeight, block.width));
          else out.push(this.missing(block.alt || targetName(block.target), indent));
          break;
        }
        case "embed":
          out.push(this.missing(targetName(block.target), indent));
          break;
      }
    });
    return out;
  }

  /** A stand-in for a picture or note that couldn't be included. */
  private missing(name: string, indent: number): Paragraph {
    return Paragraph.of([{ text: `[${name}]`, italic: true }], this.body({ leftIndent: indent, color: MUTED, spaceAfter: 6 }), this.fonts);
  }

  private table(align: MdAlign[], header: MdSpan[][], rows: MdSpan[][][], indent: number): Block[] {
    const room = this.width - indent;
    const natural = align.map((_, c) => {
      const cells = [header[c], ...rows.map((r) => r[c])];
      return Math.max(
        ...cells.map((cell, n) => this.fonts.width(this.fonts.clean(plainText(cell ?? [])), n === 0 ? "bold" : "regular", this.size)),
      ) + 2 * CELL_PADDING;
    });
    const total = natural.reduce((a, b) => a + b, 0);
    // Columns as wide as their widest cell, squeezed in proportion if the table is too wide.
    const widths = total <= room ? natural : natural.map((w) => (w * room) / total);
    const row = (cells: MdSpan[][], bold: boolean) => {
      const content: Cell[] = indent > 0 ? [{ content: Paragraph.of([], this.body(), this.fonts), width: indent, paddingLeft: 0 }] : [];
      cells.forEach((cell, c) => {
        const style = this.body({ alignment: align[c], rightIndent: CELL_PADDING });
        content.push({ content: Paragraph.of(this.spans(cell, { bold }), style, this.fonts), width: widths[c], paddingLeft: CELL_PADDING });
      });
      return new TableRow(content, 4);
    };
    const out: Block[] = [row(header, true), new RuleBlock(indent, 4, 0, widths.reduce((a, b) => a + b, 0))];
    for (const r of rows) out.push(row(r, false));
    const last = out[out.length - 1];
    last.spaceAfter = 8;
    out[0].spaceBefore = 6;
    return out;
  }
}

/**
 * The appendix as blocks to flow after the script: each note under its
 * title, on a page of its own if the style says so. `width` is the text
 * frame's width, and pictures are kept below `maxHeight`.
 */
export function appendixStory(appendix: Appendix, style: PlayStyle, fonts: FontSet, width: number, maxHeight: number): StoryItem[] {
  const builder = new AppendixBuilder(style, fonts, appendix.images, width, maxHeight);
  const story: StoryItem[] = [];
  appendix.notes.forEach((note, i) => {
    if (i > 0) {
      if (style.appendix.pagePerNote) story.push(PAGE_BREAK);
      else story.push(new Spacer(2 * style.text.leading, true));
    }
    story.push(builder.title(note.title), ...builder.blocks(note.blocks, 0));
  });
  return story;
}
