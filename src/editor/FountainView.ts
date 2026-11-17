import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { TextFileView, type WorkspaceLeaf } from "obsidian";
import { onConfigChanged, showLineNumbers } from "../obsidianConfig";

export const VIEW_TYPE_FOUNTAIN = "playwright-fountain";

/** Marks changes that came from the file on disk, so they aren't saved straight back. */
const fromFile = Annotation.define<boolean>();

/** Every line of the file is numbered, following Obsidian's "Show line number" setting. */
function lineNumberGutter(on: boolean): Extension {
  return on ? lineNumbers() : [];
}

/**
 * The editor for .fountain files: a CodeMirror 6 editor of its own,
 * rather than Obsidian's markdown editor, so that only Fountain rules
 * apply. Formatting as you type will be added as editor extensions.
 */
export class FountainView extends TextFileView {
  private editor: EditorView;
  private lineNumbers = new Compartment();

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl.addClass("playwright-view");
    this.editor = new EditorView({ parent: this.contentEl, state: this.createState("") });
    this.registerEvent(
      onConfigChanged(this.app, (key) => {
        if (key !== "showLineNumber") return;
        this.editor.dispatch({
          effects: this.lineNumbers.reconfigure(lineNumberGutter(showLineNumbers(this.app))),
        });
      }),
    );
  }

  getViewType(): string {
    return VIEW_TYPE_FOUNTAIN;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Fountain script";
  }

  getIcon(): string {
    return "drama";
  }

  getViewData(): string {
    return this.editor.state.doc.toString();
  }

  setViewData(data: string, clear: boolean): void {
    if (clear) {
      // A different file: start fresh, so undo can't reach the previous one.
      this.editor.setState(this.createState(data));
      return;
    }
    const current = this.editor.state.doc.toString();
    if (data === current) return;
    this.editor.dispatch({
      changes: { from: 0, to: current.length, insert: data },
      annotations: fromFile.of(true),
    });
  }

  clear(): void {
    this.editor.setState(this.createState(""));
  }

  async onClose(): Promise<void> {
    this.editor.destroy();
  }

  private createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        this.lineNumbers.of(lineNumberGutter(showLineNumbers(this.app))),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          const external = update.transactions.some((tr) => tr.annotation(fromFile));
          if (update.docChanged && !external) this.requestSave();
        }),
      ],
    });
  }
}
