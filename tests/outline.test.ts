import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actMatcher } from "../src/fountain/acts";
import { buildOutline, itemAt, type OutlineItem } from "../src/fountain/outline";

/** The tree as indented lines, for easy comparison. */
function show(items: OutlineItem[], indent = ""): string[] {
  return items.flatMap((item) => [
    `${indent}${item.kind} ${item.text}${item.sceneNumber ? ` #${item.sceneNumber}` : ""}${item.synopsis ? ` (${item.synopsis})` : ""} @${item.line}`,
    ...show(item.children, `${indent}  `),
  ]);
}

describe("buildOutline", () => {
  it("nests scenes under acts, and sections inside acts by depth", () => {
    const source = [
      ".ACT ONE",
      "",
      "# The setup",
      "",
      "INT. GREEN ROOM - NIGHT #1#",
      "",
      "A chair.",
      "",
      ".Scene *Two*",
      "",
      ".ACT TWO",
      "",
      "## A deep section",
      "",
      "# A shallow one",
      "",
      ".SCENE ONE",
    ].join("\n");
    expect(show(buildOutline(source))).toEqual([
      "act ACT ONE @0",
      "  section The setup @2",
      "    scene INT. GREEN ROOM - NIGHT #1 @4",
      "    scene Scene Two @8",
      "act ACT TWO @10",
      "  section A deep section @12",
      "  section A shallow one @14",
      "    scene SCENE ONE @16",
    ]);
  });

  it("ends every open section at an act", () => {
    expect(show(buildOutline("# Before\n\nINT. ROOM\n\n.ACT ONE\n\nEXT. PARK\n"))).toEqual([
      "section Before @0",
      "  scene INT. ROOM @2",
      "act ACT ONE @4",
      "  scene EXT. PARK @6",
    ]);
  });

  it("puts scene headings before any act or section at the top level", () => {
    expect(show(buildOutline("EXT. PARK - DAY\n\nBirds.\n\n.FLASHBACK\n\nMore birds.\n"))).toEqual([
      "scene EXT. PARK - DAY @0",
      "scene FLASHBACK @4",
    ]);
  });

  it("finds acts by the pattern it's given", () => {
    const source = ".PROLOGUE\n\nA chair.\n\n.ACT ONE\n\nEXT. PARK\n";
    expect(show(buildOutline(source))).toEqual(["scene PROLOGUE @0", "act ACT ONE @4", "  scene EXT. PARK @6"]);
    expect(show(buildOutline(source, actMatcher("^(ACT|PROLOGUE)\\b")))).toEqual(["act PROLOGUE @0", "act ACT ONE @4", "  scene EXT. PARK @6"]);
  });

  it("attaches a synopsis to the heading it follows", () => {
    const source = ".ACT ONE\n= Margaret waits.\n= David arrives.\n\n.SCENE ONE\n\n= After a blank line.\n\n# A beat\n\nA chair.\n\n= Not this one, after action.\n";
    expect(show(buildOutline(source))).toEqual([
      "act ACT ONE (Margaret waits. David arrives.) @0",
      "  scene SCENE ONE (After a blank line.) @4",
      "  section A beat @8",
    ]);
  });

  it("finds the part of the script a line is in", () => {
    const outline = buildOutline("Title: X\n\n.ACT ONE\n\n.A\n\nText.\n\n.ACT TWO\n\nText.\n");
    expect(itemAt(outline, 0)).toBeUndefined();
    expect(itemAt(outline, 2)?.text).toBe("ACT ONE");
    expect(itemAt(outline, 6)?.text).toBe("A");
    expect(itemAt(outline, 10)?.text).toBe("ACT TWO");
  });

  it("outlines the sample script", () => {
    const sample = readFileSync(new URL("./fixtures/sample.fountain", import.meta.url), "utf8");
    expect(show(buildOutline(sample))).toMatchSnapshot();
  });
});
