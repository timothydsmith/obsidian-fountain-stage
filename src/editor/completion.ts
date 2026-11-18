import { acceptCompletion, autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { characterNames, completeName } from "../fountain/characters";
import { scriptOf } from "./formatting";

/** The last word before the cursor has two capitals in a row, so a name may be on its way. */
const MAYBE_NAME_RE = /\p{Lu}{2}[^\s]*$/u;

function characterCompletions(context: CompletionContext): CompletionResult | null {
  const { state } = context;
  const line = state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const prevBlank = line.number === 1 || state.doc.line(line.number - 1).text.trim() === "";

  // Asked for (by Tab on a new block): every name, narrowed by what you
  // type after, in any case.
  if (context.explicit && prevBlank) {
    const indent = /^\s*/.exec(before)![0].length;
    const typed = before.slice(indent).toUpperCase();
    const names = characterNames(scriptOf(state), line.number - 1).filter((name) => name.startsWith(typed));
    if (names.length === 0) return null;
    return { from: line.from + indent, options: names.map((label) => ({ label })), filter: false };
  }

  if (!MAYBE_NAME_RE.test(before)) return null;
  const match = completeName(before, characterNames(scriptOf(state), line.number - 1));
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
 * anywhere in a line: in a cue, or a name in a stage direction. Tab on an
 * empty line that starts a block lists every name (see ./cycling). Enter or
 * Tab picks the highlighted name; Escape closes the list.
 */
export function characterCompletion(): Extension {
  return [
    autocompletion({ override: [characterCompletions], icons: false }),
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}
