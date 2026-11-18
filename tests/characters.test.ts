import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { characterNames, completeName } from "../src/fountain/characters";
import { parseFountain } from "../src/fountain/parser";

describe("characterNames", () => {
  it("takes names from cues and the Characters list, most cues first", () => {
    const script = parseFountain(
      [
        "Title: A Play",
        "Characters:",
        "    Mrs Smith, a neighbour",
        "    THE GHOST - unseen",
        "",
        "INT. ROOM",
        "",
        "DAVID",
        "Hello.",
        "",
        "MARGARET (V.O.)",
        "Hello.",
        "",
        "DAVID (CONT'D)",
        "Again.",
        "",
        "BRICK ^",
        "Me too.",
      ].join("\n"),
    );
    expect(characterNames(script)).toEqual(["DAVID", "BRICK", "MARGARET", "MRS SMITH", "THE GHOST"]);
  });

  it("reads a Characters list with spaced descriptions and lines of prose", () => {
    const script = parseFountain(
      [
        "***Characters***",
        "NICHOLAS     46. Political strategist.",
        "",
        "The following characters appear in video segments throughout the play.",
        "",
        "JOANNE PRESCOTT           News Anchor",
        "A forward slash (\"/\") indicates overlapping dialogue.",
        "The beats, pauses, and silences are important.",
        "",
        "# ACT ONE",
      ].join("\n"),
    );
    expect(characterNames(script)).toEqual(["JOANNE PRESCOTT", "NICHOLAS"]);
  });

  it("leaves out the cue being typed", () => {
    const script = parseFountain("INT. ROOM\n\nDAVID\nHello.\n\nDAV\nHi.\n");
    expect(characterNames(script, 5)).toEqual(["DAVID"]);
  });

  it("reads the sample script", () => {
    const sample = readFileSync(new URL("./fixtures/sample.fountain", import.meta.url), "utf8");
    expect(characterNames(parseFountain(sample))).toEqual(["DAVID", "MARGARET"]);
  });
});

describe("completeName", () => {
  const names = ["DAVID", "MARGARET", "MRS SMITH", "MRS JONES", "DAVIDSON"];

  it("starts after two capitals in a row", () => {
    expect(completeName("D", names)).toBeNull();
    expect(completeName("Da", names)).toBeNull();
    expect(completeName("DA", names)).toEqual({ from: 0, names: ["DAVID", "DAVIDSON"] });
  });

  it("works anywhere in a line", () => {
    expect(completeName("She hands MA", names)).toEqual({ from: 10, names: ["MARGARET"] });
    expect(completeName("    MA", names)).toEqual({ from: 4, names: ["MARGARET"] });
  });

  it("completes names of several words", () => {
    expect(completeName("MRS", names)).toEqual({ from: 0, names: ["MRS SMITH", "MRS JONES"] });
    expect(completeName("Then MRS SM", names)).toEqual({ from: 5, names: ["MRS SMITH"] });
  });

  it("completes the last word when the words before it start no name", () => {
    expect(completeName("LIGHTS UP ON DA", names)).toEqual({ from: 13, names: ["DAVID", "DAVIDSON"] });
  });

  it("offers nothing for a name typed in full, or no match", () => {
    expect(completeName("DAVIDSON", names)).toBeNull();
    expect(completeName("DAVID", names)).toBeNull();
    expect(completeName("DAVIDS", names)).toEqual({ from: 0, names: ["DAVIDSON"] });
    expect(completeName("INT", names)).toBeNull();
  });
});
