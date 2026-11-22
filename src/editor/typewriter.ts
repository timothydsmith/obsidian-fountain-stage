/**
 * Typewriter mode: the cursor's line stays in the middle of the screen as
 * you type and move with the keys, and everything but the paragraph you're
 * in fades. Clicking doesn't scroll, so the text doesn't jump away from the
 * pointer. Padding above and below the text (in styles.css) lets the first
 * and last lines reach the middle too.
 */

import { EditorState, type Extension, RangeSetBuilder, Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const faded = Decoration.line({ class: "fountain-stage-faded" });

/** Centres the cursor after anything you do with the keys: typing, deleting, moving, undoing. */
const centre = EditorState.transactionExtender.of((tr) => {
  if (!tr.selection && !tr.docChanged) return null;
  const event = tr.annotation(Transaction.userEvent);
  if (!event || tr.isUserEvent("select.pointer")) return null;
  return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) };
});

/** The lines (from 1) of the paragraph the cursor is in: lines with text, up to a blank line either side. */
export function paragraphAt(state: EditorState): { first: number; last: number } {
  const { doc } = state;
  const line = doc.lineAt(state.selection.main.head).number;
  let first = line;
  let last = line;
  if (doc.line(line).text.trim() !== "") {
    while (first > 1 && doc.line(first - 1).text.trim() !== "") first--;
    while (last < doc.lines && doc.line(last + 1).text.trim() !== "") last++;
  }
  return { first, last };
}

function fadedLines(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const { first, last } = paragraphAt(view.state);
  const builder = new RangeSetBuilder<Decoration>();
  let previous = 0;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      if (line.number > previous && (line.number < first || line.number > last)) builder.add(line.from, line.from, faded);
      previous = line.number;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const fade = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = fadedLines(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = fadedLines(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export function typewriter(): Extension {
  return [centre, fade, EditorView.editorAttributes.of({ class: "fountain-stage-typewriter" })];
}
