import { describe, expect, it } from "vitest";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import { buildReport } from "../src/fountain/report";
import { formatPages, formatShare, reportMarkdown } from "../src/fountain/reportMarkdown";
import { wordsTimeline } from "../src/fountain/runtime";

const source = [
  "Title: A Play",
  "Characters:",
  "    MARGARET, sixties",
  "    DAVID, her son",
  "    THE GHOST",
  "",
  "A note before the play.",
  "",
  "# ACT ONE",
  "",
  "## Scene One",
  "",
  "MARGARET sits. David is at the door.",
  "",
  "MARGARET",
  "(to David)",
  "Come in or go out.",
  "",
  "DAVID",
  "Out.",
  "",
  "## Scene Two",
  "",
  "ANNIE",
  "Hello hello.",
  "",
  "# ACT TWO",
  "",
  "INT. KITCHEN",
  "",
  "MARGARET",
  "Gone.",
].join("\n");

const report = (text = source) => {
  const script = parseFountain(text);
  return buildReport(script, buildOutline(text), { wordsPerMinute: 60, timeline: wordsTimeline(script, 60) });
};

describe("buildReport", () => {
  it("lists the smallest parts of the outline as scenes, with their acts", () => {
    const { scenes } = report();
    expect(scenes.map((s) => [s.number, s.title, s.act])).toEqual([
      [1, "Scene One", "ACT ONE"],
      [2, "Scene Two", "ACT ONE"],
      [3, "INT. KITCHEN", "ACT TWO"],
    ]);
  });

  it("counts each scene's speeches, words and cast, named or speaking", () => {
    const { scenes } = report();
    expect(scenes.map((s) => [s.speeches, s.words, s.characters])).toEqual([
      [2, 6, ["MARGARET", "DAVID"]],
      [1, 2, ["ANNIE"]],
      [1, 1, ["MARGARET"]],
    ]);
    // 7 words of direction at half a second each, then 6 words spoken.
    expect(scenes[0].seconds).toBeCloseTo(3.5 + 6);
  });

  it("gives each character's words, share, scenes and who they could double with", () => {
    const { characters, totals } = report();
    expect(characters.map((c) => [c.name, c.speeches, c.words, c.scenes, c.couldDouble])).toEqual([
      ["MARGARET", 2, 6, [0, 2], ["ANNIE"]],
      ["ANNIE", 1, 2, [1], ["MARGARET", "DAVID"]],
      ["DAVID", 1, 1, [0], ["ANNIE"]],
      ["THE GHOST", 0, 0, [], []],
    ]);
    expect(characters[0].share).toBeCloseTo(6 / 9);
    expect(characters[0].seconds).toBeCloseTo(6);
    expect(characters[2].firstLine).toBe(12);
    const { seconds, ...counts } = totals;
    expect(counts).toEqual({ pages: undefined, words: 9, speeches: 4, acts: 2, scenes: 3, characters: 3 });
    expect(seconds).toBeGreaterThan(0);
  });

  it("makes text before the first heading a scene, or the whole script one", () => {
    expect(report("MARGARET\nHi.\n\n# ACT ONE\n\nDAVID\nBye.\n").scenes.map((s) => s.title)).toEqual(["Before the first scene", "ACT ONE"]);
    expect(report("MARGARET\nHi.\n").scenes.map((s) => [s.title, s.characters])).toEqual([["The whole script", ["MARGARET"]]]);
  });

  it("puts a direction between an act's heading and its first scene in that scene", () => {
    const { scenes } = report("# ACT ONE\n\nDAVID waits.\n\n## Scene One\n\nMARGARET\nHi.\n\nDAVID\nBye.\n");
    expect(scenes[0].characters).toEqual(["DAVID", "MARGARET"]);
  });

  it("finds the longest name, so MRS SMITH isn't also SMITH", () => {
    const { scenes } = report("INT. ROOM\n\nSMITH\nHi.\n\nINT. HALL\n\nMRS SMITH enters.\n\nMRS SMITH\nHello.\n");
    expect(scenes.map((s) => s.characters)).toEqual([["SMITH"], ["MRS SMITH"]]);
  });
});

describe("reportMarkdown", () => {
  it("writes the report as tables", () => {
    const md = reportMarkdown(report(), { title: "A Play", date: "18 November 2026", method: "the words spoken" });
    expect(md).toMatchSnapshot();
    expect(md).toContain("| MARGARET | ● |  | ● |");
    expect(md).toContain("- **MARGARET** with ANNIE");
  });

  it("escapes a pipe in a scene's title", () => {
    const md = reportMarkdown(report("INT. ROOM | NIGHT\n\nMARGARET\nHi.\n"), { title: "X", date: "today", method: "pages" });
    expect(md).toContain("INT. ROOM \\| NIGHT");
  });
});

describe("formatting", () => {
  it("formats pages and shares", () => {
    expect([undefined, 0.25, 2.46, 12.6].map(formatPages)).toEqual(["–", "0.3", "2.5", "13"]);
    expect([0, 0.004, 0.123].map(formatShare)).toEqual(["–", "<1%", "12%"]);
  });
});
