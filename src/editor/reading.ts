import { EditorState, type Extension, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { readingHiddenRanges } from "../fountain/reading";

const hide = Decoration.replace({});

function hiddenDecorations(state: EditorState): DecorationSet {
  return Decoration.set(readingHiddenRanges(state.doc.toString()).map(({ from, to }) => hide.range(from, to)));
}

// Hidden ranges can span whole lines, which CodeMirror only allows from a
// state field. The document only changes here when the file does.
const hiddenField = StateField.define<DecorationSet>({
  create: hiddenDecorations,
  update: (value, tr) => (tr.docChanged ? hiddenDecorations(tr.state) : value),
  provide: (field) => EditorView.decorations.from(field),
});

/** Reading view, on top of the formatting: the markup and notes hidden, and no editing. */
export function readingView(): Extension {
  return [hiddenField, EditorState.readOnly.of(true), EditorView.editable.of(false)];
}
