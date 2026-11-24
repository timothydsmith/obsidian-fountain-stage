/**
 * Renaming a character in a script: choosing the character, the new name,
 * and where to change it. Renaming to a name already in the script merges
 * the two characters.
 */

import { type App, ButtonComponent, Modal, Notice, Setting, SuggestModal, TextComponent } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { characterNames } from "./fountain/characters";
import { buildOutline } from "./fountain/outline";
import { buildReport } from "./fountain/report";
import { findRenames, nameAt, RENAME_PLACES, type RenameEdit, type RenamePlace } from "./fountain/rename";

const PLACE_NAMES: Record<RenamePlace, string> = {
  cue: "Character cues",
  list: "Characters list",
  direction: "Stage directions, headings and notes",
  dialogue: "Dialogue",
};

/** How many lines of each place to show before "and N more". */
const PREVIEW_LIMIT = 50;

class CharacterPicker extends SuggestModal<string> {
  constructor(
    app: App,
    private readonly names: string[],
    private readonly onChoose: (name: string) => void,
    placeholder = "Choose a character to rename",
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getSuggestions(query: string): string[] {
    const q = query.trim().toUpperCase();
    return this.names.filter((name) => name.includes(q));
  }

  renderSuggestion(name: string, el: HTMLElement): void {
    el.setText(name);
  }

  onChooseSuggestion(name: string): void {
    this.onChoose(name);
  }
}

class RenameModal extends Modal {
  private newName: string;
  private edits: RenameEdit[] = [];
  /** Places left out of the rename. */
  private skipped = new Set<RenamePlace>();
  /** Previews opened, kept open as the list redraws while you type. */
  private opened = new Set<RenamePlace>();
  private summaryEl!: HTMLElement;
  private renameButton!: ButtonComponent;

  /** Whether it was opened to merge one character into another. */
  private readonly merging: boolean;

