/**
 * A laid-out document: pages of positioned text, ready to draw. Layout makes
 * these and the renderer draws them, so layout can be tested without a PDF.
 * Coordinates are PDF points with the origin at the bottom left of the page.
 */

import type { Face, Rgb } from "./style";

export interface TextItem {
  /** Left end of the baseline. */
  x: number;
  y: number;
  text: string;
  face: Face;
  size: number;
  color: Rgb;
}

/** A horizontal line, used for underlines. */
export interface RuleItem {
  x1: number;
  x2: number;
  y: number;
  width: number;
  color: Rgb;
}

export interface LinkItem {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
}

export interface LayoutPage {
  texts: TextItem[];
  rules: RuleItem[];
  links: LinkItem[];
}

/** Where a block from a script line landed. */
export interface Placement {
  /** The page, counting from 0. */
  page: number;
  /** The script line, counting from 0. */
  line: number;
  /** The rest of an element that a page break split, rather than its start. */
  continues: boolean;
  /** How far down the page's text frame the block starts, from 0 at the top to 1 at the foot. */
  at: number;
  /** How far down it ends, on the same scale. */
  end: number;
}

export interface LayoutDocument {
  width: number;
  height: number;
  /** PDF metadata. */
  title: string;
  author: string;
  pages: LayoutPage[];
  /** Where each block from the script landed, in order. */
  placements: Placement[];
  /** Each page's printed number, or undefined where none is printed (the title page). */
  pageNumbers: (string | undefined)[];
}

export function emptyPage(): LayoutPage {
  return { texts: [], rules: [], links: [] };
}
