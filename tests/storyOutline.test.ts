import { describe, expect, it } from "vitest";
import { actMatcher } from "../src/fountain/acts";
import { layoutBeatMap } from "../src/fountain/beatMap";
import { builtInFrameworks, parseFramework } from "../src/fountain/frameworks";
import type { OutlineItem } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import { addScene, addSection, blockEnd, frameworkLines, linkEdits, synopsisEdits } from "../src/fountain/planning";
import { moveBeatTo, moveScene } from "../src/fountain/scenes";
import { buildStoryOutline, hasBeats } from "../src/fountain/storyOutline";
import { applyEdits } from "../src/fountain/titlePage";

const SCRIPT = `Title: Test

.ACT ONE

# Setup
= Who they are.
[[>Beat - Setup]]

INT. KITCHEN - DAY

## Anna arrives

ANNA
Hello.

## Tom leaves

TOM
Goodbye.

# Catalyst

EXT. GARDEN - DAY

ANNA
Look.

.ACT TWO

INT. ATTIC - NIGHT

TOM
Boxes.
`;

const isAct = actMatcher();

/** An outline as [kind text [children]] for easy comparison. */
function shape(items: OutlineItem[]): unknown[] {
  return items.map((item) => (item.children.length ? [item.kind, item.text, shape(item.children)] : [item.kind, item.text]));
}

describe("buildStoryOutline", () => {
  it("shows acts, scenes and action beats by act, leaving out story beats", () => {
    expect(shape(buildStoryOutline(SCRIPT, "act", isAct))).toEqual([
      [
        "act",
        "ACT ONE",
        [
          ["scene", "INT. KITCHEN - DAY", [["action", "Anna arrives"], ["action", "Tom leaves"]]],
          ["scene", "EXT. GARDEN - DAY"],
        ],
      ],
      ["act", "ACT TWO", [["scene", "INT. ATTIC - NIGHT"]]],
    ]);
  });

  it("shows story beats, scenes and action beats by beat, with acts where they fall", () => {
    expect(shape(buildStoryOutline(SCRIPT, "beat", isAct))).toEqual([
      ["act", "ACT ONE"],
      ["section", "Setup", [["scene", "INT. KITCHEN - DAY", [["action", "Anna arrives"], ["action", "Tom leaves"]]]]],
      ["section", "Catalyst", [["scene", "EXT. GARDEN - DAY"], ["act", "ACT TWO"], ["scene", "INT. ATTIC - NIGHT"]]],
    ]);
  });

  it("reads a beat's synopsis and linked note", () => {
    const [, setup] = buildStoryOutline(SCRIPT, "beat", isAct);
    expect(setup.synopsis).toBe("Who they are.");
    expect(setup.link).toBe("Beat - Setup");
  });

  it("takes deeper sections as story beats with a deeper action beat depth", () => {
    const outline = buildStoryOutline(SCRIPT, "beat", isAct, 3);
    expect(shape(outline)[1]).toEqual(["section", "Setup", [["scene", "INT. KITCHEN - DAY"], ["section", "Anna arrives"], ["section", "Tom leaves"]]]);
  });

  it("knows whether a script has story beats", () => {
    expect(hasBeats(parseFountain(SCRIPT))).toBe(true);
    expect(hasBeats(parseFountain("INT. ROOM\n\nAction.\n"))).toBe(false);
  });
});

