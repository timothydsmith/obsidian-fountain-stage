import { describe, expect, it } from "vitest";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import {
  countWords,
  formatDuration,
  outlineRuntimes,
  pagesTimeline,
  wordsTimeline,
} from "../src/fountain/runtime";
import type { Placement } from "../src/pdf/model";

describe("countWords", () => {
  it("counts words, not punctuation", () => {
    expect(countWords("Don't -- *ever* say that, Margaret!")).toBe(5);
    expect(countWords("...")).toBe(0);
  });
});

describe("wordsTimeline", () => {
  const source = [
    "Title: A Play",
    "",
    "A note before the play.",
    "",
    ".ACT ONE",
    "",
    "INT. ROOM",
    "",
    "She sits down slowly.",
    "",
    "MARGARET",
    "(beat)",
    "One two three four five six.",
    "",
    ".ACT TWO",
    "",
    "Silence.",
  ].join("\n");
  const script = parseFountain(source);
  const t = wordsTimeline(script, 60);

  it("times dialogue at the speaking rate, stage directions at half, and pauses", () => {
    // 4 words of direction at half a second each, a 1 s beat, 6 words spoken,
    // then a 5 s silence (and its word).
    expect(t.total).toBeCloseTo(2 + 1 + 6 + 5 + 0.5);
    expect(t.at(4)).toBe(0);
    expect(t.at(10)).toBeCloseTo(2);
    expect(t.at(14)).toBeCloseTo(9);
  });

  it("gives each act and scene the time to the next heading outside it", () => {
    const outline = buildOutline(source);
    const runtimes = outlineRuntimes(outline, t);
    expect(runtimes.get(outline[0])).toBeCloseTo(9);
    expect(runtimes.get(outline[0].children[0])).toBeCloseTo(9);
    expect(runtimes.get(outline[1])).toBeCloseTo(5.5);
  });
});

describe("pagesTimeline", () => {
  it("times by how far down the pages each line is, from where the play starts", () => {
    const script = parseFountain("A preface.\n\n.ACT ONE\n\nA chair.\n\n.ACT TWO\n\nAnother chair.\n");
    const placements: Placement[] = [
      { page: 0, line: 0, continues: false, at: 0, end: 0.1 },
      { page: 1, line: 2, continues: false, at: 0, end: 0.05 },
      { page: 1, line: 4, continues: false, at: 0.1, end: 0.15 },
      { page: 2, line: 6, continues: false, at: 0, end: 0.05 },
      { page: 2, line: 8, continues: false, at: 0.1, end: 0.5 },
    ];
    const t = pagesTimeline(script, placements, 2);
    expect(t.total).toBeCloseTo(1.5 * 120);
    expect(t.at(6)).toBeCloseTo(120);
    expect(t.at(0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("rounds to seconds, minutes, or hours and minutes", () => {
    expect([45, 89, 600, 3600, 5520].map(formatDuration)).toEqual(["45 s", "1 min", "10 min", "1 h", "1 h 32 min"]);
  });
});
