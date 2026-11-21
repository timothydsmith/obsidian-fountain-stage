import { EditorState, type Extension, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { readingHiddenRanges } from "../fountain/reading";

const hide = Decoration.replace({});

function hiddenDecorations(state: EditorState, showSections: boolean): DecorationSet {
  return Decoration.set(readingHiddenRanges(state.doc.toString(), { showSections }).map(({ from, to }) => hide.range(from, to)));
}

// Hidden ranges can span whole lines, which CodeMirror only allows from a
// state field. The document only changes here when the file does.
const hiddenField = (showSections: boolean) =>
  StateField.define<DecorationSet>({
    create: (state) => hiddenDecorations(state, showSections),
    update: (value, tr) => (tr.docChanged ? hiddenDecorations(tr.state, showSections) : value),
    provide: (field) => EditorView.decorations.from(field),
  });

/** Reading view, on top of the formatting: the markup and notes hidden, and no editing. `showSections` keeps section headings, for cuts files. */
export function readingView({ showSections = false } = {}): Extension {
  return [hiddenField(showSections), EditorState.readOnly.of(true), EditorView.editable.of(false)];
}
