import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOutline, itemAt, type OutlineItem } from "../src/fountain/outline";

/** The tree as indented lines, for easy comparison. */
function show(items: OutlineItem[], indent = ""): string[] {
  return items.flatMap((item) => [
    `${indent}${item.kind} ${item.text}${item.sceneNumber ? ` #${item.sceneNumber}` : ""}${item.synopsis ? ` (${item.synopsis})` : ""} @${item.line}`,
    ...show(item.children, `${indent}  `),
  ]);
}

describe("buildOutline", () => {
  it("nests sections by depth and scene headings under their section", () => {
    const source = [
      "# Act One",
      "",
      "## Scene One",
      "",
      "INT. GREEN ROOM - NIGHT #1#",
      "",
      "A chair.",
      "",
      "## Scene *Two*",
      "",
      "# Act Two",
      "",
      "### A deep section",
      "",
      "## Scene One",
    ].join("\n");
    expect(show(buildOutline(source))).toEqual([
      "section Act One @0",
      "  section Scene One @2",
      "    scene INT. GREEN ROOM - NIGHT #1 @4",
      "  section Scene Two @8",
      "section Act Two @10",
      "  section A deep section @12",
      "  section Scene One @14",
    ]);
  });

  it("puts scene headings before any section at the top level", () => {
    expect(show(buildOutline("EXT. PARK - DAY\n\nBirds.\n\n.FLASHBACK\n\nMore birds.\n"))).toEqual([
      "scene EXT. PARK - DAY @0",
      "scene FLASHBACK @4",
    ]);
  });

  it("attaches a synopsis to the heading it follows", () => {
    const source = "# Act One\n= Margaret waits.\n= David arrives.\n\n## Scene One\n\n= After a blank line.\n\n## Scene Two\n\nA chair.\n\n= Not this one, after action.\n";
    expect(show(buildOutline(source))).toEqual([
      "section Act One (Margaret waits. David arrives.) @0",
      "  section Scene One (After a blank line.) @4",
      "  section Scene Two @8",
    ]);
  });

  it("finds the part of the script a line is in", () => {
    const outline = buildOutline("Title: X\n\n# One\n\n## A\n\nText.\n\n# Two\n\nText.\n");
    expect(itemAt(outline, 0)).toBeUndefined();
    expect(itemAt(outline, 2)?.text).toBe("One");
    expect(itemAt(outline, 6)?.text).toBe("A");
    expect(itemAt(outline, 10)?.text).toBe("Two");
  });

  it("outlines the sample script", () => {
    const sample = readFileSync(new URL("./fixtures/sample.fountain", import.meta.url), "utf8");
    expect(show(buildOutline(sample))).toMatchSnapshot();
  });
});
