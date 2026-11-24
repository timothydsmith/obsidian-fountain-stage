/** Setting runtime targets for the play and its headings, from the outline or the command palette. */

import { type App, Modal, Notice, Setting } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { itemAt, buildOutline, type OutlineItem } from "./fountain/outline";
import { formatTarget, headingTarget, headingTargetEdits, parseDuration, playTarget, playTargetEdits } from "./fountain/targets";
import { plainTitle } from "./fountain/titlePage";

const KIND_NAMES: Record<OutlineItem["kind"], string> = { act: "act", scene: "scene", section: "beat", action: "action beat" };

/** Asks for a target, starting from the current one. Blank takes it off. */
class TargetModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly title: string,
    private readonly about: string,
    current: number | undefined,
    private readonly onSet: (seconds: number | null) => void,
  ) {
    super(app);
    this.value = current === undefined ? "" : formatTarget(current);
  }

  onOpen(): void {
    this.setTitle(this.title);
    this.contentEl.createEl("p", { text: this.about });
    new Setting(this.contentEl)
      .setName("Target")
      .setDesc("Such as 10 min, 1 h 30 min or 12:30. Leave it blank for none.")
      .addText((text) => {
        text
          .setPlaceholder("10 min")
          .setValue(this.value)
          .onChange((value) => (this.value = value));
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" && !evt.isComposing) {
            evt.preventDefault();
            this.set();
          }
        });
        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 0);
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Set").setCta().onClick(() => this.set()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private set(): void {
    if (!this.value.trim()) {
      this.onSet(null);
      this.close();
      return;
    }
    const seconds = parseDuration(this.value);
    if (seconds === undefined || seconds <= 0) {
      new Notice(`Couldn't read "${this.value.trim()}" as a length of time. Try 10 min, 1 h 30 min or 12:30.`);
      return;
    }
    this.onSet(seconds);
    this.close();
  }
}

/** Asks for the target of an act, scene or section, and writes it under its heading. */
export function setHeadingTarget(app: App, view: FountainView, item: OutlineItem): void {
  if (view.refuseIfFrozen()) return;
  const source = view.getViewData();
  const current = headingTarget(source.split("\n"), view.script(), item.line)?.seconds;
  new TargetModal(app, `Runtime target for this ${KIND_NAMES[item.kind]}`, item.text, current, (seconds) => {
    // The text as it is now, in case it changed while the dialog was open.
    view.applyChanges(headingTargetEdits(view.getViewData(), view.script(), item.line, seconds));
  }).open();
}

/** Asks for the play's target, and writes it on the title page. */
export function setPlayTarget(app: App, view: FountainView): void {
  if (view.refuseIfFrozen()) return;
  const current = playTarget(view.script());
  new TargetModal(app, "Runtime target for the play", "How long the whole play should run.", current, (seconds) => {
    const script = view.script();
    view.applyChanges(playTargetEdits(view.getViewData(), script, seconds, plainTitle(script) || view.file?.basename || "Untitled"));
  }).open();
}

/** Asks for the target of the act, scene or section the cursor is in. */
export function setTargetHere(app: App, view: FountainView): void {
  const item = itemAt(buildOutline(view.getViewData(), view.isAct()), view.cursorLine().line);
  if (!item) {
    new Notice("The cursor isn't in an act, scene or section. Put it under a heading, or set the play's target.");
    return;
  }
  setHeadingTarget(app, view, item);
}
