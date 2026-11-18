import { Annotation, Compartment, EditorSelection, EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Platform, TextFileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { onConfigChanged, readableLineLength, showLineNumbers } from "../obsidianConfig";
import { fountainFormatting } from "./formatting";
import type { PositionStore, ScriptPosition } from "./positions";

export const VIEW_TYPE_FOUNTAIN = "playwright-fountain";

/** Marks changes that came from the file on disk, so they aren't saved straight back. */
const fromFile = Annotation.define<boolean>();

/** How long after you stop scrolling or moving the cursor your place is remembered. */
const REMEMBER_DELAY_MS = 500;

interface LineCh {
  line?: unknown;
  ch?: unknown;
}

/**
 * Navigation state, in the same shape as Obsidian's markdown editor uses,
 * so back/forward and links to a line work the same way. Lines count from 0.
 */
interface EphemeralState {
  cursor?: { from?: LineCh; to?: LineCh };
  scroll?: unknown;
  line?: unknown;
  focus?: unknown;
  focusOnMobile?: unknown;
}

/** Every line of the file is numbered, following Obsidian's "Show line number" setting. */
function lineNumberGutter(on: boolean): Extension {
  return on ? lineNumbers() : [];
}

/**
 * The editor for .fountain files: a CodeMirror 6 editor of its own,
 * rather than Obsidian's markdown editor, so that only Fountain rules
 * apply. Formatting as you type comes from ./formatting.
 */
export class FountainView extends TextFileView {
  private editor: EditorView;
  private lineNumbers = new Compartment();
  private rememberTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private positions: PositionStore,
    exportPdf: (view: FountainView) => void,
  ) {
    super(leaf);
    this.addAction("file-down", "Export to PDF", () => exportPdf(this));
    this.contentEl.addClass("playwright-view");
    this.contentEl.toggleClass("is-readable-line-width", readableLineLength(this.app));
    this.editor = new EditorView({ parent: this.contentEl, state: this.createState("") });
    this.registerEvent(
      onConfigChanged(this.app, (key) => {
        if (key === "showLineNumber") {
          this.editor.dispatch({
            effects: this.lineNumbers.reconfigure(lineNumberGutter(showLineNumbers(this.app))),
          });
        } else if (key === "readableLineLength") {
          this.contentEl.toggleClass("is-readable-line-width", readableLineLength(this.app));
          this.editor.requestMeasure();
        }
      }),
    );
    this.registerDomEvent(this.editor.scrollDOM, "scroll", () => this.rememberPositionSoon());
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
      // A different file: start fresh, so undo can't reach the previous one,
      // and go back to where you were in it.
      this.editor.setState(this.createState(data));
      this.restorePosition(this.file ? this.positions.get(this.file.path) : undefined);
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

  async onUnloadFile(file: TFile): Promise<void> {
    this.cancelRemember();
    this.positions.set(file.path, this.currentPosition(file.path));
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.cancelRemember();
    this.editor.destroy();
  }

  getEphemeralState(): Record<string, unknown> {
    const doc = this.editor.state.doc;
    const { anchor, head } = this.editor.state.selection.main;
    const lineCh = (pos: number) => {
      const line = doc.lineAt(pos);
      return { line: line.number - 1, ch: pos - line.from };
    };
    const state: Record<string, unknown> = {
      ...super.getEphemeralState(),
      cursor: { from: lineCh(anchor), to: lineCh(head) },
    };
    const top = this.topOffset();
    if (top !== undefined) state.scroll = doc.lineAt(top).number - 1;
    return state;
  }

  setEphemeralState(state: unknown): void {
    super.setEphemeralState(state);
    if (!state || typeof state !== "object") return;
    const s = state as EphemeralState;
    const doc = this.editor.state.doc;
    const offset = (p?: LineCh): number | undefined => {
      if (!p || typeof p.line !== "number") return undefined;
      const line = doc.line(Math.min(Math.max(Math.floor(p.line) + 1, 1), doc.lines));
      const ch = typeof p.ch === "number" ? Math.max(Math.floor(p.ch), 0) : 0;
      return Math.min(line.from + ch, line.to);
    };

    let anchor = offset(s.cursor?.from);
    let head = offset(s.cursor?.to) ?? anchor;
    let scrollTo = typeof s.scroll === "number" ? offset({ line: s.scroll }) : undefined;
    if (typeof s.line === "number") {
      anchor = head = offset({ line: s.line });
      scrollTo ??= anchor;
    }

    const spec: TransactionSpec = {};
    if (anchor !== undefined) spec.selection = EditorSelection.single(anchor, head ?? anchor);
    if (scrollTo !== undefined) spec.effects = EditorView.scrollIntoView(scrollTo, { y: "start", yMargin: 0 });
    else if (head !== undefined) spec.effects = EditorView.scrollIntoView(head, { y: "center" });
    if (spec.selection || spec.effects) this.editor.dispatch(spec);
    if (s.focus && (!Platform.isMobile || s.focusOnMobile)) this.editor.focus();
  }

  /** The offset of the line at the top of the editor, or undefined while it isn't laid out. */
  private topOffset(): number | undefined {
    const { scrollDOM, documentPadding } = this.editor;
    if (scrollDOM.clientHeight === 0) return undefined;
    return this.editor.lineBlockAtHeight(scrollDOM.scrollTop - documentPadding.top).from;
  }

  private currentPosition(path: string): ScriptPosition {
    const { anchor, head } = this.editor.state.selection.main;
    return { anchor, head, top: this.topOffset() ?? this.positions.get(path)?.top ?? 0 };
  }

  /** Puts the cursor and scroll back where they were, or at the top for a script not seen before. */
  private restorePosition(position: ScriptPosition | undefined): void {
    // Swapping in a new document keeps the old scroll offset, so reset it.
    this.editor.scrollDOM.scrollTop = 0;
    if (!position) return;
    const doc = this.editor.state.doc;
    const clamp = (n: number) => Math.min(Math.max(n, 0), doc.length);
    const top = doc.lineAt(clamp(position.top)).from;
    this.editor.dispatch({
      selection: EditorSelection.single(clamp(position.anchor), clamp(position.head)),
      effects: top > 0 ? EditorView.scrollIntoView(top, { y: "start", yMargin: 0 }) : [],
    });
  }

  /** Remembers where you are once scrolling or cursor movement settles, in case Obsidian quits. */
  private rememberPositionSoon(): void {
    if (this.rememberTimer !== null) return;
    this.rememberTimer = window.setTimeout(() => {
      this.rememberTimer = null;
      if (this.file) this.positions.set(this.file.path, this.currentPosition(this.file.path));
    }, REMEMBER_DELAY_MS);
  }

  private cancelRemember(): void {
    if (this.rememberTimer === null) return;
    window.clearTimeout(this.rememberTimer);
    this.rememberTimer = null;
  }

  private createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        this.lineNumbers.of(lineNumberGutter(showLineNumbers(this.app))),
        fountainFormatting(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          const external = update.transactions.some((tr) => tr.annotation(fromFile));
          if (update.docChanged && !external) this.requestSave();
          if (update.selectionSet) this.rememberPositionSoon();
        }),
      ],
    });
  }
}
