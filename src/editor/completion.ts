import { acceptCompletion, autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { characterNames, completeName } from "../fountain/characters";
import { scriptOf } from "./formatting";

/** The last word before the cursor has two capitals in a row, so a name may be on its way. */
const MAYBE_NAME_RE = /\p{Lu}{2}[^\s]*$/u;

function characterCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (!MAYBE_NAME_RE.test(before)) return null;
  const match = completeName(before, characterNames(scriptOf(context.state), line.number - 1));
  if (!match) return null;
  return {
    from: line.from + match.from,
    options: match.names.map((label) => ({ label })),
    // The names are already matched, and asked for again as you type.
    filter: false,
  };
}

/**
 * Completes character names once you type two capital letters in a row,
 * anywhere in a line: in a cue, or a name in a stage direction. Enter or
 * Tab picks the highlighted name; Escape closes the list.
 */
export function characterCompletion(): Extension {
  return [
    autocompletion({ override: [characterCompletions], icons: false }),
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}
