import { startCompletion } from "@codemirror/autocomplete";
import { type Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import { type Command, type EditorView, keymap } from "@codemirror/view";
import { type CycleMemory, tabOnLine } from "../fountain/lineTypes";

const setMemory = StateEffect.define<CycleMemory | null>();

/** Where the line Tab last changed is in the cycle. */
const memoryField = StateField.define<CycleMemory | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMemory)) return effect.value;
    return tr.docChanged ? null : value;
  },
});

/**
 * Tab (direction 1) or Shift+Tab (-1) on the cursor's line: see
 * ../fountain/lineTypes. Always handles the key while editing, so Tab
 * never moves focus out of the script.
 */
export function cycleLineType(direction: 1 | -1): Command {
  return (view: EditorView) => {
    if (view.state.readOnly) return false;
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const result = tabOnLine(state.doc.toString(), line.number - 1, direction, state.field(memoryField, false) ?? undefined);
    if (result.kind === "names") startCompletion(view);
    if (result.kind === "replace") {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: result.text },
        selection: { anchor: line.from + result.cursor },
        effects: setMemory.of(result.memory ?? null),
        userEvent: "input.cycle",
        scrollIntoView: true,
      });
    }
    return true;
  };
}

/** Tab and Shift+Tab change the type of the cursor's line. */
export function lineTypeCycling(): Extension {
  // Below the completion's own Tab, which picks a name while the list is open.
  return [memoryField, Prec.high(keymap.of([{ key: "Tab", run: cycleLineType(1), shift: cycleLineType(-1) }]))];
}
