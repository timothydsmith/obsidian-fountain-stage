/**
 * Keeps a cuts file in step with undo and redo in the script. A cut, or a
 * cut restored, carries an effect saying what to do to the cuts file. Undo
 * carries the opposite, and redo the original again, so undoing a cut takes
 * it back out of the cuts file, and undoing a restore puts it back in.
 */

import { invertedEffects } from "@codemirror/commands";
import { type Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Cut } from "../fountain/cuts";

export interface CutsFileChange {
  op: "add" | "remove";
  /** The cuts file's vault path, or the line bank's. */
  path: string;
  /** For the line bank, the entry is the cut's body, and its heading is ignored. */
  cut: Cut;
  bank?: boolean;
  /** Already made to the file, as a cut is before its text leaves the script. */
  done?: boolean;
}

export const cutsFileEffect = StateEffect.define<CutsFileChange>();

/** Undo and redo of cuts and restores, with `apply` making each change to the cuts file. */
export function cutHistory(apply: (change: CutsFileChange) => void): Extension {
  return [
    invertedEffects.of((tr) =>
      tr.effects
        .filter((effect) => effect.is(cutsFileEffect))
        .map((effect) => {
          const { op, path, cut, bank } = effect.value;
          return cutsFileEffect.of({ op: op === "add" ? "remove" : "add", path, cut, bank });
        }),
    ),
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(cutsFileEffect) && !effect.value.done) apply(effect.value);
        }
      }
    }),
  ];
}
