import { describe, expect, it } from "vitest";
import { alternatesAt, isAlternateNote, keepAlternate, switchAlternate, type AlternateEdit } from "../src/fountain/alternates";
import { parseFountain } from "../src/fountain/parser";

const apply = (source: string, edit: AlternateEdit) => source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
const at = (source: string, line: number) => alternatesAt(source, parseFountain(source), line);

const speech = ["INT. KITCHEN", "", "ANNA", "(quietly)", "Not before coffee.", "", "TOM", "Fine."].join("\n");

describe("alternate lines", () => {
  it("finds a speech's lines from its cue or any of its lines", () => {
    for (const line of [2, 3, 4]) {
      const a = at(speech, line);
      expect(a).toMatchObject({ line: 3, endLine: 4, altEndLine: 4, live: "(quietly)\nNot before coffee.", alternates: [] });
    }
    expect(at(speech, 0)).toBeUndefined();
    expect(at(speech, 1)).toBeUndefined();
  });

  it("keeps a copy of the live version in a note under the speech", () => {
    const kept = apply(speech, keepAlternate(at(speech, 4)!));
    expect(kept).toBe(["INT. KITCHEN", "", "ANNA", "(quietly)", "Not before coffee.", "[[alt: (quietly)", "Not before coffee.]]", "", "TOM", "Fine."].join("\n"));
    // Still one speech, and the note prints nothing.
    const script = parseFountain(kept);
    expect(script.elements.map((e) => e.type)).toEqual(["scene_heading", "character", "parenthetical", "dialogue", "character", "dialogue"]);
    expect(isAlternateNote(script.lineNotes[0].text)).toBe(true);
    expect(at(kept, 6)).toMatchObject({ altEndLine: 6, alternates: ["(quietly)\nNot before coffee."] });
  });

  it("cycles through the versions in order", () => {
    const source = ["ANNA", "One.", "[[alt: Two.]]", "[[alt: Three.]]", "", "TOM", "Fine."].join("\n");
    const once = apply(source, switchAlternate(at(source, 1)!, 0));
    expect(once).toBe(["ANNA", "Two.", "[[alt: Three.]]", "[[alt: One.]]", "", "TOM", "Fine."].join("\n"));
    const twice = apply(once, switchAlternate(at(once, 3)!, 0));
    expect(twice.split("\n").slice(1, 4)).toEqual(["Three.", "[[alt: One.]]", "[[alt: Two.]]"]);
    const chosen = apply(source, switchAlternate(at(source, 1)!, 1));
    expect(chosen.split("\n").slice(1, 4)).toEqual(["Three.", "[[alt: One.]]", "[[alt: Two.]]"]);
  });

  it("works for action paragraphs, and leaves other notes alone", () => {
    const source = ["INT. HALL", "", "The phone rings.", "Nobody moves.", "[[alt: The phone rings once.]]", "[[Check the sound cue]]", "", "ANNA", "Leave it."].join("\n");
    const a = at(source, 2)!;
    expect(a).toMatchObject({ live: "The phone rings.\nNobody moves.", alternates: ["The phone rings once."], altEndLine: 4 });
    expect(at(source, 4)).toMatchObject({ line: 2 });
    expect(at(source, 5)).toBeUndefined();
    expect(isAlternateNote("Check the sound cue")).toBe(false);
  });
});
