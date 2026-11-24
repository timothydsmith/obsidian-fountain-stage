import { Annotation, Compartment, EditorSelection, EditorState, type Extension, type StateEffect, type TransactionSpec } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands";
import { type Menu, Notice, Platform, Scope, setIcon, TextFileView, type TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
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
import { generateBreakdown } from "../breakdownCommand";
import { mergeCharacters, renameCharacter } from "../renameCharacterModal";
import { changeTint, setChangedLines } from "./changeTint";
import { type CheckMark, checkMarks, setCheckMarks } from "./checkMarks";
import { cutHistory, cutsFileEffect, type CutsFileChange } from "./cutHistory";
import { typewriter } from "./typewriter";
import { readMark, setReadLines } from "./readMark";

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
/** "position" is the cursor moving or any scrolling; "scroll" is only scrolling you do, not scrollToPlace. */
export type ScriptChange = "text" | "position" | "scroll" | "pages";

/** What a script's view needs from the plugin. */
export interface FountainHost {
  exportPdf(view: FountainView): void;
  /** Lays the script out as its PDF would be, or as its locked rehearsal script has it, to find its pages. */
  paginate(view: FountainView, source: string, script: ParsedScript): Promise<PaginatedScript>;
  showPageBreaks(): boolean;
  /** Whether a file is in the drafts folder: a frozen draft or a cuts file. */
  inDraftsFolder(file: TFile): boolean;
  /** Whether a file is read-only until unfrozen: a frozen draft, or the cuts file of one. */
  isFrozen(file: TFile): boolean;
  freezeDraft(view: FountainView): void;
  /** Adds a cut to its cuts file, or takes one out, as a cut or restore is made, undone or redone. */
  changeCutsFile(change: CutsFileChange): void;
  /** Whether a file is a cuts file, in the drafts folder. */
  isCutsFile(file: TFile): boolean;
  isLineBank(file: TFile): boolean;
  cutFromDraft(view: FountainView): void;
  restoreCut(view: FountainView): void;
  /** Opens the Changes tab on a script. */
  showChanges(view: FountainView): void;
  /** Opens the draft a script is compared with beside it, scrolling with it. */
  showSideBySide(view: FountainView): void;
  /** Opens the Checks tab on a script. */
  showChecks(view: FountainView): void;
  /** Whether lines changed since a draft are tinted. */
  tintingChanges(): boolean;
  /** The rehearsal script commands that apply to a script: locking, unlocking and issuing revised pages. */
  rehearsalActions(view: FountainView): { title: string; icon: string; run: () => void }[];
  toggleChangeTint(): void;
  /** Whether typewriter mode is on. */
  typewriterMode(): boolean;
  toggleTypewriter(): void;
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
  private typewriterMode = new Compartment();
  /** Strips at the top of the script, by id, for a sprint, read-through or table read going on. */
  private stripsEl: HTMLElement;
  private strips = new Map<string, HTMLElement>();
  private pages: PaginatedScript | null = null;
  private paginateTimer: number | null = null;
  private closed = false;
  private rememberTimer: number | null = null;
  private listeners = new Set<(change: ScriptChange) => void>();
  private reading: boolean;
  private sourceMode: boolean;
  private modeButton: HTMLElement;
  /** A frozen draft unfrozen for editing, until the view closes or opens another file. */
  private unfrozen = false;
  /** Where scrollToPlace last scrolled to, until the scroll event for it. */
  private syncedTop: number | null = null;

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
      this.toggleReading();
    });
    this.addAction("file-down", "Export to PDF", () => host.exportPdf(this));
    this.contentEl.addClass("fountain-stage-view");
    this.contentEl.toggleClass("is-readable-line-width", readableLineLength(this.app));
    this.stripsEl = this.contentEl.createDiv({ cls: "fountain-stage-strips" });
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
      // Scrolling to follow a script beside this one isn't yours, so isn't passed back.
      const synced = this.syncedTop !== null && Math.abs(this.editor.scrollDOM.scrollTop - this.syncedTop) < 1;
      this.syncedTop = null;
      if (!synced) this.notify("scroll");
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
    if (this.reading && this.refuseIfFrozen()) return;
    this.setMode(!this.reading, this.sourceMode);
  }

  /** Switches between Live Preview and source mode, from reading view too. */
  /** Changes the cursor's line to the next type (1) or the previous (-1), as Tab and Shift+Tab do. */
  cycleLineType(direction: 1 | -1): void {
    if (cycleLineType(direction)(this.editor)) this.editor.focus();
  }

  toggleSource(): void {
    if (this.refuseIfFrozen()) return;
    this.setMode(false, !this.sourceMode);
  }

  /** Whether the script is in the drafts folder: a frozen draft or a cuts file, frozen or not. */
  isDraft(): boolean {
    // No file yet while the view is being made.
    return this.file ? this.host.inDraftsFolder(this.file) : false;
  }

  /** Whether the script is a line bank, beside the script it belongs to. */
  isLineBank(): boolean {
    return this.file ? this.host.isLineBank(this.file) : false;
  }

  /** Whether the script is frozen: read-only, in reading view, until it's unfrozen. */
  isFrozen(): boolean {
    return this.file ? this.host.isFrozen(this.file) && !this.unfrozen : false;
  }

  /** The main selection, as offsets and its text. */
  selection(): { from: number; to: number; text: string } {
    const { from, to } = this.editor.state.selection.main;
    return { from, to, text: this.editor.state.sliceDoc(from, to) };
  }

  /**
   * Takes text out of the script as a cut, as one step to undo, if it's
   * still there. change says what was done to the cuts file, so undo can
   * take it out again.
   */
  removeCut(from: number, to: number, text: string, change: CutsFileChange): boolean {
    if (this.editor.state.sliceDoc(from, to) !== text) return false;
    this.editor.dispatch({
      changes: { from, to },
      effects: cutsFileEffect.of(change),
      selection: EditorSelection.cursor(from),
      userEvent: "delete.cut",
    });
    return true;
  }

  /** Puts text in at the cursor, in place of any selection, as one step to undo. change is made to a cuts file with it. */
  insertAtCursor(text: string, change?: CutsFileChange): void {
    const { from, to } = this.editor.state.selection.main;
    this.editor.dispatch({
      changes: { from, to, insert: text },
      effects: change ? cutsFileEffect.of(change) : [],
      selection: EditorSelection.cursor(from + text.length),
      scrollIntoView: true,
      userEvent: "input.paste",
    });
  }

  /** Says to switch to editing, in reading view, where there's no cursor to put text in at. True in reading view. */
  refuseIfReading(): boolean {
    if (!this.reading) return false;
    new Notice(`${this.file?.basename ?? "The script"} is in reading view. Switch to editing and put the cursor where the text goes.`);
    return true;
  }

  /** Says the script is frozen, if it is. True if it is, so the edit shouldn't go ahead. */
  refuseIfFrozen(): boolean {
    if (!this.isFrozen()) return false;
    new Notice("This draft is frozen. To edit it, choose Unfreeze from its More options menu.");
    return true;
  }

  /** Makes a frozen draft editable until the tab is closed or opens another file. */
  unfreeze(): void {
    if (!this.isFrozen()) return;
    this.unfrozen = true;
    this.setMode(false, this.sourceMode);
    this.showMode();
    new Notice("You can edit this draft until you close it.");
  }

  /** Catches up with whether the script is a frozen draft, which changes with the drafts folder setting or a move. */
  refreshFrozen(): void {
    if (this.isFrozen() && !this.reading) this.setMode(true, this.sourceMode);
    this.showMode();
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
    if (this.isFrozen()) {
      menu.addItem((item) =>
        item
          .setSection("action")
          .setTitle("Unfreeze")
          .setIcon("lock-open")
          .onClick(() => this.unfreeze()),
      );
    } else if (!this.isDraft() && !this.isLineBank()) {
      menu.addItem((item) =>
        item
          .setSection("action")
          .setTitle("Freeze draft")
          .setIcon("snowflake")
          .onClick(() => this.host.freezeDraft(this)),
      );
    }
    if (!this.isDraft() && !this.isLineBank()) {
      menu.addItem((item) =>
        item
          .setSection("action")
          .setTitle("Cut from this draft")
          .setIcon("scissors")
          .onClick(() => this.host.cutFromDraft(this)),
      );
    } else if (this.file && this.host.isCutsFile(this.file)) {
      menu.addItem((item) =>
        item
          .setSection("action")
          .setTitle("Restore cut")
          .setIcon("undo-2")
          .onClick(() => this.host.restoreCut(this)),
      );
    }
    for (const action of this.host.rehearsalActions(this)) {
      menu.addItem((item) => item.setSection("action").setTitle(action.title).setIcon(action.icon).onClick(action.run));
    }
    menu.addItem((item) =>
      item
        .setSection("action")
        .setTitle("Rename character")
        .setIcon("users")
        .onClick(() => renameCharacter(this.app, this)),
    );
    menu.addItem((item) =>
      item
        .setSection("action")
        .setTitle("Merge characters")
        .setIcon("merge")
        .onClick(() => mergeCharacters(this.app, this)),
    );
    menu.addItem((item) =>
      item
        .setSection("action")
        .setTitle("Write cast list and scene breakdown")
        .setIcon("list-plus")
        .onClick(() => generateBreakdown(this)),
    );
    if (!this.isLineBank() && !(this.file && this.host.isCutsFile(this.file))) {
      menu.addItem((item) =>
        item
          .setSection("view")
          .setTitle("Changes since a draft")
          .setIcon("git-compare")
          .onClick(() => this.host.showChanges(this)),
      );
      if (!Platform.isPhone) {
        menu.addItem((item) =>
          item
            .setSection("view")
            .setTitle("Side by side with a draft")
            .setIcon("columns-2")
            .onClick(() => this.host.showSideBySide(this)),
        );
      }
      menu.addItem((item) =>
        item
          .setSection("view")
          .setTitle("Checks")
          .setIcon("list-checks")
          .onClick(() => this.host.showChecks(this)),
      );
      menu.addItem((item) =>
        item
          .setSection("view")
          .setTitle("Tint changes since a draft")
          .setIcon("highlighter")
          .setChecked(this.host.tintingChanges())
          .onClick(() => this.host.toggleChangeTint()),
      );
    }
    menu.addItem((item) =>
      item
        .setSection("view")
        .setTitle("Typewriter mode")
        .setIcon("type")
        .setChecked(this.host.typewriterMode())
        .onClick(() => this.host.toggleTypewriter()),
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
        this.typewriterMode.reconfigure(this.currentTypewriter()),
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
    const frozen = this.isFrozen();
    this.contentEl.toggleClass("is-frozen", frozen);
    setIcon(this.modeButton, frozen ? "lock" : this.reading ? "pencil" : "book-open");
    this.modeButton.setAttribute(
      "aria-label",
      frozen ? "Frozen draft\nUnfreeze it to edit" : this.reading ? "Current view: reading\nClick to edit" : "Current view: editing\nClick to read",
    );
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

  /** Typewriter mode while editing, if it's on. */
  private currentTypewriter(): Extension {
    return this.host.typewriterMode() && !this.reading ? typewriter() : [];
  }

  /** Catches up with typewriter mode being turned on or off. */
  refreshTypewriter(): void {
    if (this.closed) return;
    this.editor.dispatch({ effects: this.typewriterMode.reconfigure(this.currentTypewriter()) });
    if (this.host.typewriterMode()) this.editor.dispatch({ effects: EditorView.scrollIntoView(this.editor.state.selection.main.head, { y: "center" }) });
  }

  /**
   * A strip at the top of the script, for something going on such as a
   * sprint: an empty element to fill, made the first time. With `show`
   * false it's taken away, and null comes back.
   */
  strip(id: string, show: boolean): HTMLElement | null {
    let el = this.strips.get(id);
    if (!show) {
      el?.remove();
      this.strips.delete(id);
      return null;
    }
    if (!el) {
      el = this.stripsEl.createDiv({ cls: "fountain-stage-strip" });
      this.strips.set(id, el);
    }
    el.empty();
    return el;
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
      pages = await this.host.paginate(this, state.doc.toString(), scriptOf(state));
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
    if (this.reading) return [fountainFormatting(), readingView({ showSections: this.file ? this.host.isCutsFile(this.file) : false })];
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
      this.unfrozen = false;
      this.refreshFrozen();
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
    // Obsidian can still focus a view after it's closed, such as while a
    // plugin reloads, and focusing a destroyed editor throws.
    if (this.closed || !state || typeof state !== "object") return;
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

  /**
   * Changes the script as one step to undo, unless it's frozen, then puts
   * the cursor at `cursor` (in the changed text) and brings it into view.
   * Changes are in the text as it was, and mustn't overlap.
   */
  applyEdit(changes: { from: number; to: number; insert: string }[], cursor?: number): boolean {
    if (this.refuseIfFrozen() || changes.length === 0) return false;
    this.editor.dispatch({
      changes,
      selection: cursor === undefined ? undefined : EditorSelection.cursor(cursor),
      scrollIntoView: true,
      userEvent: "input",
    });
    if (!this.reading) this.editor.focus();
    return true;
  }

  /** Tints lines changed since a frozen draft (counting from 0), or takes the tint off with null. */
  showChangedLines(lines: number[] | null): void {
    if (this.closed) return;
    this.editor.dispatch({ effects: setChangedLines.of(lines) });
  }

  /** Marks what the checks found, or takes the marks off with null. */
  showCheckMarks(marks: CheckMark[] | null): void {
    if (this.closed) return;
    this.editor.dispatch({ effects: setCheckMarks.of(marks) });
  }

  /** Highlights the lines a table read is reading (counting from 0) and brings them into view, or takes the highlight off with null. */
  showReadLines(range: { line: number; endLine: number } | null): void {
    if (this.closed) return;
    const doc = this.editor.state.doc;
    const effects: StateEffect<unknown>[] = [setReadLines.of(range)];
    if (range && range.line < doc.lines) effects.push(EditorView.scrollIntoView(doc.line(range.line + 1).from, { y: "center" }));
    this.editor.dispatch({ effects });
  }

  /** Scrolls a line (counting from 0) to the top, leaving the cursor where it is. */
  scrollLineToTop(line: number): void {
    if (this.closed) return;
    const doc = this.editor.state.doc;
    const from = doc.line(Math.min(Math.max(line + 1, 1), doc.lines)).from;
    this.editor.dispatch({ effects: EditorView.scrollIntoView(from, { y: "start", yMargin: 0 }) });
  }

  /** Moves the cursor to the start of a line, counting from 0, and brings it into view in the middle of the screen. */
  goToLine(line: number): void {
    const doc = this.editor.state.doc;
    const from = doc.line(Math.min(Math.max(line + 1, 1), doc.lines)).from;
    this.editor.dispatch({ selection: EditorSelection.cursor(from), effects: EditorView.scrollIntoView(from, { y: "center" }) });
    if (!this.reading) this.editor.focus();
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

  /** Where the script is scrolled to: the line at the top, counting from 0, and how far down it that is (0 to 1). Undefined while it isn't laid out. */
  scrollPlace(): { line: number; fraction: number } | undefined {
    const { scrollDOM, documentPadding } = this.editor;
    if (scrollDOM.clientHeight === 0) return undefined;
    const height = scrollDOM.scrollTop - documentPadding.top;
    const block = this.editor.lineBlockAtHeight(height);
    const fraction = block.height > 0 ? Math.min(Math.max((height - block.top) / block.height, 0), 1) : 0;
    return { line: this.editor.state.doc.lineAt(block.from).number - 1, fraction };
  }

  /** Scrolls a line (counting from 0) to the top, `fraction` of the way down it, leaving the cursor where it is. */
  scrollToPlace(line: number, fraction: number): void {
    if (this.closed) return;
    const { scrollDOM, documentPadding, state } = this.editor;
    const block = this.editor.lineBlockAt(state.doc.line(Math.min(Math.max(line + 1, 1), state.doc.lines)).from);
    scrollDOM.scrollTop = block.top + fraction * block.height + documentPadding.top;
    this.syncedTop = scrollDOM.scrollTop;
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
        this.typewriterMode.of(this.currentTypewriter()),
        history(),
        cutHistory((change) => this.host.changeCutsFile(change)),
        changeTint(),
        checkMarks(),
        readMark(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        // Ctrl+Shift+Z redoes too, as in notes; CodeMirror only has Ctrl+Y on Windows.
        keymap.of([...defaultKeymap, ...historyKeymap, { key: "Mod-Shift-z", run: redo, preventDefault: true }]),
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
