import { describe, expect, it } from "vitest";
import { parseFountain } from "../src/fountain/parser";
import { findRenames, inCaseOf, nameAt, type RenameEdit } from "../src/fountain/rename";

function apply(source: string, edits: RenameEdit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return out;
}

const rename = (source: string, from: string, to: string) => {
  const edits = findRenames(source, parseFountain(source), from, to);
  return { text: apply(source, edits), places: edits.map((e) => e.place) };
};

describe("inCaseOf", () => {
  it("writes the new name in the case of the old", () => {
    expect(inCaseOf("MARGARET", "Jane")).toBe("JANE");
    expect(inCaseOf("Margaret", "Jane")).toBe("Jane");
    expect(inCaseOf("Margaret", "MRS SMITH")).toBe("Mrs Smith");
    expect(inCaseOf("McCLANE", "Jane")).toBe("Jane");
    expect(inCaseOf("Margaret", "jane doe")).toBe("Jane Doe");
    expect(inCaseOf("Margaret", "McClane")).toBe("McClane");
  });
});

describe("findRenames", () => {
  const source = [
    "Title: Margaret's Garden",
    "Characters:",
    "    MARGARET, sixties",
    "    DAVID, Margaret's son",
    "",
    "INT. MARGARET'S KITCHEN",
    "",
    "MARGARET enters. She will sit.",
    "",
    "DAVID",
    "(to Margaret)",
    "Will you, Margaret? MARGARET!",
    "",
    "MARGARET (V.O.)",
    "Never.",
    "",
    "MARGARET ^",
    "Never.",
  ].join("\n");

  it("renames cues, the Characters list, directions and dialogue, in the case each was written", () => {
    const { text, places } = rename(source, "MARGARET", "Jane");
    expect(text.split("\n")).toEqual([
      "Title: Margaret's Garden",
      "Characters:",
      "    JANE, sixties",
      "    DAVID, Jane's son",
      "",
      "INT. JANE'S KITCHEN",
      "",
      "JANE enters. She will sit.",
      "",
      "DAVID",
      "(to Jane)",
      "Will you, Jane? JANE!",
      "",
      "JANE (V.O.)",
      "Never.",
      "",
      "JANE ^",
      "Never.",
    ]);
    expect(places).toEqual(["list", "list", "direction", "direction", "direction", "dialogue", "dialogue", "cue", "cue"]);
  });

  it("leaves the name alone written in lower case, or inside a longer word", () => {
    const { text } = rename("INT. ROOM\n\nWILL\nI will. Willow will.\n\nWILL\nYes.\n", "WILL", "Bob");
    expect(text).toBe("INT. ROOM\n\nBOB\nI will. Willow will.\n\nBOB\nYes.\n");
  });

  it("only changes a cue that is the whole name", () => {
    const { text } = rename("INT. ROOM\n\nANNE\nHi.\n\nANN\nHi.\n", "ANN", "Jo");
    expect(text).toBe("INT. ROOM\n\nANNE\nHi.\n\nJO\nHi.\n");
  });

  it("keeps a forcing mark and renames a name of several words", () => {
    const { text } = rename("INT. ROOM\n\n@MRS  SMITH\nHi.\n\nMrs Smith sits.\n", "MRS SMITH", "Mrs Jones");
    expect(text).toBe("INT. ROOM\n\n@MRS JONES\nHi.\n\nMrs Jones sits.\n");
  });

  it("renames names in a Characters section written in the body", () => {
    const { text, places } = rename("***Characters***\nMARGARET   sixties\n\n# ACT ONE\n\nMARGARET sits.\n", "MARGARET", "Jane");
    expect(text).toBe("***Characters***\nJANE   sixties\n\n# ACT ONE\n\nJANE sits.\n");
    expect(places).toEqual(["list", "direction"]);
  });

  it("finds nothing to change for the same name, or an empty one", () => {
    expect(findRenames(source, parseFountain(source), "MARGARET", "margaret ")).toEqual([]);
    expect(findRenames(source, parseFountain(source), "MARGARET", " ")).toEqual([]);
  });
});

describe("nameAt", () => {
  it("finds the longest name at a point in a line", () => {
    const names = ["SMITH", "MRS SMITH", "DAVID"];
    expect(nameAt("Then MRS SMITH sits.", 10, names)).toBe("MRS SMITH");
    expect(nameAt("David sits.", 0, names)).toBe("DAVID");
    expect(nameAt("David sits.", 8, names)).toBeUndefined();
    expect(nameAt("I will.", 3, ["WILL"])).toBeUndefined();
  });
});
