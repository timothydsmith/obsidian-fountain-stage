/**
 * Freezing a draft: a copy of the script, as it is, goes to the drafts
 * folder with its draft number and date on its title page, and the script
 * itself moves on to the next draft.
 */

import { type App, Modal, Notice, Setting, type TFile } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { freeScriptPath } from "./files";
import { applyEdits, draftNumber, formatDraftDate, frozenDraftName, plainTitle, type TitleKeyChange, titleKeyEdits } from "./fountain/titlePage";

/** What the freeze dialog asks. */
export interface FreezeChoices {
  /** What the draft is for, kept on the frozen copy's title page and never printed. */
  notes: string;
  exportPdf: boolean;
}

class FreezeModal extends Modal {
  private choices: FreezeChoices = { notes: "", exportPdf: false };

  constructor(
    app: App,
    private readonly draft: number,
    private readonly folder: string,
    private readonly onFreeze: (choices: FreezeChoices) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(`Freeze draft ${this.draft}`);
    this.contentEl.createEl("p", {
      text: `A copy of the script as it is now goes in ${this.folder} as draft ${this.draft}, where it opens read-only. This script becomes draft ${this.draft + 1}.`,
    });
    new Setting(this.contentEl)
      .setName("What's this draft for?")
      .setDesc("Kept on the frozen draft's title page, and never printed. Optional.")
      .addText((text) => {
        text.setPlaceholder("For the reading on Friday").onChange((value) => (this.choices.notes = value));
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" && !evt.isComposing) {
            evt.preventDefault();
            this.freeze();
          }
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });
    new Setting(this.contentEl)
      .setName("Export a PDF of the draft")
      .addToggle((toggle) => toggle.setValue(this.choices.exportPdf).onChange((value) => (this.choices.exportPdf = value)));
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Freeze").setCta().onClick(() => this.freeze()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private freeze(): void {
    this.close();
    this.onFreeze(this.choices);
  }
}

/**
 * Asks what the draft is for and whether to export it, then freezes it.
 * `exportPdf` exports the frozen copy.
 */
export function freezeDraft(app: App, view: FountainView, folder: string, exportPdf: (file: TFile) => void): void {
  if (!view.file) return;
  const draft = draftNumber(view.script());
  new FreezeModal(app, draft, folder, (choices) => {
    void freeze(app, view, folder, choices).then((copy) => {
      if (copy && choices.exportPdf) exportPdf(copy);
    });
  }).open();
}

/**
 * Freezes the script as it is now: a copy in the drafts folder with its draft number, date and any
 * other title-page keys given, and the script moved on to the next draft. Returns the copy.
 */
export async function freeze(app: App, view: FountainView, folder: string, choices: FreezeChoices, keys: TitleKeyChange[] = []): Promise<TFile | undefined> {
  const file = view.file;
  if (!file) return;
  const { vault } = app;
  // The script as it is now, unsaved changes and all.
  const source = view.getViewData();
  const script = view.script();
  const draft = draftNumber(script);
  const date = new Date();
  const title = plainTitle(script) || file.basename;
  const notes = choices.notes.replace(/\s+/g, " ").trim();

  const frozen = applyEdits(
    source,
    titleKeyEdits(source, script, [["Draft", String(draft)], ["Draft date", formatDraftDate(date)], ["Draft notes", notes || null], ...keys], file.basename),
  );
  let copy: TFile;
  try {
    if (!vault.getFolderByPath(folder)) await vault.createFolder(folder);
    const path = freeScriptPath(folder, frozenDraftName(title, draft, date), (p) => vault.getAbstractFileByPath(p) !== null);
    copy = await vault.create(path, frozen);
  } catch (error) {
    console.error("[fountain-stage] couldn't freeze the draft", error);
    new Notice(`Couldn't freeze the draft: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // The script moves on to the next draft, as one step to undo.
  view.applyChanges(titleKeyEdits(source, script, [["Draft", `${draft + 1} (working)`], ["Draft date", null], ["Draft notes", null]], file.basename));
  new Notice(`Froze draft ${draft} as ${copy.basename}. This script is now draft ${draft + 1}.`);
  return copy;
}
