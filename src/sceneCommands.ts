/**
 * Commands that work scene by scene: jumping to the next scene or speech,
 * moving scenes, splitting and merging them, and renumbering them.
 */

import { type App, Modal, Notice, Setting } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import {
  canSplitAt,
  mergeWithPrevious,
  moveScene,
  moveSceneTo,
  nextHeading,
  nextSceneLine,
  nextSpeechLine,
  renumberEdits,
  renumberScenes,
  type Renumbering,
  sceneHeadingAt,
  splitScene,
} from "./fountain/scenes";

/** How many renumbered headings to list before "and N more". */
const PREVIEW_LIMIT = 50;

export function jumpToScene(view: FountainView, direction: -1 | 1): void {
  const line = nextSceneLine(view.script(), view.currentLine(), direction);
  if (line === undefined) new Notice(direction > 0 ? "There are no more scenes after this." : "There are no scenes before this.");
  else view.revealLine(line);
}

export function jumpToSpeech(view: FountainView, direction: -1 | 1): void {
  const next = nextSpeechLine(view.script(), view.currentLine(), direction);
  if (!next) new Notice("Put the cursor in a speech first.");
  else if (next.line === undefined) new Notice(direction > 0 ? `${next.name} doesn't speak again after this.` : `${next.name} doesn't speak before this.`);
  else view.goToLine(next.line);
}

/** Moves the scene a line is in (the cursor's, unless given) up or down past the heading next to it. */
export function moveSceneBy(view: FountainView, direction: -1 | 1, line = view.currentLine()): void {
  if (view.refuseIfFrozen()) return;
  const source = view.getViewData();
  const script = view.script();
  const edit = moveScene(source, script, view.isAct(), line, direction);
  if (edit) view.applyEdit([edit], edit.cursor);
  else if (!sceneHeadingAt(source, script, view.isAct(), line)) new Notice("Put the cursor in a scene to move it.");
  else new Notice(direction > 0 ? "This scene is already the last." : "This scene is already the first.");
}

/** Moves the scene whose heading is on `sceneLine` to just before or after the heading on `targetLine`, as dragging in the outline does. */
export function moveSceneToLine(view: FountainView, sceneLine: number, targetLine: number, after: boolean): void {
  if (view.refuseIfFrozen()) return;
  const edit = moveSceneTo(view.getViewData(), view.script(), view.isAct(), sceneLine, targetLine, after);
  if (edit) view.applyEdit([edit], edit.cursor);
}

class SplitModal extends Modal {
  private heading: string;

  constructor(
    app: App,
    suggested: string,
    private readonly onSplit: (heading: string) => void,
  ) {
    super(app);
    this.heading = suggested;
  }

  onOpen(): void {
    this.setTitle("Split scene");
    this.contentEl.createEl("p", { text: "A new scene starts at the cursor's line, with this heading." });
    new Setting(this.contentEl).setName("Heading for the new scene").addText((text) => {
      text.setValue(this.heading).onChange((value) => (this.heading = value));
      text.inputEl.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" && !evt.isComposing) {
          evt.preventDefault();
          this.split();
        }
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 0);
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Split").setCta().onClick(() => this.split()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private split(): void {
    if (!this.heading.trim()) {
      new Notice("Give the new scene a heading.");
      return;
    }
    this.close();
    this.onSplit(this.heading);
  }
}

export function splitSceneAtCursor(app: App, view: FountainView): void {
  if (view.refuseIfFrozen()) return;
  const source = view.getViewData();
  const script = view.script();
  const line = view.currentLine();
  if (!canSplitAt(script, line)) {
    new Notice(script.lineRoles.get(line) === "title-page" ? "Put the cursor where the new scene starts, below the title page." : "Put the cursor where the new scene starts, below the heading.");
    return;
  }
  const current = sceneHeadingAt(source, script, view.isAct(), line);
  new SplitModal(app, current ? nextHeading(current.text) : "", (heading) => {
    // The script may have changed while the dialog was open.
    const edit = splitScene(view.getViewData(), view.script(), Math.min(line, view.getViewData().split("\n").length - 1), heading);
    if (edit) view.applyEdit([edit], edit.cursor);
  }).open();
}

export function mergeWithPreviousScene(view: FountainView): void {
  if (view.refuseIfFrozen()) return;
  const edits = mergeWithPrevious(view.getViewData(), view.script(), view.isAct(), view.currentLine());
  if (!edits) {
    new Notice("Merge works on a scene that follows another scene, not an act heading or section.");
    return;
  }
  // Where the heading was, after the synopsis moved up above it.
  const cursor = edits[0].from + (edits[1]?.insert.length ?? 0);
  view.applyEdit(edits, cursor);
}

class RenumberModal extends Modal {
  private listEl!: HTMLElement;
  private changes: Renumbering[] = [];

  constructor(
    app: App,
    private readonly view: FountainView,
    private restart: boolean,
    private readonly remember: (restart: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Renumber scenes");
    this.contentEl.createEl("p", {
      text: "Rewrites scene numbers in headings, such as SCENE 3 or SCENE THREE, and #3# scene numbers, so they count in order. Acts aren't counted.",
    });
    new Setting(this.contentEl).setName("Count scenes").addDropdown((dropdown) =>
      dropdown
        .addOption("restart", "From 1 in each act")
        .addOption("through", "Straight through the play")
        .setValue(this.restart ? "restart" : "through")
        .onChange((value) => {
          this.restart = value === "restart";
          this.remember(this.restart);
          this.showChanges();
        }),
    );
    this.listEl = this.contentEl.createDiv({ cls: "fountain-stage-renumber-list" });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Renumber").setCta().onClick(() => this.renumber()));
    this.showChanges();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private showChanges(): void {
    this.changes = renumberScenes(this.view.getViewData(), this.view.script(), this.view.isAct(), this.restart);
    this.listEl.empty();
    if (this.changes.length === 0) {
      this.listEl.createEl("p", { text: "The scenes are already numbered in order." });
      return;
    }
    const count = this.changes.length === 1 ? "1 heading changes" : `${this.changes.length} headings change`;
    this.listEl.createEl("p", { text: `${count}:` });
    const list = this.listEl.createEl("ul");
    for (const { before, after } of this.changes.slice(0, PREVIEW_LIMIT)) list.createEl("li", { text: `${before.trim()} → ${after.trim()}` });
    if (this.changes.length > PREVIEW_LIMIT) list.createEl("li", { text: `and ${this.changes.length - PREVIEW_LIMIT} more` });
  }

  private renumber(): void {
    this.close();
    if (this.changes.length === 0) return;
    if (this.view.applyEdit(renumberEdits(this.view.getViewData(), this.changes))) {
      new Notice(`Renumbered ${this.changes.length === 1 ? "1 scene" : `${this.changes.length} scenes`}. Undo puts the numbers back.`);
    }
  }
}

export function renumber(app: App, view: FountainView, restart: boolean, remember: (restart: boolean) => void): void {
  if (view.refuseIfFrozen()) return;
  new RenumberModal(app, view, restart, remember).open();
}
