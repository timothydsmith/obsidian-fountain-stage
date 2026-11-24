/**
 * Set up a play: makes the folders Fountain Stage uses, as named in
 * settings, and a first script for a vault with none. Folders already there
 * are left alone. Offered once, the first time the plugin loads in a vault
 * with no scripts, and always from the command palette and settings.
 */

import { type App, Modal, Notice, Setting, type TFile } from "obsidian";
import { FOUNTAIN_EXTENSION, freeScriptPath } from "./files";
import type { FountainStageSettings } from "./library";
import { firstScriptText, foldersToMake, scriptFileName, type SetupFolder, setupFolders } from "./setupPlan";

/** Whether the vault has any scripts, frozen drafts included. */
export function hasScripts(app: App): boolean {
  return app.vault.getFiles().some((file) => file.extension === FOUNTAIN_EXTENSION);
}

class SetupModal extends Modal {
  private makeScript = true;
  private title = "";
  private author = "";

  constructor(
    app: App,
    private readonly folders: SetupFolder[],
    private readonly offerScript: boolean,
    private readonly onDone: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Set up a play");
    const { contentEl } = this;
    const exists = (path: string) => this.app.vault.getFolderByPath(path) !== null;
    const missing = this.folders.filter((folder) => !exists(folder.path));
    if (missing.length === 0 && !this.offerScript) {
      contentEl.createEl("p", { text: "Everything's in place: the folders in settings are all there, and the vault has scripts." });
      new Setting(contentEl).addButton((button) => button.setButtonText("Close").setCta().onClick(() => this.close()));
      return;
    }

    contentEl.createEl("p", { text: "Makes the folders Fountain Stage uses, as named in its settings. Folders already there are left as they are." });
    for (const folder of this.folders) {
      const setting = new Setting(contentEl).setName(folder.name).setDesc(folder.path);
      setting.controlEl.createSpan({ cls: "fountain-stage-setup-status", text: exists(folder.path) ? "Already there" : "To make" });
    }

    if (this.offerScript) {
      new Setting(contentEl).setName("First script").setHeading();
      const fields: Setting[] = [];
      new Setting(contentEl)
        .setName("Create a first script")
        .setDesc("The vault has no scripts yet. This one starts with a title page.")
        .addToggle((toggle) =>
          toggle.setValue(this.makeScript).onChange((value) => {
            this.makeScript = value;
            for (const field of fields) field.setDisabled(!value);
          }),
        );
      fields.push(
        new Setting(contentEl).setName("Title").addText((text) => {
          text.setPlaceholder("Untitled").onChange((value) => (this.title = value));
          window.setTimeout(() => text.inputEl.focus(), 0);
        }),
        new Setting(contentEl).setName("Author").addText((text) => text.onChange((value) => (this.author = value))),
      );
    }

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText("Set up")
          .setCta()
          .onClick(() => {
            this.close();
            void this.setUp();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async setUp(): Promise<void> {
    const { vault, workspace, fileManager } = this.app;
    const exists = (path: string) => vault.getAbstractFileByPath(path) !== null;
    let made = 0;
    try {
      for (const path of foldersToMake(
        this.folders.map((folder) => folder.path),
        exists,
      )) {
        await vault.createFolder(path);
        made++;
      }
      let script: TFile | null = null;
      if (this.offerScript && this.makeScript) {
        const parent = fileManager.getNewFileParent("");
        const path = freeScriptPath(parent.path, scriptFileName(this.title), exists);
        script = await vault.create(path, firstScriptText(this.title, this.author));
        await workspace.getLeaf(false).openFile(script);
      }
      const folders = made === 0 ? "" : made === 1 ? "1 folder" : `${made} folders`;
      const parts = [folders, script ? script.basename : ""].filter((part) => part !== "");
      new Notice(parts.length > 0 ? `Made ${parts.join(" and ")}.` : "Nothing to make: everything's in place.");
    } catch (error) {
      console.error("[fountain-stage] set up a play", error);
      new Notice(`Couldn't finish setting up${made > 0 ? `, after making ${made === 1 ? "1 folder" : `${made} folders`}` : ""}: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.onDone();
  }
}

/** Opens Set up a play. `onDone` runs once it has made what it can. */
export function setUpPlay(app: App, settings: FountainStageSettings, onDone: () => void = () => undefined): void {
  new SetupModal(app, setupFolders(settings), !hasScripts(app), onDone).open();
}

/**
 * The first time the plugin loads in a vault with no scripts, a notice
 * offers Set up a play. Either way it's offered only once.
 */
export async function offerSetUp(app: App, settings: FountainStageSettings, save: () => Promise<void>, onDone: () => void = () => undefined): Promise<void> {
  if (settings.setupOffered) return;
  settings.setupOffered = true;
  await save();
  if (hasScripts(app)) return;
  const fragment = activeDocument.createDocumentFragment();
  fragment.createDiv({ text: "Fountain Stage is ready. Set up a play to make its folders and a first script." });
  const button = fragment.createEl("button", { cls: "mod-cta fountain-stage-setup-button", text: "Set up a play" });
  button.addEventListener("click", () => setUpPlay(app, settings, onDone));
  new Notice(fragment, 0);
}
