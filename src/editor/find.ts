/**
 * Find and replace in a script: CodeMirror's search bar at the top of the
 * script, opened with Obsidian's own hotkeys for searching and replacing
 * in a file (see FountainView). In reading view, and in a frozen draft,
 * it only finds.
 */

import { closeSearchPanel, findNext, findPrevious, openSearchPanel, search } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";

/** The search bar's words, in sentence case as Obsidian's are. */
const PHRASES = {
  Find: "Find",
  Replace: "Replace",
  next: "Next",
  previous: "Previous",
  all: "All",
  "match case": "Match case",
  regexp: "Regular expression",
  "by word": "Whole word",
  replace: "Replace",
  "replace all": "Replace all",
  close: "Close",
  "current match": "Current match",
  "replaced $ matches": "Replaced $ matches",
  "replaced match on line $": "Replaced the match on line $",
  "on line": "on line",
};

/** The search bar, and keys for moving between matches while it's open: Enter and Shift+Enter in it, F3 and Shift+F3, and Escape to close it. */
export function findInScript(): Extension {
  return [
    search({ top: true }),
    EditorState.phrases.of(PHRASES),
    keymap.of([
      { key: "F3", run: findNext, shift: findPrevious, scope: "editor search-panel", preventDefault: true },
      { key: "Escape", run: closeSearchPanel, scope: "editor search-panel" },
    ]),
  ];
}

/** Opens the search bar, with the cursor in its find box. It holds the selection, if there is one. */
export function openFind(view: EditorView): void {
  openSearchPanel(view);
}
