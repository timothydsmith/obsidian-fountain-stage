import { describe, expect, it } from "vitest";
import { findLinks, linkedTargets, linkNoteLabel, parseLinkNote, renamedTarget, renameEdits, targetName, targetNames } from "../src/fountain/links";
import { readingText } from "../src/fountain/reading";
import { applyEdits } from "../src/fountain/titlePage";
import { parseFountain } from "../src/fountain/parser";
import { layoutScript } from "../src/pdf/layout";
import { standardFontSet } from "../src/pdf/fonts";
import { modern } from "../src/pdf/styles/modern";
import { TIMES } from "../src/pdf/style";

const SCRIPT = `INT. KITCHEN - DAY

ANNA reads [[>Research/Ibsen.md|the letter]] at the table.

[[>Props list]]

ANNA
I've read [[>Ibsen]] twice.

[[an ordinary note]]
`;

describe("link notes", () => {
  it("reads targets and display text", () => {
    expect(parseLinkNote(">Ibsen")).toEqual({ target: "Ibsen" });
    expect(parseLinkNote(" > Notes/Ibsen.md | the letter ")).toEqual({ target: "Notes/Ibsen.md", display: "the letter" });
    expect(parseLinkNote(">Ibsen|")).toEqual({ target: "Ibsen" });
    expect(parseLinkNote("an ordinary note")).toBeUndefined();
    expect(parseLinkNote(">")).toBeUndefined();
  });

  it("names a target by its file name", () => {
    expect(targetName("Research/Ibsen.md")).toBe("Ibsen");
    expect(targetName("Ibsen#Act two")).toBe("Ibsen");
    expect(linkNoteLabel(">Research/Ibsen.md")).toBe("Ibsen");
    expect(linkNoteLabel(">Ibsen|the letter")).toBe("the letter");
  });

  it("finds links with their offsets, but not other notes", () => {
    const links = findLinks(SCRIPT);
    expect(links.map((l) => [l.target, l.display, l.label])).toEqual([
      ["Research/Ibsen.md", "the letter", "the letter"],
      ["Props list", undefined, "Props list"],
      ["Ibsen", undefined, "Ibsen"],
    ]);
    for (const l of links) {
      expect(SCRIPT.slice(l.targetFrom, l.targetTo)).toBe(l.target);
      expect(SCRIPT.slice(l.labelFrom, l.labelTo)).toBe(l.label);
      expect(SCRIPT.slice(l.from, l.from + 3)).toBe("[[>");
    }
  });

  it("finds the name inside a target with folders", () => {
    const source = "Some action [[>Research/Ibsen.md#Act two]].\n";
    const [link] = findLinks(source);
    expect(source.slice(link.labelFrom, link.labelTo)).toBe("Ibsen");
  });

  it("lists each target once, in order of its first link", () => {
    expect(linkedTargets(findLinks(SCRIPT + "\n[[>ibsen.md]]\n[[>Props list]]\n"))).toEqual(["Research/Ibsen.md", "Props list", "Ibsen"]);
  });
});

describe("following renamed notes", () => {
  it("matches a target by path or by name", () => {
    expect(targetNames("Ibsen", "Research/Ibsen.md")).toBe(true);
    expect(targetNames("research/ibsen.md", "Research/Ibsen.md")).toBe(true);
    expect(targetNames("Research/Ibsen#Act two", "Research/Ibsen.md")).toBe(true);
    expect(targetNames("sen", "Research/Ibsen.md")).toBe(false);
    expect(targetNames("Other/Ibsen", "Research/Ibsen.md")).toBe(false);
  });

  it("keeps the form a target was written in", () => {
    expect(renamedTarget("Research/Ibsen.md", "Research/Henrik Ibsen.md", "Henrik Ibsen")).toBe("Research/Henrik Ibsen.md");
    expect(renamedTarget("Research/Ibsen", "Archive/Ibsen.md", "Ibsen")).toBe("Archive/Ibsen");
    expect(renamedTarget("Ibsen#Act two", "Research/Henrik Ibsen.md", "Henrik Ibsen")).toBe("Henrik Ibsen#Act two");
    expect(renamedTarget("Ibsen.md", "Research/Henrik Ibsen.md", "Henrik Ibsen")).toBe("Henrik Ibsen.md");
  });

  it("rewrites every link to the renamed note, and nothing else", () => {
    const edits = renameEdits(findLinks(SCRIPT), "Research/Ibsen.md", "Research/Henrik Ibsen.md", "Henrik Ibsen", () => false);
    const out = applyEdits(SCRIPT, edits);
    expect(out).toContain("[[>Research/Henrik Ibsen.md|the letter]]");
    expect(out).toContain("I've read [[>Henrik Ibsen]] twice.");
    expect(out).toContain("[[>Props list]]");
  });

  it("leaves a link that still finds a note", () => {
    const edits = renameEdits(findLinks(SCRIPT), "Research/Ibsen.md", "Research/Henrik Ibsen.md", "Henrik Ibsen", (t) => t === "Ibsen");
    expect(edits).toHaveLength(1);
  });
});

describe("links in reading view and the PDF", () => {
  it("shows a link's display text, or its note's name, in reading view", () => {
    const text = readingText(SCRIPT);
    expect(text).toContain("ANNA reads the letter at the table.");
    expect(text).toContain("I've read Ibsen twice.");
    expect(text).toContain("Props list");
    expect(text).not.toContain("ordinary");
    expect(text).not.toContain("[[");
  });

  it("prints a link's display text with notes, and nothing without", () => {
    const fonts = standardFontSet(TIMES);
    const printed = (notes: boolean) =>
      layoutScript(parseFountain(SCRIPT), modern, fonts, { notes })
        .pages.flatMap((p) => p.texts.map((t) => t.text))
        .join(" ");
    expect(printed(true)).toContain("the letter");
    expect(printed(true)).toContain("Props list");
    expect(printed(true)).toContain("[an ordinary note]");
    expect(printed(true)).not.toContain("[the letter]");
    expect(printed(true)).toContain("the letter at");
    expect(printed(false)).not.toContain("the letter");
  });
});
