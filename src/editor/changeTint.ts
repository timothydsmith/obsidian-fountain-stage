/**
 * A faint tint on lines changed since a frozen draft, on screen only. The
 * plugin works out which lines changed and sets them; edits in between move
 * the tint with the text until the next comparison.
 */

import { type EditorState, type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/** Lines to tint, counting from 0, or null for none. */
export const setChangedLines = StateEffect.define<number[] | null>();

const changedLine = Decoration.line({ class: "fountain-stage-changed" });

function decorations(state: EditorState, lines: number[] | null): DecorationSet {
  if (!lines?.length) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const n of [...lines].sort((a, b) => a - b)) {
    if (n >= 0 && n < state.doc.lines) builder.add(state.doc.line(n + 1).from, state.doc.line(n + 1).from, changedLine);
  }
  return builder.finish();
}

const changeTintField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(tint, tr) {
    let next = tint.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setChangedLines)) next = decorations(tr.state, effect.value);
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function changeTint(): Extension {
  return changeTintField;
}
