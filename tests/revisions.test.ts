import { describe, expect, it } from "vitest";
import { actMatcher, DEFAULT_ACT_PATTERN } from "../src/fountain/acts";
import type { ScriptVersion } from "../src/fountain/compare";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import { standardFontSet } from "../src/pdf/fonts";
import { layoutScript } from "../src/pdf/layout";
import { addRevisionHeader, lockedPages, type RehearsalPages, rehearsalPages, revise } from "../src/pdf/revisions";
import { TIMES } from "../src/pdf/style";
import { BUILT_IN_STYLES, findStyle } from "../src/pdf/styles";

const fonts = standardFontSet(TIMES);
/** A play long enough for many pages: scenes of short and long speeches. */
const sample = [
  "Title: Revisions",
  "Author: Test",
  "",
  ...Array.from({ length: 6 }, (_, s) => [
    `INT. ROOM ${s + 1} - DAY`,
    "",
    `The room is bare. Scene ${s + 1} begins.`,
    "",
    ...Array.from({ length: 24 }, (_, k) => [
      k % 2 ? "ANNA" : "TOM",
      `Speech ${k + 1} of scene ${s + 1}.${k % 5 === 0 ? " It goes on for a while, longer than the others, so that it takes up two or three lines on the page and the breaks fall in different places." : ""}`,
      "",
    ]).flat(),
  ]).flat(),
].join("\n");
const modern = findStyle(BUILT_IN_STYLES, "modern")!;

const version = (source: string): ScriptVersion => ({ source, script: parseFountain(source), outline: buildOutline(source, actMatcher(DEFAULT_ACT_PATTERN)) });

function lock(source: string): RehearsalPages {
  const v = version(source);
  return lockedPages(layoutScript(v.script, modern, fonts), v);
}

/**
 * A body page that starts and ends on a whole block, with no scene heading, so it can be edited on its own:
 * its first line, a line partway down it where a block starts, and the next page's first line.
 */
function cleanPage(locked: RehearsalPages): { index: number; start: number; middle: number; next: number } {
  const { pages } = locked;
  const headings = locked.version.script.elements.filter((el) => el.type === "scene_heading").map((el) => el.line);
  for (let i = pages.findIndex((p) => !p.front) + 2; i < pages.length - 1; i++) {
    const here = pages[i].placements;
    const after = pages[i + 1].placements;
    if (here.length < 4 || here[0].continues || after.length === 0 || after[0].continues) continue;
    const [start, next] = [here[0].line, after[0].line];
    if (headings.some((h) => h >= start && h < next)) continue;
    return { index: i, start, middle: here[2].line, next };
  }
  throw new Error("no clean page in the sample");
}

const labels = (pages: RehearsalPages) => pages.pages.map((p) => p.label);
const lines = sample.split("\n");

