import { describe, expect, it } from "vitest";
import { type CycleMemory, describeLine, tabOnLine } from "../src/fountain/lineTypes";
import { parseFountain } from "../src/fountain/parser";

/** Presses Tab (or Shift+Tab) on a line `times` times, returning the line's text after each press. */
function press(source: string, line: number, times: number, direction: 1 | -1 = 1): string[] {
  const lines = source.split("\n");
  let memory: CycleMemory | undefined;
  const seen: string[] = [];
  for (let i = 0; i < times; i++) {
    const result = tabOnLine(lines.join("\n"), line, direction, memory);
    if (result.kind !== "replace") {
      seen.push(result.kind);
      continue;
    }
    lines[line] = result.text;
    memory = result.memory;
    seen.push(result.text);
  }
  return seen;
}

describe("tabOnLine", () => {
  it("asks for character names on an empty line that starts a block", () => {
    expect(tabOnLine("INT. ROOM\n\n", 2, 1)).toEqual({ kind: "names" });
    expect(tabOnLine("", 0, 1)).toEqual({ kind: "names" });
    expect(tabOnLine("INT. ROOM\n\n", 2, -1)).toEqual({ kind: "none" });
  });

  it("cycles a stage direction through character, scene heading and transition, and back", () => {
    expect(press("INT. ROOM\n\nMargaret enters.\n", 2, 4)).toEqual([
      "MARGARET ENTERS.",
      ".Margaret enters.",
      "> Margaret enters.",
      "Margaret enters.",
    ]);
  });

  it("goes the other way with Shift+Tab", () => {
    expect(press("INT. ROOM\n\nMargaret enters.\n", 2, 2, -1)).toEqual(["> Margaret enters.", ".Margaret enters."]);
  });

  it("leaves out marks the text doesn't need", () => {
    expect(press("A chair.\n\nINT. GREEN ROOM\n", 2, 2)).toEqual(["> INT. GREEN ROOM", "!INT. GREEN ROOM"]);
    expect(press("A chair.\n\nCUT TO:\n", 2, 1)).toEqual(["!CUT TO:"]);
  });

  it("forces a cue that would read as something else", () => {
    // "int. office" is already a scene heading, so Shift+Tab makes it a cue first.
    expect(press("INT. ROOM\n\nint. office\nHello.\n", 2, 3, -1)).toEqual(["@INT. OFFICE", "!int. office", "> int. office"]);
  });

  it("turns an existing cue into action that stays action", () => {
    expect(press("INT. ROOM\n\nMARGARET\nHello.\n", 2, 1, -1)).toEqual(["!MARGARET"]);
  });

  it("starts again once the line has been edited", () => {
    const first = tabOnLine("INT. ROOM\n\nMargaret enters.\n", 2, 1);
    expect(first.kind === "replace" && first.text).toBe("MARGARET ENTERS.");
    const memory = first.kind === "replace" ? first.memory : undefined;
    // Edited since, so it starts again from the line as it is. It's action
    // already in capitals, so becoming a cue wouldn't change it: Tab goes on
    // to a scene heading.
    const again = tabOnLine("INT. ROOM\n\nMARGARET LEAVES.\n", 2, 1, memory);
    expect(again.kind === "replace" && again.text).toBe(".MARGARET LEAVES.");
  });

  it("switches dialogue and parenthetical inside a speech", () => {
    const source = "INT. ROOM\n\nMARGARET\nlaughing\nHello.\n";
    expect(press(source, 3, 2)).toEqual(["(laughing)", "laughing"]);
    expect(press("INT. ROOM\n\nMARGARET\n(beat)\nHello.\n", 3, 1)).toEqual(["beat"]);
  });

  it("starts a parenthetical on an empty line under a cue or dialogue", () => {
    expect(tabOnLine("INT. ROOM\n\nMARGARET\n", 3, 1)).toEqual({ kind: "replace", text: "()", cursor: 1 });
    expect(tabOnLine("INT. ROOM\n\nMARGARET\nHello.\n", 4, 1)).toEqual({ kind: "replace", text: "()", cursor: 1 });
  });

  it("does nothing on the title page, in the preface or under a stage direction", () => {
    expect(tabOnLine("A note before the play.\n\nINT. ROOM\n", 0, 1)).toEqual({ kind: "none" });
    expect(tabOnLine("Title: A Play\nAuthor: Me\n\nINT. ROOM\n", 1, 1)).toEqual({ kind: "none" });
    expect(tabOnLine("INT. ROOM\n\nA chair.\n", 3, 1)).toEqual({ kind: "none" });
  });
});

describe("describeLine", () => {
  const source = [
    "Title: A Play",
    "",
    "Before the play.",
    "",
    "# Act One",
    "",
    "## Scene One",
    "= Margaret waits.",
    "",
    "INT. ROOM",
    "",
    "A chair.",
    "",
    "MARGARET",
    "(quietly)",
    "Hello.",
    "",
    "MARGARET",
    "",
    "> CUT TO:",
    "",
    "[[a note]]",
  ].join("\n");
  const script = parseFountain(source);
  const lines = source.split("\n");
  const at = (n: number) => describeLine(script, n, lines[n]);

  it("names each kind of line", () => {
    expect([0, 1, 2, 4, 6, 7, 9, 11, 13, 14, 15, 19].map(at)).toEqual([
      "Title page",
      "Blank line",
      "Preface",
      "Act",
      "Scene",
      "Synopsis",
      "Scene heading",
      "Stage direction",
      "Character",
      "Parenthetical",
      "Dialogue",
      "Transition",
    ]);
  });

  it("calls a cue with no dialogue yet a stage direction, as the parser reads it", () => {
    expect(at(17)).toBe("Stage direction");
  });

  it("names a line that's only a note", () => {
    expect(at(21)).toBe("Note or boneyard");
  });
});
