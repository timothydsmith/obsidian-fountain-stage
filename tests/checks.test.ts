import { describe, expect, it } from "vitest";
import { runChecks } from "../src/fountain/checks";
import { checkDirections } from "../src/fountain/checks/directions";
import { alike, checkNames, namesOnOneLine } from "../src/fountain/checks/names";
import { checkOverlaps, overlapSlashes } from "../src/fountain/checks/overlaps";
import { checkPauses, checkPhrases, fillers } from "../src/fountain/checks/repetition";
import { speechMap } from "../src/fountain/checks/speeches";
import { findPhrase } from "../src/fountain/checks/text";
import { voices } from "../src/fountain/checks/voice";
import { buildOutline } from "../src/fountain/outline";
import { parseFountain } from "../src/fountain/parser";
import { defaultPauseWords } from "../src/fountain/pauses";
import { scriptScenes } from "../src/fountain/report";

const script = (lines: string[]) => {
  const source = lines.join("\n");
  return { source, script: parseFountain(source) };
};
const lineOf = (source: string, text: string) => source.split("\n").indexOf(text);

describe("finding phrases", () => {
  it("finds whole words, any case, across line breaks", () => {
    expect(findPhrase("We see her. we\nsee him. Wesee.", "we see")).toEqual([
      { from: 0, to: 6 },
      { from: 12, to: 18 },
    ]);
    expect(findPhrase("She realises", "realise")).toEqual([]);
  });
});

describe("name consistency", () => {
  it("knows which names look alike", () => {
    expect(alike("JON", "JOHN")).toBe("one may be a short form of the other");
    expect(alike("CAROLINE", "CAROLYNE")).toBe("spelt nearly the same");
    expect(alike("ANA", "ANNA")).toBe("spelt nearly the same");
    expect(alike("TOM", "TIM")).toBeUndefined();
    expect(alike("MAGGIE", "MARGARET")).toBe("one may be a short form of the other");
    expect(alike("MRS SMITH", "SMITH")).toBe("one name is part of the other");
    expect(alike("MRS SMITH", "MR SMITH")).toBeUndefined();
    expect(alike("DR. JONES", "DR JONES")).toBe("written two ways");
    expect(alike("ALEX", "XANDER")).toBeUndefined();
  });

  it("flags names spelt two ways, silent listed characters and unlisted speakers", () => {
    const { source, script: s } = script([
      "Title: Play",
      "Characters: MARGARET, sixties",
      "    NORA, her daughter",
      "",
      "INT. KITCHEN",
      "",
      "MARGARET",
      "Tea?",
      "",
      "MAGGIE",
      "Coffee.",
      "",
      "MARGARET",
      "Tea it is.",
      "",
      "ALL",
      "Cheers.",
    ]);
    const findings = checkNames(source, s);
    expect(findings.map((f) => f.key).sort()).toEqual(["names:alike:MAGGIE|MARGARET", "names:silent:NORA", "names:unlisted:MAGGIE"]);
    const alikeFinding = findings.find((f) => f.key.startsWith("names:alike"))!;
    expect(alikeFinding.line).toBe(lineOf(source, "MAGGIE"));
    expect(alikeFinding.message).toBe("MAGGIE and MARGARET may be one character (one may be a short form of the other). MAGGIE has 1 speech, MARGARET 2 speeches.");
    expect(source.slice(alikeFinding.marks![0].from, alikeFinding.marks![0].to)).toBe("MAGGIE");
    expect(findings.find((f) => f.key === "names:silent:NORA")!.line).toBe(2);
  });

  it("reads a cast list written on one line", () => {
    expect(namesOnOneLine("ANNA, TOM and MRS PIKE")).toEqual(["ANNA", "TOM", "MRS PIKE"]);
    expect(namesOnOneLine("Anna & Tom")).toEqual(["ANNA", "TOM"]);
    expect(namesOnOneLine("ANNA, his sister")).toEqual(["ANNA, his sister"]);
    expect(namesOnOneLine("NORA")).toEqual(["NORA"]);
    const { source, script: s } = script(["Title: Play", "Characters: ANNA, TOM, MRS PIKE", "", "INT. KITCHEN", "", "ANNA", "Tea?", "", "TOM", "Coffee."]);
    expect(checkNames(source, s).map((f) => f.key)).toEqual(["names:silent:MRS PIKE"]);
  });

  it("goes to the spelling missing from the list when both speak as often", () => {
    const { source, script: s } = script(["Title: Play", "Characters: CAROLINE", "", "INT. KITCHEN", "", "CAROLINE", "Hello.", "", "CAROLYNE", "Hello again."]);
    expect(checkNames(source, s).find((f) => f.key.startsWith("names:alike"))!.line).toBe(lineOf(source, "CAROLYNE"));
  });
});