describe("revised pages", () => {
  it("issues nothing when nothing has changed", () => {
    const locked = lock(sample);
    const { issued, pages } = revise(locked, version(sample), modern, fonts);
    expect(issued).toEqual([]);
    expect(labels(pages)).toEqual(labels(locked));
  });

  it("issues only the page with a changed line, with a mark beside it", () => {
    const locked = lock(sample);
    const { index, start, next } = cleanPage(locked);
    const target = locked.version.script.elements.find((el) => el.type === "dialogue" && el.line > start && el.endLine < next - 1)!;
    const edited = [...lines];
    edited[target.line] = `${edited[target.line]} And then some.`;
    const { issued, pages } = revise(locked, version(edited.join("\n")), modern, fonts);
    expect(issued.map((p) => p.label)[0]).toBe(locked.pages[index].label);
    expect(issued.every((p) => p.label.startsWith(locked.pages[index].label))).toBe(true);
    const markX = modern.page.width - modern.page.margins.right + modern.revision.markGap;
    const marks = issued[0].page.texts.filter((t) => t.text === "*" && Math.abs(t.x - markX) < 0.01);
    // One beside each line of the changed speech, and none beside the speech after it.
    const speech = issued[0].page.drawn.filter((d) => d.line === target.line - 1 || d.line === target.line).flatMap((d) => d.baselines);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => speech.some((y) => Math.abs(y - m.y) < 0.01))).toBe(true);
    // Every other page keeps its number.
    expect(labels(pages).filter((l) => !l.startsWith(locked.pages[index].label))).toEqual(labels(locked).filter((l) => l !== locked.pages[index].label));
  });

  it("runs added text onto A pages, leaving the next page alone", () => {
    const locked = lock(sample);
    const { index, middle } = cleanPage(locked);
    const label = locked.pages[index].label;
    const added = Array.from({ length: 40 }, (_, i) => `\nSTEVEL\nA brand new line of dialogue, number ${i + 1}, that wasn't here before.`);
    const edited = [...lines.slice(0, middle), ...added, "", ...lines.slice(middle)];
    const { issued, pages } = revise(locked, version(edited.join("\n")), modern, fonts);
    const issuedLabels = issued.map((p) => p.label);
    expect(issuedLabels.slice(0, 3)).toEqual([label, `${label}A`, `${label}B`]);
    expect(issuedLabels).not.toContain(locked.pages[index + 1].label);
    expect(labels(pages)).toContain(locked.pages[index + 1].label);
  });

  it("numbers a page that lost all its text with the page before", () => {
    const locked = lock(sample);
    const { index, start, next } = cleanPage(locked);
    const edited = [...lines.slice(0, start), ...lines.slice(next)];
    const { issued } = revise(locked, version(edited.join("\n")), modern, fonts);
    const before = locked.pages[index - 1].label;
    expect(issued.map((p) => p.label)).toContain(`${before}–${locked.pages[index].label}`);
  });

  it("marks where a speech was cut", () => {
    const locked = lock(sample);
    const { index, middle } = cleanPage(locked);
    // The speech starting partway down the page: its cue, its line and the blank after.
    const edited = [...lines.slice(0, middle), ...lines.slice(middle + 3)];
    const { issued } = revise(locked, version(edited.join("\n")), modern, fonts);
    expect(issued[0].label).toBe(locked.pages[index].label);
    const markX = modern.page.width - modern.page.margins.right + modern.revision.markGap;
    const marks = issued[0].page.texts.filter((t) => t.text === "*" && Math.abs(t.x - markX) < 0.01);
    // Beside the speech that now follows the cut.
    const following = issued[0].page.drawn.filter((d) => d.line === middle || d.line === middle + 1).flatMap((d) => d.baselines);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => following.some((y) => Math.abs(y - m.y) < 0.01))).toBe(true);
  });

  it("keeps A pages from one revision to the next", () => {
    const locked = lock(sample);
    const { index, middle } = cleanPage(locked);
    const label = locked.pages[index].label;
    const added = Array.from({ length: 40 }, (_, i) => `\nSTEVEL\nA brand new line of dialogue, number ${i + 1}, that wasn't here before.`);
    const rev1 = [...lines.slice(0, middle), ...added, "", ...lines.slice(middle)];
    const afterRev1 = rehearsalPages(locked, [version(rev1.join("\n"))], modern, fonts);
    expect(labels(afterRev1)).toContain(`${label}A`);
    // A change on the last page leaves the A pages as they were.
    const last = rev1.length - 1;
    const rev2 = [...rev1];
    const lastDialogue = parseFountain(rev1.join("\n")).elements.filter((el) => el.type === "dialogue").pop()!;
    rev2[lastDialogue.line] = `${rev2[lastDialogue.line]} One more thing.`;
    expect(last).toBeGreaterThan(0);
    const { issued, pages } = revise(afterRev1, version(rev2.join("\n")), modern, fonts);
    expect(issued.map((p) => p.label)).not.toContain(`${label}A`);
    expect(labels(pages)).toContain(`${label}A`);
  });

  it("puts the revision header clear of the page number", () => {
    const locked = lock(sample);
    const { start, next } = cleanPage(locked);
    const target = locked.version.script.elements.find((el) => el.type === "dialogue" && el.line > start && el.endLine < next - 1)!;
    const edited = [...lines];
    edited[target.line] += " Changed.";
    const { issued } = revise(locked, version(edited.join("\n")), modern, fonts);
    addRevisionHeader(issued[0].page, modern, fonts, 2, "22 November 2026");
    const header = issued[0].page.texts.find((t) => t.text === "Rev. 2 · 22 November 2026")!;
    expect(header.x).toBeCloseTo(modern.page.margins.left);
  });
});
