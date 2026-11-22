/** Commands to keep alternate versions of a speech or action paragraph, and switch which is live. */

import { type App, FuzzySuggestModal, Notice } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { type Alternates, alternatesAt, canBeAlternate, keepAlternate, switchAlternate } from "./fountain/alternates";

/** The speech or action paragraph at the cursor, or undefined after saying what's needed. */
function alternatesHere(view: FountainView, needAlternates: boolean): Alternates | undefined {
  if (view.refuseIfFrozen() || view.refuseIfReading()) return undefined;
  const a = alternatesAt(view.getViewData(), view.script(), view.currentLine());
  if (!a) {
    new Notice("Put the cursor in a speech or an action paragraph.");
    return undefined;
  }
  if (needAlternates && a.alternates.length === 0) {
    new Notice("This has no alternates yet. Keep as an alternate saves a copy to rewrite from.");
    return undefined;
  }
  return a;
}

/** Keeps a copy of the speech or paragraph at the cursor, in a note under it, to rewrite the live one. */
export function keepAsAlternate(view: FountainView): void {
  const a = alternatesHere(view, false);
  if (!a) return;
  if (!canBeAlternate(a.live)) {
    new Notice("This has a note in it, which can't go inside an alternate's note. Take the note out first.");
    return;
  }
  const edit = keepAlternate(a);
  view.applyEdit([edit], edit.cursor);
}

/** Makes the next alternate live, keeping the live version as an alternate. */
export function nextAlternate(view: FountainView): void {
  const a = alternatesHere(view, true);
  if (!a) return;
  if (!canBeAlternate(a.live)) {
    new Notice("The live version has a note in it, which can't go inside an alternate's note. Take the note out first.");
    return;
  }
  const edit = switchAlternate(a, 0);
  view.applyEdit([edit], edit.cursor);
}

/** Picks which alternate to make live. */
export function chooseAlternate(app: App, view: FountainView): void {
  const a = alternatesHere(view, true);
  if (!a) return;
  if (!canBeAlternate(a.live)) {
    new Notice("The live version has a note in it, which can't go inside an alternate's note. Take the note out first.");
    return;
  }
  new AlternateModal(app, a, (index) => {
    // The script may have changed while the list was open.
    const now = alternatesAt(view.getViewData(), view.script(), a.line);
    if (!now || now.live !== a.live || now.alternates[index] !== a.alternates[index]) {
      new Notice("The script changed, so nothing was switched. Try again.");
      return;
    }
    const edit = switchAlternate(now, index);
    view.applyEdit([edit], edit.cursor);
  }).open();
}

class AlternateModal extends FuzzySuggestModal<number> {
  constructor(
    app: App,
    private readonly a: Alternates,
    private readonly choose: (index: number) => void,
  ) {
    super(app);
    this.setPlaceholder("Choose the version to make live");
  }

  getItems(): number[] {
    return this.a.alternates.map((_, i) => i);
  }

  getItemText(index: number): string {
    return this.a.alternates[index].split("\n").map((l) => l.trim()).filter(Boolean).join(" / ");
  }

  onChooseItem(index: number): void {
    this.choose(index);
  }
}
