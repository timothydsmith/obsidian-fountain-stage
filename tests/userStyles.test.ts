import { describe, expect, it } from "vitest";
import { MM } from "../src/pdf/style";
import { BUILT_IN_STYLES, findStyle } from "../src/pdf/styles";
import { loadStyles, parseLength } from "../src/pdf/userStyles";
import { chooseFamily, type FontInfo } from "../src/pdf/vaultFonts";

const load = (...files: [string, unknown][]) =>
  loadStyles(
    BUILT_IN_STYLES,
    files.map(([path, content]) => ({ path, text: typeof content === "string" ? content : JSON.stringify(content) })),
  );

describe("parseLength", () => {
  it("reads points and units", () => {
    expect(parseLength(12)).toBe(12);
    expect(parseLength("12pt")).toBe(12);
    expect(parseLength("1in")).toBe(72);
    expect(parseLength("25mm")).toBeCloseTo(25 * MM);
    expect(parseLength("2.5 cm")).toBeCloseTo(25 * MM);
    expect(parseLength("wide")).toBeUndefined();
  });
});

describe("loadStyles", () => {
  it("extends a built-in style, changing only what's given", () => {
    const { styles, problems } = load(["Styles/My theatre.json", { extends: "apt", character: { bold: true }, page: { margins: { top: "30mm" } } }]);
    expect(problems).toEqual([]);
    const mine = findStyle(styles, "my theatre")!;
    const apt = findStyle(styles, "apt")!;
    expect(mine.id).toBe("My theatre");
    expect(mine.name).toBe("My theatre");
    expect(mine.description).toBe(`Based on ${apt.name}.`);
    expect(mine.source).toBe("Styles/My theatre.json");
    expect(mine.character.bold).toBe(true);
    expect(mine.character.nameColumnWidth).toBe(apt.character.nameColumnWidth);
    expect(mine.page.margins.top).toBeCloseTo(30 * MM);
    expect(mine.page.margins.left).toBe(apt.page.margins.left);
    expect(apt.character.bold).toBe(false);
  });

  it("takes id, name and description from the file", () => {
    const { styles } = load(["s.json", { id: "festival", name: "Festival", description: "For the festival.", extends: "modern" }]);
    const s = findStyle(styles, "festival")!;
    expect([s.name, s.description]).toEqual(["Festival", "For the festival."]);
    expect(findStyle(styles, "Festival")).toBe(s);
  });

  it("extends another vault style", () => {
    const { styles, problems } = load(
      ["b.json", { extends: "a", speech: { moreText: "(more)" } }],
      ["a.json", { extends: "samuel french", action: { italic: true } }],
    );
    expect(problems).toEqual([]);
    const b = findStyle(styles, "b")!;
    expect(b.action.italic).toBe(true);
    expect(b.speech.moreText).toBe("(more)");
    expect(b.speech.continuedText).toBe("(Cont.)");
  });

  it("sets page size, colours and font families", () => {
    const { styles, problems } = load([
      "s.json",
      { extends: "modern", page: { size: "A4" }, action: { color: "#336699" }, fonts: { family: "Garamond", fallback: "helvetica" } },
    ]);
    expect(problems).toEqual([]);
    const s = findStyle(styles, "s")!;
    expect(s.page.width).toBeCloseTo(210 * MM);
    expect(s.action.color.map((c) => Math.round(c * 255))).toEqual([0x33, 0x66, 0x99]);
    expect(s.fonts).toEqual({ family: ["Garamond"], fallback: "helvetica" });
  });

  it("ignores keys starting with an underscore", () => {
    expect(load(["s.json", { extends: "modern", _note: "for the festival" }]).problems).toEqual([]);
  });

  it("reports every problem with the setting and the reason", () => {
    const { styles, problems } = load([
      "bad.json",
      {
        extends: "apt",
        character: { bolt: true, size: "big" },
        action: { alignment: "middle", color: "red" },
        speech: { moreContinued: "yes" },
        colour: 1,
      },
    ]);
    expect(findStyle(styles, "bad")).toBeUndefined();
    expect(problems).toHaveLength(1);
    expect(problems[0].path).toBe("bad.json");
    expect(problems[0].messages).toEqual([
      `"character.bolt" isn't a setting in character. Did you mean "bold"?`,
      `"character.size" must be a length, such as 25mm, 1in, 12pt or a number of points.`,
      `"action.alignment" must be one of "left", "center", "right".`,
      `"action.color" must be a colour, such as "#1a1a1a" or [0.1, 0.1, 0.1].`,
      `"speech.moreContinued" must be true or false.`,
      `"colour" isn't a setting at the top level.`,
    ]);
  });

  it("reports bad JSON, a missing or unknown base, circles and clashing ids", () => {
    const { problems } = load(
      ["broken.json", "{ extends: apt }"],
      ["orphan.json", { name: "Orphan" }],
      ["typo.json", { extends: "aptt" }],
      ["x.json", { extends: "y" }],
      ["y.json", { extends: "x" }],
      ["apt.json", { extends: "modern" }],
    );
    const byPath = Object.fromEntries(problems.map((p) => [p.path, p.messages.join(" ")]));
    expect(byPath["broken.json"]).toMatch(/^This isn't valid JSON/);
    expect(byPath["orphan.json"]).toMatch(/Add "extends"/);
    expect(byPath["typo.json"]).toMatch(/no style with that id/);
    expect(byPath["x.json"] + byPath["y.json"]).toMatch(/circle/);
    expect(byPath["apt.json"]).toMatch(/already a built-in style/);
  });
});

describe("chooseFamily", () => {
  const font = (family: string, weight: number, italic: boolean): FontInfo => ({
    path: `${family}-${weight}${italic ? "i" : ""}.ttf`,
    family,
    weight,
    italic,
    bytes: new Uint8Array(),
  });
  const palatino = [font("Palatino Linotype", 400, false), font("Palatino Linotype", 700, false), font("Palatino Linotype", 400, true), font("Palatino Linotype", 700, true)];

  it("finds a family by the start of its name and picks each face", () => {
    const chosen = chooseFamily([font("Arial", 400, false), ...palatino], ["Palatino"])!;
    expect(chosen.family).toBe("Palatino Linotype");
    expect(chosen.missing).toEqual([]);
    expect(chosen.faces.boldItalic.path).toBe("Palatino Linotype-700i.ttf");
  });

  it("tries each wanted family in turn", () => {
    const chosen = chooseFamily([font("TeX Gyre Pagella", 400, false)], ["Palatino", "TeX Gyre Pagella"])!;
    expect(chosen.family).toBe("TeX Gyre Pagella");
    expect(chosen.missing).toEqual(["bold", "italic", "boldItalic"]);
    expect(chosen.faces.bold.path).toBe("TeX Gyre Pagella-400.ttf");
  });

  it("prefers the weights nearest regular and bold", () => {
    const chosen = chooseFamily([font("Source", 300, false), font("Source", 400, false), font("Source", 600, false), font("Source", 900, false)], ["source"])!;
    expect(chosen.faces.regular.weight).toBe(400);
    expect(chosen.faces.bold.weight).toBe(600);
  });

  it("finds nothing when no family matches", () => {
    expect(chooseFamily(palatino, ["Garamond"])).toBeUndefined();
  });
});

describe("notes, synopses and watermark settings", () => {
  it("sets them, and checks numbers are in range", () => {
    const good = load(["s.json", { extends: "apt", notes: { color: "#ff0000" }, watermark: { opacity: 0.5, angle: -30, maxSize: "2in" } }]);
    expect(good.problems).toEqual([]);
    const s = findStyle(good.styles, "s")!;
    expect(s.notes.color).toEqual([1, 0, 0]);
    expect(s.watermark).toMatchObject({ opacity: 0.5, angle: -30, maxSize: 144 });
    const bad = load(["b.json", { extends: "apt", watermark: { opacity: 2, angle: "steep" } }]);
    expect(bad.problems[0].messages).toEqual([`"watermark.opacity" must be a number from 0 to 1.`, `"watermark.angle" must be a number from -90 to 90.`]);
  });
});

describe("act settings", () => {
  it("sets the act pattern and new page, and checks the pattern", () => {
    const { styles, problems } = load(
      ["Styles/Prologue.json", { extends: "modern", act: { pattern: "^(ACT|PROLOGUE)\\b", newPage: false } }],
      ["Styles/Broken.json", { extends: "modern", act: { pattern: "(ACT" } }],
    );
    const prologue = findStyle(styles, "prologue")!;
    expect(prologue.act.pattern).toBe("^(ACT|PROLOGUE)\\b");
    expect(prologue.act.newPage).toBe(false);
    expect(findStyle(styles, "broken")).toBeUndefined();
    expect(problems.map((p) => p.messages[0])).toEqual([expect.stringMatching(/^"act.pattern" isn't a regular expression that can be used/)]);
  });

  it("still loads a style that sets the retired scene.uppercaseSections", () => {
    const { styles, problems } = load(["Styles/Old.json", { extends: "modern", scene: { uppercaseSections: true, bold: true } }]);
    expect(problems).toEqual([]);
    expect(findStyle(styles, "old")!.scene.bold).toBe(true);
  });
});
