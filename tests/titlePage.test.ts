import { describe, expect, it } from "vitest";
import { parseFountain } from "../src/fountain/parser";
import {
  applyEdits,
  draftNumber,
  formatDraftDate,
  frozenDraftName,
  plainTitle,
  titleKeyEdits,
  type TitleKeyChange,
} from "../src/fountain/titlePage";

const set = (source: string, changes: TitleKeyChange[], title = "Play") =>
  applyEdits(source, titleKeyEdits(source, parseFountain(source), changes, title));

describe("draftNumber", () => {
  it("reads the number in the Draft key", () => {
    expect(draftNumber(parseFountain("Title: Play\nDraft: 3\n\nACTION."))).toBe(3);
    expect(draftNumber(parseFountain("Title: Play\nDraft: 4 (working)\n\nACTION."))).toBe(4);
  });

  it("is 1 with no key or no number", () => {
    expect(draftNumber(parseFountain("Title: Play\n\nACTION."))).toBe(1);
    expect(draftNumber(parseFountain("Title: Play\nDraft: first\n\nACTION."))).toBe(1);
    expect(draftNumber(parseFountain("Just some action."))).toBe(1);
  });
});

describe("dates and names", () => {
  const date = new Date(2026, 10, 21);

  it("writes the draft date in words", () => {
    expect(formatDraftDate(date)).toBe("21 November 2026");
    expect(formatDraftDate(new Date(2027, 0, 5))).toBe("5 January 2027");
  });

  it("names a frozen draft from the title, draft and date", () => {
    expect(frozenDraftName("Play", 3, date)).toBe("Play - Draft 03 - 2026-11-21");
    expect(frozenDraftName("Play", 12, date)).toBe("Play - Draft 12 - 2026-11-21");
    expect(frozenDraftName("Who: What?", 1, date)).toBe("Who What - Draft 01 - 2026-11-21");
    expect(frozenDraftName("", 1, date)).toBe("Untitled - Draft 01 - 2026-11-21");
  });

  it("reads the title without emphasis", () => {
    expect(plainTitle(parseFountain("Title: **_STILL_**\n\nACTION."))).toBe("STILL");
    expect(plainTitle(parseFountain("Title:\n    The Long\n    Way Home\n\nACTION."))).toBe("The Long Way Home");
    expect(plainTitle(parseFountain("ACTION."))).toBe("");
  });
});

describe("titleKeyEdits", () => {
  it("rewrites a key in place, keeping how it was written", () => {
    expect(set("Title: Play\ndraft: 2\nContact: me\n\nACTION.", [["Draft", "3"]])).toBe(
      "Title: Play\ndraft: 3\nContact: me\n\nACTION.",
    );
  });

  it("adds missing keys at the end of the title page", () => {
    expect(set("Title: Play\nAuthor: Me\n\nACTION.", [["Draft", "3"], ["Draft date", "21 November 2026"]])).toBe(
      "Title: Play\nAuthor: Me\nDraft: 3\nDraft date: 21 November 2026\n\nACTION.",
    );
  });

  it("removes keys, with their continuation lines", () => {
    expect(set("Title: Play\nDraft date: 1 May 2026\nDraft notes:\n    For the reading\n    at the library\nAuthor: Me\n\nACTION.", [
      ["Draft date", null],
      ["Draft notes", null],
    ])).toBe("Title: Play\nAuthor: Me\n\nACTION.");
  });

  it("leaves a missing key alone when removing it", () => {
    expect(set("Title: Play\n\nACTION.", [["Draft date", null]])).toBe("Title: Play\n\nACTION.");
  });

  it("replaces one key and removes the others like it", () => {
    expect(set("Title: Play\nDraft: 2\nDraft: 3\n\nACTION.", [["Draft", "4 (working)"]])).toBe(
      "Title: Play\nDraft: 4 (working)\n\nACTION.",
    );
  });

  it("works on a script that's only a title page", () => {
    expect(set("Title: Play\nDraft date: 1 May 2026", [["Draft date", null], ["Draft", "2"]])).toBe("Title: Play\nDraft: 2");
    expect(set("Title: Play", [["Draft", "2"]])).toBe("Title: Play\nDraft: 2");
  });

  it("adds after a removed last key", () => {
    expect(set("Title: Play\nDraft date: 1 May 2026\n\nACTION.", [["Draft date", null], ["Draft", "2"]])).toBe(
      "Title: Play\nDraft: 2\n\nACTION.",
    );
  });

  it("gives a script with no title page one", () => {
    expect(set("INT. ROOM\n\nACTION.", [["Draft", "1"], ["Draft notes", null]], "My Play")).toBe(
      "Title: My Play\nDraft: 1\n\nINT. ROOM\n\nACTION.",
    );
    expect(set("\nACTION.", [["Draft", "1"]], "My Play")).toBe("Title: My Play\nDraft: 1\n\nACTION.");
  });

  it("keeps Windows line endings", () => {
    expect(set("Title: Play\r\nDraft: 2\r\n\r\nACTION.", [["Draft", "3"], ["Draft date", "today"]])).toBe(
      "Title: Play\r\nDraft: 3\r\nDraft date: today\r\n\r\nACTION.",
    );
  });

  it("makes a frozen copy and the next working draft", () => {
    const source = "Title: Play\nDraft: 3 (working)\n\nINT. ROOM\n";
    const script = parseFountain(source);
    const copy = applyEdits(source, titleKeyEdits(source, script, [["Draft", "3"], ["Draft date", "21 November 2026"], ["Draft notes", "For the reading"]], "Play"));
    const working = applyEdits(source, titleKeyEdits(source, script, [["Draft", "4 (working)"], ["Draft date", null], ["Draft notes", null]], "Play"));
    expect(copy).toBe("Title: Play\nDraft: 3\nDraft date: 21 November 2026\nDraft notes: For the reading\n\nINT. ROOM\n");
    expect(working).toBe("Title: Play\nDraft: 4 (working)\n\nINT. ROOM\n");
    expect(parseFountain(copy).titleValues["draft notes"]).toEqual(["For the reading"]);
  });
});