describe("planning", () => {
  const script = parseFountain(SCRIPT);
  const lines = SCRIPT.split("\n");
  const lineOf = (text: string) => lines.indexOf(text);

  it("finds where each kind of heading's block ends", () => {
    expect(blockEnd(SCRIPT, script, isAct, lineOf("# Setup"), 2)).toBe(lineOf("# Catalyst"));
    expect(blockEnd(SCRIPT, script, isAct, lineOf("INT. KITCHEN - DAY"), 2)).toBe(lineOf("# Catalyst"));
    expect(blockEnd(SCRIPT, script, isAct, lineOf("## Anna arrives"), 2)).toBe(lineOf("## Tom leaves"));
    expect(blockEnd(SCRIPT, script, isAct, lineOf(".ACT ONE"), 2)).toBe(lineOf(".ACT TWO"));
  });

  it("adds a beat as a paragraph of its own before a heading", () => {
    const edit = addSection(SCRIPT, lineOf("# Catalyst"), "Debate", 1, "Should she stay?");
    const out = applyEdits(SCRIPT, [edit]);
    expect(out).toContain("Goodbye.\n\n# Debate\n= Should she stay?\n\n# Catalyst");
    expect(out.slice(edit.cursor - "# Debate".length, edit.cursor)).toBe("# Debate");
  });

  it("adds a scene at the end of the script, forcing its heading", () => {
    const out = applyEdits(SCRIPT, [addScene(SCRIPT, lines.length + 5, "The roof", "They climb out.")]);
    expect(out.endsWith("Boxes.\n\n.The roof\n= They climb out.\n")).toBe(true);
  });

  it("sets, replaces and removes a synopsis", () => {
    const kitchen = lineOf("INT. KITCHEN - DAY");
    expect(applyEdits(SCRIPT, synopsisEdits(SCRIPT, script, kitchen, "Morning."))).toContain("INT. KITCHEN - DAY\n= Morning.\n");
    const setup = lineOf("# Setup");
    expect(applyEdits(SCRIPT, synopsisEdits(SCRIPT, script, setup, "Who they really are."))).toContain("# Setup\n= Who they really are.\n[[>Beat - Setup]]");
    expect(applyEdits(SCRIPT, synopsisEdits(SCRIPT, script, setup, ""))).toContain("# Setup\n[[>Beat - Setup]]");
  });

  it("links a note after the synopsis, once", () => {
    const catalyst = lineOf("# Catalyst");
    expect(applyEdits(SCRIPT, linkEdits(SCRIPT, script, catalyst, "Beat - Catalyst"))).toContain("# Catalyst\n[[>Beat - Catalyst]]\n");
    expect(linkEdits(SCRIPT, script, lineOf("# Setup"), "Other")).toEqual([]);
  });

  it("writes a framework's beats as sections with synopses", () => {
    expect(frameworkLines([{ name: "Need", description: "They want\nsomething." }, { name: "Go", description: "" }])).toEqual(["# Need", "= They want something.", "", "# Go"]);
  });
});

