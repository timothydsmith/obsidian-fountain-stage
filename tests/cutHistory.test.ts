import { history, redo, undo } from "@codemirror/commands";
import { EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { cutHistory, cutsFileEffect, type CutsFileChange } from "../src/editor/cutHistory";

const cut = { heading: "# 1. INT. KITCHEN, line 2 · 22 November 2026", body: "A table." };
const path = "Drafts/Play - Draft 01 - Cuts.fountain";

/** The cuts-file changes a transaction carries. */
const changes = (tr: Transaction) => tr.effects.filter((e) => e.is(cutsFileEffect)).map((e) => e.value as CutsFileChange);

function run(command: typeof undo, state: EditorState): Transaction {
  let tr: Transaction | undefined;
  command({ state, dispatch: (t) => (tr = t) });
  if (!tr) throw new Error("nothing to do");
  return tr;
}

describe("cutHistory", () => {
  const start = EditorState.create({ doc: "INT. KITCHEN\n\nA table.\n", extensions: [history(), cutHistory(() => undefined)] });

  it("takes an undone cut out of the cuts file, and adds it again on redo", () => {
    const from = start.doc.toString().indexOf("A table.");
    const cutTr = start.update({ changes: { from, to: from + 8 }, effects: cutsFileEffect.of({ op: "add", path, cut, done: true }) });
    const undone = run(undo, cutTr.state);
    expect(undone.state.doc.toString()).toBe(start.doc.toString());
    expect(changes(undone)).toEqual([{ op: "remove", path, cut }]);
    const redone = run(redo, undone.state);
    expect(changes(redone)).toEqual([{ op: "add", path, cut }]);
  });

  it("puts an undone restore back in the cuts file", () => {
    const restoreTr = start.update({ changes: { from: 0, insert: "A table.\n" }, effects: cutsFileEffect.of({ op: "remove", path, cut }) });
    expect(changes(run(undo, restoreTr.state))).toEqual([{ op: "add", path, cut }]);
  });
});