  constructor(
    app: App,
    private readonly view: FountainView,
    private readonly oldName: string,
    newName = oldName,
  ) {
    super(app);
    this.newName = newName;
    this.merging = newName !== oldName;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(this.merging ? `Merge ${this.oldName} into ${this.newName}` : `Rename ${this.oldName}`);
    contentEl.addClass("fountain-stage-rename");

    let input!: TextComponent;
    new Setting(contentEl)
      .setName("New name")
      .setDesc("Written in capitals in cues, and in the case the old name was written in elsewhere.")
      .addText((text) => {
        input = text;
        text.setValue(this.newName).onChange((value) => {
          this.newName = value;
          this.update();
        });
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" && !evt.isComposing) {
            evt.preventDefault();
            this.rename();
          }
        });
      });

    this.summaryEl = contentEl.createDiv({ cls: "fountain-stage-rename-summary" });
    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
    this.renameButton = new ButtonComponent(buttons)
      .setButtonText(this.merging ? "Merge" : "Rename")
      .setCta()
      .onClick(() => this.rename());

    this.update();
    input.inputEl.focus();
    input.inputEl.select();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** The changes to make, without the places left out. */
  private chosenEdits(): RenameEdit[] {
    return this.edits.filter((e) => !this.skipped.has(e.place));
  }

  private update(): void {
    const source = this.view.getViewData();
    const script = this.view.script();
    this.edits = findRenames(source, script, this.oldName, this.newName);
    const el = this.summaryEl;
    el.empty();

    const name = this.newName.trim();
    if (name && name.toUpperCase() !== this.oldName && characterNames(script).includes(name.toUpperCase())) {
      el.createEl("p", {
        cls: "fountain-stage-rename-warning",
        text: `There's already a character called ${name.toUpperCase()}. Renaming makes them one character.${this.sharedScenes(name.toUpperCase())}`,
      });
    }

    if (this.edits.length === 0) {
      el.createEl("p", { cls: "setting-item-description", text: name ? "Nothing to change." : "Type the new name." });
    }
    const lines = source.split("\n");
    for (const place of RENAME_PLACES) {
      const edits = this.edits.filter((e) => e.place === place);
      if (edits.length === 0) continue;
      new Setting(el)
        .setName(`${PLACE_NAMES[place]} (${edits.length})`)
        .addToggle((toggle) =>
          toggle.setValue(!this.skipped.has(place)).onChange((on) => {
            if (on) this.skipped.delete(place);
            else this.skipped.add(place);
            this.updateButton();
          }),
        );
      this.preview(el, place, edits, lines);
    }
    this.updateButton();
  }

  /** The scenes both characters are in, which merging them puts one character in twice. */
  private sharedScenes(other: string): string {
    const { characters, scenes } = buildReport(this.view.script(), buildOutline(this.view.getViewData(), this.view.isAct()), { wordsPerMinute: 150 });
    const scenesOf = (name: string) => characters.find((c) => c.name === name)?.scenes ?? [];
    const theirs = scenesOf(other);
    const shared = scenesOf(this.oldName).filter((s) => theirs.includes(s));
    if (shared.length === 0) return " They're never in a scene together.";
    const list = shared.map((s) => `${scenes[s].number}. ${scenes[s].title}`);
    const named = list.length <= 3 ? list.join("; ") : `${list.slice(0, 3).join("; ")} and ${list.length - 3} more`;
    return ` They're both in ${shared.length === 1 ? "a scene" : `${shared.length} scenes`} (${named}), so check those read right with one character.`;
  }

  /** Each line a place's changes are on, with the name marked, folded away until opened. */
  private preview(el: HTMLElement, place: RenamePlace, edits: RenameEdit[], lines: string[]): void {
    const details = el.createEl("details", { cls: "fountain-stage-rename-preview" });
    details.open = this.opened.has(place);
    details.addEventListener("toggle", () => {
      if (details.open) this.opened.add(place);
      else this.opened.delete(place);
    });
    details.createEl("summary", { text: "Show where" });
    const list = details.createEl("ul");
    const byLine = new Map<number, RenameEdit[]>();
    for (const e of edits) byLine.set(e.line, [...(byLine.get(e.line) ?? []), e]);
    const lineStart = (line: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
    let shown = 0;
    for (const [line, lineEdits] of byLine) {
      if (shown++ === PREVIEW_LIMIT) {
        list.createEl("li", { cls: "fountain-stage-rename-more", text: `and ${byLine.size - PREVIEW_LIMIT} more lines` });
        break;
      }
      const text = lines[line];
      const start = lineStart(line);
      const item = list.createEl("li");
      item.createSpan({ cls: "fountain-stage-rename-line", text: `${line + 1}` });
      let pos = 0;
      for (const e of lineEdits) {
        item.appendText(text.slice(pos, e.from - start));
        item.createEl("mark", { text: text.slice(e.from - start, e.to - start) });
        pos = e.to - start;
      }
      item.appendText(text.slice(pos));
    }
  }

  private updateButton(): void {
    this.renameButton.setDisabled(this.chosenEdits().length === 0);
  }

  private rename(): void {
    // The script as it is now, in case it changed while the dialog was open.
    this.edits = findRenames(this.view.getViewData(), this.view.script(), this.oldName, this.newName);
    const edits = this.chosenEdits();
    if (edits.length === 0) return;
    this.view.applyChanges(edits);
    this.close();
    const places = edits.length === 1 ? "1 place" : `${edits.length} places`;
    const verb = this.merging ? "Merged" : "Renamed";
    const into = this.merging ? "into" : "to";
    new Notice(`${verb} ${this.oldName} ${into} ${this.newName.trim().toUpperCase()} in ${places}. Undo puts it back.`);
  }
}

/**
 * Renames a character in a script. The character is the one at the
 * cursor, if there is one, or else one you choose.
 */
export function renameCharacter(app: App, view: FountainView): void {
  if (view.refuseIfFrozen()) return;
  const names = characterNames(view.script());
  if (names.length === 0) {
    new Notice("This script has no characters to rename yet.");
    return;
  }
  const { text, ch } = view.cursorLine();
  const atCursor = nameAt(text, ch, names);
  if (atCursor) new RenameModal(app, view, atCursor).open();
  else new CharacterPicker(app, names, (name) => new RenameModal(app, view, name).open()).open();
}

/**
 * Merges two characters into one: the first you choose is renamed to the
 * second everywhere, as a rename would.
 */
export function mergeCharacters(app: App, view: FountainView): void {
  if (view.refuseIfFrozen()) return;
  const names = characterNames(view.script());
  if (names.length < 2) {
    new Notice("This script needs two characters to merge.");
    return;
  }
  const { text, ch } = view.cursorLine();
  const chooseInto = (from: string) =>
    new CharacterPicker(app, names.filter((n) => n !== from), (into) => new RenameModal(app, view, from, into).open(), `Merge ${from} into…`).open();
  const atCursor = nameAt(text, ch, names);
  if (atCursor) chooseInto(atCursor);
  else new CharacterPicker(app, names, chooseInto, "Choose a character to merge into another").open();
}
