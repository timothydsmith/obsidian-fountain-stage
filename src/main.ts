import { normalizePath, Notice, Plugin, TFile } from "obsidian";
import { FountainView, type ScriptChange, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { PositionStore } from "./editor/positions";
import { exportScript } from "./export";
import { FOUNTAIN_EXTENSION, untitledScriptPath } from "./files";
import { DEFAULT_SETTINGS, Library, type PlaywrightSettings, readSettings } from "./library";
import { buildOutline } from "./fountain/outline";
import { buildReport, type ScriptReport } from "./fountain/report";
import { reportMarkdown } from "./fountain/reportMarkdown";
import { formatDuration, pagePositions, type Timeline, timeline } from "./fountain/runtime";
import { OutlineView, VIEW_TYPE_OUTLINE } from "./outlineView";
import { Paginator } from "./pagination";
import { pageAtLine, pageLabel } from "./pdf/pageBreaks";
import { renameCharacter } from "./renameCharacterModal";
import { ReportView, VIEW_TYPE_REPORT } from "./reportView";
import { PlaywrightSettingTab } from "./settings";

/** Local-storage key (scoped to this vault by Obsidian) for where you were in each script. */
const POSITIONS_KEY = "playwright-positions";

export default class PlaywrightPlugin extends Plugin {
  private positions!: PositionStore;
  private playwrightSettings: PlaywrightSettings = { ...DEFAULT_SETTINGS };
  private library!: Library;
  private paginator!: Paginator;

  async onload(): Promise<void> {
    this.playwrightSettings = readSettings(await this.loadData());
    this.library = new Library(this.app, () => this.playwrightSettings);
    this.paginator = new Paginator(this.library, () => this.playwrightSettings);
    this.addSettingTab(new PlaywrightSettingTab(this.app, this, this.playwrightSettings, () => this.saveSettings(), this.library));

    this.positions = new PositionStore({
      load: () => this.app.loadLocalStorage(POSITIONS_KEY),
      save: (data) => this.app.saveLocalStorage(POSITIONS_KEY, data),
    });
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.positions.rename(oldPath, file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.positions.delete(file.path)));

    this.registerView(
      VIEW_TYPE_FOUNTAIN,
      (leaf) =>
        new FountainView(leaf, this.positions, {
          exportPdf: (view) => view.file && void this.exportPdf(view.file),
          paginate: (script) => this.paginator.paginate(script),
          showPageBreaks: () => this.playwrightSettings.showPageBreaks,
        }),
    );

    this.showStatusBar();

    this.registerView(VIEW_TYPE_OUTLINE, (leaf) => new OutlineView(leaf, (view) => this.timelineOf(view)));
    this.registerView(
      VIEW_TYPE_REPORT,
      (leaf) => new ReportView(leaf, { reportOf: (view) => this.reportOf(view), saveReport: (view) => void this.saveReport(view) }),
    );
    this.addCommand({
      id: "show-outline",
      name: "Show script outline",
      callback: () => void this.showOutline(),
    });

    try {
      this.registerExtensions([FOUNTAIN_EXTENSION], VIEW_TYPE_FOUNTAIN);
    } catch (error) {
      // Only one plugin can claim an extension. Another Fountain plugin
      // (such as "Fountain") that loaded first will have taken it.
      console.error("[playwright] could not register .fountain files", error);
      new Notice("Playwright can't open .fountain files because another plugin already does. Turn that plugin off, then reload Playwright.", 0);
    }

    this.addCommand({
      id: "new-script",
      name: "New script",
      callback: () => this.newScript(),
    });
    this.addRibbonIcon("drama", "New Fountain script", () => this.newScript());

    // Obsidian's own mode commands only work in notes. Their hotkeys work
    // in scripts too (see FountainView); these are for the command palette.
    const viewCommand = (id: string, name: string, run: (view: FountainView) => void) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const view = this.app.workspace.getActiveViewOfType(FountainView);
          if (!view) return false;
          if (!checking) run(view);
          return true;
        },
      });
    viewCommand("toggle-reading-view", "Toggle reading view", (view) => view.toggleReading());
    viewCommand("toggle-source-mode", "Toggle source mode", (view) => view.toggleSource());
    // For touch keyboards, which have no Tab key: these can go on the mobile toolbar.
    viewCommand("next-line-type", "Next line type", (view) => view.cycleLineType(1));
    viewCommand("previous-line-type", "Previous line type", (view) => view.cycleLineType(-1));
    viewCommand("rename-character", "Rename character", (view) => renameCharacter(this.app, view));
    viewCommand("show-report", "Show script report", (view) => void this.showReport(view));
    viewCommand("save-report", "Save script report as a note", (view) => void this.saveReport(view));

    this.addCommand({
      id: "export-pdf",
      name: "Export to PDF",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.extension !== FOUNTAIN_EXTENSION) return false;
        if (!checking) void this.exportPdf(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== FOUNTAIN_EXTENSION) return;
        menu.addItem((item) =>
          item
            .setTitle("Export to PDF")
            .setIcon("file-down")
            .onClick(() => void this.exportPdf(file)),
        );
      }),
    );
  }

  /** Exports a script, using unsaved changes if it's open. */
  private async exportPdf(file: TFile): Promise<void> {
    const open = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FOUNTAIN)
      .map((leaf) => leaf.view)
      .find((view): view is FountainView => view instanceof FountainView && view.file?.path === file.path);
    const source = open ? open.getViewData() : await this.app.vault.read(file);
    await exportScript(this.app, this.library, file, source, this.playwrightSettings.export, (choices) => {
      this.playwrightSettings.export = choices;
      // Nothing else depends on these, so there's nothing to refresh.
      void this.saveData(this.playwrightSettings);
    });
  }

  private async saveSettings(): Promise<void> {
    await this.saveData(this.playwrightSettings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN)) {
      if (leaf.view instanceof FountainView) leaf.view.refreshPages();
    }
  }

  /** The script's runtime, line by line, by the method in settings. Undefined by pages until they're laid out. */
  private timelineOf(view: FountainView): Timeline | undefined {
    const { runtimeMethod, wordsPerMinute, minutesPerPage, pauseWords } = this.playwrightSettings;
    return timeline(view.script(), view.scriptPages()?.placements, { method: runtimeMethod, wordsPerMinute, minutesPerPage, pauses: pauseWords });
  }

  /**
   * Shows, while you're in a script, what the cursor's line is (Character,
   * Dialogue, Stage direction…), the page you're on, and the runtime.
   */
  private showStatusBar(): void {
    const lineTypeEl = this.addStatusBarItem();
    lineTypeEl.addClass("playwright-line-type");
    const pageEl = this.addStatusBarItem();
    pageEl.addClass("playwright-page");
    const runtimeEl = this.addStatusBarItem();
    runtimeEl.addClass("playwright-runtime");
    let script: FountainView | null = null;
    let unsubscribe: (() => void) | null = null;
    let frame: number | null = null;
    // The runtime changes only with the text or layout, not as you move about.
    let runtimeStale = true;

    const showPage = (view: FountainView) => {
      const pages = view.scriptPages();
      pageEl.toggle(pages !== null);
      if (!pages) return;
      const count = `${pages.pageCount} ${pages.pageCount === 1 ? "page" : "pages"}`;
      const page = pageAtLine(pages, view.script(), view.currentLine());
      pageEl.setText(page === undefined ? count : `${pageLabel(pages, page)} (${count})`);
      pageEl.setAttribute("aria-label", [`Pages as laid out in ${pages.styleName}`, pages.fontNotice].filter(Boolean).join("\n"));
      pageEl.setAttribute("data-tooltip-position", "top");
    };
    const showRuntime = (view: FountainView) => {
      const t = this.timelineOf(view);
      runtimeEl.toggle(t !== undefined);
      if (!t) return;
      runtimeEl.setText(`Runtime ${formatDuration(t.total)}`);
      const method = this.playwrightSettings.runtimeMethod === "words" ? "from the words spoken" : "from the number of pages";
      runtimeEl.setAttribute("aria-label", `Estimated runtime, ${method}`);
      runtimeEl.setAttribute("data-tooltip-position", "top");
    };
    const update = () => {
      frame = null;
      for (const el of [lineTypeEl, pageEl, runtimeEl]) el.toggle(script !== null);
      if (!script) return;
      lineTypeEl.setText(script.cursorLineType());
      showPage(script);
      if (runtimeStale) showRuntime(script);
      runtimeStale = false;
    };
    const updateSoon = (change?: ScriptChange) => {
      if (change !== "position") runtimeStale = true;
      frame ??= window.requestAnimationFrame(update);
    };
    const follow = () => {
      const active = this.app.workspace.getActiveViewOfType(FountainView);
      if (active === script) return;
      unsubscribe?.();
      script = active;
      unsubscribe = active?.subscribe(updateSoon) ?? null;
      updateSoon();
    };

    this.registerEvent(this.app.workspace.on("active-leaf-change", follow));
    this.app.workspace.onLayoutReady(follow);
    this.register(() => {
      unsubscribe?.();
      if (frame !== null) window.cancelAnimationFrame(frame);
    });
  }

  /** The script's report, with lengths by the runtime method in settings. */
  private reportOf(view: FountainView): ScriptReport {
    const pages = view.scriptPages();
    return buildReport(view.script(), buildOutline(view.getViewData()), {
      wordsPerMinute: this.playwrightSettings.wordsPerMinute,
      timeline: this.timelineOf(view),
      positions: pages ? pagePositions(pages.placements) : undefined,
      pageCount: pages?.pageCount,
    });
  }

  /** Shows the report on a script in a tab beside it, opening one if there isn't one. */
  private async showReport(view: FountainView): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_REPORT)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("split", "vertical");
      await leaf.setViewState({ type: VIEW_TYPE_REPORT, active: false });
    }
    if (leaf.view instanceof ReportView) leaf.view.setScript(view);
    await workspace.revealLeaf(leaf);
  }

  /** Saves the report on a script as a Markdown note beside it, replacing an earlier one, and opens it. */
  private async saveReport(view: FountainView): Promise<void> {
    const file = view.file;
    if (!file) return;
    const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const method = this.playwrightSettings.runtimeMethod === "words" ? "the words spoken" : "the number of pages";
    const text = reportMarkdown(this.reportOf(view), { title: file.basename, date, method });
    const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
    const path = normalizePath(`${folder}${file.basename} - Report.md`);
    try {
      const { vault, workspace } = this.app;
      const existing = vault.getAbstractFileByPath(path);
      let note: TFile;
      if (existing instanceof TFile) {
        await vault.modify(existing, text);
        note = existing;
      } else if (existing) {
        throw new Error(`${path} is a folder`);
      } else {
        note = await vault.create(path, text);
      }
      await workspace.getLeaf("tab").openFile(note);
      new Notice(`Saved the report as ${note.name}`);
    } catch (error) {
      console.error("[playwright] couldn't save the report", error);
      new Notice(`Couldn't save the report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Shows the script outline, opening it in the right sidebar if it isn't open yet. */
  private async showOutline(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OUTLINE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf("split");
      await leaf.setViewState({ type: VIEW_TYPE_OUTLINE, active: false });
    }
    await workspace.revealLeaf(leaf);
  }

  onunload(): void {
    this.positions.flush();
  }

  /** Creates an untitled script in the folder Obsidian uses for new notes, and opens it. */
  private async newScript(): Promise<void> {
    const { vault, workspace, fileManager } = this.app;
    const folder = fileManager.getNewFileParent(workspace.getActiveFile()?.path ?? "");
    const path = untitledScriptPath(folder.path, (p) => vault.getAbstractFileByPath(p) !== null);
    const file = await vault.create(path, "Title: Untitled\n\n");
    await workspace.getLeaf(false).openFile(file);
  }
}
