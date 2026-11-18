import { describe, expect, it } from "vitest";
import { DEFAULT_PAUSE_WORDS, pauseSeconds, readPauseWords } from "../src/fountain/pauses";

describe("pauseSeconds", () => {
  it("counts every pause in a parenthetical", () => {
    expect(pauseSeconds("(beat)", true)).toBe(1);
    expect(pauseSeconds("(a long pause before answering)", true)).toBe(4);
    expect(pauseSeconds("(after a moment)", true)).toBe(2);
    expect(pauseSeconds("(laughing)", true)).toBe(0);
  });

  it("counts a pause that stands on its own in a stage direction", () => {
    expect(pauseSeconds("Beat.", false)).toBe(1);
    expect(pauseSeconds("A long silence.", false)).toBe(7);
    expect(pauseSeconds("Silence falls.", false)).toBe(5);
    expect(pauseSeconds("After a pause, she sits.", false)).toBe(2);
    expect(pauseSeconds("They sit in silence.", false)).toBe(5);
    expect(pauseSeconds("A brief pause. Then two beats.", false)).toBe(1 + 2);
  });

  it("doesn't count pause words that don't ask for a pause", () => {
    expect(pauseSeconds("A moment later, the door opens.", false)).toBe(0);
    expect(pauseSeconds("She pauses at the door and looks back.", false)).toBe(0);
  });

  it("times pauses as Annie Baker's Author's Note does, by default", () => {
    const times = ["(pause)", "(long pause)", "(short pause)", "(silence)", "(long silence)"].map((p) => pauseSeconds(p, true));
    expect(times).toEqual([2, 4, 1, 5, 7]);
  });

  it("uses each word's own short and long times", () => {
    const words = [{ word: "beat", seconds: 1, short: 0.25, long: 3 }];
    expect(pauseSeconds("(beat) (a quick beat) (a long beat) (two long beats)", true, words)).toBe(1 + 0.25 + 3 + 6);
  });

  it("matches words of your own, including phrases and plurals", () => {
    const words = [...DEFAULT_PAUSE_WORDS, { word: "Lights  fade", seconds: 3, short: 1, long: 6 }, { word: "hush", seconds: 2, short: 1, long: 4 }];
    expect(pauseSeconds("Lights fade.", false, words)).toBe(3);
    expect(pauseSeconds("A long hush.", false, words)).toBe(4);
    expect(pauseSeconds("(two hushes)", true, words)).toBe(4);
    expect(pauseSeconds("Beat.", false, words)).toBe(1);
  });

  it("counts nothing with no words", () => {
    expect(pauseSeconds("(beat)", true, [])).toBe(0);
    expect(pauseSeconds("(beat)", true, [{ word: " ", seconds: 1, short: 1, long: 1 }])).toBe(0);
  });
});

describe("readPauseWords", () => {
  it("keeps entries that make sense, filling in short and long times", () => {
    expect(readPauseWords([{ word: "hush", seconds: 2 }, { seconds: 3 }, "beat", { word: "lull", seconds: -1, short: 1, long: 2 }])).toEqual([
      { word: "hush", seconds: 2, short: 1, long: 4 },
      { word: "lull", seconds: 0, short: 1, long: 2 },
    ]);
  });

  it("gives the defaults for anything that isn't a list", () => {
    expect(readPauseWords(undefined)).toEqual(DEFAULT_PAUSE_WORDS);
    expect(readPauseWords([])).toEqual([]);
  });
});
