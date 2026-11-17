import { describe, expect, it } from "vitest";
import { untitledScriptPath } from "../src/files";

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
