import { describe, expect, it } from "vitest";
import { breakdownEdits } from "../src/fountain/breakdown";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import { buildReport, scriptScenes } from "../src/fountain/report";
import { castSummary, fitSummary, reportMarkdown, totalsRows } from "../src/fountain/reportMarkdown";
import { onStageAt, speaksFromOff, stagePlot } from "../src/fountain/stage";
import { applyEdits } from "../src/fountain/titlePage";

function plotOf(source: string) {
  const script = parseFountain(source);
  return stagePlot(script, scriptScenes(script, buildOutline(source)));
}

const lineOf = (source: string, text: string) => source.split("\n").findIndex((l) => l.includes(text));

describe("entrances and exits", () => {
  const source = [
    "Title: Stage",
    "Characters:",
    "    ANNA",
    "    TOM",
    "    MRS PIKE",
    "",
    "INT. KITCHEN - DAY",
    "",
    "ANNA is at the table, reading.",
    "",
    "ANNA",
    "Where is everyone?",
    "",
    "Enter TOM, with a bag.",
    "",
    "TOM",
    "Here.",
    "",
    "ANNA picks up her coat and leaves.",
    "",
    "TOM",
    "Typical.",
    "",
    "MRS PIKE comes in from the garden.",
    "",
    "MRS PIKE",
    "Is she gone?",
    "",
    "They both go out.",
    "",
    "INT. GARDEN - NIGHT",
    "",
    "TOM",
    "(entering)",
    "Anyone?",
    "",
    "ANNA",
    "Over here.",
    "(going)",
    "Come on.",
    "",
    "Exeunt.",
  ].join("\n");
  const plot = plotOf(source);
  const at = (text: string) => onStageAt(plot, lineOf(source, text));

  it("finds entrances and exits from phrases", () => {
    expect(plot.moves.map((m) => `${m.kind} ${m.name} ${source.split("\n")[m.line].slice(0, 12)}`)).toEqual([
      "enter TOM Enter TOM, w",
      "exit ANNA ANNA picks u",
      "enter MRS PIKE MRS PIKE com",
      "exit TOM They both go",
      "exit MRS PIKE They both go",
      "enter TOM (entering)",
      "exit ANNA ",
      "exit TOM Exeunt.",
    ]);
  });

  it("knows who's on stage at a line", () => {
    expect(at("Where is everyone")).toEqual(["ANNA"]);
    expect(at("Here.")).toEqual(["ANNA", "TOM"]);
    expect(at("Typical.")).toEqual(["TOM"]);
    expect(at("Is she gone?")).toEqual(["TOM", "MRS PIKE"]);
    // ANNA speaks in the next scene without coming in, so she's there from its start.
    expect(at("INT. GARDEN")).toEqual(["ANNA"]);
    // ANNA speaks without coming in, so she was there from the start; she goes when her speech ends.
    expect(at("Anyone?")).toEqual(["ANNA", "TOM"]);
    expect(at("Come on.")).toEqual(["ANNA", "TOM"]);
    expect(at("Exeunt.")).toEqual([]);
    expect(plot.issues).toEqual([]);
  });

  it("tells a move from leaving or returning something", () => {
    const p = plotOf(["INT. ROOM", "", "ANNA leaves the letter on the table. She returns the book.", "", "ANNA", "There.", "", "The alarm goes off.", ""].join("\n"));
    expect(p.moves).toEqual([]);
    const q = plotOf(["INT. ROOM", "", "ANNA", "Bye.", "", "She leaves the room.", "", "ANNA returns with tea.", ""].join("\n"));
    expect(q.moves.map((m) => m.kind)).toEqual(["exit", "enter"]);
  });

  it("finds who moved: the subject, not a name after it", () => {
    const p = plotOf(
      [
        "Title: Who",
        "Characters: ANNA",
        "    TOM",
        "    JO",
        "",
        "INT. ROOM",
        "",
        "ANNA, TOM and JO wait.",
        "",
        "ANNA watches TOM leave.",
        "",
        "JO hands ANNA the bag and walks out.",
        "",
        "As ANNA goes off, the lights fade.",
      ].join("\n"),
    );
    expect(p.moves.map((m) => `${m.kind} ${m.name}`)).toEqual(["exit TOM", "exit JO", "exit ANNA"]);
  });

  it("takes speaking off as off stage", () => {
    expect(speaksFromOff("ALEX (offstage)")).toBe(true);
    expect(speaksFromOff("ALEX (O.S.)")).toBe(true);
    expect(speaksFromOff("ALEX (V.O.)")).toBe(true);
    expect(speaksFromOff("ALEX (CONT'D)")).toBe(false);
    const p = plotOf(["INT. ROOM", "", "ALEX (offstage)", "Where's the toothpaste?", "", "Enter ALEX from the bathroom.", "", "ALEX", "Hey.", ""].join("\n"));
    expect(p.issues).toEqual([]);
    expect(p.moves.map((m) => m.kind)).toEqual(["enter"]);
  });
});

