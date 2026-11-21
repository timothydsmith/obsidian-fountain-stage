import { describe, expect, it } from "vitest";
import { freeScriptPath, isInFolder, untitledScriptPath } from "../src/files";

describe("untitledScriptPath", () => {
  it("uses Untitled.fountain when it is free", () => {
    expect(untitledScriptPath("Drafts", () => false)).toBe("Drafts/Untitled.fountain");
  });

  it("puts the file at the vault root for an empty or slash folder", () => {
    expect(untitledScriptPath("", () => false)).toBe("Untitled.fountain");
    expect(untitledScriptPath("/", () => false)).toBe("Untitled.fountain");
  });

  it("counts up past taken names", () => {
    const taken = new Set(["Drafts/Untitled.fountain", "Drafts/Untitled 1.fountain"]);
    expect(untitledScriptPath("Drafts/", (p) => taken.has(p))).toBe("Drafts/Untitled 2.fountain");
  });
});

describe("freeScriptPath", () => {
  it("counts up past a taken name", () => {
    const taken = new Set(["Drafts/Play - Draft 03 - 2026-11-21.fountain"]);
    expect(freeScriptPath("Drafts", "Play - Draft 03 - 2026-11-21", (p) => taken.has(p))).toBe("Drafts/Play - Draft 03 - 2026-11-21 1.fountain");
  });
});

describe("isInFolder", () => {
  it("finds files in the folder, at any depth", () => {
    expect(isInFolder("Drafts/Play.fountain", "Drafts")).toBe(true);
    expect(isInFolder("Drafts/Old/Play.fountain", "Drafts/")).toBe(true);
    expect(isInFolder("Play/Drafts/Play.fountain", "Play/Drafts")).toBe(true);
  });

  it("doesn't match a folder that only starts the same way, or no folder", () => {
    expect(isInFolder("Drafts old/Play.fountain", "Drafts")).toBe(false);
    expect(isInFolder("Play.fountain", "Drafts")).toBe(false);
    expect(isInFolder("Play.fountain", "")).toBe(false);
  });
});
