import { describe, expect, it } from "vitest";
import {
  addCut,
  cutAtLine,
  cutBody,
  cutHeading,
  cutPlace,
  cutsFileName,
  isFrozenDraftOf,
  parseCutsFile,
  parseCutsFileName,
  removeCut,
  restoreText,
} from "../src/fountain/cuts";
import { parseFountain } from "../src/fountain/parser";
import { frozenDraftName } from "../src/fountain/titlePage";

const date = new Date(2026, 10, 22);
const script = "Title: Play\n\nA prologue.\n\nINT. KITCHEN\n\nA table.\n\nNORA\nHello.\n\n.ACT TWO\n\nEXT. *GARDEN*\n\nRain.\n";

describe("cutHeading", () => {
  const heading = (text: string) => cutHeading(parseFountain(script), script, script.indexOf(text), date);

  it("names the scene heading the cut was under, and the line in that scene", () => {
    expect(heading("NORA")).toBe("# 1. INT. KITCHEN, line 4 · 22 November 2026");
    expect(heading("Hello")).toBe("# 1. INT. KITCHEN, line 5 · 22 November 2026");
    expect(heading("Rain")).toBe("# 3. EXT. GARDEN, line 2 · 22 November 2026");
  });

  it("counts from the start before the first scene heading", () => {
    expect(heading("A prologue")).toBe("# Start, line 2 · 22 November 2026");
  });

  it("reads back where a cut came from", () => {
    expect(cutPlace("# 3. EXT. GARDEN, line 2 · 22 November 2026")).toEqual({ scene: 3, line: 2 });
    expect(cutPlace("# Start, line 2 · 22 November 2026 · the old opening")).toEqual({ scene: 0, line: 2 });
    expect(cutPlace("# A section of my own")).toBeUndefined();
  });
});

describe("cutBody", () => {
  it("drops blank lines at either end, and keeps those inside", () => {
    expect(cutBody("\n\nNORA\nHello.\n\nShe goes.\n\n")).toBe("NORA\nHello.\n\nShe goes.");
    expect(cutBody("and then")).toBe("and then");
  });
});

describe("the cuts file", () => {
  const a = { heading: "# 1. INT. KITCHEN, line 4 · 22 November 2026", body: "NORA\nHello." };
  const b = { heading: "# 3. EXT. GARDEN, line 2 · 22 November 2026", body: "Rain." };
  const c = { heading: "# 1. INT. KITCHEN, line 2 · 23 November 2026", body: "A table." };

  it("keeps cuts in play order, whenever they were made", () => {
    let file = addCut("", b);
    file = addCut(file, a);
    file = addCut(file, c);
    expect(file).toBe(
      "# 1. INT. KITCHEN, line 2 · 23 November 2026\n\nA table.\n\n" +
        "# 1. INT. KITCHEN, line 4 · 22 November 2026\n\nNORA\nHello.\n\n" +
        "# 3. EXT. GARDEN, line 2 · 22 November 2026\n\nRain.\n",
    );
  });

  it("puts a cut from the same place after the earlier one", () => {
    const again = { ...a, body: "Again." };
    expect(parseCutsFile(addCut(addCut("", a), again)).cuts.map((cut) => cut.body)).toEqual(["NORA\nHello.", "Again."]);
  });

  it("keeps text and headings of your own", () => {
    const file = "Notes about these cuts.\n\n# My favourite\n\nKeep this.\n\n" + addCut("", b).trim() + "\n";
    const added = addCut(file, a);
    expect(added.startsWith("Notes about these cuts.\n\n")).toBe(true);
    expect(added).toContain("# My favourite\n\nKeep this.");
    expect(parseCutsFile(added).cuts.map((cut) => cut.heading)).toEqual([a.heading, b.heading]);
  });

  it("removes a cut by heading and text, and leaves an edited one", () => {
    const file = addCut(addCut("", a), b);
    expect(removeCut(file, a)).toBe(addCut("", b));
    expect(removeCut(file, { ...a, body: "Changed." })).toBe(file);
    expect(removeCut(addCut("", a), a)).toBe("");
  });

  it("finds the cut at a line", () => {
    const file = addCut(addCut("", a), b);
    expect(cutAtLine(file, 0)).toEqual(a);
    expect(cutAtLine(file, 3)).toEqual(a);
    expect(cutAtLine(file, 5)).toEqual(b);
    expect(cutAtLine("Notes.\n\n" + file, 0)).toBeUndefined();
  });

  it("keeps a section inside a cut as part of it", () => {
    const withSection = { heading: a.heading, body: "# Beat one\n\nNORA\nHello." };
    const file = addCut("", withSection);
    expect(parseCutsFile(file).cuts).toHaveLength(1);
    expect(removeCut(file, withSection)).toBe("");
  });
});

describe("cuts file names", () => {
  it("names a draft's cuts file after its frozen copy", () => {
    expect(cutsFileName(frozenDraftName("Play", 4, date))).toBe("Play - Draft 04 - Cuts");
  });

  it("knows which frozen draft a cuts file belongs to", () => {
    const cuts = parseCutsFileName("Play - Draft 04 - Cuts");
    expect(cuts).toEqual({ prefix: "Play - Draft 04 - " });
    expect(isFrozenDraftOf("Play - Draft 04 - 2026-11-29", cuts!.prefix)).toBe(true);
    expect(isFrozenDraftOf("Play - Draft 04 - 2026-11-29 1", cuts!.prefix)).toBe(true);
    expect(isFrozenDraftOf("Play - Draft 04 - Cuts", cuts!.prefix)).toBe(false);
    expect(isFrozenDraftOf("Play - Draft 05 - 2026-11-29", cuts!.prefix)).toBe(false);
    expect(parseCutsFileName("Play - Draft 04 - 2026-11-29")).toBeUndefined();
  });
});

describe("restoreText", () => {
  const at = (doc: string, marker = "|") => {
    const from = doc.indexOf(marker);
    return { doc: doc.replace(marker, ""), from };
  };
  const restore = (marked: string, body: string) => {
    const { doc, from } = at(marked);
    return doc.slice(0, from) + restoreText(doc, from, from, body) + doc.slice(from);
  };

  it("puts a phrase back partway along a line as it is", () => {
    expect(restore("NORA\nI never | this house.\n", "liked")).toBe("NORA\nI never liked this house.\n");
  });

  it("makes a paragraph of a cut put back on a blank line", () => {
    expect(restore("INT. ROOM\n\n|\nNORA\nHello.\n", "A chair.")).toBe("INT. ROOM\n\nA chair.\n\nNORA\nHello.\n");
    expect(restore("INT. ROOM\n|\nNORA\nHello.\n", "A chair.")).toBe("INT. ROOM\n\nA chair.\n\nNORA\nHello.\n");
    expect(restore("INT. ROOM\n\n|\n\nNORA\n", "A chair.")).toBe("INT. ROOM\n\nA chair.\n\nNORA\n");
  });

  it("makes a paragraph of a cut put back at the start of a line of text", () => {
    expect(restore("INT. ROOM\n\n|NORA\nHello.\n", "A chair.")).toBe("INT. ROOM\n\nA chair.\n\nNORA\nHello.\n");
  });

  it("works at the start and end of the script", () => {
    expect(restore("|", "A chair.")).toBe("A chair.");
    expect(restore("Hello.\n|", "A chair.")).toBe("Hello.\n\nA chair.");
  });
});
