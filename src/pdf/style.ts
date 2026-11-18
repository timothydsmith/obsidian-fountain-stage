/**
 * A house style for PDF export: every margin, font, size and layout choice
 * the layout engine makes comes from here, so adding a style never means
 * changing the engine. Ported from fountain2pdf's styles/base.py, with the
 * fields grouped and renamed. Lengths are in points (1/72 inch).
 */

export type Alignment = "left" | "center" | "right";
export type Face = "regular" | "bold" | "italic" | "boldItalic";
/** Red, green and blue, each from 0 to 1. */
export type Rgb = [number, number, number];

/** The 14 fonts every PDF reader has built in. */
export type StandardFont =
  | "Times-Roman"
  | "Times-Bold"
  | "Times-Italic"
  | "Times-BoldItalic"
  | "Helvetica"
  | "Helvetica-Bold"
  | "Helvetica-Oblique"
  | "Helvetica-BoldOblique"
  | "Courier"
  | "Courier-Bold"
  | "Courier-Oblique"
  | "Courier-BoldOblique"
  | "Symbol"
  | "ZapfDingbats";

export interface PlayStyle {
  /** What a script's `Style:` title-page key names, e.g. "apt". */
  id: string;
  name: string;
  description: string;

  page: {
    width: number;
    height: number;
    margins: { top: number; right: number; bottom: number; left: number };
  };

  fonts: {
    /** Standard PDF fonts for each face. */
    standard: Record<Face, StandardFont>;
    /** A font family the style really wants, which needs font files. Until those can be supplied, the standard fonts are used with a notice. */
    preferred?: string;
  };

  text: {
    size: number;
    /** Distance from one baseline to the next. */
    leading: number;
  };

  titlePage: { titleSize: number; bylineSize: number };

  character: {
    size: number;
    bold: boolean;
    /** The name on its own line above the speech (Modern Play Format), or sharing the first line with it (APT). */
    ownLine: boolean;
    /** Alignment of a name on its own line. */
    alignment: Alignment;
    /** On its own line, a leading one-word parenthetical joins the name: "JOHN (laughing)". */
    shortParentheticalInline: boolean;
    /** Shared-line layout: width of the name column. */
    nameColumnWidth: number;
    /** Shared-line layout: gap between the name column and the dialogue. */
    gutter: number;
  };

  speech: {
    /** Extra space between two speeches. */
    gap: number;
    /** Mark a speech that breaks across a page with "(MORE)" and a repeated "NAME (CONT'D)". */
    moreContinued: boolean;
    moreText: string;
    continuedText: string;
    /** Added to both names of a dual dialogue pair, e.g. "(together)". Empty for none. */
    dualLabel: string;
  };

  parenthetical: {
    italic: boolean;
    /** Extra indent past the dialogue's margin, for names on their own line. */
    indent: number;
  };

  action: {
    size: number;
    italic: boolean;
    alignment: Alignment;
    leftIndent: number;
    rightIndent: number;
    color: Rgb;
  };

  act: { size: number; bold: boolean; italic: boolean; underline: boolean; alignment: Alignment };

  scene: {
    size: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    alignment: Alignment;
    /** Upper-case `##` scene sections. Acts and INT./EXT. headings are always upper case. */
    uppercaseSections: boolean;
  };

  sceneNumbers: {
    /** Where a forced scene number (`#2A#`) goes. */
    position: "hide" | "before" | "after";
    /** `{n}` is replaced by the number. */
    format: string;
    inHeader: boolean;
  };

  /** A running "PLAY TITLE | SCENE" header at the top of each script page. */
  header: { strap: boolean };

  pagination: {
    /** Number from the first act or scene, leaving the title and preliminary pages unnumbered. */
    fromBody: boolean;
    /** With fromBody, number the pages before it i, ii, iii (the title page stays unnumbered). */
    prefaceRoman: boolean;
    face: Face;
    size: number;
    /** `{n}` is replaced by the page number. */
    format: string;
    position: "top" | "bottom";
    alignment: Alignment;
  };

  prelims: {
    headingBold: boolean;
    headingUnderline: boolean;
    /** Underline the name in a "Name   Description" line. */
    nameUnderline: boolean;
  };
}

export const MM = 72 / 25.4;
export const INCH = 72;
export const A4 = { width: 210 * MM, height: 297 * MM };
export const LETTER = { width: 8.5 * INCH, height: 11 * INCH };

export const TIMES: Record<Face, StandardFont> = {
  regular: "Times-Roman",
  bold: "Times-Bold",
  italic: "Times-Italic",
  boldItalic: "Times-BoldItalic",
};
