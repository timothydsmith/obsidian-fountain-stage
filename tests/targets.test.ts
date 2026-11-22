import { describe, expect, it } from "vitest";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import {
  formatTarget,
  headingTargetEdits,
  headingTargets,
  parseDuration,
  playTarget,
  playTargetEdits,
  targetDelta,
} from "../src/fountain/targets";
import { applyEdits } from "../src/fountain/titlePage";
import { standardFontSet } from "../src/pdf/fonts";
import { layoutScript } from "../src/pdf/layout";
import { TIMES } from "../src/pdf/style";
import { BUILT_IN_STYLES, findStyle } from "../src/pdf/styles";

const script = [
  "Title: Targets",
  "Target: 1 h 30 min",
  "",
  "INT. KITCHEN - DAY",
  "= They argue about the house.",
  "[[target: 10 min]]",
  "",
  "ANNA",
  "We keep it.",
  "",
  "INT. GARDEN - NIGHT",
  "",
  "TOM",
  "We sell it.",
].join("\n");

describe("durations", () => {
  it("reads units, plain minutes and colons", () => {
    expect(parseDuration("90")).toBe(5400);
    expect(parseDuration("90 min")).toBe(5400);
    expect(parseDuration("1 h 30 min")).toBe(5400);
    expect(parseDuration("1h30m")).toBe(5400);
    expect(parseDuration("1 hour and 5 minutes")).toBe(3900);
    expect(parseDuration("45 s")).toBe(45);
    expect(parseDuration("12:30")).toBe(750);
    expect(parseDuration("1:30:00")).toBe(5400);
    expect(parseDuration("2.5")).toBe(150);
  });

  it("refuses what isn't a duration", () => {
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("soon")).toBeUndefined();
    expect(parseDuration("10 parsecs")).toBeUndefined();
    expect(parseDuration("10 min or so")).toBeUndefined();
  });

  it("writes targets back readably", () => {
    expect(formatTarget(600)).toBe("10 min");
    expect(formatTarget(5400)).toBe("1 h 30 min");
    expect(formatTarget(150)).toBe("2 min 30 s");
    expect(formatTarget(3600)).toBe("1 h");
  });

  it("says how a runtime compares", () => {
    expect(targetDelta(720, 600)).toEqual({ over: true, on: false, seconds: 120 });
    expect(targetDelta(420, 600)).toEqual({ over: false, on: false, seconds: 180 });
    expect(targetDelta(610, 600).on).toBe(true);
    expect(targetDelta(62, 40)).toEqual({ over: true, on: false, seconds: 22 });
    // Within 5 % of a long target.
    expect(targetDelta(5600, 5400).on).toBe(true);
  });
});

describe("targets in a script", () => {
  const parsed = parseFountain(script);

  it("reads the play's target from the title page", () => {
    expect(playTarget(parsed)).toBe(5400);
  });

  it("reads a heading's target from the note under it, past its synopsis", () => {
    expect(headingTargets(script, parsed, [3, 10])).toEqual(new Map([[3, 600]]));
  });

  it("keeps the synopsis with its heading", () => {
    const withNoteFirst = script.replace("= They argue about the house.\n[[target: 10 min]]", "[[target: 10 min]]\n= They argue about the house.");
    expect(buildOutline(withNoteFirst)[0].synopsis).toBe("They argue about the house.");
  });

  it("changes, adds and takes out a heading's target", () => {
    const changed = applyEdits(script, headingTargetEdits(script, parsed, 3, 720));
    expect(changed).toContain("[[target: 12 min]]");
    expect(changed).not.toContain("10 min]]");

    const added = applyEdits(script, headingTargetEdits(script, parsed, 10, 300));
    expect(added.split("\n").slice(10, 13)).toEqual(["INT. GARDEN - NIGHT", "[[target: 5 min]]", ""]);
    expect(headingTargets(added, parseFountain(added), [10])).toEqual(new Map([[10, 300]]));

    const removed = applyEdits(script, headingTargetEdits(script, parsed, 3, null));
    expect(removed).not.toContain("target:");
    expect(removed.split("\n").slice(3, 6)).toEqual(["INT. KITCHEN - DAY", "= They argue about the house.", ""]);
  });

  it("puts a new target after the synopsis", () => {
    const noTarget = script.replace("[[target: 10 min]]\n", "");
    const added = applyEdits(noTarget, headingTargetEdits(noTarget, parseFountain(noTarget), 3, 600));
    expect(added.split("\n").slice(3, 7)).toEqual(["INT. KITCHEN - DAY", "= They argue about the house.", "[[target: 10 min]]", ""]);
  });

  it("sets and takes out the play's target", () => {
    const changed = applyEdits(script, playTargetEdits(script, parsed, 6300, "Targets"));
    expect(changed).toContain("Target: 1 h 45 min");
    const removed = applyEdits(script, playTargetEdits(script, parsed, null, "Targets"));
    expect(removed).not.toContain("Target:");
  });

  it("never prints targets, even with notes included", () => {
    const modern = findStyle(BUILT_IN_STYLES, "modern")!;
    const layout = layoutScript(parsed, modern, standardFontSet(TIMES), { notes: true });
    const texts = layout.pages.flatMap((p) => p.texts.map((t) => t.text)).join(" ");
    expect(texts).not.toMatch(/target:/i);
    expect(texts).not.toContain("10 min");
    expect(texts).not.toContain("1 h 30 min");
  });
});
