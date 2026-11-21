import { DEFAULT_ACT_PATTERN } from "../../fountain/acts";
import { A4, MM, EXTRAS_DEFAULTS, type PlayStyle } from "../style";

/**
 * Australian Plays Transform submission format, per the "APT Submissions
 * Style Guide" (08/13/21):
 *
 * - A4; 40mm top margin, 25mm left, right and bottom
 * - Palatino 10pt (title page 35pt title, 18pt playwright)
 * - Names flush left, a tab, then dialogue on the same line, with wrapped
 *   lines aligned under the first
 * - Single-spaced within a speech, double-spaced between speeches
 * - Stage directions in italics, 90% black, flush left
 * - Running header "PLAY TITLE | SCENE", title bold, centred
 * - Page numbers centred at the bottom: Arabic from the first scene, lower-case
 *   Roman before it, title page unnumbered
 * - Forced scene numbers before the heading ("SCENE 2A:"), not in the header
 * - Dual dialogue labelled "(together)" on both names
 * - A speech breaking across a page gets (MORE) and "NAME (CONT'D)"
 */
export const apt: PlayStyle = {
  id: "apt",
  name: "Australian Plays Transform (APT)",
  description: "APT submission format. A4, Palatino 10pt, names beside the speech, running header.",
  page: { ...A4, margins: { top: 40 * MM, right: 25 * MM, bottom: 25 * MM, left: 25 * MM } },
  fonts: { family: ["Palatino", "TeX Gyre Pagella"], fallback: "times" },
  text: { size: 10, leading: 13 },
  titlePage: { titleSize: 35, bylineSize: 18, draft: "hide" },
  character: {
    size: 10,
    bold: false,
    ownLine: false,
    alignment: "left",
    shortParentheticalInline: false,
    nameColumnWidth: 32 * MM,
    gutter: 6,
  },
  speech: { gap: 13, moreContinued: true, moreText: "(MORE)", continuedText: "(CONT'D)", dualLabel: "(together)" },
  parenthetical: { italic: true, indent: 0 },
  action: { size: 10, italic: true, alignment: "left", leftIndent: 0, rightIndent: 0, color: [0.1, 0.1, 0.1] },
  act: { size: 10, bold: true, italic: false, underline: false, alignment: "left", pattern: DEFAULT_ACT_PATTERN, newPage: true },
  scene: { size: 10, bold: true, italic: false, underline: false, alignment: "left" },
  sceneNumbers: { position: "before", format: "SCENE {n}:", inHeader: false },
  header: { strap: true },
  pagination: { fromBody: true, prefaceRoman: true, face: "bold", size: 10, format: "{n}", position: "bottom", alignment: "center" },
  prelims: { headingBold: true, headingUnderline: false, nameUnderline: false },
  ...EXTRAS_DEFAULTS,
};
