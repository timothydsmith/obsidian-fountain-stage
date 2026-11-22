/**
 * Marks on what the checks find, such as screen language in a stage
 * direction, on screen only. The plugin runs the checks and sets the marks;
 * edits in between move them with the text until the next run. Hovering a
 * mark shows what was found.
 */

import { type EditorState, type Extension, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export interface CheckMark {
  from: number;
  to: number;
  message: string;
}

/** The marks to show, or null for none. */
export const setCheckMarks = StateEffect.define<CheckMark[] | null>();

function decorations(state: EditorState, marks: CheckMark[] | null): DecorationSet {
  if (!marks?.length) return Decoration.none;
  const length = state.doc.length;
  const ranges: Range<Decoration>[] = [];
  for (const { from, to, message } of marks) {
    if (from < 0 || to > length || to <= from) continue;
    ranges.push(Decoration.mark({ class: "fountain-stage-check", attributes: { title: message } }).range(from, to));
  }
  return Decoration.set(ranges, true);
}

const checkMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setCheckMarks)) next = decorations(tr.state, effect.value);
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function checkMarks(): Extension {
  return checkMarksField;
}
