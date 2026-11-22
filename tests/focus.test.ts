import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { paragraphAt } from "../src/editor/typewriter";
import { parseFountain } from "../src/fountain/parser";
import { addReading, calibrate, calibrationFactor, clockTime, describeFactor, type Reading } from "../src/fountain/readings";
import { DEFAULT_PAUSE_WORDS } from "../src/fountain/pauses";
import { assignVoices, readItems, speechPieces, spokenText } from "../src/fountain/tableRead";
import { wordChange } from "../src/fountain/runtime";

describe("table read", () => {
  const script = parseFountain(
    [
      "Title: Read",
      "",
      "INT. KITCHEN - DAY",
      "",
      "Anna sits. *Rain* on the window.",
      "",
      "ANNA (V.O.)",
      "We keep it.",
      "We keep it and we fix the _roof_.",
      "(beat)",
      "Don't we? /",
      "",
      "TOM ^",
      "We sell it.",
    ].join("\n"),
  );

  it("reads speeches in their speaker's part and the rest as the narrator", () => {
    expect(readItems(script, { directions: true }).map(({ speaker, text, line, endLine }) => ({ speaker, text, line, endLine }))).toEqual([
      { speaker: undefined, text: "INT. KITCHEN - DAY", line: 2, endLine: 2 },
      { speaker: undefined, text: "Anna sits. Rain on the window.", line: 4, endLine: 4 },
      { speaker: "ANNA", text: "We keep it. We keep it and we fix the roof.", line: 6, endLine: 8 },
      { speaker: undefined, text: "beat", line: 9, endLine: 9 },
      { speaker: "ANNA", text: "Don't we?", line: 10, endLine: 10 },
      { speaker: "TOM", text: "We sell it.", line: 12, endLine: 13 },
    ]);
  });

  it("can leave out stage directions, and start from a line", () => {
    const items = readItems(script, { directions: false, fromLine: 8 });
    expect(items.map((i) => i.speaker)).toEqual(["ANNA", "ANNA", "TOM"]);
    expect(items[0].text).toBe("We keep it. We keep it and we fix the roof.");
  });

  it("drops markup and overlap slashes but not slashes in words", () => {
    expect(spokenText("**Now** / or _never_ [[a note]]")).toBe("Now or never [[a note]]");
    expect(spokenText("and/or")).toBe("and/or");
  });

  it("breaks long text after sentences", () => {
    const text = "One sentence here. Another one there! And a third?";
    expect(speechPieces(text, 30)).toEqual(["One sentence here.", "Another one there!", "And a third?"]);
    expect(speechPieces(text)).toEqual([text]);
    expect(speechPieces("word ".repeat(30).trim(), 40).every((p) => p.length <= 40)).toBe(true);
  });

  it("gives out voices in turn, keeping the narrator's and earlier choices", () => {
    const voices = [
      { uri: "a", lang: "en-GB" },
      { uri: "b", lang: "en-US" },
      { uri: "c", lang: "en-AU" },
      { uri: "f", lang: "fr-FR" },
    ];
    const out = assignVoices(["ANNA", "TOM", "MRS PIKE", "JO"], voices, { TOM: { voice: "a", pitch: 1 } }, "a", "en-GB");
    expect(out.TOM).toEqual({ voice: "a", pitch: 1 });
    expect(out.ANNA.voice).not.toBe("f");
    expect(new Set([out.ANNA.voice, out["MRS PIKE"].voice])).toEqual(new Set(["b", "c"]));
    // A fourth part shares a voice, at another pitch.
    expect(out.JO.pitch).not.toBe(1);
    expect(assignVoices(["ANNA"], [], {}, undefined, "en")).toEqual({});
  });
});

describe("readings", () => {
  const scenes = [
    { title: "1. INT. KITCHEN", read: 330, estimate: 300 },
    { title: "Garden | night", read: 330, estimate: 300 },
    { title: "Unestimated", read: 60, estimate: 0 },
  ];

  it("works out one factor from the scenes with an estimate", () => {
    expect(calibrationFactor(scenes)).toBeCloseTo(1.1);
    expect(calibrationFactor([])).toBeUndefined();
    expect(describeFactor(1.1)).toBe("10 % slower");
    expect(describeFactor(0.94)).toBe("6 % faster");
    expect(describeFactor(1.002)).toBe("as estimated");
  });

  it("scales words per minute, pauses and minutes per page by it", () => {
    const rates = calibrate({ wordsPerMinute: 150, minutesPerPage: 1, pauses: DEFAULT_PAUSE_WORDS.map((p) => ({ ...p })) }, 1.25);
    expect(rates.wordsPerMinute).toBe(120);
    expect(rates.minutesPerPage).toBe(1.25);
    expect(rates.pauses.find((p) => p.word === "pause")).toEqual({ word: "pause", seconds: 2.5, short: 1.3, long: 5 });
  });

  it("adds a reading to the note", () => {
    const reading: Reading = { when: "22 November 2026, 14:05", draft: "3 (working)", method: "at 150 words a minute", scenes };
    const first = addReading("", "The Play", reading);
    expect(first).toMatch(/^# Readings of The Play\n/);
    expect(first).toContain("## 22 November 2026, 14:05");
    expect(first).toContain("Draft 3 (working). 3 scenes read in 12 min, against an estimate of 10 min at 150 words a minute (10 % slower).");
    expect(first).toContain("| Garden \\| night | 5:30 | 5:00 |");
    const second = addReading(first, "The Play", { ...reading, when: "23 November 2026, 10:00" });
    expect(second.match(/^# /gm)).toHaveLength(1);
    expect(second.indexOf("## 23 November")).toBeGreaterThan(second.indexOf("## 22 November"));
  });

  it("writes times as on a clock", () => {
    expect(clockTime(65)).toBe("1:05");
    expect(clockTime(3750)).toBe("1:02:30");
  });
});

describe("focus", () => {
  it("counts a sprint's words with a sign", () => {
    expect(wordChange(312)).toBe("+312 words");
    expect(wordChange(-8)).toBe("−8 words");
    expect(wordChange(1)).toBe("+1 word");
    expect(wordChange(0)).toBe("0 words");
  });

  it("finds the paragraph the cursor is in for typewriter mode", () => {
    const doc = "INT. KITCHEN\n\nANNA\nWe keep it.\n\nTOM";
    const at = (pos: number) => paragraphAt(EditorState.create({ doc, selection: EditorSelection.cursor(pos) }));
    expect(at(doc.indexOf("keep"))).toEqual({ first: 3, last: 4 });
    expect(at(doc.indexOf("\n\nANNA") + 1)).toEqual({ first: 2, last: 2 });
    expect(at(0)).toEqual({ first: 1, last: 1 });
  });
});
