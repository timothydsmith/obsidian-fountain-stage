/**
 * The Search scripts panel: every line in the vault's scripts that has
 * some text in it, grouped by script. A click opens the script with the
 * match selected. Obsidian's own search doesn't look inside .fountain
 * files, so this does.
 */

import { ItemView, Keymap, Platform, TFile, debounce, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { FOUNTAIN_EXTENSION, isInFolder } from "./files";
import { excerpt, searchText, type LineMatch, type SearchOptions } from "./fountain/textSearch";

export const VIEW_TYPE_SEARCH = "fountain-stage-search";

/** The most matches listed, so a search for "e" doesn't build a list nobody can read. */
const MAX_MATCHES = 1000;

interface SearchState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  drafts: boolean;
}

interface ScriptResult {
  file: TFile;
  lines: LineMatch[];
}

export class SearchView extends ItemView {
  private state: SearchState = { query: "", matchCase: false, wholeWord: false, drafts: false };
  private input!: HTMLInputElement;
  private toggles = new Map<keyof SearchState, HTMLInputElement>();
  private summaryEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  /** Scripts whose results are folded away, by path. */
  private collapsed = new Set<string>();
  /** Counts searches, so a slow one that's overtaken doesn't draw its results. */
  private generation = 0;

  private readonly searchSoon = debounce(() => void this.search(), 250, true);

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: { draftsFolder: () => string },
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SEARCH;
  }

  getDisplayText(): string {
    return "Search scripts";
  }

  getIcon(): string {
    return "file-search";
  }

  getState(): Record<string, unknown> {
    return { ...super.getState(), ...this.state };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (state && typeof state === "object") {
      const s = state as Partial<SearchState>;
      if (typeof s.query === "string") this.state.query = s.query;
      for (const key of ["matchCase", "wholeWord", "drafts"] as const) {
        if (typeof s[key] === "boolean") this.state[key] = s[key];
      }
      this.showState();
      void this.search();
    }
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.addClass("fountain-stage-search");

    const box = el.createDiv({ cls: "fountain-stage-search-box search-input-container" });
    this.input = box.createEl("input", { type: "search", placeholder: "Search scripts…", attr: { enterkeyhint: "search", spellcheck: "false" } });
    this.input.addEventListener("input", () => {
      this.state.query = this.input.value;
      this.searchSoon();
    });
    this.input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        this.searchSoon.cancel();
        void this.search();
      }
    });

    const controls = el.createDiv({ cls: "fountain-stage-search-controls" });
    const toggle = (key: "matchCase" | "wholeWord" | "drafts", label: string) => {
      const wrap = controls.createEl("label", { cls: "fountain-stage-search-toggle" });
      const box = wrap.createEl("input", { type: "checkbox" });
      wrap.createSpan({ text: label });
      box.addEventListener("change", () => {
        this.state[key] = box.checked;
        void this.search();
        this.app.workspace.requestSaveLayout();
      });
      this.toggles.set(key, box);
    };
    toggle("matchCase", "Match case");
    toggle("wholeWord", "Whole word");
    toggle("drafts", "Include drafts");

    this.summaryEl = el.createDiv({ cls: "fountain-stage-search-summary" });
    this.resultsEl = el.createDiv({ cls: "fountain-stage-search-results" });

    const changed = (file: unknown) => {
      if (file instanceof TFile && file.extension === FOUNTAIN_EXTENSION && this.state.query) this.searchSoon();
    };
    this.registerEvent(this.app.vault.on("modify", changed));
    this.registerEvent(this.app.vault.on("create", changed));
    this.registerEvent(this.app.vault.on("delete", changed));
    this.registerEvent(this.app.vault.on("rename", changed));

    this.showState();
    void this.search();
  }

  async onClose(): Promise<void> {
    this.searchSoon.cancel();
    this.generation++;
  }

  /** Puts the cursor in the search box, with `query` in it if there is one, and searches. */
  focusSearch(query?: string): void {
    if (query !== undefined && query !== this.state.query) {
      this.state.query = query;
      this.input.value = query;
      void this.search();
    }
    this.input.focus();
    this.input.select();
  }

  private showState(): void {
    if (!this.input) return;
    this.input.value = this.state.query;
    for (const [key, box] of this.toggles) box.checked = this.state[key] as boolean;
  }

  /** The scripts searched: every .fountain file, leaving out frozen drafts unless they're asked for. */
  private scripts(): TFile[] {
    const drafts = this.host.draftsFolder();
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension === FOUNTAIN_EXTENSION && (this.state.drafts || !isInFolder(file.path, drafts)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /** A script's text: what's in its open tab, which can be ahead of the file, or else the file. */
  private async textOf(file: TFile): Promise<string> {
    const open = this.openView(file);
    return open ? open.getViewData() : this.app.vault.cachedRead(file);
  }

  private openView(file: TFile): FountainView | undefined {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN)) {
      if (leaf.view instanceof FountainView && leaf.view.file === file) return leaf.view;
    }
    return undefined;
  }

  private async search(): Promise<void> {
    const generation = ++this.generation;
    const { query } = this.state;
    if (!this.resultsEl) return;
    if (!query) {
      this.resultsEl.empty();
      this.summaryEl.setText("");
      return;
    }
    const options: SearchOptions = { matchCase: this.state.matchCase, wholeWord: this.state.wholeWord };
    const results: ScriptResult[] = [];
    let count = 0;
    for (const file of this.scripts()) {
      if (count >= MAX_MATCHES) break;
      const text = await this.textOf(file);
      if (generation !== this.generation) return;
      const lines = searchText(text, query, options, MAX_MATCHES - count);
      if (!lines.length) continue;
      count += lines.reduce((n, line) => n + line.matches.length, 0);
      results.push({ file, lines });
    }
    this.render(results, count);
  }

  private render(results: ScriptResult[], count: number): void {
    this.resultsEl.empty();
    if (!results.length) {
      this.summaryEl.setText("No matches.");
      return;
    }
    const matches = count === 1 ? "1 match" : `${count} matches`;
    const scripts = results.length === 1 ? "1 script" : `${results.length} scripts`;
    this.summaryEl.setText(count >= MAX_MATCHES ? `The first ${MAX_MATCHES} matches, in ${scripts}.` : `${matches} in ${scripts}.`);

    for (const { file, lines } of results) {
      const group = this.resultsEl.createDiv({ cls: "fountain-stage-search-script" });
      const header = group.createDiv({ cls: "fountain-stage-search-file" });
      const fold = header.createSpan({ cls: "fountain-stage-search-fold" });
      header.createSpan({ cls: "fountain-stage-search-name", text: file.basename });
      const n = lines.reduce((total, line) => total + line.matches.length, 0);
      header.createSpan({ cls: "fountain-stage-search-count", text: String(n) });
      if (file.parent && !file.parent.isRoot()) header.setAttr("aria-label", file.path);
      const list = group.createDiv({ cls: "fountain-stage-search-lines" });
      const setFolded = (folded: boolean) => {
        setIcon(fold, folded ? "chevron-right" : "chevron-down");
        list.toggle(!folded);
        if (folded) this.collapsed.add(file.path);
        else this.collapsed.delete(file.path);
      };
      setFolded(this.collapsed.has(file.path));
      header.addEventListener("click", () => setFolded(!this.collapsed.has(file.path)));

      for (const line of lines) {
        const row = list.createDiv({ cls: "fountain-stage-search-line" });
        row.createSpan({ cls: "fountain-stage-search-number", text: String(line.line + 1) });
        const textEl = row.createSpan({ cls: "fountain-stage-search-text" });
        const shown = excerpt(line);
        let at = 0;
        for (const [from, to] of shown.matches) {
          if (from > at) textEl.appendText(shown.text.slice(at, from));
          textEl.createSpan({ cls: "fountain-stage-search-match", text: shown.text.slice(from, to) });
          at = to;
        }
        if (at < shown.text.length) textEl.appendText(shown.text.slice(at));
        const [from, to] = line.matches[0];
        row.addEventListener("click", (evt) => void this.openMatch(file, line.line, from, to - from, evt));
      }
    }
  }

  /** Opens a script with a match selected: in its tab if it's open, else in this tab or (with Ctrl/Cmd) a new one. */
  private async openMatch(file: TFile, line: number, ch: number, length: number, evt: MouseEvent): Promise<void> {
    const { workspace } = this.app;
    const open = Keymap.isModEvent(evt) ? undefined : workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN).find((leaf) => leaf.view instanceof FountainView && leaf.view.file === file);
    if (open?.view instanceof FountainView) {
      await workspace.revealLeaf(open);
      workspace.setActiveLeaf(open, { focus: true });
      open.view.selectInLine(line, ch, length);
    } else {
      await workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file, {
        active: true,
        eState: { cursor: { from: { line, ch }, to: { line, ch: ch + length } }, focus: true },
      });
    }
    // On a phone the sidebar covers the script, so it gets out of the way.
    if (Platform.isMobile) workspace.leftSplit?.collapse();
  }
}
