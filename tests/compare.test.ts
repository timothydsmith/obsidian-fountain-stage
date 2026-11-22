import { describe, expect, it } from "vitest";
import { compareScripts, type ScriptVersion } from "../src/fountain/compare";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";

const version = (lines: string[]): ScriptVersion => {
  const source = lines.join("\n");
  return { source, script: parseFountain(source), outline: buildOutline(source) };
};
const lineOf = (v: ScriptVersion, text: string) => v.source.split("\n").indexOf(text);

describe("alternates in a comparison", () => {
  it("leaves alternates' notes out, so keeping one changes nothing", () => {
    const before = version([".SCENE 1", "", "NORA", "Where were you?", "", "TOM", "Out."]);
    const after = version([".SCENE 1", "", "NORA", "Where were you?", "[[alt: Where have you been,", "Tom?]]", "", "TOM", "Out."]);
    const c = compareScripts(before, after);
    expect(c.changedLines).toEqual([]);
    expect(c.scenes[0].status).toBe("same");
  });
});
const summary = (earlier: ScriptVersion, later: ScriptVersion) =>
  compareScripts(earlier, later).scenes.map((s) => `${s.status}${s.moved ? " moved" : ""}: ${s.after?.title ?? s.before?.title}`);

const draft = version([
  "Title: Play",
  "Draft: 3",
  "",
  ".SCENE 1",
  "",
  "A kitchen.",
  "",
  "NORA",
  "Where were you?",
  "",
  "TOM",
  "Out.",
  "",
  ".SCENE 2",
  "",
  "A garden.",
  "",
  "NORA",
  "It's cold.",
  "",
  ".SCENE 3",
  "",
  "A street.",
  "",
  "TOM",
  "Taxi!",
]);

describe("comparing drafts", () => {
  it("finds nothing changed in the same script, title page aside", () => {
    const working = version(draft.source.replace("Draft: 3", "Draft: 4 (working)").split("\n"));
    const result = compareScripts(draft, working);
    expect(result.changedLines).toEqual([]);
    expect(result.scenes.map((s) => s.status)).toEqual(["same", "same", "same"]);
  });

  it("marks changed lines within a scene, and counts them", () => {
    const working = version(draft.source.replace("Out.", "Out. Walking.").split("\n"));
    const result = compareScripts(draft, working);
    expect(result.changedLines).toEqual([lineOf(working, "Out. Walking.")]);
    expect(result.scenes[0]).toMatchObject({ status: "changed", linesAdded: 1, linesRemoved: 1 });
  });

  it("finds added and cut scenes, keeping a cut scene where it was", () => {
    const lines = draft.source.split("\n");
    const withoutTwo = [...lines.slice(0, 13), ...lines.slice(20)];
    const working = version([...withoutTwo, "", ".SCENE 4", "", "A bridge."]);
    expect(summary(draft, working)).toEqual(["same: SCENE 1", "cut: SCENE 2", "same: SCENE 3", "added: SCENE 4"]);
    expect(compareScripts(draft, working).changedLines).toEqual([lineOf(working, ".SCENE 4"), lineOf(working, "A bridge.")]);
  });

  it("matches renumbered scenes by their text, and finds the one that moved", () => {
    const lines = draft.source.split("\n");
    const one = lines.slice(3, 13);
    const two = lines.slice(13, 20);
    const three = lines.slice(20);
    // Scene 3 moved to the front, and every heading renumbered.
    const renumber = (scene: string[], n: number) => [`.SCENE ${n}`, ...scene.slice(1)];
    const working = version([...lines.slice(0, 3), ...renumber([...three, ""], 1), ...renumber(one, 2), ...renumber(two, 3)]);
    expect(summary(draft, working)).toEqual(["changed moved: SCENE 1", "changed: SCENE 2", "changed: SCENE 3"]);
    // Only the headings changed.
    expect(compareScripts(draft, working).changedLines).toEqual([lineOf(working, ".SCENE 1"), lineOf(working, ".SCENE 2"), lineOf(working, ".SCENE 3")]);
  });

  it("matches a rewritten scene by a heading unique to it", () => {
    const earlier = version(["INT. KITCHEN", "", "Old text.", "", "INT. GARDEN", "", "Roses."]);
    const later = version(["INT. KITCHEN", "", "Brand new text.", "", "INT. GARDEN", "", "Roses."]);
    expect(summary(earlier, later)).toEqual(["changed: INT. KITCHEN", "same: INT. GARDEN"]);
  });

  it("maps lines between the versions, for scrolling side by side", () => {
    const working = version([...draft.source.split("\n").slice(0, 5), "A new line.", "", ...draft.source.split("\n").slice(5)]);
    const result = compareScripts(draft, working);
    expect(result.earlierLine(lineOf(working, "Taxi!"))).toBe(lineOf(draft, "Taxi!"));
    expect(result.laterLine(lineOf(draft, "It's cold."))).toBe(lineOf(working, "It's cold."));
  });
});
