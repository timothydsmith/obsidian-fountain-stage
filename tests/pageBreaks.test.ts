import { describe, expect, it } from "vitest";
import { parseFountain } from "../src/fountain/parser";
import { standardFontSet } from "../src/pdf/fonts";
import { layoutScript } from "../src/pdf/layout";
import { pageAtLine, pageLabel, pageRules, scriptPages } from "../src/pdf/pageBreaks";
import { TIMES } from "../src/pdf/style";
import { BUILT_IN_STYLES, findStyle } from "../src/pdf/styles";

const fonts = standardFontSet(TIMES);
const pagesOf = (source: string, style = "modern") => {
  const script = parseFountain(source);
  return { script, pages: scriptPages(layoutScript(script, findStyle(BUILT_IN_STYLES, style)!, fonts), style) };
};

describe("pageRules", () => {
  it("puts a rule before the element each page starts with, after the title page too", () => {
    const { script, pages } = pagesOf("Title: A Play\n\n# Act One\n\nA chair.\n\n# Act Two\n\nAnother chair.\n");
    expect(pageRules(pages, script)).toEqual([
      { line: 2, after: false, page: 1 },
      { line: 6, after: false, page: 2 },
    ]);
    expect([1, 2].map((p) => pageLabel(pages, p))).toEqual(["Page 1", "Page 2"]);
    expect(pageLabel(pages, 0)).toBe("Unnumbered page");
  });

  it("puts the rule after a paragraph that runs onto the next page", () => {
    const long = Array.from({ length: 400 }, () => "word").join(" ");
    const { script, pages } = pagesOf(`INT. ROOM\n\n${long}\n\nA chair.\n`);
    expect(pageRules(pages, script)).toEqual([{ line: 2, after: true, page: 1 }]);
  });
});

describe("pageAtLine", () => {
  it("finds the page a line prints on, and none on the title page", () => {
    const long = Array.from({ length: 400 }, () => "word").join(" ");
    const { script, pages } = pagesOf(`Title: A Play\n\nINT. ROOM\n\n${long}\n\nA chair.\n`);
    expect(pageAtLine(pages, script, 0)).toBeUndefined();
    expect(pageAtLine(pages, script, 2)).toBe(1);
    // The long paragraph starts on page 1 and runs onto page 2.
    expect(pageAtLine(pages, script, 4)).toBe(1);
    expect(pageAtLine(pages, script, 5)).toBe(2);
    expect(pageAtLine(pages, script, 6)).toBe(2);
  });
});
