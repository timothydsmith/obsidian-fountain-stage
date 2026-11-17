import { describe, expect, it } from "vitest";
import { parseFountain, type ScriptElement } from "../src/fountain/parser";

/** Element types and text, for comparing shapes. */
const shape = (source: string) => parseFountain(source).elements.map((e) => [e.type, e.text]);
const find = (els: ScriptElement[], type: string) => els.find((e) => e.type === type)!;

describe("title page", () => {
  it("reads keys, values and indented continuation lines", () => {
    const r = parseFountain("Title: The Play\nAuthor: Tim\nContact:\n    1 Main St\n    Town\n\nINT. ROOM - DAY\n");
    expect(r.titleValues).toEqual({ title: ["The Play"], author: ["Tim"], contact: ["", "1 Main St", "Town"] });
    expect(r.titlePage.map((e) => [e.key, e.line, e.endLine])).toEqual([
      ["title", 0, 0],
      ["author", 1, 1],
      ["contact", 2, 4],
    ]);
    expect([0, 1, 2, 3, 4].map((i) => r.lineRoles.get(i))).toEqual(Array(5).fill("title-page"));
    expect(r.spans.filter((s) => s.kind === "title-key").map((s) => [s.from, s.to])).toEqual([
      [0, 6],
      [16, 23],
      [28, 36],
    ]);
  });

  it("is not a title page when a line in the block isn't a key or continuation", () => {
    const r = parseFountain("Title: X\nnot a key\n");
    expect(r.titlePage).toEqual([]);
    expect(r.elements[0].type).toBe("preface");
  });
});

describe("script elements", () => {
  it("parses a scene with a speech", () => {
    const source = [
      "# ACT ONE",
      "",
      "## Scene One",
      "",
      "INT. GREEN ROOM - NIGHT",
      "",
      "A bare bulb.",
      "",
      "MARGARET",
      "(not looking up)",
      "You said that before.",
      "",
      "> LIGHTS SHIFT TO:",
      "",
      ">THE NEXT WEEK<",
      "",
      "===",
    ].join("\n");
    expect(shape(source)).toEqual([
      ["section", "ACT ONE"],
      ["section", "Scene One"],
      ["scene_heading", "INT. GREEN ROOM - NIGHT"],
      ["action", "A bare bulb."],
      ["character", "MARGARET"],
      ["parenthetical", "(not looking up)"],
      ["dialogue", "You said that before."],
      ["transition", "LIGHTS SHIFT TO:"],
      ["centered", "THE NEXT WEEK"],
      ["page_break", ""],
    ]);
    const sections = parseFountain(source).elements.filter((e) => e.type === "section");
    expect(sections.map((s) => s.depth)).toEqual([1, 2]);
  });

  it("needs dialogue under an all-caps line to make it a character cue", () => {
    expect(shape("\nINT. ROOM\n\nBLACKOUT.\n")).toEqual([
      ["scene_heading", "INT. ROOM"],
      ["action", "BLACKOUT."],
    ]);
  });

  it("allows a lower-case extension on a character cue", () => {
    expect(shape("INT. ROOM\n\nMARGARET (v.o.)\nHello.\n")[1]).toEqual(["character", "MARGARET (v.o.)"]);
  });

  it("joins action lines into one paragraph until something else starts", () => {
    expect(shape("INT. ROOM\n\nShe sits.\nHe stands.\nDAVID\nHi.\n")).toEqual([
      ["scene_heading", "INT. ROOM"],
      ["action", "She sits. He stands."],
      ["character", "DAVID"],
      ["dialogue", "Hi."],
    ]);
  });

  it("treats text before the first scene as preface, with lists", () => {
    expect(shape("A note.\n\n- First song\n2. Second song\n\n# ACT ONE\n\n- not a list\n")).toEqual([
      ["preface", "A note."],
      ["preface_list_item", "First song"],
      ["preface_list_item", "Second song"],
      ["section", "ACT ONE"],
      ["action", "- not a list"],
    ]);
  });

  it("skips synopses but notes their lines", () => {
    const r = parseFountain("INT. ROOM\n\n= The confrontation\n\nAction.\n");
    expect(r.elements.map((e) => e.type)).toEqual(["scene_heading", "action"]);
    expect(r.lineRoles.get(2)).toBe("synopsis");
  });
});

