/** Draws a laid-out document as a PDF with pdf-lib. */

import { PDFDocument, PDFFont, PDFString, rgb } from "pdf-lib";
import type { LayoutDocument } from "./model";
import type { Face, Rgb, StandardFont } from "./style";

const FACES: Face[] = ["regular", "bold", "italic", "boldItalic"];

const color = ([r, g, b]: Rgb) => rgb(r, g, b);

export async function renderPdf(doc: LayoutDocument, faces: Record<Face, StandardFont>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  if (doc.author) pdf.setAuthor(doc.author);
  pdf.setCreator("Playwright");

  const fonts = {} as Record<Face, PDFFont>;
  for (const face of FACES) fonts[face] = await pdf.embedFont(faces[face]);

  for (const layoutPage of doc.pages) {
    const page = pdf.addPage([doc.width, doc.height]);
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
  return pdf.save();
}
