import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readingHiddenRanges, readingText } from "../src/fountain/reading";

describe("readingText", () => {
  it("hides forcing marks and emphasis marks", () => {
    const source = ".ACT ONE\n\n.FLASHBACK\n\n@McCLANE\nHi *there*, **you**.\n\n>THE END<\n";
    expect(readingText(source)).toBe("ACT ONE\n\nFLASHBACK\n\nMcCLANE\nHi there, you.\n\nTHE END\n");
  });

  it("hides sections, which never print", () => {
    const source = "# Act One\n\n## The catalyst\n\nINT. ROOM\n\nA chair.\n\n# Act Two\n\nA table.\n";
    expect(readingText(source)).toBe("INT. ROOM\n\nA chair.\n\nA table.\n");
  });

  it("shows only a link's text", () => {
    expect(readingText("INT. ROOM\n\nSee [the site](https://example.com) now.\n")).toBe("INT. ROOM\n\nSee the site now.\n");
  });

  it("hides notes and boneyard inside a line", () => {
    expect(readingText("INT. ROOM\n\nA chair. [[Is it red?]] A table./* cut */\n")).toBe("INT. ROOM\n\nA chair.  A table.\n");
  });

  it("removes lines with nothing left, without doubling blank lines", () => {
    const source = "INT. ROOM\n\n[[A note on its own line]]\n\nA chair.\n\n= A synopsis\n\nA table.\n";
    expect(readingText(source)).toBe("INT. ROOM\n\nA chair.\n\nA table.\n");
  });

  it("removes boneyard across lines", () => {
    const source = "INT. ROOM\n\n/*\nAn old scene.\n\nGONE\nLines.\n*/\n\nA chair.\n";
    expect(readingText(source)).toBe("INT. ROOM\n\nA chair.\n");
  });

  it("ignores emphasis marks inside notes", () => {
    expect(readingText("INT. ROOM\n\nOne *two [[three*]] four.\n")).toBe("INT. ROOM\n\nOne *two  four.\n");
  });

  it("keeps the title page, scene numbers and page breaks", () => {
    const source = "Title: A Play\nAuthor: Me\n\nINT. ROOM #1#\n\n===\n\nA chair.\n";
    expect(readingText(source)).toBe(source);
  });

  it("handles a hidden last line", () => {
    expect(readingText("INT. ROOM\n\nA chair.\n\n[[end]]")).toBe("INT. ROOM\n\nA chair.\n");
  });

  it("reads the sample script", () => {
    const sample = readFileSync(new URL("./fixtures/sample.fountain", import.meta.url), "utf8");
    const text = readingText(sample);
    expect(text).not.toMatch(/\[\[|\/\*|\*\*/);
    expect(text).not.toMatch(/\n\n\n/);
  });
});

describe("reading view of a cuts file", () => {
  it("keeps section headings, without their #", () => {
    const source = "# 1. INT. ROOM, line 2 · 22 November 2026\n\nA chair.\n";
    let shown = source;
    for (const { from, to } of readingHiddenRanges(source, { showSections: true }).reverse()) shown = shown.slice(0, from) + shown.slice(to);
    expect(shown).toBe("1. INT. ROOM, line 2 · 22 November 2026\n\nA chair.\n");
    expect(readingText(source)).toBe("A chair.\n");
  });
});
