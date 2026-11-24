import { describe, expect, it } from "vitest";
import { eolOf, lineAt, lineStarts } from "../src/fountain/lines";
import { longestRun } from "../src/fountain/sequence";

describe("lines", () => {
  it("finds where each line starts", () => {
    expect(lineStarts("")).toEqual([0]);
    expect(lineStarts("ab\ncd\n")).toEqual([0, 3, 6]);
    expect(lineStarts("a\r\nb")).toEqual([0, 3]);
  });

  it("finds the line an offset is on", () => {
    const starts = lineStarts("ab\ncd\nef");
    expect([0, 2, 3, 5, 6, 8].map((offset) => lineAt(starts, offset))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("finds the line ending a text uses", () => {
    expect(eolOf("a\nb")).toBe("\n");
    expect(eolOf("a\r\nb")).toBe("\r\n");
    expect(eolOf("")).toBe("\n");
  });
});

describe("longestRun", () => {
  it("finds a longest rising run", () => {
    expect([...longestRun([3, 1, 2, 5, 4, 6], true)].sort()).toEqual([1, 2, 4, 5]);
    expect([...longestRun([2, 2, 2], true)]).toHaveLength(1);
  });

  it("finds a longest run that never falls, leaving out undefined values", () => {
    expect([...longestRun([2, undefined, 2, 1, 3], false)].sort()).toEqual([0, 2, 4]);
    expect(longestRun([], false).size).toBe(0);
  });
});
