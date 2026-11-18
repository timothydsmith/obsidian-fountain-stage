import { Encodings, Font } from "@pdf-lib/standard-fonts";
import type { Face, StandardFont } from "./style";

/** Measures text for layout. The renderer must draw with the same fonts, so that measured and drawn widths agree. */
export interface FontSet {
  /** Width in points, without kerning (matching how the text is drawn). */
  width(text: string, face: Face, size: number): number;
  /** Replaces characters the fonts can't draw. Text goes through this before it's measured. */
  clean(text: string): string;
}

/** Characters outside WinAnsi that have a close WinAnsi equivalent. */
const SUBSTITUTES: Record<string, string> = {
  "‐": "-",
  "‑": "-",
  "‒": "–",
  "―": "—",
  "−": "-",
  "′": "'",
  "″": '"',
  "⁃": "-",
  "≤": "<=",
  "≥": ">=",
  "→": "->",
  "←": "<-",
};

const fontCache = new Map<StandardFont, Font>();
function loadFont(name: StandardFont): Font {
  let font = fontCache.get(name);
  if (!font) {
    font = Font.load(name);
    fontCache.set(name, font);
  }
  return font;
}

/**
 * The standard PDF fonts, which every reader has built in. They only cover
 * the WinAnsi character set (Western European), so anything else is replaced.
 */
export function standardFontSet(faces: Record<Face, StandardFont>): FontSet {
  const encoding = Encodings.WinAnsi;
  // Glyph widths per face, in 1/1000 em, keyed by code point.
  const widths = new Map<Face, Map<number, number>>();

  const glyphWidth = (face: Face, codePoint: number): number => {
    let table = widths.get(face);
    if (!table) {
      table = new Map();
      widths.set(face, table);
    }
    let w = table.get(codePoint);
    if (w === undefined) {
      const glyph = encoding.encodeUnicodeCodePoint(codePoint).name;
      w = loadFont(faces[face]).getWidthOfGlyph(glyph) ?? 0;
      table.set(codePoint, w);
    }
    return w;
  };

  return {
    width(text, face, size) {
      let total = 0;
      for (const ch of text) total += glyphWidth(face, ch.codePointAt(0)!);
      return (total * size) / 1000;
    },
    clean(text) {
      let out = "";
      for (const ch of text) {
        if (encoding.canEncodeUnicodeCodePoint(ch.codePointAt(0)!)) out += ch;
        else if (/\s/.test(ch)) out += " ";
        else out += SUBSTITUTES[ch] ?? "?";
      }
      return out;
    },
  };
}
