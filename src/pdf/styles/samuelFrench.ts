import { DEFAULT_ACT_PATTERN } from "../../fountain/acts";
import { INCH, LETTER, EXTRAS_DEFAULTS, type PlayStyle } from "../style";

/**
 * Samuel French / SFI submission format, per the worked example in the
 * Dramatists Guild's "General SFI Formatting Guidelines":
 *
 * - US Letter; 1" top, right and bottom margins, 1.5" left
 * - 12pt Times throughout
 * - Names centred, caps, plain; a one-word parenthetical shares the name's
 *   line ("JOHN (patiently.)"), a longer one goes on its own line, indented
 * - Dialogue flush, on the line below the name
 * - Stage directions plain and centred
 * - Acts centred caps, underlined, each on a new page; scenes centred, underlined
 * - No running header; page number top right, from the first page of the play
 * - A speech breaking across a page gets (MORE) and "NAME (Cont.)"
 * - Preliminary page headings underlined, not bold
 */
export const samuelFrench: PlayStyle = {
  id: "samuel_french",
  name: "Samuel French / SFI",
  description: "Samuel French submission format. US Letter, Times 12pt, centred stage directions.",
  page: { ...LETTER, margins: { top: INCH, right: INCH, bottom: INCH, left: 1.5 * INCH } },
  fonts: { family: [], fallback: "times" },
  text: { size: 12, leading: 14 },
  titlePage: { titleSize: 24, bylineSize: 14 },
  character: {
    size: 12,
    bold: false,
    ownLine: true,
    alignment: "center",
    shortParentheticalInline: true,
    nameColumnWidth: 0,
    gutter: 0,
  },
  speech: { gap: 14, moreContinued: true, moreText: "(MORE)", continuedText: "(Cont.)", dualLabel: "" },
  parenthetical: { italic: false, indent: 3 * 0.5 * INCH },
  action: { size: 12, italic: false, alignment: "center", leftIndent: 0, rightIndent: 0, color: [0, 0, 0] },
  act: { size: 12, bold: false, italic: false, underline: true, alignment: "center", pattern: DEFAULT_ACT_PATTERN, newPage: true },
  scene: { size: 12, bold: false, italic: false, underline: true, alignment: "center" },
  sceneNumbers: { position: "before", format: "Scene {n}.", inHeader: false },
  header: { strap: false },
  pagination: { fromBody: true, prefaceRoman: false, face: "regular", size: 12, format: "{n}.", position: "top", alignment: "right" },
  prelims: { headingBold: false, headingUnderline: true, nameUnderline: true },
  ...EXTRAS_DEFAULTS,
};
