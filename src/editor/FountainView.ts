import { Annotation, Compartment, EditorSelection, EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { type Menu, Platform, Scope, setIcon, TextFileView, type TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { defaultViewMode, hotkeysOf, livePreview, onConfigChanged, readableLineLength, showLineNumbers } from "../obsidianConfig";
import { characterCompletion } from "./completion";
import { cycleLineType, lineTypeCycling } from "./cycling";
import { describeLine } from "../fountain/lineTypes";
import { actPatternField, fountainFormatting, scriptOf, setActPattern } from "./formatting";
import { actMatcher, DEFAULT_ACT_PATTERN, type IsAct } from "../fountain/acts";
import { readingView } from "./reading";
import type { PositionStore, ScriptPosition } from "./positions";
import { pageRuleDisplay, pageRuleField, setPages } from "./pageRules";
import type { ParsedScript } from "../fountain/parser";
import type { PaginatedScript } from "../pagination";
import { renameCharacter } from "../renameCharacterModal";

export const VIEW_TYPE_FOUNTAIN = "fountain-stage-script";

/** Marks changes that came from the file on disk, so they aren't saved straight back. */
const fromFile = Annotation.define<boolean>();

/** How long after you stop scrolling or moving the cursor your place is remembered. */
const REMEMBER_DELAY_MS = 500;

/** How long after you stop typing the page breaks catch up. */
const PAGINATE_DELAY_MS = 1000;

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

/**
 * The view's mode, in the same shape as Obsidian's markdown view keeps it:
 * `mode` is editing ("source") or reading ("preview"), and while editing,
 * `source` picks source mode over Live Preview.
 */
interface ModeState {
  mode?: unknown;
  source?: unknown;
}

/** What changed in a script, for views that follow it, such as the outline: its text, where you are, or its page layout. */
export type ScriptChange = "text" | "position" | "pages";

/** What a script's view needs from the plugin. */
export interface FountainHost {
  exportPdf(view: FountainView): void;
  /** Lays the script out as its PDF would be, to find its pages. */
  paginate(script: ParsedScript): Promise<PaginatedScript>;
  showPageBreaks(): boolean;
}

/** Obsidian's commands for switching modes, whose hotkeys switch a script's mode too. */
const TOGGLE_READING_COMMAND = "markdown:toggle-preview";
const TOGGLE_SOURCE_COMMAND = "editor:toggle-source";

/**
 * The editor for .fountain files: a CodeMirror 6 editor of its own,
 * rather than Obsidian's markdown editor, so that only Fountain rules
 * apply. Like a note, it has three modes: Live Preview, which formats as
 * you type (./formatting); source mode, plain text; and reading view,
 * formatted without the markup and not editable (./reading).
 */
export class FountainView extends TextFileView {
  private editor: EditorView;
  private lineNumbers = new Compartment();
  private modeExtensions = new Compartment();
  private pageDisplay = new Compartment();
  private pages: PaginatedScript | null = null;
  private paginateTimer: number | null = null;
  private closed = false;
  private rememberTimer: number | null = null;
  private listeners = new Set<(change: ScriptChange) => void>();
  private reading: boolean;
  private sourceMode: boolean;
  private modeButton: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    private positions: PositionStore,
    private host: FountainHost,
  ) {
    super(leaf);
    this.reading = defaultViewMode(this.app) === "preview";
    this.sourceMode = !livePreview(this.app);
    // Actions are added right to left, so the mode button sits beside the menu, as for notes.
    this.modeButton = this.addAction("book-open", "", (evt) => {
      evt.preventDefault();
      this.setMode(!this.reading, this.sourceMode);
    });
    this.addAction("file-down", "Export to PDF", () => host.exportPdf(this));
    this.contentEl.addClass("fountain-stage-view");
    this.contentEl.toggleClass("is-readable-line-width", readableLineLength(this.app));
    this.editor = new EditorView({ parent: this.contentEl, state: this.createState("") });
    this.showMode();

    // Obsidian's hotkeys for reading view and source mode (Ctrl/Cmd+E for
    // reading view, unless you've changed it) work here too.
    this.scope = new Scope(this.app.scope);
    for (const { modifiers, key } of hotkeysOf(this.app, TOGGLE_READING_COMMAND)) {
      this.scope.register(modifiers, key, () => {
        this.toggleReading();
        return false;
      });
    }
    for (const { modifiers, key } of hotkeysOf(this.app, TOGGLE_SOURCE_COMMAND)) {
      this.scope.register(modifiers, key, () => {
        if (this.reading) return true;
        this.toggleSource();
        return false;
      });
    }

    this.registerEvent(
      onConfigChanged(this.app, (key) => {
        if (key === "showLineNumber") {
          this.editor.dispatch({ effects: this.lineNumbers.reconfigure(this.lineNumberGutter()) });
        } else if (key === "readableLineLength") {
          this.contentEl.toggleClass("is-readable-line-width", readableLineLength(this.app));
          this.editor.requestMeasure();
        }
      }),
    );
    this.registerDomEvent(this.editor.scrollDOM, "scroll", () => {
      this.rememberPositionSoon();
      this.notify("position");
    });
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

  getState(): Record<string, unknown> {
    return { ...super.getState(), mode: this.reading ? "preview" : "source", source: this.sourceMode };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (state && typeof state === "object") {
      const { mode, source } = state as ModeState;
      const reading = mode === "preview" ? true : mode === "source" ? false : this.reading;
      this.setMode(reading, typeof source === "boolean" ? source : this.sourceMode);
    }
    await super.setState(state, result);
  }

  /** Switches between editing and reading view. */
  toggleReading(): void {
    this.setMode(!this.reading, this.sourceMode);
  }

  /** Switches between Live Preview and source mode, from reading view too. */
  /** Changes the cursor's line to the next type (1) or the previous (-1), as Tab and Shift+Tab do. */
  cycleLineType(direction: 1 | -1): void {
    if (cycleLineType(direction)(this.editor)) this.editor.focus();
  }

  toggleSource(): void {
    this.setMode(false, !this.sourceMode);
  }

  onPaneMenu(menu: Menu, source: string): void {
    menu.addItem((item) =>
      item
        .setSection("pane")
        .setTitle(this.reading ? "Editing view" : "Reading view")
        .setIcon(this.reading ? "pencil" : "book-open")
        .onClick(() => this.toggleReading()),
    );
    menu.addItem((item) =>
      item
        .setSection("pane")
        .setTitle("Source mode")
        .setIcon("code")
        .setChecked(!this.reading && this.sourceMode)
        .onClick(() => this.toggleSource()),
    );
    menu.addItem((item) =>
      item
        .setSection("action")
        .setTitle("Rename character")
        .setIcon("users")
        .onClick(() => renameCharacter(this.app, this)),
    );
    super.onPaneMenu(menu, source);
  }

  private setMode(reading: boolean, sourceMode: boolean): void {
    if (reading === this.reading && sourceMode === this.sourceMode) return;
    // Keep the same line at the top, though lines change height between modes.
    const top = this.topOffset();
    this.reading = reading;
    this.sourceMode = sourceMode;
    this.editor.dispatch({
      effects: [
        this.modeExtensions.reconfigure(this.currentModeExtensions()),
        this.lineNumbers.reconfigure(this.lineNumberGutter()),
        this.pageDisplay.reconfigure(this.currentPageDisplay()),
      ],
    });
    if (top !== undefined) this.editor.dispatch({ effects: EditorView.scrollIntoView(top, { y: "start", yMargin: 0 }) });
    this.showMode();
    this.app.workspace.requestSaveLayout();
  }

  /** Shows the current mode on the view and its mode button, which offers the other mode. */
  private showMode(): void {
    this.contentEl.toggleClass("is-reading", this.reading);
    this.contentEl.toggleClass("is-source", !this.reading && this.sourceMode);
    setIcon(this.modeButton, this.reading ? "pencil" : "book-open");
    this.modeButton.setAttribute("aria-label", this.reading ? "Current view: reading\nClick to edit" : "Current view: editing\nClick to read");
  }

  /** Line numbers while editing, following Obsidian's "Show line number" setting. */
  private lineNumberGutter(): Extension {
    return showLineNumbers(this.app) && !this.reading ? lineNumbers() : [];
  }

  /** Page-break rules, in Live Preview and reading view, if they're turned on. */
  private currentPageDisplay(): Extension {
    const source = !this.reading && this.sourceMode;
    return this.host.showPageBreaks() && !source ? pageRuleDisplay() : [];
  }

  /** Catches up with changed settings: whether page breaks show, and the style and fonts they're found with. */
  refreshPages(): void {
    this.editor.dispatch({ effects: this.pageDisplay.reconfigure(this.currentPageDisplay()) });
    this.paginateSoon(0);
  }

  /** The script's page layout, as of a moment ago, or null before the first. */
  scriptPages(): PaginatedScript | null {
    return this.pages;
  }

  /** The script as it is now, parsed. */
  script(): ParsedScript {
    return scriptOf(this.editor.state);
  }

  private paginateSoon(delay: number): void {
    this.cancelPaginate();
    this.paginateTimer = window.setTimeout(() => {
      this.paginateTimer = null;
      void this.paginate();
    }, delay);
  }

  private cancelPaginate(): void {
    if (this.paginateTimer === null) return;
    window.clearTimeout(this.paginateTimer);
    this.paginateTimer = null;
  }

  private async paginate(): Promise<void> {
    const { state } = this.editor;
    let pages: PaginatedScript | null = null;
    try {
      pages = await this.host.paginate(scriptOf(state));
    } catch (error) {
      console.error("[fountain-stage] couldn't find the page breaks", error);
    }
    // Changed since, so another layout is on its way.
    if (this.closed || this.editor.state.doc !== state.doc) return;
    this.pages = pages;
    this.editor.dispatch({ effects: [setPages.of(pages), setActPattern.of(this.actPattern())] });
    this.notify("pages");
  }

  /** The act pattern of the script's style, from its latest layout. */
  private actPattern(): string {
    return this.pages?.actPattern ?? DEFAULT_ACT_PATTERN;
  }

  private actTest: { pattern: string; isAct: IsAct } | null = null;

  /** Which scene headings are acts, by the script's style, so the outline and status bar agree with the PDF. */
  isAct(): IsAct {
    const pattern = this.actPattern();
    if (this.actTest?.pattern !== pattern) this.actTest = { pattern, isAct: actMatcher(pattern) };
    return this.actTest.isAct;
  }

  private currentModeExtensions(): Extension {
    if (this.reading) return [fountainFormatting(), readingView()];
    const editing = [EditorView.contentAttributes.of({ spellcheck: "true" }), characterCompletion(), lineTypeCycling()];
    return this.sourceMode ? editing : [fountainFormatting(), editing];
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
      this.pages = null;
      this.paginateSoon(0);
      this.notify("text");
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
    this.cancelPaginate();
    this.pages = null;
    this.editor.setState(this.createState(""));
    this.notify("text");
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.cancelRemember();
    this.positions.set(file.path, this.currentPosition(file.path));
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.cancelRemember();
    this.cancelPaginate();
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

  /**
   * Calls `listener` when the script's text changes (as you type, or a
   * different file loads) or you move through it. Returns a function that
   * stops the calls.
   */
  subscribe(listener: (change: ScriptChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(change: ScriptChange): void {
    for (const listener of this.listeners) listener(change);
  }

  /** The line you're at, counting from 0: the cursor's while you're typing, otherwise the top line. */
  currentLine(): number {
    const doc = this.editor.state.doc;
    const top = this.topOffset();
    const pos = this.editor.hasFocus || top === undefined ? this.editor.state.selection.main.head : top;
    return doc.lineAt(pos).number - 1;
  }

  /** What the cursor's line is, in words, such as "Character" or "Stage direction". */
  cursorLineType(): string {
    const { state } = this.editor;
    const line = state.doc.lineAt(state.selection.main.head);
    return describeLine(scriptOf(state), line.number - 1, line.text, this.isAct());
  }

  /** The cursor's line (counting from 0), its text, and the cursor's place in it. */
  cursorLine(): { line: number; text: string; ch: number } {
    const { state } = this.editor;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return { line: line.number - 1, text: line.text, ch: head - line.from };
  }

  /** Changes the script, as one step to undo, such as a rename. Works in reading view too. */
  applyChanges(changes: { from: number; to: number; insert: string }[]): void {
    if (changes.length === 0) return;
    this.editor.dispatch({ changes, userEvent: "edit.rename", scrollIntoView: false });
  }

  /** Moves to a line, counting from 0: scrolled to the top, with the cursor at its start. */
  revealLine(line: number): void {
    const doc = this.editor.state.doc;
    const from = doc.line(Math.min(Math.max(line + 1, 1), doc.lines)).from;
    this.editor.dispatch({
      selection: EditorSelection.cursor(from),
      effects: EditorView.scrollIntoView(from, { y: "start", yMargin: 0 }),
    });
    if (!this.reading) this.editor.focus();
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
        this.lineNumbers.of(this.lineNumberGutter()),
        this.modeExtensions.of(this.currentModeExtensions()),
        pageRuleField,
        actPatternField.init(() => this.actPattern()),
        this.pageDisplay.of(this.currentPageDisplay()),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          const external = update.transactions.some((tr) => tr.annotation(fromFile));
          if (update.docChanged && !external) this.requestSave();
          if (update.selectionSet) this.rememberPositionSoon();
          if (update.docChanged) {
            this.paginateSoon(PAGINATE_DELAY_MS);
            this.notify("text");
          }
          else if (update.selectionSet) this.notify("position");
        }),
      ],
    });
  }
}
