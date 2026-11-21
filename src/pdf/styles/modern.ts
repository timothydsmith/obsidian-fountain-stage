import { DEFAULT_ACT_PATTERN } from "../../fountain/acts";
import { INCH, LETTER, EXTRAS_DEFAULTS, type PlayStyle } from "../style";

/**
 * Dramatists Guild "Modern Play Format", per the Guild's annotated example
 * page and its general SFI formatting guide (see fountain2pdf's
 * styles/modern.py for sources):
 *
 * - US Letter; 1" top, right and bottom margins, 1.5" left for binding
 * - 12pt Times throughout
 * - Names centred, caps, plain, on their own line; dialogue below, flush
 * - Stage directions plain, from the centre of the page to the right margin
 * - Parentheticals plain, indented a little past the dialogue
 * - Acts centred caps, each on a new page; scenes centred, underlined
 * - No running header; page number top right ("16."), from the first page of the play
 * - A speech breaking across a page just continues, with no (MORE)/(CONT'D)
 */
export const modern: PlayStyle = {
  id: "modern",
  name: "Modern Play Format",
  description: "Dramatists Guild Modern Play Format. US Letter, Times 12pt, names centred above the speech.",
  page: { ...LETTER, margins: { top: INCH, right: INCH, bottom: INCH, left: 1.5 * INCH } },
  fonts: { family: [], fallback: "times" },
  text: { size: 12, leading: 14 },
  titlePage: { titleSize: 24, bylineSize: 14, draft: "right" },
  character: {
    size: 12,
    bold: false,
    ownLine: true,
    alignment: "center",
    shortParentheticalInline: false,
    nameColumnWidth: 0,
    gutter: 0,
  },
  speech: { gap: 14, moreContinued: false, moreText: "(MORE)", continuedText: "(CONT'D)", dualLabel: "" },
  parenthetical: { italic: false, indent: 0.5 * INCH },
  // Stage directions start at the centre of the page, measured from the left margin.
  action: { size: 12, italic: false, alignment: "left", leftIndent: LETTER.width / 2 - 1.5 * INCH, rightIndent: 0, color: [0, 0, 0] },
  act: { size: 12, bold: false, italic: false, underline: false, alignment: "center", pattern: DEFAULT_ACT_PATTERN, newPage: true },
  scene: { size: 12, bold: false, italic: false, underline: true, alignment: "center" },
  sceneNumbers: { position: "before", format: "Scene {n}.", inHeader: false },
  header: { strap: false },
  pagination: { fromBody: true, prefaceRoman: false, face: "regular", size: 12, format: "{n}.", position: "top", alignment: "right" },
  prelims: { headingBold: true, headingUnderline: false, nameUnderline: false },
  ...EXTRAS_DEFAULTS,
};
