import { acceptCompletion, autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { characterNames, completeName } from "../fountain/characters";
import { scriptOf } from "./formatting";

/** The last word before the cursor has two capitals in a row, so a name may be on its way. */
const MAYBE_NAME_RE = /\p{Lu}{2}[^\s]*$/u;

/** A link to a note being written: `[[>` and the start of its target. */
const LINK_START_RE = /\[\[>\s*([^\]|]*)$/;

/** Note names for a link, after `[[>`. Picking one closes the link if it isn't closed already. */
function linkCompletions(noteNames: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const m = LINK_START_RE.exec(line.text.slice(0, context.pos - line.from));
    if (!m) return null;
    const closed = line.text.slice(context.pos - line.from).startsWith("]]");
    return {
      from: context.pos - m[1].length,
      options: noteNames().map((label) => ({ label, apply: closed ? label : `${label}]]` })),
      validFor: /^[^\]|]*$/,
    };
  };
}

function characterCompletions(context: CompletionContext): CompletionResult | null {
  const { state } = context;
  const line = state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  // A link's target is a note, not a name.
  if (LINK_START_RE.test(before)) return null;
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
 * Tab picks the highlighted name; Escape closes the list. After `[[>`, it
 * completes the names of notes, from `noteNames`, for a link.
 */
export function characterCompletion(noteNames: () => string[] = () => []): Extension {
  return [
    autocompletion({ override: [linkCompletions(noteNames), characterCompletions], icons: false }),
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}
