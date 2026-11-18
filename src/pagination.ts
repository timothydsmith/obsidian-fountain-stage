/** Lays out a script for the editor, to show where its pages break: in the style and fonts its PDF would use. */

import type { ParsedScript } from "./fountain/parser";
import type { Library, FountainStageSettings } from "./library";
import type { FontSet } from "./pdf/fonts";
import { layoutScript } from "./pdf/layout";
import { type ScriptPages, scriptPages } from "./pdf/pageBreaks";
import { type FontChoice, measuringFontSet } from "./pdf/render";
import type { Face, PlayStyle } from "./pdf/style";
import { findStyle } from "./pdf/styles";

const FACES: Face[] = ["regular", "bold", "italic", "boldItalic"];

/** How many sets of font files to keep measuring with. */
const FONT_CACHE_SIZE = 4;

export interface PaginatedScript extends ScriptPages {
  /** Why the fonts aren't the ones the style asks for, if they aren't. */
  fontNotice?: string;
}

export class Paginator {
  private fileFonts: { files: Record<Face, Uint8Array>; fontSet: Promise<FontSet> }[] = [];
  private standardFonts = new Map<string, Promise<FontSet>>();

  constructor(
    private readonly library: Library,
    private readonly settings: () => FountainStageSettings,
  ) {}

  /** The style a script's `Style:` key names, else the one in settings, else Modern. */
  private async styleFor(script: ParsedScript): Promise<PlayStyle> {
    const { styles } = await this.library.loadStyles();
    const key = (script.titleValues.style ?? []).join(" ").trim();
    return (key && findStyle(styles, key)) || findStyle(styles, this.settings().pageBreakStyle) || findStyle(styles, "modern") || styles[0];
  }

  /** Measuring fonts, made once for each set of font files (the library keeps a file's bytes while it's unchanged). */
  private fontSetFor(choice: FontChoice): Promise<FontSet> {
    if ("standard" in choice) {
      let fontSet = this.standardFonts.get(choice.standard);
      if (!fontSet) {
        fontSet = measuringFontSet(choice);
        this.standardFonts.set(choice.standard, fontSet);
      }
      return fontSet;
    }
    const files = choice.files;
    let entry = this.fileFonts.find((e) => FACES.every((face) => e.files[face] === files[face]));
    if (!entry) {
      entry = { files, fontSet: measuringFontSet(choice) };
      this.fileFonts.unshift(entry);
      this.fileFonts.length = Math.min(this.fileFonts.length, FONT_CACHE_SIZE);
      // A font that fails to load isn't kept, so it's tried again next time.
      entry.fontSet.catch(() => (this.fileFonts = this.fileFonts.filter((e) => e !== entry)));
    }
    return entry.fontSet;
  }

  async paginate(script: ParsedScript): Promise<PaginatedScript> {
    const style = await this.styleFor(script);
    const { choice, notice } = await this.library.fontsFor(style);
    const fonts = await this.fontSetFor(choice);
    return { ...scriptPages(layoutScript(script, style, fonts), style.name), fontNotice: notice };
  }
}
