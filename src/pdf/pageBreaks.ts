/**
 * Where a script's pages break, from its layout, for the editor: a rule
 * between lines where each page starts, and which page a line is on.
 */

import { DEFAULT_ACT_PATTERN } from "../fountain/acts";
import type { ParsedScript } from "../fountain/parser";
import type { LayoutDocument, Placement } from "./model";

/** What the editor keeps of a script's layout. */
export interface ScriptPages {
  /** The style it was laid out in. */
  styleName: string;
  /** That style's act pattern, so the editor and outline find the same acts as the PDF. */
  actPattern: string;
  pageCount: number;
  /** Each page's printed number, or undefined where none is printed. */
  pageNumbers: (string | undefined)[];
  placements: Placement[];
}

export function scriptPages(layout: LayoutDocument, styleName: string, actPattern: string = DEFAULT_ACT_PATTERN): ScriptPages {
  return { styleName, actPattern, pageCount: layout.pages.length, pageNumbers: layout.pageNumbers, placements: layout.placements };
}

export interface PageRule {
  /** The line the rule goes next to, counting from 0. */
  line: number;
  /** After the line rather than before it: the page starts partway through the element ending on it. */
  after: boolean;
  /** The page, counting from 0. */
  page: number;
}

/** "Page 12" for a page with a printed number, otherwise "Unnumbered page". */
export function pageLabel(pages: ScriptPages, page: number): string {
  const number = pages.pageNumbers[page];
  return number === undefined ? "Unnumbered page" : `Page ${number}`;
}

/** Each element's last line, by its first. */
function endLines(script: ParsedScript): Map<number, number> {
  return new Map(script.elements.map((el) => [el.line, el.endLine]));
}

/**
 * A rule where each page after the first starts. A page that starts with a
 * new element gets its rule before it; one that starts partway through an
 * element (a long paragraph), after it.
 */
export function pageRules(pages: ScriptPages, script: ParsedScript): PageRule[] {
  const ends = endLines(script);
  const rules: PageRule[] = [];
  let lastPage = 0;
  for (const p of pages.placements) {
    if (p.page <= lastPage) continue;
    lastPage = p.page;
    rules.push(p.continues ? { line: ends.get(p.line) ?? p.line, after: true, page: p.page } : { line: p.line, after: false, page: p.page });
  }
  return rules;
}

/**
 * The page a line is on, counting from 0, or undefined before the first
 * line that prints (on the title page). A line partway through an element
 * that runs over a page is counted on the page the element starts on.
 */
export function pageAtLine(pages: ScriptPages, script: ParsedScript, line: number): number | undefined {
  const ends = endLines(script);
  let page: number | undefined;
  for (const p of pages.placements) {
    const reached = p.continues ? (ends.get(p.line) ?? p.line) < line : p.line <= line;
    if (p.line > line) break;
    if (reached) page = p.page;
  }
  return page;
}