describe("the entrances and exits check", () => {
  it("finds speaking after leaving, before coming in, coming in twice and going twice", () => {
    const source = [
      "INT. ROOM",
      "",
      "ANNA",
      "Hello.",
      "",
      "ANNA enters.",
      "",
      "TOM enters. TOM enters again.",
      "",
      "TOM exits.",
      "",
      "TOM",
      "Still here.",
      "",
      "Exit TOM. Exit TOM.",
    ].join("\n");
    const issues = plotOf(source).issues.map((i) => `${i.kind} ${i.name} ${i.line + 1}${i.otherLine === undefined ? "" : `/${i.otherLine + 1}`}`);
    expect(issues).toEqual(["speaks-before-entrance ANNA 4/6", "enters-twice TOM 8/8", "speaks-after-exit TOM 13/10", "exits-twice TOM 15/15"]);
  });

  it("notices someone left on stage without a word for a long time", () => {
    const speech = "word ".repeat(200).trim();
    const lines = ["Title: Quiet", "Characters: ANNA", "", "INT. ROOM", "", "ANNA and TOM sit.", ""];
    for (let i = 0; i < 5; i++) lines.push("TOM", speech, "");
    const plot = plotOf(lines.join("\n"));
    expect(plot.issues.map((i) => `${i.kind} ${i.name}`)).toEqual(["silent ANNA"]);
  });
});

describe("the smallest cast", () => {
  const reportOf = (source: string) => {
    const script = parseFountain(source);
    return buildReport(script, buildOutline(source), { wordsPerMinute: 150 });
  };
  /** A scene for each group of speakers. */
  const play = (...scenes: string[][]) => scenes.map((cast, i) => [`INT. ROOM ${i + 1}`, "", ...cast.flatMap((name) => [name, "Words.", ""])].join("\n")).join("\n");

  it("shares out the parts among as few actors as the biggest scene needs", () => {
    const report = reportOf(play(["ANNA", "TOM"], ["ANNA", "JO"], ["TOM", "MRS PIKE"]));
    expect(report.cast).toEqual({ size: 2, actors: [["ANNA", "MRS PIKE"], ["TOM", "JO"]], exact: true, largestScene: 2 });
  });

  it("needs more than the biggest scene when characters share scenes in a ring", () => {
    const report = reportOf(play(["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"], ["E", "A"]));
    expect(report.cast.size).toBe(3);
    expect(report.cast.largestScene).toBe(2);
    expect(report.cast.exact).toBe(true);
    expect(castSummary(report.cast)).toBe("The play needs at least 3 actors. No scene has more than 2 characters, but the way they share scenes needs 3.");
    // Each actor's parts never meet.
    for (const parts of report.cast.actors) {
      for (const a of parts) for (const b of parts) if (a !== b) expect(report.characters.find((c) => c.name === a)!.couldDouble).toContain(b);
    }
  });

  it("says whether a cast of a given size can play every part", () => {
    const report = reportOf(play(["A", "B", "C"], ["A", "D"]));
    expect(fitSummary(report.cast, report.scenes, 3)).toBe("A cast of 3 can play every part.");
    expect(fitSummary(report.cast, report.scenes, 2)).toBe("A cast of 2 can't play every part. One scene has more than 2 characters: 1. INT. ROOM 1 (3).");
    const ring = reportOf(play(["A", "B"], ["B", "C"], ["C", "A"].reverse()));
    expect(fitSummary(ring.cast, ring.scenes, 2)).toBe("A cast of 2 can't play every part. No scene has more than 2 characters, but the way they share scenes needs 3.");
    const md = reportMarkdown(report, { title: "X", date: "today", method: "the words spoken", castSize: 2 });
    expect(md).toContain("## Smallest cast");
    expect(md).toContain("A cast of 2 can't play every part.");
    expect(md).toContain("1. A\n2. B, D\n3. C");
  });
});

describe("silence", () => {
  it("adds up the pauses and silences each scene asks for", () => {
    const source = ["INT. ROOM", "", "A long silence.", "", "ANNA", "(beat)", "No.", "", "INT. HALL", "", "She pauses at the door.", "", "TOM", "Yes.", ""].join("\n");
    const script = parseFountain(source);
    const report = buildReport(script, buildOutline(source), { wordsPerMinute: 150 });
    expect(report.scenes.map((s) => s.silence)).toEqual([8, 0]);
    expect(report.totals.silence).toBe(8);
    expect(totalsRows(report)).toContainEqual(["Silence", "8 s"]);
  });
});

