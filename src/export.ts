/** Exporting a script to PDF from Obsidian: choosing the style, laying out, and saving the PDF beside the script. */

import { type App, FileView, normalizePath, Notice, SuggestModal, TFile } from "obsidian";
import { parseFountain } from "./fountain/parser";
import { standardFontSet } from "./pdf/fonts";
import { layoutScript } from "./pdf/layout";
import { renderPdf } from "./pdf/render";
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
export function exportScript(app: App, file: TFile, source: string, styles: readonly PlayStyle[], options: ExportOptions = {}): void {
  const script = parseFountain(source);
  const key = (script.titleValues.style ?? []).join(" ").trim();
  const named = key && !options.chooseStyle ? findStyle(styles, key) : undefined;
  if (named) {
    void writePdf(app, file, script, named);
    return;
  }
  if (key && !options.chooseStyle) {
    new Notice(`There's no style called "${key}". Choose one for this export.`);
  }
  new StylePicker(app, styles, (style) => void writePdf(app, file, script, style)).open();
}

async function writePdf(app: App, file: TFile, script: ReturnType<typeof parseFountain>, style: PlayStyle): Promise<void> {
  try {
    const faces = style.fonts.standard;
    if (style.fonts.preferred) {
      const family = faces.regular.split("-")[0];
      new Notice(`${style.name} calls for ${style.fonts.preferred}, which Playwright can't use yet, so the PDF uses ${family}.`);
    }
    const layout = layoutScript(script, style, standardFontSet(faces));
    const bytes = await renderPdf(layout, faces);
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
