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

export interface LayoutDocument {
  width: number;
  height: number;
  /** PDF metadata. */
  title: string;
  author: string;
  pages: LayoutPage[];
}

export function emptyPage(): LayoutPage {
  return { texts: [], rules: [], links: [] };
}
