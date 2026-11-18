import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseFountain } from "../src/fountain/parser";
import { PAGE_BREAK, Spacer } from "../src/pdf/blocks";
import { flow } from "../src/pdf/flow";
import { standardFontSet } from "../src/pdf/fonts";
import { layoutScript, toRoman } from "../src/pdf/layout";
import type { LayoutDocument } from "../src/pdf/model";
import { Paragraph, paraStyle } from "../src/pdf/paragraph";
import { buildPdf } from "../src/pdf/render";
import { TIMES } from "../src/pdf/style";
import { BUILT_IN_STYLES, findStyle } from "../src/pdf/styles";

const fonts = standardFontSet(TIMES);
const sample = readFileSync(new URL("./fixtures/sample.fountain", import.meta.url), "utf8");
const style = (id: string) => findStyle(BUILT_IN_STYLES, id)!;

/** Each page as lines of "x y face size text", rounded so snapshots are stable. */
function describeLayout(doc: LayoutDocument): string[][] {
  const r = (n: number) => n.toFixed(2);
  return doc.pages.map((page) => [
    ...page.texts.map((t) => `${r(t.x)} ${r(t.y)} ${t.face} ${t.size} ${t.text}`),
    ...page.rules.map((l) => `rule ${r(l.x1)}-${r(l.x2)} ${r(l.y)}`),
    ...page.links.map((l) => `link ${l.url}`),
  ]);
}

const texts = (doc: LayoutDocument) => doc.pages.map((p) => p.texts.map((t) => t.text).join(" "));

describe("built-in styles", () => {
  for (const s of BUILT_IN_STYLES) {
    it(`lays out the sample script in ${s.id}`, () => {
      expect(describeLayout(layoutScript(parseFountain(sample), s, fonts))).toMatchSnapshot();
    });
  }

  it("finds styles by id, loosely", () => {
    expect(findStyle(BUILT_IN_STYLES, "Samuel French")?.id).toBe("samuel_french");
    expect(findStyle(BUILT_IN_STYLES, "APT")?.id).toBe("apt");
    expect(findStyle(BUILT_IN_STYLES, "nope")).toBeUndefined();
  });
});

describe("layout", () => {
  it("never prints the Style key", () => {
    const doc = layoutScript(parseFountain("Title: A Play\nStyle: apt\nContact: me@example.com\n\nINT. ROOM\n"), style("modern"), fonts);
    const all = texts(doc).join(" ");
    expect(all).toContain("me@example.com");
    expect(all).not.toMatch(/apt/i);
  });

  it("has no title page when a script has only a Style key", () => {
    const doc = layoutScript(parseFountain("Style: apt\n\nINT. ROOM\n\nA chair.\n"), style("modern"), fonts);
    expect(doc.pages).toHaveLength(1);
    expect(texts(doc)[0]).not.toContain("Untitled");
  });

  it("numbers pages from the first scene, with Roman numerals before it in APT", () => {
    const doc = layoutScript(parseFountain(sample), style("apt"), fonts);
    const numbers = doc.pages.map((p) => p.texts.find((t) => t.face === "bold" && t.y < 50)?.text);
    expect(numbers[0]).toBeUndefined();
    expect(numbers.slice(1, 4)).toEqual(["i", "ii", "iii"]);
    expect(numbers[4]).toBe("1");
  });

  it("marks a speech that breaks across a page", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `Line number ${i + 1} of a very long speech.`).join("\n");
    const doc = layoutScript(parseFountain(`INT. ROOM\n\nMARGARET\n${lines}\n`), style("samuel_french"), fonts);
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(texts(doc)[0]).toContain("(MORE)");
    expect(texts(doc)[1]).toMatch(/^MARGARET \(Cont\.\) Line number/);
  });

  it("starts each act on a new page", () => {
    const doc = layoutScript(parseFountain("# Act One\n\nA chair.\n\n# Act Two\n\nAnother chair.\n"), style("modern"), fonts);
    expect(doc.pages).toHaveLength(2);
    expect(texts(doc)[1]).toContain("ACT TWO");
  });

  it("draws links in blue with an annotation", () => {
    const doc = layoutScript(parseFountain("INT. ROOM\n\nSee [the site](https://example.com) now.\n"), style("modern"), fonts);
    const page = doc.pages[0];
    expect(page.links).toEqual([expect.objectContaining({ url: "https://example.com" })]);
    expect(page.texts.find((t) => t.text === "the site")?.color).toEqual([0, 0, 1]);
  });

  it("replaces characters the standard fonts can't draw", () => {
    const doc = layoutScript(parseFountain("INT. ROOM\n\nCafé ☕ ‑ done.\n"), style("modern"), fonts);
    expect(texts(doc)[0]).toContain("Café ? - done.");
  });
});

describe("toRoman", () => {
  it("converts", () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994].map(toRoman)).toEqual(["i", "iv", "ix", "xiv", "xl", "xc", "cd", "mcmxciv"]);
  });
});

describe("paragraphs", () => {
  const body = paraStyle({ face: "regular", size: 12, leading: 14 });

  it("collapses whitespace and wraps between words", () => {
    const p = Paragraph.of([{ text: "  one   two\tthree  " }], body, fonts);
    expect(p.wrap(1000)).toBe(14);
    const narrow = Paragraph.of([{ text: "one two three four five six" }], body, fonts);
    expect(narrow.wrap(60)).toBeGreaterThan(14);
  });

  it("splits only if two lines stay behind", () => {
    const p = Paragraph.of([{ text: "word ".repeat(60) }], body, fonts);
    const lines = p.wrap(100) / 14;
    expect(lines).toBeGreaterThan(4);
    expect(p.split(100, 27)).toEqual([]);
    const parts = p.split(100, 28);
    expect(parts).toHaveLength(2);
    expect(parts[0].wrap(100, false)).toBe(28);
    expect(parts[1].wrap(100, false)).toBe((lines - 2) * 14);
  });

  it("breaks a word too long for the line", () => {
    const p = Paragraph.of([{ text: "x".repeat(200) }], body, fonts);
    expect(p.wrap(100)).toBeGreaterThan(14);
  });
});

describe("flow", () => {
  const frame = { left: 0, bottom: 0, width: 200, height: 112 };

  it("adds no blank page for a trailing page break", () => {
    expect(flow([new Spacer(10), PAGE_BREAK], frame).pages).toHaveLength(1);
  });

  it("drops a collapsing spacer at the top of a page", () => {
    const body = paraStyle({ face: "regular", size: 12, leading: 14 });
    const para = Paragraph.of([{ text: "hello" }], body, fonts);
    const result = flow([new Spacer(14, true), para], frame);
    expect(result.pages[0].texts[0].y).toBeCloseTo(112 - 6 - 12);
  });
});

describe("buildPdf", () => {
  it("writes a PDF with one page per layout page", async () => {
    const { bytes, layout } = await buildPdf(parseFountain(sample), style("apt"), { standard: "times" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(layout.pages.length);
    expect(pdf.getTitle()).toBe("The Last Rehearsal");
  });
});
