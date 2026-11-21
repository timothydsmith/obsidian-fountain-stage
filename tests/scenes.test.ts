import { describe, expect, it } from "vitest";
import { actMatcher } from "../src/fountain/acts";
import { parseFountain } from "../src/fountain/parser";
import {
  canSplitAt,
  headingLine,
  mergeWithPrevious,
  moveScene,
  moveSceneTo,
  nextHeading,
  nextSceneLine,
  nextSpeechLine,
  numberWord,
  renumberEdits,
  renumberScenes,
  type ScriptEdit,
  splitScene,
} from "../src/fountain/scenes";
import { applyEdits } from "../src/fountain/titlePage";

const isAct = actMatcher();
const apply = (source: string, edit: ScriptEdit | undefined) => {
  if (!edit) throw new Error("no edit");
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
};
const lineOf = (source: string, text: string) => source.slice(0, source.indexOf(text)).split("\n").length - 1;

const play = [
  "Title: Play",
  "",
  ".ACT ONE",
  "",
  ".SCENE 1",
  "",
  "A chair.",
  "",
  ".SCENE 2",
  "= The second scene.",
  "",
  "NORA",
  "Hello.",
  "",
  ".ACT TWO",
  "",
  ".SCENE 3",
  "",
  "NORA",
  "Goodbye.",
  "",
].join("\n");

describe("moving scenes", () => {
  const move = (source: string, text: string, direction: -1 | 1) => moveScene(source, parseFountain(source), isAct, lineOf(source, text), direction);

  it("swaps a scene with the one before or after it", () => {
    const up = apply(play, move(play, "Hello.", -1));
    expect(up).toContain(".SCENE 2\n= The second scene.\n\nNORA\nHello.\n\n.SCENE 1\n\nA chair.\n\n.ACT TWO");
    const down = apply(play, move(play, "A chair.", 1));
    expect(down).toBe(up);
  });

  it("moves a scene past an act heading, into the other act", () => {
    expect(apply(play, move(play, "Goodbye.", -1))).toContain("Hello.\n\n.SCENE 3\n\nNORA\nGoodbye.\n\n.ACT TWO\n");
    expect(apply(play, move(play, "Hello.", 1))).toContain(".ACT TWO\n\n.SCENE 2\n= The second scene.\n\nNORA\nHello.\n");
  });

  it("puts the cursor on the moved scene's heading", () => {
    const edit = move(play, "Hello.", -1)!;
    const result = apply(play, edit);
    expect(result.slice(edit.cursor, edit.cursor + 8)).toBe(".SCENE 2");
  });

  it("goes no further than the ends, and moves only scenes", () => {
    expect(move(play, "Goodbye.", 1)).toBeUndefined();
    expect(move(play, ".ACT TWO", -1)).toBeUndefined();
    expect(move(play, "Title", -1)).toBeUndefined();
  });

  it("keeps the end of a script without a final line break", () => {
    const source = "INT. A\n\nOne.\n\nINT. B\n\nTwo.";
    expect(apply(source, move(source, "Two.", -1))).toBe("INT. B\n\nTwo.\n\nINT. A\n\nOne.");
  });

  it("moves a scene to before or after another, for dragging in the outline", () => {
    const script = parseFountain(play);
    const to = (scene: string, target: string, after: boolean) =>
      apply(play, moveSceneTo(play, script, isAct, lineOf(play, scene), lineOf(play, target), after));
    expect(to(".SCENE 3", ".SCENE 1", false)).toContain(".ACT ONE\n\n.SCENE 3\n\nNORA\nGoodbye.\n\n.SCENE 1\n");
    expect(to(".SCENE 1", ".ACT TWO", true)).toContain(".ACT TWO\n\n.SCENE 1\n\nA chair.\n\n.SCENE 3\n");
    expect(moveSceneTo(play, script, isAct, lineOf(play, ".SCENE 1"), lineOf(play, ".SCENE 2"), false)).toBeUndefined();
  });
});

describe("jumping", () => {
  const script = parseFountain(play);

  it("finds the next and previous scene headings, acts included", () => {
    expect(nextSceneLine(script, lineOf(play, "A chair."), 1)).toBe(lineOf(play, ".SCENE 2"));
    expect(nextSceneLine(script, lineOf(play, "Hello."), 1)).toBe(lineOf(play, ".ACT TWO"));
    expect(nextSceneLine(script, lineOf(play, "A chair."), -1)).toBe(lineOf(play, ".SCENE 1"));
    expect(nextSceneLine(script, lineOf(play, "Goodbye."), 1)).toBeUndefined();
  });

  it("finds the next and previous speech by the character speaking", () => {
    expect(nextSpeechLine(script, lineOf(play, "Hello."), 1)).toEqual({ name: "NORA", line: lineOf(play, "NORA\nGoodbye.") });
    expect(nextSpeechLine(script, lineOf(play, "Goodbye."), -1)).toEqual({ name: "NORA", line: lineOf(play, "NORA\nHello.") });
    expect(nextSpeechLine(script, lineOf(play, "Goodbye."), 1)).toEqual({ name: "NORA", line: undefined });
    expect(nextSpeechLine(script, lineOf(play, "A chair."), 1)).toBeUndefined();
  });

  it("matches cues whatever their extensions", () => {
    const source = "INT. A\n\nNORA (V.O.)\nHi.\n\nTOM\nYes.\n\nNORA\nAgain.\n";
    expect(nextSpeechLine(parseFountain(source), 3, 1)).toEqual({ name: "NORA", line: 8 });
  });
});

