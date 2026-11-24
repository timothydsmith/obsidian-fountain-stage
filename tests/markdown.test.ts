import { describe, expect, it } from "vitest";
import { parseFountain } from "../src/fountain/parser";
import { appendixStory } from "../src/pdf/appendix";
import { standardFontSet } from "../src/pdf/fonts";
import { imageData } from "../src/pdf/images";
import { layoutScript } from "../src/pdf/layout";
import { parseInlineMarkdown, parseMarkdown, shiftHeadings, splitLinkedNotes, stripFrontmatter } from "../src/pdf/markdown";
import { TIMES } from "../src/pdf/style";
import { modern } from "../src/pdf/styles/modern";

describe("inline Markdown", () => {
  it("reads emphasis", () => {
    expect(parseInlineMarkdown("a **bold** and *italic* and ***both***")).toEqual([
      { text: "a " },
      { text: "bold", bold: true },
      { text: " and " },
      { text: "italic", italic: true },
      { text: " and " },
      { text: "both", bold: true, italic: true },
    ]);
    expect(parseInlineMarkdown("snake_case_name and __bold__")).toEqual([{ text: "snake_case_name and " }, { text: "bold", bold: true }]);
    expect(parseInlineMarkdown("~~gone~~ ==lit== `code`")).toEqual([{ text: "gone" }, { text: " " }, { text: "lit" }, { text: " code" }]);
  });

  it("keeps web links and shows note links as text", () => {
    expect(parseInlineMarkdown("see [the site](https://example.com) or [[Ibsen|him]] or [[Notes/Ibsen#Act two]]")).toEqual([
      { text: "see " },
      { text: "the site", link: "https://example.com" },
      { text: " or him or Ibsen > Act two" },
    ]);
  });

  it("drops tags, footnotes and escapes", () => {
    expect(parseInlineMarkdown("a<br>b[^1] \\*not\\*")).toEqual([{ text: "a b *not*" }]);
  });
});

describe("Markdown blocks", () => {
  it("drops frontmatter and comments", () => {
    expect(stripFrontmatter("---\ntags: [a]\n---\nBody")).toBe("Body");
    expect(parseMarkdown("---\ntags: [a]\n---\nBody %%hidden%% text")).toEqual([{ kind: "paragraph", lines: [[{ text: "Body  text" }]] }]);
  });

  it("reads headings, paragraphs with their lines, and rules", () => {
    expect(parseMarkdown("# Title\n\nOne\nTwo\n\n---\n## Sub ##")).toEqual([
      { kind: "heading", level: 1, spans: [{ text: "Title" }] },
      { kind: "paragraph", lines: [[{ text: "One" }], [{ text: "Two" }]] },
      { kind: "rule" },
      { kind: "heading", level: 2, spans: [{ text: "Sub" }] },
    ]);
  });

  it("reads nested, numbered and task lists", () => {
    const blocks = parseMarkdown("- one\n  - inner\n- [x] done\n\n3. three\n4. four");
    expect(blocks).toEqual([
      {
        kind: "list",
        items: [
          { marker: "•", blocks: [{ kind: "paragraph", lines: [[{ text: "one" }]] }, { kind: "list", items: [{ marker: "•", blocks: [{ kind: "paragraph", lines: [[{ text: "inner" }]] }] }] }] },
          { marker: "[x]", blocks: [{ kind: "paragraph", lines: [[{ text: "done" }]] }] },
        ],
      },
      {
        kind: "list",
        items: [
          { marker: "3.", blocks: [{ kind: "paragraph", lines: [[{ text: "three" }]] }] },
          { marker: "4.", blocks: [{ kind: "paragraph", lines: [[{ text: "four" }]] }] },
        ],
      },
    ]);
  });

  it("reads quotes and callouts", () => {
    expect(parseMarkdown("> quoted\n> more")).toEqual([{ kind: "quote", blocks: [{ kind: "paragraph", lines: [[{ text: "quoted" }], [{ text: "more" }]] }] }]);
    expect(parseMarkdown("> [!warning]\n> Careful")).toEqual([
      { kind: "quote", title: [{ text: "Warning" }], blocks: [{ kind: "paragraph", lines: [[{ text: "Careful" }]] }] },
    ]);
  });

  it("reads tables", () => {
    expect(parseMarkdown("| Name | Age |\n|:--|--:|\n| Anna | 30 |\n| [[Tom\\|T]] |")).toEqual([
      {
        kind: "table",
        align: ["left", "right"],
        header: [[{ text: "Name" }], [{ text: "Age" }]],
        rows: [
          [[{ text: "Anna" }], [{ text: "30" }]],
          [[{ text: "T" }], []],
        ],
      },
    ]);
  });

  it("reads code, pictures and embeds", () => {
    expect(parseMarkdown("```\n  x = 1\n```\n![[stage.png|300]]\n![plan](Plans/plan%201.jpg)\n![[Other note#Act two]]")).toEqual([
      { kind: "code", lines: ["  x = 1"] },
      { kind: "image", target: "stage.png", alt: "", width: 300 },
      { kind: "image", target: "Plans/plan 1.jpg", alt: "plan", width: undefined },
      { kind: "embed", target: "Other note#Act two" },
    ]);
  });
});

