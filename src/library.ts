/** Reads styles and fonts from the vault folders named in settings. */

import { type App, normalizePath, TFile } from "obsidian";
import type { FontChoice } from "./pdf/render";
import { type Face, type PlayStyle, STANDARD_FAMILY_NAMES } from "./pdf/style";
import { BUILT_IN_STYLES } from "./pdf/styles";
import type { RuntimeMethod } from "./fountain/runtime";
import { defaultPauseWords, type PauseWord, readPauseWords } from "./fountain/pauses";
import { type LoadedStyles, loadStyles } from "./pdf/userStyles";
import { chooseFamily, describeFont, FONT_EXTENSIONS, type FontInfo } from "./pdf/vaultFonts";

export interface PlaywrightSettings {
  /** Folder of JSON style files. */
  stylesFolder: string;
  /** Folder of .ttf and .otf font files. */
  fontsFolder: string;
  /** Show where the PDF's pages break, in Live Preview and reading view. */
  showPageBreaks: boolean;
  /** The style to find page breaks in, for a script with no `Style:` key. */
  pageBreakStyle: string;
  /** Estimate runtime from the words spoken or the number of pages. */
  runtimeMethod: RuntimeMethod;
  wordsPerMinute: number;
  minutesPerPage: number;
  /** Words that add pauses to the runtime, going by words spoken. */
  pauseWords: PauseWord[];
  /** What the export dialog was last given. */
  export: ExportChoices;
}

/** What the export dialog asks, remembered for next time. */
export interface ExportChoices {
  /** The id of the style last chosen. A script's `Style:` key comes first. */
  style: string;
  /** Text across every page, or blank for none. */
  watermark: string;
  notes: boolean;
  synopses: boolean;
}

export const DEFAULT_SETTINGS: PlaywrightSettings = {
  stylesFolder: "Playwright/Styles",
  fontsFolder: "Playwright/Fonts",
  showPageBreaks: true,
  pageBreakStyle: "modern",
  runtimeMethod: "words",
  wordsPerMinute: 150,
  minutesPerPage: 1,
  pauseWords: defaultPauseWords(),
  export: { style: "modern", watermark: "", notes: false, synopses: false },
};

/**
 * Settings as saved, with defaults for what's missing or the wrong kind.
 * Settings no longer used are dropped, so they aren't saved again.
 */
export function readSettings(saved: unknown): PlaywrightSettings {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const string = (key: keyof PlaywrightSettings, fallback: string) => (typeof s[key] === "string" ? (s[key] as string) : fallback);
  const positive = (key: keyof PlaywrightSettings, fallback: number) => {
    const value = s[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const d = DEFAULT_SETTINGS;
  return {
    stylesFolder: string("stylesFolder", d.stylesFolder),
    fontsFolder: string("fontsFolder", d.fontsFolder),
    showPageBreaks: typeof s.showPageBreaks === "boolean" ? s.showPageBreaks : d.showPageBreaks,
    pageBreakStyle: string("pageBreakStyle", d.pageBreakStyle),
    runtimeMethod: s.runtimeMethod === "pages" ? "pages" : "words",
    wordsPerMinute: positive("wordsPerMinute", d.wordsPerMinute),
    minutesPerPage: positive("minutesPerPage", d.minutesPerPage),
    pauseWords: s.pauseWords === undefined ? defaultPauseWords() : readPauseWords(s.pauseWords),
    export: readExportChoices(s.export),
  };
}

function readExportChoices(saved: unknown): ExportChoices {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS.export;
  return {
    style: typeof s.style === "string" ? s.style : d.style,
    watermark: typeof s.watermark === "string" ? s.watermark : d.watermark,
    notes: typeof s.notes === "boolean" ? s.notes : d.notes,
    synopses: typeof s.synopses === "boolean" ? s.synopses : d.synopses,
  };
}

export interface LoadedFonts {
  fonts: FontInfo[];
  problems: { path: string; message: string }[];
}

const FACE_NAMES: Record<Face, string> = { regular: "regular", bold: "bold", italic: "italic", boldItalic: "bold italic" };

function list(items: string[], conjunction: string): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

export class Library {
  /** Font files already read, by path, kept while their size and modified time are unchanged. */
  private fontCache = new Map<string, { stamp: string; result: FontInfo | string }>();

  constructor(
    private readonly app: App,
    private readonly settings: () => PlaywrightSettings,
  ) {}

  /** Files anywhere under a folder with one of the extensions, in path order. */
  private filesIn(folder: string, extensions: string[]): TFile[] {
    const root = normalizePath(folder);
    if (!folder.trim() || root === "/") return [];
    return this.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(`${root}/`) && extensions.includes(f.extension.toLowerCase()))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async loadStyles(): Promise<LoadedStyles> {
    const files = this.filesIn(this.settings().stylesFolder, ["json"]);
    const texts = await Promise.all(files.map(async (f) => ({ path: f.path, text: await this.app.vault.cachedRead(f) })));
    return loadStyles(BUILT_IN_STYLES, texts);
  }

  async loadFonts(): Promise<LoadedFonts> {
    const fonts: FontInfo[] = [];
    const problems: LoadedFonts["problems"] = [];
    const files = this.filesIn(this.settings().fontsFolder, FONT_EXTENSIONS);
    for (const file of files) {
      const stamp = `${file.stat.size}:${file.stat.mtime}`;
      let entry = this.fontCache.get(file.path);
      if (entry?.stamp !== stamp) {
        const bytes = new Uint8Array(await this.app.vault.readBinary(file));
        entry = { stamp, result: describeFont(file.path, bytes) };
        this.fontCache.set(file.path, entry);
      }
      if (typeof entry.result === "string") problems.push({ path: file.path, message: entry.result });
      else fonts.push(entry.result);
    }
    return { fonts, problems };
  }

  /** The fonts to export a style with, and a notice if they aren't the ones it asks for. */
  async fontsFor(style: PlayStyle): Promise<{ choice: FontChoice; notice?: string }> {
    const { family, fallback } = style.fonts;
    if (family.length === 0) return { choice: { standard: fallback } };

    const chosen = chooseFamily((await this.loadFonts()).fonts, family);
    if (!chosen) {
      const folder = this.settings().fontsFolder || "(not set)";
      return {
        choice: { standard: fallback },
        notice: `${style.name} calls for ${list(family, "or")}, which isn't in your fonts folder (${folder}), so the PDF uses ${STANDARD_FAMILY_NAMES[fallback]}.`,
      };
    }
    const f = chosen.faces;
    const choice = { files: { regular: f.regular.bytes, bold: f.bold.bytes, italic: f.italic.bytes, boldItalic: f.boldItalic.bytes } };
    if (chosen.missing.length === 0) return { choice };
    const missing = list(chosen.missing.map((m) => FACE_NAMES[m]), "and");
    return { choice, notice: `Your fonts folder has no ${missing} ${chosen.family}, so the nearest face stands in.` };
  }
}
