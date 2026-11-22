/** A highlight on the lines a table read is reading, on screen only. */

import { type EditorState, type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/** The lines being read, counting from 0, or null for none. */
export const setReadLines = StateEffect.define<{ line: number; endLine: number } | null>();

const readLine = Decoration.line({ class: "fountain-stage-read-line" });

function decorations(state: EditorState, range: { line: number; endLine: number } | null): DecorationSet {
  if (!range) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = Math.max(range.line, 0); n <= Math.min(range.endLine, state.doc.lines - 1); n++) {
    const from = state.doc.line(n + 1).from;
    builder.add(from, from, readLine);
  }
  return builder.finish();
}

const readMarkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setReadLines)) next = decorations(tr.state, effect.value);
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function readMark(): Extension {
  return readMarkField;
}