describe("forced elements and markers", () => {
  const markers = (source: string) =>
    parseFountain(source)
      .spans.filter((s) => s.kind === "marker" || s.kind === "scene-number")
      .map((s) => [s.kind, source.slice(s.from, s.to)]);

  it("forces scene headings, characters, action and lyrics", () => {
    const source = ".FLASHBACK #4B#\n\n@McCLANE\nYippee.\n\n!SHOUTS FROM OFF\n\n~Sing a song\n";
    expect(shape(source)).toEqual([
      ["scene_heading", "FLASHBACK"],
      ["character", "McCLANE"],
      ["dialogue", "Yippee."],
      ["action", "SHOUTS FROM OFF"],
      ["action", "Sing a song"],
    ]);
    const els = parseFountain(source).elements;
    expect(find(els, "scene_heading").sceneNumber).toBe("4B");
    expect(els[4].italic).toBe(true);
    expect(markers(source)).toEqual([
      ["marker", "."],
      ["scene-number", "#4B#"],
      ["marker", "@"],
      ["marker", "!"],
      ["marker", "~"],
    ]);
  });

  it("marks section hashes and centered-text arrows", () => {
    expect(markers("## Scene One\n\n>CENTERED<\n")).toEqual([
      ["marker", "##"],
      ["marker", ">"],
      ["marker", "<"],
    ]);
  });

  it("does not treat an ellipsis as a forced scene heading", () => {
    expect(shape("INT. ROOM\n\n...and then nothing.\n")[1]).toEqual(["action", "...and then nothing."]);
  });
});

describe("dual dialogue", () => {
  it("tags both cues of the pair and marks the caret", () => {
    const source = "INT. ROOM\n\nALEX\nNow!\n\nBEN ^\nNow!\n";
    const els = parseFountain(source).elements.filter((e) => e.type === "character");
    expect(els.map((e) => [e.text, e.dual])).toEqual([
      ["ALEX", true],
      ["BEN", true],
    ]);
  });

  it("ignores a caret with no speech just before it", () => {
    const els = parseFountain("INT. ROOM\n\nAction.\n\nBEN ^\nNow!\n").elements;
    expect(find(els, "character")).toMatchObject({ text: "BEN" });
    expect(find(els, "character").dual).toBeUndefined();
  });
});

describe("boneyard and notes", () => {
  it("hides them from the text but keeps offsets true", () => {
    const source = "INT. ROOM\n\nShe [[check this]] sits.\n/* cut\nthis */\nDAVID\nHi.\n";
    const r = parseFountain(source);
    expect(r.elements.map((e) => [e.type, e.text])).toEqual([
      ["scene_heading", "INT. ROOM"],
      ["action", "She  sits."],
      ["character", "DAVID"],
      ["dialogue", "Hi."],
    ]);
    expect(r.spans.filter((s) => s.kind === "note" || s.kind === "boneyard").map((s) => [s.kind, source.slice(s.from, s.to)])).toEqual([
      ["note", "[[check this]]"],
      ["boneyard", "/* cut\nthis */"],
    ]);
    const action = find(r.elements, "action");
    expect(source.slice(action.from, action.to)).toBe("She [[check this]] sits.");
  });

  it("treats a line holding only a note as blank", () => {
    expect(shape("INT. ROOM\n\nBOB\n[[a note]]\nHello.\n")).toEqual([
      ["scene_heading", "INT. ROOM"],
      ["action", "BOB"],
      ["action", "Hello."],
    ]);
  });
});

describe("breakdown sections in the body", () => {
  it("moves them into the title values and marks their lines", () => {
    const source = "Title: X\n\n***Characters***\nMARGARET   sixties\nDAVID   thirty\n\n===\n\n# ACT ONE\n";
    const r = parseFountain(source);
    expect(r.titleValues.characters).toEqual(["MARGARET   sixties", "DAVID   thirty", ""]);
    expect(r.lineRoles.get(2)).toBe("breakdown-heading");
    expect(r.lineRoles.get(3)).toBe("breakdown");
    // The page break only separated the breakdown, so it's dropped.
    expect(r.elements.map((e) => e.type)).toEqual(["section"]);
  });
});

describe("positions", () => {
  it("gives elements their source lines and offsets", () => {
    const source = "INT. ROOM\n\n  She sits.\n  He stands.\n";
    const action = find(parseFountain(source).elements, "action");
    expect([action.line, action.endLine]).toEqual([2, 3]);
    expect(source.slice(action.from, action.to)).toBe("She sits.\n  He stands.");
  });

  it("handles Windows line endings", () => {
    expect(shape("INT. ROOM\r\n\r\nDAVID\r\nHi.\r\n")).toEqual([
      ["scene_heading", "INT. ROOM"],
      ["character", "DAVID"],
      ["dialogue", "Hi."],
    ]);
  });
});
