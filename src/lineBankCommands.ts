/** Adding a line to the line bank, and dropping one from it into the script at the cursor. */

import { type App, Modal, Notice, Setting, SuggestModal, TextAreaComponent } from "obsidian";
import type { CutsFiles } from "./cutsCommands";
import type { FountainView } from "./editor/FountainView";
import { insertionText } from "./fountain/insert";

class AddLineModal extends Modal {
  private text: string;

  constructor(
    app: App,
    selected: string,
    private readonly onAdd: (text: string) => void,
  ) {
    super(app);
    this.text = selected;
  }

  onOpen(): void {
    this.setTitle("Add to line bank");
    const area = new TextAreaComponent(this.contentEl);
    area.inputEl.addClass("fountain-stage-line-bank-input");
    area.setPlaceholder("A line, or a cue and its speech").setValue(this.text).onChange((value) => (this.text = value));
    area.inputEl.rows = 4;
    // Enter adds a new line; Ctrl or Cmd with Enter adds the entry.
    area.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey) && !evt.isComposing) {
        evt.preventDefault();
        this.add();
      }
    });
    window.setTimeout(() => area.inputEl.focus(), 0);
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Add").setCta().onClick(() => this.add()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private add(): void {
    if (!this.text.trim()) {
      new Notice("Type the line to keep.");
      return;
    }
    this.close();
    this.onAdd(this.text);
  }
}

class DropLineModal extends SuggestModal<string> {
  constructor(
    app: App,
    private readonly entries: string[],
    private readonly onChoose: (entry: string) => void,
  ) {
    super(app);
    this.setPlaceholder("Choose a line to put in at the cursor");
    this.emptyStateText = "No lines in the bank match.";
  }

  getSuggestions(query: string): string[] {
    const q = query.trim().toLowerCase();
    return this.entries.filter((entry) => entry.toLowerCase().includes(q));
  }

  renderSuggestion(entry: string, el: HTMLElement): void {
    const lines = entry.split("\n");
    el.createDiv({ text: lines[0] });
    if (lines.length > 1) el.createEl("small", { cls: "fountain-stage-line-bank-more", text: lines.slice(1).join(" ") });
  }

  onChooseSuggestion(entry: string): void {
    this.onChoose(entry);
  }
}

/** Asks for a line, starting from the selection, and adds it to the line bank beside the script. The script isn't changed. */
export function addToLineBank(app: App, cuts: CutsFiles, view: FountainView): void {
  const path = cuts.bankPathFor(view);
  if (!path) return;
  new AddLineModal(app, view.selection().text, (text) => {
    void cuts.change({ op: "add", path, cut: { heading: "", body: text }, bank: true }).then(
      () => new Notice(`Added to ${path.split("/").pop()?.replace(/\.fountain$/, "")}.`),
      () => undefined,
    );
  }).open();
}

/** Lists the line bank's entries, and puts the one chosen in at the cursor, taking it out of the bank. */
export async function dropFromLineBank(app: App, cuts: CutsFiles, view: FountainView): Promise<void> {
  if (view.refuseIfFrozen() || view.refuseIfReading()) return;
  const path = cuts.bankPathFor(view);
  const entries = await cuts.bankEntriesFor(view);
  if (!path || entries.length === 0) {
    new Notice("The line bank is empty. Add to it with Add to line bank.");
    return;
  }
  new DropLineModal(app, entries, (entry) => {
    const { from, to } = view.selection();
    view.insertAtCursor(insertionText(view.getViewData(), from, to, entry), { op: "remove", path, cut: { heading: "", body: entry }, bank: true });
  }).open();
}
