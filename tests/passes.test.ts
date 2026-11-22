import { describe, expect, it } from "vitest";
import { addPass, parsePasses, passesName, sceneKeys, setTicked, tickedKeys } from "../src/fountain/passes";

describe("pass checklists", () => {
  it("names the note after the play", () => {
    expect(passesName("Still")).toBe("Still - Passes");
  });

  it("starts a note with a pass of every scene, and adds later passes after it", () => {
    const first = addPass("", "Still", "Dialogue pass", ["INT. KITCHEN", "EXT. GARDEN"], "Draft 1, 20 November 2026");
    expect(first).toContain("# Passes for Still");
    expect(first).toContain("## Dialogue pass\n\nStarted after Draft 1, 20 November 2026.\n\n- [ ] INT. KITCHEN\n- [ ] EXT. GARDEN\n");
    const second = addPass(first, "Still", "Act two structure", ["INT. KITCHEN"]);
    const passes = parsePasses(second);
    expect(passes.map((p) => p.name)).toEqual(["Dialogue pass", "Act two structure"]);
    expect(passes[0].items.map((i) => i.title)).toEqual(["INT. KITCHEN", "EXT. GARDEN"]);
    expect(passes[1].items.map((i) => i.title)).toEqual(["INT. KITCHEN"]);
  });

  it("keeps scenes with the same heading apart", () => {
    expect(sceneKeys(["INT. KITCHEN", "EXT. GARDEN", "INT.  KITCHEN "])).toEqual(["INT. KITCHEN#1", "EXT. GARDEN#1", "INT. KITCHEN#2"]);
    const text = addPass("", "Play", "Pass", ["INT. KITCHEN", "EXT. GARDEN", "INT. KITCHEN"]);
    const ticked = setTicked(text, parsePasses(text)[0], "INT. KITCHEN#2", true);
    expect(ticked).toContain("- [ ] INT. KITCHEN\n- [ ] EXT. GARDEN\n- [x] INT. KITCHEN\n");
    expect([...tickedKeys(parsePasses(ticked)[0])]).toEqual(["INT. KITCHEN#2"]);
    const unticked = setTicked(ticked, parsePasses(ticked)[0], "INT. KITCHEN#2", false);
    expect(unticked).toBe(text);
  });

  it("adds a scene written since the pass began to the end of its list", () => {
    const text = addPass("", "Play", "First", ["INT. KITCHEN"]) + "\n## Second\n\n- [ ] INT. KITCHEN\n\nNotes after.\n";
    const passes = parsePasses(text);
    const ticked = setTicked(text, passes[1], "INT. STREET#1", true);
    expect(ticked).toContain("## Second\n\n- [ ] INT. KITCHEN\n- [x] INT. STREET\n\nNotes after.");
    expect(parsePasses(ticked)[0].items).toHaveLength(1);
  });

  it("reads ticks written in other ways", () => {
    const passes = parsePasses("## Pass ##\n\n* [X] INT. KITCHEN\n  - [ ] EXT. GARDEN\n");
    expect(passes[0].name).toBe("Pass");
    expect(passes[0].items.map((i) => [i.title, i.done])).toEqual([
      ["INT. KITCHEN", true],
      ["EXT. GARDEN", false],
    ]);
  });
});