describe("the linked-notes note", () => {
  it("moves headings down and back up, leaving code alone", () => {
    const text = "# A\n```\n# not a heading\n```\n###### Six";
    expect(shiftHeadings(text, 1)).toBe("## A\n```\n# not a heading\n```\n###### Six");
    expect(shiftHeadings("## A\n### B", -1)).toBe("# A\n## B");
  });

  it("splits back into its notes", () => {
    const note = "%% Linked notes of Play - Draft 3 %%\n\n# Ibsen\n\nBorn 1828.\n\n## Plays\n\n# Props list\n\n- A chair\n";
    expect(splitLinkedNotes(note)).toEqual([
      { title: "Ibsen", text: "Born 1828.\n\n# Plays" },
      { title: "Props list", text: "- A chair" },
    ]);
  });
});

/** A one-pixel-square PNG's first 24 bytes, enough to read its size. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("pictures", () => {
  it("reads PNG and JPEG sizes", () => {
    expect(imageData(png(640, 480))).toMatchObject({ format: "png", width: 640, height: 480 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x2c, 0x00, 0xc8, 3, 0, 0]);
    expect(imageData(jpeg)).toMatchObject({ format: "jpg", width: 200, height: 300 });
    expect(imageData(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });
});

describe("the appendix", () => {
  const fonts = standardFontSet(TIMES);
  const script = parseFountain("Title: Play\n\nINT. ROOM\n\nANNA\nHello.\n");
  const notes = [
    { title: "Ibsen", blocks: parseMarkdown("Born **1828**.\n\n- Plays\n  - A Doll's House\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![[stage.png]]\n\n![[missing.png]]") },
    { title: "Props list", blocks: parseMarkdown("> A chair") },
  ];
  (notes[0].blocks.find((b) => b.kind === "image" && b.target === "stage.png") as { src?: string }).src = "stage.png";
  const images = { "stage.png": { ...imageData(png(800, 400))! } };

  it("puts each note on a page of its own after the script, under its title", () => {
    const plain = layoutScript(script, modern, fonts);
    const doc = layoutScript(script, modern, fonts, { appendix: { notes, images } });
    expect(doc.pages).toHaveLength(plain.pages.length + 2);
    const words = (n: number) => doc.pages[n].texts.map((t) => t.text).join(" ");
    const first = plain.pages.length;
    expect(words(first)).toMatch(/^Ibsen Born 1828 . • Plays • A Doll's House A B 1 2 \[missing\.png\]/);
    expect(words(first + 1)).toContain("Props list A chair");
    expect(doc.pages[first].images).toHaveLength(1);
    expect(doc.images).toBe(images);
    // The picture fits the text's width.
    const [image] = doc.pages[first].images!;
    expect(image.width).toBeLessThanOrEqual(modern.page.width - modern.page.margins.left - modern.page.margins.right);
    expect(image.height).toBeCloseTo(image.width / 2);
  });

  it("runs the notes on when the style says so", () => {
    const style = { ...modern, appendix: { ...modern.appendix, pagePerNote: false } };
    const story = appendixStory({ notes, images }, style, fonts, 400, 600);
    expect(story.some((item) => typeof item === "symbol")).toBe(false);
  });

  it("leaves the script's own pages as they were", () => {
    const plain = layoutScript(script, modern, fonts);
    const doc = layoutScript(script, modern, fonts, { appendix: { notes, images } });
    expect(doc.pages.slice(0, plain.pages.length)).toEqual(plain.pages);
  });
});