describe("splitting and merging", () => {
  it("starts a new scene at the cursor's line, forced unless it starts like INT.", () => {
    const source = "INT. ROOM\n\nA chair.\n\nA table.\n";
    expect(apply(source, splitScene(source, parseFountain(source), 4, "INT. ROOM - LATER"))).toBe("INT. ROOM\n\nA chair.\n\nINT. ROOM - LATER\n\nA table.\n");
    expect(apply(source, splitScene(source, parseFountain(source), 3, "Later"))).toBe("INT. ROOM\n\nA chair.\n\n.Later\n\nA table.\n");
    expect(splitScene(source, parseFountain(source), 0, "X")).toBeUndefined();
  });

  it("doesn't start a scene in the title page", () => {
    const source = "Title: Play\nAuthor: Me\n\nINT. ROOM\n\nA chair.\n";
    const script = parseFountain(source);
    expect(canSplitAt(script, 0)).toBe(false);
    expect(splitScene(source, script, 1, "X")).toBeUndefined();
    expect(apply(source, splitScene(source, script, 2, ".PROLOGUE"))).toBe("Title: Play\nAuthor: Me\n\n.PROLOGUE\n\nINT. ROOM\n\nA chair.\n");
  });

  it("splits partway through a paragraph with blank lines around the heading", () => {
    const source = "INT. ROOM\n\nOne.\nTwo.\n";
    expect(apply(source, splitScene(source, parseFountain(source), 3, ".SCENE 2"))).toBe("INT. ROOM\n\nOne.\n\n.SCENE 2\n\nTwo.\n");
  });

  it("joins a scene to the one before, moving its synopsis up", () => {
    const merged = applyEdits(play, mergeWithPrevious(play, parseFountain(play), isAct, lineOf(play, "Hello."))!);
    expect(merged).toContain(".SCENE 1\n= The second scene.\n\nA chair.\n\nNORA\nHello.\n\n.ACT TWO");
  });

  it("only joins a scene to a scene", () => {
    expect(mergeWithPrevious(play, parseFountain(play), isAct, lineOf(play, "A chair."))).toBeUndefined();
    expect(mergeWithPrevious(play, parseFountain(play), isAct, lineOf(play, "Goodbye."))).toBeUndefined();
  });

  it("writes a heading line", () => {
    expect(headingLine("EXT. GARDEN")).toBe("EXT. GARDEN");
    expect(headingLine("Scene 4")).toBe(".Scene 4");
    expect(headingLine(".SCENE 4")).toBe(".SCENE 4");
  });
});

describe("renumbering", () => {
  const source = [
    ".ACT ONE", "", ".SCENE ONE", "", "A.", "", ".SCENE THREE", "", "B.", "",
    ".ACT TWO", "", ".Scene Seven", "", "C.", "", "INT. ROOM #9#", "", "D.", "",
  ].join("\n");
  const script = parseFountain(source);

  it("restarts in each act, keeping digits as digits and words as words in their case", () => {
    const changes = renumberScenes(source, script, isAct, true);
    expect(changes.map((c) => c.after)).toEqual([".SCENE TWO", ".Scene One", "INT. ROOM #2#"]);
  });

  it("counts straight through the play", () => {
    const result = applyEdits(source, renumberEdits(source, renumberScenes(source, script, isAct, false)));
    expect(result).toContain(".SCENE TWO\n");
    expect(result).toContain(".Scene Three\n");
    expect(result).toContain("INT. ROOM #4#\n");
  });

  it("leaves scenes already in order alone", () => {
    const ordered = ".SCENE 1\n\nA.\n\n.SCENE 2\n\nB.\n";
    expect(renumberScenes(ordered, parseFountain(ordered), isAct, true)).toEqual([]);
  });

  it("writes numbers past ninety-nine in digits", () => {
    const many = Array.from({ length: 100 }, () => ".SCENE ONE\n\nA.\n").join("\n");
    const changes = renumberScenes(many, parseFountain(many), isAct, false);
    expect(changes.at(-2)?.after).toBe(".SCENE NINETY-NINE");
    expect(changes.at(-1)?.after).toBe(".SCENE 100");
  });

  it("writes numbers in words", () => {
    expect(numberWord(7)).toBe("seven");
    expect(numberWord(21)).toBe("twenty-one");
    expect(numberWord(40)).toBe("forty");
  });

  it("suggests the next heading for a split", () => {
    expect(nextHeading(".SCENE 3")).toBe(".SCENE 4");
    expect(nextHeading(".SCENE TWENTY")).toBe(".SCENE TWENTY-ONE");
    expect(nextHeading("INT. ROOM #9#")).toBe("INT. ROOM");
  });
});
