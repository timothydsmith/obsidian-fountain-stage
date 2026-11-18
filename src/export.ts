/**
 * Exporting a script to PDF from Obsidian: the export dialog (style,
 * watermark, notes and synopses), laying out, and saving the PDF beside the script.
 */

import { type App, FileView, Modal, normalizePath, Notice, Setting, TFile } from "obsidian";
import { type ParsedScript, parseFountain } from "./fountain/parser";
import type { ExportChoices, Library } from "./library";
import type { LayoutOptions } from "./pdf/layout";
import { buildPdf } from "./pdf/render";
import type { PlayStyle } from "./pdf/style";
import { findStyle } from "./pdf/styles";

class ExportModal extends Modal {
  private readonly choices: ExportChoices;
  private style: PlayStyle;

  constructor(
    app: App,
    private readonly fileName: string,
    private readonly styles: readonly PlayStyle[],
    initial: PlayStyle,
    remembered: ExportChoices,
    /** Explains where the style comes from, or why the script's own isn't used. */
    private readonly styleNote: string | undefined,
    private readonly onExport: (style: PlayStyle, choices: ExportChoices) => void,
  ) {
    super(app);
    this.style = initial;
    this.choices = { ...remembered, style: initial.id };
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(`Export ${this.fileName} to PDF`);
    contentEl.addClass("fountain-stage-export");

    const styleSetting = new Setting(contentEl).setName("Style");
    const describe = () => {
      styleSetting.descEl.empty();
      styleSetting.descEl.createDiv({ text: this.style.description });
      if (this.styleNote) styleSetting.descEl.createDiv({ text: this.styleNote, cls: "fountain-stage-export-note" });
    };
    styleSetting.addDropdown((dropdown) => {
      for (const [i, style] of this.styles.entries()) dropdown.addOption(String(i), style.name);
      dropdown.setValue(String(this.styles.indexOf(this.style)));
      dropdown.onChange((value) => {
        this.style = this.styles[Number(value)];
        this.choices.style = this.style.id;
        describe();
      });
    });
    describe();

    new Setting(contentEl)
      .setName("Watermark")
      .setDesc("Printed faintly across every page, such as DRAFT. Leave it blank for none.")
      .addText((text) =>
        text
          .setPlaceholder("None")
          .setValue(this.choices.watermark)
          .onChange((value) => (this.choices.watermark = value)),
      );

    new Setting(contentEl)
      .setName("Include notes")
      .setDesc("Print [[notes]] in grey, in square brackets, where they're written.")
      .addToggle((toggle) => toggle.setValue(this.choices.notes).onChange((value) => (this.choices.notes = value)));

    new Setting(contentEl)
      .setName("Include synopses")
      .setDesc("Print = synopsis lines in grey, where they're written.")
      .addToggle((toggle) => toggle.setValue(this.choices.synopses).onChange((value) => (this.choices.synopses = value)));

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText("Export")
          .setCta()
          .onClick(() => this.export()),
      );

    this.scope.register([], "Enter", (evt) => {
      if (evt.isComposing) return;
      evt.preventDefault();
      this.export();
      return false;
    });
  }

  private export(): void {
    this.close();
    this.onExport(this.style, { ...this.choices, watermark: this.choices.watermark.trim() });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Opens the export dialog for a script, starting in the style its `Style:`
 * title-page key names, or else the one chosen last time.
 */
export async function exportScript(
  app: App,
  library: Library,
  file: TFile,
  source: string,
  remembered: ExportChoices,
  remember: (choices: ExportChoices) => void,
): Promise<void> {
  const { styles, problems } = await library.loadStyles();
  if (problems.length > 0) {
    const files = problems.length === 1 ? `${problems[0].path} has problems` : `${problems.length} style files have problems`;
    new Notice(`${files}, so ${problems.length === 1 ? "it's" : "they're"} left out. See Fountain Stage's settings for details.`);
  }

  const script = parseFountain(source);
  const key = (script.titleValues.style ?? []).join(" ").trim();
  const named = key ? findStyle(styles, key) : undefined;
  const initial = named ?? findStyle(styles, remembered.style) ?? styles[0];
  const note = named
    ? "This script's Style key names this style."
    : key
      ? `This script's Style key names "${key}", but there's no style called that.`
      : undefined;

  new ExportModal(app, file.basename, styles, initial, remembered, note, (style, choices) => {
    remember(choices);
    void writePdf(app, library, file, script, style, { watermark: choices.watermark, notes: choices.notes, synopses: choices.synopses });
  }).open();
}

async function writePdf(app: App, library: Library, file: TFile, script: ParsedScript, style: PlayStyle, options: LayoutOptions): Promise<void> {
  try {
    const { choice, notice } = await library.fontsFor(style);
    if (notice) new Notice(notice);
    const { bytes, layout } = await buildPdf(script, style, choice, options);
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
    console.error("[fountain-stage] PDF export failed", error);
    new Notice(`Couldn't export ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