describe("generating the cast list and scene breakdown", () => {
  const generate = (source: string) => {
    const script = parseFountain(source);
    const outline = buildOutline(source);
    const headings = new Set<number>();
    const walk = (items: typeof outline) => items.forEach((i) => (i.kind !== "section" && headings.add(i.line), walk(i.children)));
    walk(outline);
    const result = breakdownEdits(source, script, scriptScenes(script, outline), headings);
    return { ...result, text: applyEdits(source, result.edits) };
  };

  it("writes both before the play when the script has neither", () => {
    const { text, added, scenes } = generate(["Title: New", "", ".ACT ONE", "", ".The Kitchen", "", "ANNA", "Hi.", "", "TOM", "Hi.", "", ".The Garden", "", "ANNA", "Bye."].join("\n"));
    expect(added).toEqual(["ANNA", "TOM"]);
    expect(scenes).toBe(2);
    expect(text).toBe(
      ["Title: New", "", "***Characters***", "ANNA", "TOM", "", "***Scene Breakdown***", "*ACT ONE*", "1. The Kitchen", "2. The Garden", "", ".ACT ONE", "", ".The Kitchen", "", "ANNA", "Hi.", "", "TOM", "Hi.", "", ".The Garden", "", "ANNA", "Bye."].join("\n"),
    );
    // Once written, the sections are read back as the cast list and breakdown, and doing it again changes nothing.
    const again = generate(text);
    expect(again.edits).toEqual([]);
    expect(parseFountain(text).titleValues.characters?.filter(Boolean)).toEqual(["ANNA", "TOM"]);
  });

  it("adds new speakers to a list, keeping descriptions and notes", () => {
    const source = [
      "Title: Old",
      "",
      "***Characters***",
      "ANNA              41 years old",
      "JO                Anna's sister",
      "",
      "ANNA and JO are played by the same actor.",
      "",
      "***Scene Breakdown***",
      "*Act One*",
      "1. The Kitchen, early morning",
      "2. My own words for the hall",
      "",
      "A slash marks overlapping dialogue.",
      "",
      "===",
      "",
      ".Act One",
      "",
      ".The Kitchen",
      "",
      "ANNA",
      "Hi.",
      "",
      "TOM",
      "Hi.",
      "",
      ".The Hall",
      "",
      "MRS PIKE",
      "Who's there?",
      "",
      ".The Garden",
      "",
      "ANNA",
      "Bye.",
    ].join("\n");
    const { text, added, unused } = generate(source);
    expect(added).toEqual(["TOM", "MRS PIKE"]);
    expect(unused).toEqual(["JO"]);
    expect(text.split("\n").slice(2, 18)).toEqual([
      "***Characters***",
      "ANNA              41 years old",
      "JO                Anna's sister",
      "TOM",
      "MRS PIKE",
      "",
      "ANNA and JO are played by the same actor.",
      "",
      "***Scene Breakdown***",
      "*Act One*",
      "1. The Kitchen, early morning",
      "2. My own words for the hall",
      "3. The Garden",
      "",
      "A slash marks overlapping dialogue.",
      "",
    ]);
  });

  it("keeps your own words for a scene by its number", () => {
    const source = ["***Scene Breakdown***", "1. Where it all starts", "", ".The Kitchen", "", "ANNA", "Hi."].join("\n");
    expect(generate(source).text.split("\n").slice(0, 2)).toEqual(["***Scene Breakdown***", "1. Where it all starts"]);
  });

  it("adds to a list of names on a title page", () => {
    const source = ["Title: Keys", "Characters: ANNA, TOM", "", "INT. KITCHEN", "", "ANNA", "Hi.", "", "JO", "Hi."].join("\n");
    const { text } = generate(source);
    expect(text.split("\n")[1]).toBe("Characters: ANNA, TOM, JO");
    const indented = ["Title: Keys", "Characters:", "    ANNA, sixties", "", "INT. KITCHEN", "", "JO", "Hi."].join("\n");
    expect(generate(indented).text.split("\n").slice(1, 5)).toEqual(["Characters:", "    ANNA, sixties", "    JO", "***Scene Breakdown***"].slice(0, 3).concat(""));
  });

  it("keeps Windows line breaks", () => {
    const source = ["Title: New", "", "INT. KITCHEN", "", "ANNA", "Hi."].join("\r\n");
    expect(generate(source).text).toContain("***Characters***\r\nANNA\r\n\r\n***Scene Breakdown***\r\n1. INT. KITCHEN\r\n\r\nINT. KITCHEN");
  });
});

describe("a cast list of names alone", () => {
  it("isn't taken for a speech, but a speech after it still starts the play", () => {
    const script = parseFountain(["***Characters***", "ANNA", "TOM", "", "ANNA", "Hello."].join("\n"));
    expect(script.titleValues.characters?.filter(Boolean)).toEqual(["ANNA", "TOM"]);
    expect(script.elements.map((el) => el.type)).toEqual(["character", "dialogue"]);
  });
});
