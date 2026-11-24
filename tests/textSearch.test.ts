import { describe, expect, it } from "vitest";
import { excerpt, searchText } from "../src/fountain/textSearch";

const SCRIPT = ["INT. KITCHEN", "", "NORA", "Where is the knife?", "", "TORVALD", "In the kitchen, Nora."].join("\r\n");

describe("searchText", () => {
  it("finds lines ignoring case by default", () => {
    expect(searchText(SCRIPT, "kitchen")).toEqual([
      { line: 0, text: "INT. KITCHEN", matches: [[5, 12]] },
      { line: 6, text: "In the kitchen, Nora.", matches: [[7, 14]] },
    ]);
  });

  it("matches case when asked", () => {
    expect(searchText(SCRIPT, "Nora", { matchCase: true }).map((m) => m.line)).toEqual([6]);
  });

  it("finds every match on a line, without overlaps", () => {
    expect(searchText("aaaa", "aa")[0].matches).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it("finds whole words only when asked", () => {
    expect(searchText("the theatre, the end", "the", { wholeWord: true })[0].matches).toEqual([
      [0, 3],
      [13, 16],
    ]);
    expect(searchText("Nora's", "Nora", { wholeWord: true })).toEqual([]);
  });

  it("stops at the limit", () => {
    const results = searchText("a a\na a", "a", {}, 3);
    expect(results.flatMap((r) => r.matches)).toHaveLength(3);
  });

  it("finds nothing for an empty query", () => {
    expect(searchText(SCRIPT, "")).toEqual([]);
  });
});

describe("excerpt", () => {
  it("leaves short lines alone", () => {
    const [match] = searchText("short line", "line");
    expect(excerpt(match)).toEqual({ text: "short line", matches: [[6, 10]] });
  });

  it("cuts a long line around its first match", () => {
    const line = `${"x".repeat(200)}needle${"y".repeat(200)}`;
    const [match] = searchText(line, "needle");
    const { text, matches } = excerpt(match, 40);
    expect(text.startsWith("…")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.slice(matches[0][0], matches[0][1])).toBe("needle");
  });
});
