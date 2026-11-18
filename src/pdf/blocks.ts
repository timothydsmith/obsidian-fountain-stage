/**
 * The pieces a script is laid out from, stacked down the page by flow.ts.
 * Like reportlab's flowables: each knows its height at a given width and how
 * to split itself across a page break, but not where it will land.
 */

import type { LayoutPage } from "./model";
import type { Paragraph } from "./paragraph";

export interface Block {
  /** Space wanted above, dropped at the top of a page. */
  spaceBefore: number;
  /** Space wanted below. The next block's spaceBefore overlaps it rather than adding to it. */
  spaceAfter: number;
  /** Lays the block out at this width and returns its height. */
  wrap(availWidth: number, atTop: boolean): number;
  /**
   * Splits the block so the first part fits in `availHeight`. Returns no
   * parts if nothing fits, which moves the whole block to the next page.
   */
  split(availWidth: number, availHeight: number): Block[];
  /** Draws the block with its bottom left corner at (x, y). Called after wrap. */
  draw(page: LayoutPage, x: number, y: number): void;
  /** Running-header and pagination markers, noted when the block is placed. */
  marks?: Marks;
}

export interface Marks {
  /** The scene this block starts, for the running header. */
  scene?: string;
  /** The first act or scene, where page numbering starts. */
  bodyStart?: boolean;
}

/** Ends the page. */
export const PAGE_BREAK = Symbol("page break");
export type StoryItem = Block | typeof PAGE_BREAK;

/** Fixed vertical space. A collapsing spacer takes no space at the top of a page. */
export class Spacer implements Block {
  spaceBefore = 0;
  spaceAfter = 0;

  constructor(
    private readonly height: number,
    private readonly collapsing = false,
  ) {}

  wrap(_availWidth: number, atTop: boolean): number {
    return this.collapsing && atTop ? 0 : this.height;
  }

  split(): Block[] {
    return [];
  }

  draw(): void {}
}

export interface Cell {
  content: Paragraph;
  width: number;
  paddingLeft: number;
}

/**
 * A row of fixed-width columns, top-aligned, which never splits. Used for a
 * name beside its first line of dialogue, or beside its description.
 */
export class TableRow implements Block {
  spaceBefore = 0;
  spaceAfter = 0;
  private heights: number[] = [];
  private height = 0;

  constructor(
    private readonly cells: Cell[],
    private readonly paddingBottom = 0,
  ) {}

  wrap(): number {
    this.heights = this.cells.map((c) => c.content.wrap(c.width - c.paddingLeft));
    this.height = Math.max(0, ...this.heights) + this.paddingBottom;
    return this.height;
  }

  split(): Block[] {
    return [];
  }

  draw(page: LayoutPage, x: number, y: number): void {
    const top = y + this.height;
    let cx = x;
    this.cells.forEach((cell, i) => {
      cell.content.draw(page, cx + cell.paddingLeft, top - this.heights[i]);
      cx += cell.width;
    });
  }
}

export interface SpeechContext {
  /** Makes the "(MORE)" line put at the foot of a page when a speech breaks. */
  more(): Block;
  /** Makes the repeated "NAME (CONT'D)" that starts the rest of a broken speech, or undefined if the style doesn't mark breaks. */
  continued(name: string): Block | undefined;
}

/**
 * A character's speech: the name and its lines, which can break across a
 * page only between parts, with a "(MORE)" / "NAME (CONT'D)" cue. The first
 * `minLead` parts always stay together, so a name is never left alone at the
 * foot of a page.
 */
export class Speech implements Block {
  spaceBefore = 0;
  private heights: number[] = [];
  private readonly minLead: number;

  constructor(
    private readonly name: string,
    private readonly parts: Block[],
    private readonly context: SpeechContext,
    minLead: number,
    public spaceAfter = 0,
  ) {
    this.minLead = Math.min(minLead, parts.length);
  }

  wrap(availWidth: number): number {
    this.heights = this.parts.map((p) => p.wrap(availWidth, false));
    return this.heights.reduce((a, b) => a + b, 0);
  }

  split(availWidth: number, availHeight: number): Block[] {
    this.wrap(availWidth);
    const more = this.context.more();
    const budget = availHeight - more.wrap(availWidth, false);
    let used = this.heights.slice(0, this.minLead).reduce((a, b) => a + b, 0);
    if (this.heights.length === 0 || used > budget) return [];

    let fitted = this.minLead;
    while (fitted < this.parts.length && used + this.heights[fitted] <= budget) {
      used += this.heights[fitted];
      fitted++;
    }
    if (fitted === this.parts.length) return [];

    let rest = this.parts.slice(fitted);
    let restLead = this.minLead;
    const cue = this.context.continued(this.name);
    if (cue) {
      rest = [cue, ...rest];
      restLead = Math.min(2, rest.length);
    }
    return [
      new Speech(this.name, [...this.parts.slice(0, fitted), more], this.context, this.minLead),
      new Speech(this.name, rest, this.context, restLead, this.spaceAfter),
    ];
  }

  draw(page: LayoutPage, x: number, y: number): void {
    let top = y + this.heights.reduce((a, b) => a + b, 0);
    this.parts.forEach((part, i) => {
      top -= this.heights[i];
      part.draw(page, x, top);
    });
  }
}
