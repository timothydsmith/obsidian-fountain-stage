import { describe, expect, it } from "vitest";
import { firstScriptText, foldersToMake, scriptFileName, setupFolders } from "../src/setupPlan";

const DEFAULT_SETTINGS = {
  draftsFolder: "Drafts",
  beatNotesFolder: "Notes",
  frameworksFolder: "Fountain Stage/Frameworks",
  stylesFolder: "Fountain Stage/Styles",
  fontsFolder: "Fountain Stage/Fonts",
};

describe("setupFolders", () => {
  it("lists the folders in settings", () => {
    expect(setupFolders(DEFAULT_SETTINGS)).toEqual([
      { name: "Drafts folder", path: "Drafts" },
      { name: "Beat notes folder", path: "Notes" },
      { name: "Frameworks folder", path: "Fountain Stage/Frameworks" },
      { name: "Styles folder", path: "Fountain Stage/Styles" },
      { name: "Fonts folder", path: "Fountain Stage/Fonts" },
    ]);
  });

  it("leaves out blank folders and lists a folder named twice once", () => {
    const settings = { ...DEFAULT_SETTINGS, draftsFolder: " ", beatNotesFolder: "/Play/", frameworksFolder: "play", stylesFolder: "", fontsFolder: "Fonts" };
    expect(setupFolders(settings)).toEqual([
      { name: "Beat notes folder", path: "Play" },
      { name: "Fonts folder", path: "Fonts" },
    ]);
  });
});

describe("foldersToMake", () => {
  it("makes parents first, once each, and skips folders already there", () => {
    const there = new Set(["Drafts"]);
    expect(foldersToMake(["Drafts", "Fountain Stage/Styles", "Fountain Stage/Fonts", "Notes"], (p) => there.has(p))).toEqual([
      "Fountain Stage",
      "Fountain Stage/Styles",
      "Fountain Stage/Fonts",
      "Notes",
    ]);
  });

  it("makes nothing when everything's there", () => {
    expect(foldersToMake(["A/B"], () => true)).toEqual([]);
  });
});

describe("the first script", () => {
  it("is named from the title", () => {
    expect(scriptFileName("Still: a play in two acts?")).toBe("Still a play in two acts");
    expect(scriptFileName(" ..hidden")).toBe("hidden");
    expect(scriptFileName("  ")).toBe("Untitled");
  });

  it("has a title page", () => {
    expect(firstScriptText("Still", "Sam Writer")).toBe("Title: Still\nCredit: Written by\nAuthor: Sam Writer\n\n");
    expect(firstScriptText("", "")).toBe("Title: Untitled\n\n");
  });
});
