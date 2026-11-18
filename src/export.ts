/** Exporting a script to PDF from Obsidian: choosing the style, laying out, and saving the PDF beside the script. */

import { type App, FileView, normalizePath, Notice, SuggestModal, TFile } from "obsidian";
import { type ParsedScript, parseFountain } from "./fountain/parser";
import type { Library } from "./library";
import { buildPdf } from "./pdf/render";
import type { PlayStyle } from "./pdf/style";
import { findStyle } from "./pdf/styles";

class StylePicker extends SuggestModal<PlayStyle> {
  constructor(
    app: App,
    private readonly styles: readonly PlayStyle[],
    private readonly onChoose: (style: PlayStyle) => void,
  ) {
    super(app);
    this.setPlaceholder("Choose a style for the PDF");
  }

  getSuggestions(query: string): PlayStyle[] {
    const q = query.trim().toLowerCase();
    return this.styles.filter((s) => [s.name, s.id, s.description].some((text) => text.toLowerCase().includes(q)));
  }

  renderSuggestion(style: PlayStyle, el: HTMLElement): void {
    el.createDiv({ text: style.name });
    el.createEl("small", { text: style.description, cls: "playwright-style-description" });
  }

  onChooseSuggestion(style: PlayStyle): void {
    this.onChoose(style);
  }
}

export interface ExportOptions {
  /** Always ask for a style, even if the script names one. */
  chooseStyle?: boolean;
}

/**
 * Exports a script in the style its `Style:` title-page key names, or the
 * one you pick if it names none (or one that doesn't exist).
 */
export async function exportScript(app: App, library: Library, file: TFile, source: string, options: ExportOptions = {}): Promise<void> {
  const { styles, problems } = await library.loadStyles();
  if (problems.length > 0) {
    const files = problems.length === 1 ? `${problems[0].path} has problems` : `${problems.length} style files have problems`;
    new Notice(`${files}, so ${problems.length === 1 ? "it's" : "they're"} left out. See Playwright's settings for details.`);
  }

  const script = parseFountain(source);
  const key = (script.titleValues.style ?? []).join(" ").trim();
  const named = key && !options.chooseStyle ? findStyle(styles, key) : undefined;
  if (named) {
    await writePdf(app, library, file, script, named);
    return;
  }
  if (key && !options.chooseStyle) {
    new Notice(`There's no style called "${key}". Choose one for this export.`);
  }
  new StylePicker(app, styles, (style) => void writePdf(app, library, file, script, style)).open();
}

async function writePdf(app: App, library: Library, file: TFile, script: ParsedScript, style: PlayStyle): Promise<void> {
  try {
    const { choice, notice } = await library.fontsFor(style);
    if (notice) new Notice(notice);
    const { bytes, layout } = await buildPdf(script, style, choice);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
    const path = normalizePath(`${folder}${file.basename}.pdf`);
    const existing = app.vault.getAbstractFileByPath(path);
    let pdf: TFile;
    if (existing instanceof TFile) {
      await app.vault.modifyBinary(existing, data);
      pdf = existing;
    } else if (existing) {
      throw new Error(`${path} is a folder`);
    } else {
      pdf = await app.vault.createBinary(path, data);
    }

    // Show the PDF: where it's already open, or in a new tab.
    const open = app.workspace.getLeavesOfType("pdf").find((leaf) => leaf.view instanceof FileView && leaf.view.file?.path === path);
    if (open) await app.workspace.revealLeaf(open);
    else await app.workspace.getLeaf("tab").openFile(pdf);
    new Notice(`Exported ${pdf.name} (${style.name}, ${layout.pages.length} pages)`);
  } catch (error) {
    console.error("[playwright] PDF export failed", error);
    new Notice(`Couldn't export ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
