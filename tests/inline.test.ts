import { describe, expect, it } from "vitest";
import { parseInline } from "../src/fountain/inline";

/** Each styled run as [text, styles], skipping plain runs. */
function styled(text: string) {
  return parseInline(text)
    .runs.filter((r) => r.bold || r.italic || r.underline || r.link)
    .map((r) => {
      const styles = [r.bold && "b", r.italic && "i", r.underline && "u", r.link && `link:${r.link}`].filter(Boolean).join(" ");
      return [text.slice(r.from, r.to), styles];
    });
}
const markers = (text: string) => parseInline(text).markers.map((m) => text.slice(m.from, m.to));

describe("parseInline", () => {
  it("finds each kind of emphasis", () => {
    expect(styled("a *i* b **b** c ***bi*** d _u_")).toEqual([
      ["i", "i"],
      ["b", "b"],
      ["bi", "b i"],
      ["u", "u"],
    ]);
    expect(markers("a *i* b **b**")).toEqual(["*", "*", "**", "**"]);
  });

  it("nests different kinds", () => {
    expect(styled("**bold _and under_ more**")).toEqual([
      ["bold ", "b"],
      ["and under", "b u"],
      [" more", "b"],
    ]);
  });

  it("matches non-greedily", () => {
    expect(styled("**a** and **b**")).toEqual([
      ["a", "b"],
      ["b", "b"],
    ]);
  });

  it("doesn't pair an unmatched double asterisk with a single one", () => {
    expect(styled("a ** b *c*")).toEqual([["c", "i"]]);
  });

  it("leaves a lone marker as text", () => {
    expect(styled("5 * 3 = 15")).toEqual([]);
    expect(markers("5 * 3 = 15")).toEqual([]);
  });

  it("makes escaped characters literal", () => {
    const text = "\\*not italic\\* but *this*";
    expect(styled(text)).toEqual([["this", "i"]]);
    expect(markers(text)).toEqual(["\\", "\\", "*", "*"]);
  });

  it("reads links, keeping underscores in the address", () => {
    const text = "see [the *site*](https://a.com/x_y_z) now";
    expect(styled(text)).toEqual([
      ["the ", "link:https://a.com/x_y_z"],
      ["site", "i link:https://a.com/x_y_z"],
    ]);
    // Neighbouring markers merge into one range.
    expect(markers(text)).toEqual(["[", "*", "*](https://a.com/x_y_z)"]);
  });
});