describe("stage directions", () => {
  it("flags unplayable and screen language, your own phrases, and long directions, but not lyrics or notes", () => {
    const long = Array.from({ length: 70 }, () => "word").join(" ");
    const { source, script: s } = script([
      "INT. KITCHEN",
      "",
      "She realises he's gone. We see the door.",
      "",
      "~We see the stars tonight",
      "",
      "He sits. [[We see this later]]",
      "",
      "Suddenly, the lights.",
      "",
      long,
    ]);
    const findings = checkDirections(source, s, ["suddenly"]);
    expect(findings.map((f) => f.message)).toEqual([
      `"realises": the audience only sees what the actor can play.`,
      `"We see" is screen language.`,
      `"Suddenly" is one of your phrases to check.`,
      "A stage direction of 70 words. Could it be shorter, or split up?",
    ]);
    expect(findings.slice(0, 2).map((f) => source.slice(f.marks![0].from, f.marks![0].to))).toEqual(["realises", "We see"]);
  });

  it("keys a finding to its text, so a changed direction comes back", () => {
    const key = (text: string) => {
      const { source, script: s } = script(["INT. KITCHEN", "", text]);
      return checkDirections(source, s)[0].key;
    };
    expect(key("She realises.")).toBe(key("She realises."));
    expect(key("She realises.")).not.toBe(key("She realises it."));
  });
});

describe("overlaps", () => {
  it("finds overlap slashes, not ones between words", () => {
    expect(overlapSlashes("I don't / know what and/or 24/7 /")).toEqual([8, 32]);
  });

  it("flags a slash with no speech after it", () => {
    const { source, script: s } = script([
      "INT. KITCHEN",
      "",
      "NORA",
      "I was going to / say that.",
      "",
      "TOM",
      "Say what? /",
      "",
      "She leaves.",
    ]);
    const findings = checkOverlaps(source, s);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toBe("TOM's speech has an overlap slash, but no speech follows it to come in over it.");
    expect(findings[0].line).toBe(lineOf(source, "Say what? /"));
    expect(source.slice(findings[0].marks![0].from, findings[0].marks![0].to)).toBe("/");
  });
});

describe("repetition", () => {
  it("finds repeated phrases, once each, not inside longer ones", () => {
    const { script: s } = script([
      "INT. KITCHEN",
      "",
      "NORA",
      "The house on the corner is empty.",
      "",
      "TOM",
      "The house on the corner? Again?",
      "",
      "NORA",
      "The house on the corner.",
      "",
      "TOM",
      "I don't want to. I don't want to. I don't want to.",
    ]);
    const findings = checkPhrases(s);
    expect(findings.map((f) => f.message)).toEqual([`"the house on the corner" comes 3 times.`, `"i don't want to" comes 3 times.`]);
    expect(findings[0].lines).toEqual([3, 6, 9]);
    // Phrases of only common words don't count.
    const { script: common } = script(["INT. HALL", "", "TOM", "And then I did. And then I did. And then I did."]);
    expect(checkPhrases(common)).toEqual([]);
  });

  it("counts filler words and who says them most", () => {
    const { script: s } = script(["INT. KITCHEN", "", "NORA", "I just, you know, just can't.", "", "TOM", "Just go."]);
    expect(fillers(s)).toEqual([
      { word: "just", count: 3, most: "NORA", mostCount: 2 },
      { word: "you know", count: 1, most: "NORA", mostCount: 1 },
    ]);
  });

  it("flags scenes heavy with beats and pauses", () => {
    const talk = "Words and more words to say here today for sure.";
    const lines = ["INT. KITCHEN", ""];
    for (let i = 0; i < 6; i++) lines.push("NORA", "(beat)", "Yes.", "");
    lines.push("INT. HALL", "");
    for (let i = 0; i < 10; i++) lines.push("TOM", talk, "");
    lines.push("Beat.");
    const { source, script: s } = script(lines);
    const findings = checkPauses(s, scriptScenes(s, buildOutline(source)), defaultPauseWords());
    expect(findings.map((f) => f.key)).toEqual(["pauses:INT. KITCHEN:6"]);
  });
});

describe("voices and speeches", () => {
  const lines = ["INT. KITCHEN", ""];
  for (let i = 0; i < 6; i++) {
    lines.push("NORA", `Honestly the garden needs rain, darling. Number ${i}.`, "");
    lines.push("TOM", i === 0 ? Array.from({ length: 160 }, () => "talk").join(" ") : "The garden needs work.", "");
  }
  const { source, script: s } = script(lines);

  it("profiles each character's voice", () => {
    const [first, second] = voices(s);
    expect(first.name).toBe("TOM");
    expect(first.longest).toBe(160);
    expect(second).toMatchObject({ name: "NORA", speeches: 6, typical: 8, own: ["darling", "honestly", "number", "rain"] });
    expect(second.repeats).toEqual(["honestly the garden needs", "rain darling number"]);
    expect(second.closest?.name).toBe("TOM");
  });

  it("maps the longest speeches", () => {
    const map = speechMap(s, scriptScenes(s, buildOutline(source)));
    expect(map.longest[0]).toMatchObject({ name: "TOM", words: 160, scene: 0 });
    expect(map.speeches).toHaveLength(12);
    expect(map.longest[0].at).toBeLessThan(0.1);
  });

  it("runs every check together", () => {
    const results = runChecks(source, s, buildOutline(source), { directionPhrases: [], pauseWords: defaultPauseWords() });
    expect(results.voices).toHaveLength(2);
    expect(results.scenes).toHaveLength(1);
  });
});
