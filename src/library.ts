/** Reads styles and fonts from the vault folders named in settings. */

import { type App, normalizePath, TFile, Vault } from "obsidian";
import type { FontChoice } from "./pdf/render";
import { type Face, type PlayStyle, STANDARD_FAMILY_NAMES } from "./pdf/style";
import { BUILT_IN_STYLES } from "./pdf/styles";
import type { RuntimeMethod } from "./fountain/runtime";
import { defaultPauseWords, type PauseWord, readPauseWords } from "./fountain/pauses";
import { type LoadedStyles, loadStyles } from "./pdf/userStyles";
import { DEFAULT_TABLE_READ, type TableReadChoices } from "./tableRead";
import { chooseFamily, describeFont, FONT_EXTENSIONS, type FontInfo } from "./pdf/vaultFonts";

export interface FountainStageSettings {
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
  /** Folder that frozen drafts are saved in, where they open read-only. */
  draftsFolder: string;
  /** Renumber scenes counts from 1 in each act, rather than straight through the play. */
  renumberRestart: boolean;
  /** The outline has been opened in the sidebar for the vault's first script, so it isn't opened again if you close it. */
  outlineAdded: boolean;
  /** Tint lines changed since a frozen draft, on screen. */
  showChanges: boolean;
  /** Mark what the checks find in the editor, on screen. */
  showCheckMarks: boolean;
  /** Your own phrases for the stage direction check. */
  directionPhrases: string[];
  /** Findings you've dismissed, by key, most recent last. */
  dismissedFindings: string[];
  /** Typewriter mode: the cursor's line stays in the middle, and the rest fades. */
  typewriter: boolean;
  /** How long the last sprint was, in minutes. */
  sprintMinutes: number;
  /** What the table read dialog was last given. */
  tableRead: TableReadChoices;
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

export const DEFAULT_SETTINGS: FountainStageSettings = {
  stylesFolder: "Fountain Stage/Styles",
  fontsFolder: "Fountain Stage/Fonts",
  showPageBreaks: true,
  pageBreakStyle: "modern",
  runtimeMethod: "words",
  wordsPerMinute: 150,
  minutesPerPage: 1,
  pauseWords: defaultPauseWords(),
  draftsFolder: "Drafts",
  renumberRestart: true,
  outlineAdded: false,
  showChanges: false,
  showCheckMarks: false,
  directionPhrases: [],
  dismissedFindings: [],
  typewriter: false,
  sprintMinutes: 25,
  tableRead: DEFAULT_TABLE_READ,
  export: { style: "modern", watermark: "", notes: false, synopses: false },
};

/**
 * Settings as saved, with defaults for what's missing or the wrong kind.
 * Settings no longer used are dropped, so they aren't saved again.
 */
export function readSettings(saved: unknown): FountainStageSettings {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const string = (key: keyof FountainStageSettings, fallback: string) => (typeof s[key] === "string" ? s[key] : fallback);
  const positive = (key: keyof FountainStageSettings, fallback: number) => {
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
    draftsFolder: string("draftsFolder", d.draftsFolder),
    renumberRestart: typeof s.renumberRestart === "boolean" ? s.renumberRestart : d.renumberRestart,
    outlineAdded: s.outlineAdded === true,
    showChanges: s.showChanges === true,
    showCheckMarks: s.showCheckMarks === true,
    directionPhrases: strings(s.directionPhrases),
    dismissedFindings: strings(s.dismissedFindings),
    typewriter: s.typewriter === true,
    sprintMinutes: positive("sprintMinutes", d.sprintMinutes),
    tableRead: readTableRead(s.tableRead),
    export: readExportChoices(s.export),
  };
}

/** A list of strings as saved, or none. */
function strings(saved: unknown): string[] {
  return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string") : [];
}

function readTableRead(saved: unknown): TableReadChoices {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const d = DEFAULT_TABLE_READ;
  const voices: TableReadChoices["voices"] = {};
  if (typeof s.voices === "object" && s.voices !== null) {
    for (const [name, choice] of Object.entries(s.voices as Record<string, unknown>)) {
      const c = (typeof choice === "object" && choice !== null ? choice : {}) as Record<string, unknown>;
      if (typeof c.voice === "string") voices[name] = { voice: c.voice, pitch: typeof c.pitch === "number" && c.pitch > 0 ? c.pitch : 1 };
    }
  }
  return {
    voices,
    narrator: typeof s.narrator === "string" ? s.narrator : d.narrator,
    directions: typeof s.directions === "boolean" ? s.directions : d.directions,
    rate: typeof s.rate === "number" && s.rate > 0 ? s.rate : d.rate,
    readers: strings(s.readers),
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
    private readonly settings: () => FountainStageSettings,
  ) {}

  /** Files anywhere under a folder with one of the extensions, in path order. Only that folder is read, not the whole vault. */
  private filesIn(folder: string, extensions: string[]): TFile[] {
    const root = normalizePath(folder);
    if (!folder.trim() || root === "/") return [];
    const top = this.app.vault.getFolderByPath(root);
    if (!top) return [];
    const files: TFile[] = [];
    Vault.recurseChildren(top, (f) => {
      if (f instanceof TFile && extensions.includes(f.extension.toLowerCase())) files.push(f);
    });
    return files.sort((a, b) => a.path.localeCompare(b.path));
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
