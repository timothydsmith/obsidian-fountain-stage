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

  it("notes which page each script line lands on", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `Line number ${i + 1} of a very long speech.`).join("\n");
    const doc = layoutScript(parseFountain(`INT. ROOM\n\nMARGARET\n${lines}\n\nShe sits.\n`), style("samuel_french"), fonts);
    // The heading, the speech (placed by its cue), then the line the speech
    // carries on with at the top of page 2.
    const [heading, cue, carried] = doc.placements;
    expect([heading, cue].map((p) => [p.page, p.line, p.continues])).toEqual([
      [0, 0, false],
      [0, 2, false],
    ]);
    expect(heading.at).toBe(0);
    expect(cue.at).toBeGreaterThan(0);
    expect(carried.page).toBe(1);
    expect(carried.at).toBe(0);
    expect(carried.line).toBeGreaterThan(3);
    expect(texts(doc)[1]).toContain(`Line number ${carried.line - 2} `);
    const last = doc.placements[doc.placements.length - 1];
    expect([last.page, last.line]).toEqual([doc.pages.length - 1, 84]);
    expect(last.at).toBeGreaterThan(0);
    expect(doc.pageNumbers).toEqual(doc.pages.map((_, i) => String(i + 1)));
  });

  it("notes a paragraph that breaks across a page as continuing", () => {
    const long = Array.from({ length: 400 }, () => "word").join(" ");
    const doc = layoutScript(parseFountain(`INT. ROOM\n\n${long}\n`), style("modern"), fonts);
    expect(doc.placements.map((p) => [p.page, p.line, p.continues])).toEqual([
      [0, 0, false],
      [0, 2, false],
      [1, 2, true],
    ]);
  });

  it("starts each act on a new page", () => {
    const doc = layoutScript(parseFountain(".ACT ONE\n\nA chair.\n\n.Act Two\n\nAnother chair.\n"), style("modern"), fonts);
    expect(doc.pages).toHaveLength(2);
    expect(texts(doc)[1]).toContain("ACT TWO");
  });

  it("keeps acts on the page when the style says so", () => {
    const sameStyle = { ...style("modern"), act: { ...style("modern").act, newPage: false } };
    const doc = layoutScript(parseFountain(".ACT ONE\n\nA chair.\n\n.ACT TWO\n\nAnother chair.\n"), sameStyle, fonts);
    expect(doc.pages).toHaveLength(1);
  });

  it("finds acts by the style's act pattern", () => {
    const interval = { ...style("modern"), act: { ...style("modern").act, pattern: "^(ACT|INTERVAL)\\b" } };
    const source = ".ACT ONE\n\nA chair.\n\n.INTERVAL\n\nAnother chair.\n";
    expect(layoutScript(parseFountain(source), style("modern"), fonts).pages).toHaveLength(1);
    expect(layoutScript(parseFountain(source), interval, fonts).pages).toHaveLength(2);
  });

  it("never prints sections", () => {
    const doc = layoutScript(parseFountain("# Act One\n\n## Scene One\n\nINT. ROOM\n\nA chair.\n\n# Act Two\n\nAnother chair.\n"), style("modern"), fonts);
    expect(doc.pages).toHaveLength(1);
    const all = texts(doc).flat().join(" ");
    expect(all).not.toMatch(/act one|scene one|act two/i);
    expect(all).toContain("INT. ROOM");
  });

  describe("draft on the title page", () => {
    const source = "Title: Play\nAuthor: Me\nContact: me@example.com\nDraft: 4 (working)\nDraft date: 21 November 2026\nDraft notes: For the reading\n\nINT. ROOM\n\nA chair.\n";
    const titlePage = (s: ReturnType<typeof style>) => layoutScript(parseFountain(source), s, fonts).pages[0].texts;

    it("prints the draft and date bottom right, and never the notes", () => {
      const modern = style("modern");
      const texts = titlePage(modern);
      const draft = texts.find((t) => t.text === "Draft 4 (working)");
      const date = texts.find((t) => t.text === "21 November 2026");
      expect(draft).toBeDefined();
      expect(date?.y).toBeCloseTo(modern.page.margins.bottom);
      expect(draft!.y).toBeCloseTo(date!.y + modern.text.leading);
      expect(date!.x + fonts.width(date!.text, "regular", modern.text.size)).toBeCloseTo(modern.page.width - modern.page.margins.right);
      expect(texts.map((t) => t.text)).toContain("me@example.com");
      expect(texts.map((t) => t.text).join(" ")).not.toMatch(/reading/);
    });

    it("prints them bottom left, or not at all, as the style says", () => {
      const left = { ...style("modern"), titlePage: { ...style("modern").titlePage, draft: "left" as const } };
      expect(titlePage(left).find((t) => t.text === "Draft 4 (working)")?.x).toBeCloseTo(left.page.margins.left);
      expect(titlePage(style("apt")).map((t) => t.text).join(" ")).not.toMatch(/Draft|November/);
    });

    it("prints a draft written in words as it is", () => {
      const doc = layoutScript(parseFountain("Title: Play\nDraft: Rehearsal draft\n\nA chair.\n"), style("modern"), fonts);
      expect(doc.pages[0].texts.map((t) => t.text)).toContain("Rehearsal draft");
    });
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

describe("notes, synopses and watermark", () => {
  const source = [
    "INT. ROOM [[check set]]",
    "= The morning after.",
    "",
    "She opens the door [[props: key]] and waits.",
    "",
    "[[Cut the next speech?]]",
    "",
    "DAVID",
    "Hello [[louder]] there.",
  ].join("\n");
  const script = parseFountain(source);
  const grey = style("modern").notes.color;

  it("leaves them out unless asked", () => {
    const plain = texts(layoutScript(script, style("modern"), fonts))[0];
    expect(plain).not.toMatch(/check set|morning|props|Cut the|louder/);
  });

  it("prints notes in grey brackets where they were written", () => {
    const doc = layoutScript(script, style("modern"), fonts, { notes: true });
    const page = texts(doc)[0];
    expect(page).toContain("INT. ROOM [check set]");
    expect(page).toContain("door [props: key] and waits.");
    expect(page).toContain("[Cut the next speech?]");
    expect(page).toContain("Hello [louder] there.");
    expect(page).not.toContain("morning");
    const note = doc.pages[0].texts.find((t) => t.text.includes("louder"))!;
    expect(note).toMatchObject({ face: "italic", color: grey });
  });

  it("prints synopses as lines of their own", () => {
    const doc = layoutScript(script, style("modern"), fonts, { synopses: true });
    const synopsis = doc.pages[0].texts.find((t) => t.text === "The morning after.")!;
    const heading = doc.pages[0].texts.find((t) => t.text.includes("ROOM"))!;
    expect(synopsis).toMatchObject({ face: "italic", color: grey });
    expect(synopsis.y).toBeLessThan(heading.y);
  });

  it("keeps a note in a speech", () => {
    const doc = layoutScript(script, style("apt"), fonts, { notes: true });
    expect(texts(doc).join(" ")).toContain("Hello [louder] there.");
  });

  it("puts a watermark behind every page, centred and fitted", () => {
    const doc = layoutScript(parseFountain(sample), style("modern"), fonts, { watermark: "  DRAFT " });
    for (const page of doc.pages) expect(page.texts[0]).toMatchObject({ text: "DRAFT", rotate: 45, opacity: 0.2, size: 120 });
    const long = layoutScript(script, style("modern"), fonts, { watermark: "NOT FOR CIRCULATION OR PERFORMANCE" }).pages[0].texts[0];
    expect(long.size).toBeLessThan(120);
    // The rotated text's middle is the page's middle.
    const w = fonts.width(long.text, "bold", long.size);
    const rad = Math.PI / 4;
    const midX = long.x + (w / 2) * Math.cos(rad) - 0.35 * long.size * Math.sin(rad);
    const midY = long.y + (w / 2) * Math.sin(rad) + 0.35 * long.size * Math.cos(rad);
    expect(midX).toBeCloseTo(doc.width / 2);
    expect(midY).toBeCloseTo(doc.height / 2);
  });

  it("draws the watermark in the PDF", async () => {
    const { bytes } = await buildPdf(script, style("apt"), { standard: "times" }, { watermark: "DRAFT", notes: true, synopses: true });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
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
