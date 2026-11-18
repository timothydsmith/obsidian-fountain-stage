/** Builds the PDF: embeds the fonts, lays out the script with them, and draws the pages with pdf-lib. */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, PDFString, rgb } from "pdf-lib";
import type { ParsedScript } from "../fountain/parser";
import { type FontSet, standardFontSet } from "./fonts";
import { layoutScript } from "./layout";
import type { LayoutDocument } from "./model";
import { type Face, type PlayStyle, type Rgb, STANDARD_FAMILIES, type StandardFamily } from "./style";

const FACES: Face[] = ["regular", "bold", "italic", "boldItalic"];

/** The fonts to set a PDF in: one of the standard families, or font files for each face. */
export type FontChoice = { standard: StandardFamily } | { files: Record<Face, Uint8Array> };

const color = ([r, g, b]: Rgb) => rgb(r, g, b);

const NO_SHAPING = { liga: false, clig: false, dlig: false, hlig: false, calt: false, kern: false };

/** Measures with embedded font files, exactly as pdf-lib will draw them. */
function embeddedFontSet(fonts: Record<Face, PDFFont>): FontSet {
  const cache = new Map<string, number>();
  let supported: Set<number> | undefined;
  return {
    width(text, face, size) {
      const key = `${face}\u0000${text}`;
      let w = cache.get(key);
      if (w === undefined) {
        w = fonts[face].widthOfTextAtSize(text, 1000);
        cache.set(key, w);
      }
      return (w * size) / 1000;
    },
    clean(text) {
      // Only characters every face can draw are kept.
      supported ??= FACES.map((f) => new Set(fonts[f].getCharacterSet())).reduce((a, b) => new Set([...a].filter((c) => b.has(c))));
      let out = "";
      for (const ch of text) {
        if (/\s/.test(ch)) out += " ";
        else out += supported.has(ch.codePointAt(0)!) ? ch : "?";
      }
      return out;
    },
  };
}

export interface BuiltPdf {
  bytes: Uint8Array;
  layout: LayoutDocument;
}

/** Embeds the fonts in a PDF, returning them and a font set that measures text exactly as they'll draw it. */
async function embedFonts(pdf: PDFDocument, choice: FontChoice): Promise<{ fonts: Record<Face, PDFFont>; fontSet: FontSet }> {
  const fonts = {} as Record<Face, PDFFont>;
  if ("standard" in choice) {
    const faces = STANDARD_FAMILIES[choice.standard];
    for (const face of FACES) fonts[face] = await pdf.embedFont(faces[face]);
    return { fonts, fontSet: standardFontSet(faces) };
  }
  pdf.registerFontkit(fontkit);
  // A file standing in for a missing face is embedded once.
  const embedded = new Map<Uint8Array, PDFFont>();
  for (const face of FACES) {
    const bytes = choice.files[face];
    let font = embedded.get(bytes);
    if (!font) {
      // Each character is drawn as its own glyph, without ligatures or
      // contextual alternates, as fountain2pdf did, so lines measure and
      // break the same.
      font = await pdf.embedFont(bytes, { subset: true, features: NO_SHAPING });
      embedded.set(bytes, font);
    }
    fonts[face] = font;
  }
  return { fonts, fontSet: embeddedFontSet(fonts) };
}

/**
 * A font set that measures text as a PDF in these fonts would, for laying
 * out a script without drawing it (to show page breaks in the editor).
 */
export async function measuringFontSet(choice: FontChoice): Promise<FontSet> {
  if ("standard" in choice) return standardFontSet(STANDARD_FAMILIES[choice.standard]);
  return (await embedFonts(await PDFDocument.create(), choice)).fontSet;
}

export async function buildPdf(script: ParsedScript, style: PlayStyle, choice: FontChoice): Promise<BuiltPdf> {
  const pdf = await PDFDocument.create();
  const { fonts, fontSet } = await embedFonts(pdf, choice);
  const layout = layoutScript(script, style, fontSet);
  pdf.setTitle(layout.title);
  if (layout.author) pdf.setAuthor(layout.author);
  pdf.setCreator("Playwright");

  for (const layoutPage of layout.pages) {
    const page = pdf.addPage([layout.width, layout.height]);
    for (const t of layoutPage.texts) {
      page.drawText(t.text, { x: t.x, y: t.y, size: t.size, font: fonts[t.face], color: color(t.color) });
    }
    for (const r of layoutPage.rules) {
      page.drawLine({ start: { x: r.x1, y: r.y }, end: { x: r.x2, y: r.y }, thickness: r.width, color: color(r.color) });
    }
    for (const link of layoutPage.links) {
      const annotation = pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [link.x, link.y, link.x + link.width, link.y + link.height],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(link.url) },
      });
      page.node.addAnnot(pdf.context.register(annotation));
    }
  }
  return { bytes: await pdf.save(), layout };
}