describe("moving scenes and beats", () => {
  const script = parseFountain(SCRIPT);
  const lines = SCRIPT.split("\n");
  const lineOf = (text: string) => lines.indexOf(text);

  it("moves a scene with its action beats", () => {
    const edit = moveScene(SCRIPT, script, isAct, lineOf("INT. KITCHEN - DAY"), 1, 2);
    const out = applyEdits(SCRIPT, edit ? [edit] : []);
    expect(out.indexOf("# Catalyst")).toBeLessThan(out.indexOf("INT. KITCHEN - DAY"));
    expect(out.indexOf("INT. KITCHEN - DAY")).toBeLessThan(out.indexOf("## Tom leaves"));
    expect(out.indexOf("## Tom leaves")).toBeLessThan(out.indexOf("EXT. GARDEN - DAY"));
  });

  it("moves a beat with everything it holds", () => {
    const edit = moveBeatTo(SCRIPT, script, isAct, lineOf("# Catalyst"), lineOf("# Setup"), false, 2);
    const out = applyEdits(SCRIPT, edit ? [edit] : []);
    const order = ["# Catalyst", "EXT. GARDEN - DAY", ".ACT TWO", "# Setup", "INT. KITCHEN - DAY", "## Tom leaves"].map((text) => out.indexOf(text));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("won't move a beat inside itself", () => {
    expect(moveBeatTo(SCRIPT, script, isAct, lineOf("# Setup"), lineOf("INT. KITCHEN - DAY"), true, 2)).toBeUndefined();
  });
});

describe("frameworks", () => {
  it("reads a framework note", () => {
    const result = parseFramework("---\ntags: x\n---\n# Mine\nMy own.\n\n## Start\nPosition: 0%\nIt **begins**.\n\n## End\nPosition: 90\nIt ends.", "Mine.md", "Mine file");
    expect(result).toEqual({
      framework: {
        id: "Mine.md",
        name: "Mine",
        description: "My own.",
        beats: [
          { name: "Start", position: 0, description: "It begins." },
          { name: "End", position: 0.9, description: "It ends." },
        ],
      },
    });
  });

  it("says what's wrong with a framework it can't read", () => {
    expect(parseFramework("# Empty\nNothing here.", "x", "x")).toEqual({ error: "It has no beats. Start each beat with a ## heading." });
    expect(parseFramework("## Late\nPosition: 120%", "x", "x")).toEqual({ error: 'The position of "Late" (line 2) is more than 100%.' });
  });

  it("has the built-in frameworks, each beat placed", () => {
    const frameworks = builtInFrameworks();
    expect(frameworks.map((f) => f.name)).toEqual(["Three-act structure", "Freytag's pyramid", "Story Spine", "Story Circle", "Kishōtenketsu", "Save the Cat"]);
    for (const framework of frameworks) for (const beat of framework.beats) expect(beat.position).toBeTypeOf("number");
  });
});

describe("layoutBeatMap", () => {
  const outline = buildStoryOutline(SCRIPT, "beat", isAct);
  const items: OutlineItem[] = [];
  const walk = (list: OutlineItem[]) => list.forEach((item) => (items.push(item), walk(item.children)));
  walk(outline);
  const byText = (text: string) => items.find((item) => item.text === text) as OutlineItem;
  // Each scene runs a minute, from the line it starts on.
  const runtimes = new Map<OutlineItem, number>([
    [byText("INT. KITCHEN - DAY"), 60],
    [byText("Anna arrives"), 30],
    [byText("Tom leaves"), 30],
    [byText("EXT. GARDEN - DAY"), 60],
    [byText("INT. ATTIC - NIGHT"), 60],
    [byText("Setup"), 60],
    [byText("Catalyst"), 120],
  ]);
  const starts = new Map<number, number>([
    [byText("INT. KITCHEN - DAY").line, 0],
    [byText("Anna arrives").line, 0],
    [byText("Tom leaves").line, 30],
    [byText("EXT. GARDEN - DAY").line, 60],
    [byText("INT. ATTIC - NIGHT").line, 120],
  ]);
  const at = (line: number) => starts.get(line) ?? 0;
  const options = { equal: false, scale: 2, minWidth: 40, cardWidth: 150, emptyWidth: 100, gap: 10 };

  it("sizes scenes by runtime, with beats over the scenes they hold", () => {
    const layout = layoutBeatMap(outline, runtimes, at, options);
    expect(layout.scenes.map((s) => [s.item.text, s.x, s.width])).toEqual([
      ["INT. KITCHEN - DAY", 0, 120],
      ["EXT. GARDEN - DAY", 130, 120],
      ["INT. ATTIC - NIGHT", 260, 120],
    ]);
    expect(layout.beats.map((b) => [b.item.text, b.x, b.width, b.empty])).toEqual([
      ["Setup", 0, 120, false],
      ["Catalyst", 130, 250, false],
    ]);
    expect(layout.scenes[0].actions.map((a) => [a.x, a.width])).toEqual([
      [0, 60],
      [60, 60],
    ]);
    expect(layout.acts.map((a) => [a.item.text, a.x])).toEqual([
      ["ACT ONE", 0],
      ["ACT TWO", 260],
    ]);
    expect(layout.xAt(90)).toBe(190);
    expect(layout.width).toBe(380);
  });

  it("makes every scene the same width as cards, and gives an empty beat a box", () => {
    const planned = buildStoryOutline("# Setup\n\n# Catalyst\n\nINT. ROOM\n\nAction.\n", "beat", isAct);
    const layout = layoutBeatMap(planned, new Map(), () => 0, { ...options, equal: true });
    expect(layout.beats.map((b) => [b.item.text, b.x, b.width, b.empty])).toEqual([
      ["Setup", 0, 150, true],
      ["Catalyst", 160, 150, false],
    ]);
  });
});
