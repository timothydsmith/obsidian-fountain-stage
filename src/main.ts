import { Keymap, normalizePath, Notice, Platform, Plugin, TFile } from "obsidian";
import { FountainView, type ScriptChange, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { PositionStore } from "./editor/positions";
import { exportScript } from "./export";
import { FOUNTAIN_EXTENSION, untitledScriptPath } from "./files";
import { freezeDraft } from "./freezeDraft";
import { chooseAlternate, keepAsAlternate, nextAlternate } from "./alternateCommands";
import { Changes } from "./changes";
import { ChangesView, VIEW_TYPE_CHANGES } from "./changesView";
import { Checks } from "./checks";
import { ChecksView, VIEW_TYPE_CHECKS } from "./checksView";
import { CutsFiles } from "./cutsCommands";
import type { ScriptVersion } from "./fountain/compare";
import { addToLineBank, dropFromLineBank } from "./lineBankCommands";
import { jumpToScene, jumpToSpeech, mergeWithPreviousScene, moveBeatToLine, moveSceneBy, moveSceneToLine, renumber, splitSceneAtCursor } from "./sceneCommands";
import { DEFAULT_SETTINGS, Library, type FountainStageSettings, readSettings } from "./library";
import { buildOutline } from "./fountain/outline";
import { buildReport, type ScriptReport } from "./fountain/report";
import { reportMarkdown } from "./fountain/reportMarkdown";
import { formatDuration, pagePositions, type Timeline, timeline } from "./fountain/runtime";
import { OutlineView, VIEW_TYPE_OUTLINE } from "./outlineView";
import { SearchView, VIEW_TYPE_SEARCH } from "./searchView";
import { BeatMapView, VIEW_TYPE_BEAT_MAP } from "./beatMapView";
import { addBeatAfter, addSceneTo, editSynopsis, importFramework, itemAtCursor, openLinkedNote } from "./planningCommands";
import { type PaginatedScript, Paginator } from "./pagination";
import type { ParsedScript } from "./fountain/parser";
import { pageAtLine, pageLabel } from "./pdf/pageBreaks";
import { mergeCharacters, renameCharacter } from "./renameCharacterModal";
import { ReportView, VIEW_TYPE_REPORT } from "./reportView";
import { Passes } from "./passes";
import { Rehearsal } from "./rehearsal";
import { SideBySide } from "./sideBySide";
import { Sprints } from "./sprint";
import { ReadThroughs } from "./readThrough";
import { TableReads, warmUpVoices } from "./tableRead";
import { calibrate } from "./fountain/readings";
import { playTarget, targetDelta } from "./fountain/targets";
import { setPlayTarget, setTargetHere } from "./targetCommands";
import { FountainStageSettingTab } from "./settings";
import { OnStage } from "./onStage";
import { generateBreakdown } from "./breakdownCommand";
import type { LinkHost } from "./editor/links";
import { followRename, resolveTarget } from "./linkedNotes";
import { offerSetUp, setUpPlay } from "./setupCommand";

/** How long after you stop typing the tint on changed lines catches up. */
const CHANGE_TINT_DELAY_MS = 500;

/** Local-storage key (scoped to this vault by Obsidian) for where you were in each script. */
const POSITIONS_KEY = "fountain-stage-positions";
/** Page preview sources: links hovered in reading view, and while editing (with Ctrl or Cmd, unless changed). */
const HOVER_READING = "fountain-stage-reading";
const HOVER_EDITING = "fountain-stage-editing";

export default class FountainStagePlugin extends Plugin {
  private positions!: PositionStore;
  settings: FountainStageSettings = { ...DEFAULT_SETTINGS };
  private library!: Library;
  private paginator!: Paginator;
  private cuts!: CutsFiles;
  private changes!: Changes;
  private sideBySide!: SideBySide;
  private passes!: Passes;
  private checks!: Checks;
  private rehearsal!: Rehearsal;
  private sprints!: Sprints;
  private readonly onStage = new OnStage();
  private readThroughs!: ReadThroughs;
  private tableReads!: TableReads;
  /** Brings the tint on changed lines up to date in every open script. */
  private retint: () => void = () => undefined;

  async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.library = new Library(this.app, () => this.settings);
    this.paginator = new Paginator(this.library, () => this.settings);
    this.cuts = new CutsFiles(this.app, () => this.draftsFolder(), () => this.scriptViews());
    this.changes = new Changes(this.app, () => this.draftsFolder());
    this.sideBySide = new SideBySide(this.app, this.changes);
    this.rehearsal = new Rehearsal(this.app, this.changes, this.library, this.paginator, () => this.draftsFolder());
    this.sprints = new Sprints(
      this.app,
      () => this.settings.sprintMinutes,
      (minutes) => {
        this.settings.sprintMinutes = minutes;
        void this.saveData(this.settings);
      },
      () => this.scriptViews(),
    );
    this.register(() => this.sprints.cancel());
    this.readThroughs = new ReadThroughs(
      this.app,
      {
        timelineOf: (view) => this.timelineOf(view),
        methodDescription: () => (this.settings.runtimeMethod === "words" ? `at ${this.settings.wordsPerMinute} words a minute` : `at ${this.settings.minutesPerPage} minutes a page`),
        calibrate: (factor) => void this.calibrateRuntime(factor),
      },
      () => this.scriptViews(),
    );
    this.register(() => this.readThroughs.cancel());
    this.tableReads = new TableReads(
      this.app,
      () => this.settings.tableRead,
      (choices) => {
        this.settings.tableRead = choices;
        void this.saveData(this.settings);
      },
      () => this.scriptViews(),
    );
    this.register(() => this.tableReads.stop());
    this.app.workspace.onLayoutReady(() => warmUpVoices());
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.workspace.on("layout-change", () => this.sideBySide.layoutChanged(this.scriptViews())));
    });
    this.register(() => this.sideBySide.stopAll());
    this.passes = new Passes(this.app, this.changes);
    this.app.workspace.onLayoutReady(() => {
      this.passes.sync(this.scriptViews());
      this.registerEvent(this.app.workspace.on("layout-change", () => this.passes.sync(this.scriptViews())));
    });
    this.registerEvent(this.app.vault.on("modify", (file) => this.passes.fileChanged(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.passes.fileChanged(file.path)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.passes.fileChanged(oldPath);
        this.passes.fileChanged(file.path);
      }),
    );
    // A new draft, or another chosen, is what changes are counted from now.
    this.register(this.changes.onChange(() => this.passes.recheck()));
    this.register(() => this.passes.stopAll());
    this.checks = new Checks(
      () => this.settings,
      () => void this.saveData(this.settings),
    );
    this.app.workspace.onLayoutReady(() => {
      this.checks.sync(this.scriptViews());
      this.registerEvent(this.app.workspace.on("layout-change", () => this.checks.sync(this.scriptViews())));
    });
    this.register(() => this.checks.stopAll());
    this.addSettingTab(new FountainStageSettingTab(this.app, this, this.settings, () => this.saveSettings(), this.library));

    this.positions = new PositionStore({
      load: (): unknown => this.app.loadLocalStorage(POSITIONS_KEY),
      save: (data) => this.app.saveLocalStorage(POSITIONS_KEY, data),
    });
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.positions.rename(oldPath, file.path);
        // A script moved into the drafts folder is frozen now, or one moved out isn't.
        for (const view of this.scriptViews()) if (view.file === file) view.refreshFrozen();
      }),
    );
    // Freezing a draft freezes its cuts file too, and gives scripts a new draft to compare with.
    const refreshFrozen = () => {
      for (const view of this.scriptViews()) view.refreshFrozen();
      this.changes.changed();
    };
    // Not while the vault loads, when every file is announced as created.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on("create", refreshFrozen));
      this.registerEvent(this.app.vault.on("delete", refreshFrozen));
      this.registerEvent(this.app.vault.on("rename", () => this.changes.changed()));
    });
    this.registerEvent(this.app.vault.on("delete", (file) => this.positions.delete(file.path)));

    this.registerView(
      VIEW_TYPE_FOUNTAIN,
      (leaf) =>
        new FountainView(leaf, this.positions, {
          exportPdf: (view) => view.file && void this.exportPdf(view.file),
          paginate: (view, source, script) => this.paginate(view, source, script),
          showPageBreaks: () => this.settings.showPageBreaks,
          inDraftsFolder: (file) => this.cuts.inDraftsFolder(file),
          isFrozen: (file) => this.cuts.isFrozen(file),
          isCutsFile: (file) => this.cuts.isCutsFile(file),
          isLineBank: (file) => this.cuts.isLineBank(file),
          freezeDraft: (view) => this.freezeDraft(view),
          changeCutsFile: (change) => void this.cuts.change(change).catch(() => undefined),
          cutFromDraft: (view) => void this.cuts.cut(view),
          restoreCut: (view) => this.cuts.restore(view),
          showChanges: (view) => void this.showChanges(view),
          showSideBySide: (view) => void this.sideBySide.open(view),
          tintingChanges: () => this.settings.showChanges,
          toggleChangeTint: () => this.toggleChangeTint(),
          showChecks: (view) => void this.showChecks(view),
          rehearsalActions: (view) => this.rehearsalActions(view),
          typewriterMode: () => this.settings.typewriter,
          toggleTypewriter: () => this.toggleTypewriter(),
          actionDepth: () => this.settings.actionDepth,
          links: (view) => this.linkHost(view),
          noteNames: (view) => {
            const from = view.file?.path ?? "";
            return this.app.vault.getMarkdownFiles().map((file) => this.app.metadataCache.fileToLinktext(file, from, true));
          },
        }),
    );
    this.watchLinkedNotes();
    this.tintChanges();

    this.showStatusBar();

    this.registerView(
      VIEW_TYPE_OUTLINE,
      (leaf) =>
        new OutlineView(leaf, {
          timelineOf: (view) => this.timelineOf(view),
          moveScene: moveSceneToLine,
          moveSceneBy: (view, line, direction) => moveSceneBy(view, direction, line),
          moveBeat: moveBeatToLine,
          outlineBy: () => this.settings.outlineBy,
          setOutlineBy: (by) => {
            this.settings.outlineBy = by;
            void this.saveData(this.settings);
            this.redrawStoryViews();
          },
          beatNotesFolder: () => this.settings.beatNotesFolder,
          frameworksFolder: () => this.settings.frameworksFolder,
          showBeatMap: (view) => void this.showBeatMap(view),
          passOf: (view, outline) => {
            const pass = view.isDraft() ? undefined : this.passes.current(view);
            // A pass lists scenes as the report does, whichever way the outline shows them.
            return pass && outline ? { pass, keys: this.passes.keysByLine(view, buildOutline(view.getViewData(), view.isAct())) } : undefined;
          },
          tick: (view, key, done) => void this.passes.tick(view, key, done),
          onPassesChange: (listener) => this.passes.onChange(listener),
        }),
    );
    this.addOutlineOnce();
    this.registerView(
      VIEW_TYPE_REPORT,
      (leaf) =>
        new ReportView(leaf, {
          reportOf: (view) => this.reportOf(view),
          saveReport: (view) => void this.saveReport(view),
          castSize: () => this.settings.castSize,
          setCastSize: (actors) => {
            this.settings.castSize = actors;
            // Nothing else depends on it, so nothing needs laying out again.
            void this.saveData(this.settings);
          },
        }),
    );
    this.registerView(
      VIEW_TYPE_CHANGES,
      (leaf) =>
        new ChangesView(leaf, {
          changes: this.changes,
          reportOf: (view) => this.reportOf(view),
          reportOfVersion: (version) => this.reportOfVersion(version),
          showSideBySide: (view) => void this.sideBySide.open(view),
        }),
    );
    this.registerView(
      VIEW_TYPE_CHECKS,
      (leaf) => new ChecksView(leaf, { checks: this.checks, settings: () => this.settings, setMarks: (on) => this.setCheckMarks(on) }),
    );
    this.addCommand({
      id: "show-outline",
      name: "Show script outline",
      callback: () => void this.showOutline(),
    });
    this.registerView(VIEW_TYPE_SEARCH, (leaf) => new SearchView(leaf, { draftsFolder: () => this.draftsFolder() }));
    this.registerView(
      VIEW_TYPE_BEAT_MAP,
      (leaf) =>
        new BeatMapView(leaf, {
          timelineOf: (view) => this.timelineOf(view),
          moveScene: moveSceneToLine,
          moveBeat: moveBeatToLine,
          equalWidths: () => this.settings.beatMapEqual,
          setEqualWidths: (equal) => {
            this.settings.beatMapEqual = equal;
            void this.saveData(this.settings);
            this.redrawStoryViews();
          },
          frameworksFolder: () => this.settings.frameworksFolder,
        }),
    );
    this.addCommand({
      id: "search-scripts",
      name: "Search scripts",
      callback: () => void this.showSearch(),
    });

    try {
      this.registerExtensions([FOUNTAIN_EXTENSION], VIEW_TYPE_FOUNTAIN);
    } catch (error) {
      // Only one plugin can claim an extension. Another Fountain plugin
      // (such as "Fountain") that loaded first will have taken it.
      console.error("[fountain-stage] could not register .fountain files", error);
      new Notice("Fountain Stage can't open .fountain files because another plugin already does. Turn that plugin off, then reload Fountain Stage.", 0);
    }

    this.addCommand({
      id: "new-script",
      name: "New script",
      callback: () => this.newScript(),
    });
    this.addRibbonIcon("drama", "New Fountain script", () => this.newScript());
    this.addCommand({
      id: "set-up-play",
      name: "Set up a play",
      callback: () => setUpPlay(this.app, this.settings),
    });
    // Offered once, the first time the plugin loads in a vault with no scripts.
    this.app.workspace.onLayoutReady(() => void offerSetUp(this.app, this.settings, () => this.saveData(this.settings)));

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
    // Obsidian's hotkeys for searching in a file open the search bar too (see FountainView).
    viewCommand("find-in-script", "Find in script", (view) => view.find());
    // For touch keyboards, which have no Tab key: these can go on the mobile toolbar.
    viewCommand("next-line-type", "Next line type", (view) => view.cycleLineType(1));
    viewCommand("previous-line-type", "Previous line type", (view) => view.cycleLineType(-1));
    viewCommand("rename-character", "Rename character", (view) => renameCharacter(this.app, view));
    viewCommand("merge-characters", "Merge characters", (view) => mergeCharacters(this.app, view));
    viewCommand("show-on-stage", "Show who's on stage", (view) => this.onStage.show(view));
    viewCommand("generate-breakdown", "Write cast list and scene breakdown", (view) => generateBreakdown(view));
    // Story outline: planning beats and scenes, and the beat map.
    viewCommand("show-beat-map", "Show beat map", (view) => void this.showBeatMap(view));
    viewCommand("import-framework", "Import framework", (view) => void importFramework(this.app, view, this.settings.frameworksFolder));
    viewCommand("add-beat", "Add beat", (view) => addBeatAfter(this.app, view, itemAtCursor(view)));
    viewCommand("add-scene", "Add scene", (view) => addSceneTo(this.app, view, itemAtCursor(view)));
    viewCommand("edit-synopsis", "Edit synopsis", (view) => {
      const item = itemAtCursor(view);
      if (item) editSynopsis(this.app, view, item);
      else new Notice("Put the cursor in a beat, scene or act to write its synopsis.");
    });
    viewCommand("create-linked-note", "Create or open linked note", (view) => {
      const item = itemAtCursor(view);
      if (item) void openLinkedNote(this.app, view, item, this.settings.beatNotesFolder);
      else new Notice("Put the cursor in a beat, scene or act to link a note to it.");
    });
    this.addCommand({
      id: "freeze-draft",
      name: "Freeze draft",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(FountainView);
        if (!view?.file || view.isDraft() || this.cuts.isLineBank(view.file)) return false;
        if (!checking) this.freezeDraft(view);
        return true;
      },
    });
    this.addCommand({
      id: "unfreeze-draft",
      name: "Unfreeze draft",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(FountainView);
        if (!view?.isFrozen()) return false;
        if (!checking) view.unfreeze();
        return true;
      },
    });
    this.addCommand({
      id: "cut-from-draft",
      name: "Cut from this draft",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(FountainView);
        if (!view?.file || view.isDraft() || this.cuts.isLineBank(view.file)) return false;
        if (!checking) void this.cuts.cut(view);
        return true;
      },
    });
    this.addCommand({
      id: "restore-cut",
      name: "Restore cut",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(FountainView);
        if (!view?.file || !this.cuts.isCutsFile(view.file)) return false;
        if (!checking) this.cuts.restore(view);
        return true;
      },
    });
    // The line bank goes with a script, not with its drafts or with itself.
    const scriptCommand = (id: string, name: string, run: (view: FountainView) => void) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const view = this.app.workspace.getActiveViewOfType(FountainView);
          if (!view?.file || view.isDraft() || this.cuts.isLineBank(view.file)) return false;
          if (!checking) run(view);
          return true;
        },
      });
    scriptCommand("add-to-line-bank", "Add to line bank", (view) => addToLineBank(this.app, this.cuts, view));
    scriptCommand("drop-from-line-bank", "Put in a line from the line bank", (view) => void dropFromLineBank(this.app, this.cuts, view));
    viewCommand("next-scene", "Go to next scene", (view) => jumpToScene(view, 1));
    viewCommand("previous-scene", "Go to previous scene", (view) => jumpToScene(view, -1));
    viewCommand("next-speech", "Go to this character's next speech", (view) => jumpToSpeech(view, 1));
    viewCommand("previous-speech", "Go to this character's previous speech", (view) => jumpToSpeech(view, -1));
    viewCommand("move-scene-up", "Move scene up", (view) => moveSceneBy(view, -1));
    viewCommand("move-scene-down", "Move scene down", (view) => moveSceneBy(view, 1));
    viewCommand("split-scene", "Split scene", (view) => splitSceneAtCursor(this.app, view));
    viewCommand("merge-scene", "Merge with previous scene", (view) => mergeWithPreviousScene(view));
    viewCommand("renumber-scenes", "Renumber scenes", (view) => this.renumberScenes(view));
    scriptCommand("start-pass", "Start a pass", (view) => this.passes.start(view));
    scriptCommand("open-passes", "Open passes", (view) => void this.passes.open(view));
    viewCommand("keep-alternate", "Keep as an alternate", (view) => keepAsAlternate(view));
    viewCommand("next-alternate", "Switch to next alternate", (view) => nextAlternate(view));
    viewCommand("choose-alternate", "Choose an alternate", (view) => chooseAlternate(this.app, view));
    viewCommand("show-changes", "Show changes since a draft", (view) => void this.showChanges(view));
    viewCommand("tint-changes", "Tint changes since a draft", () => this.toggleChangeTint());
    if (!Platform.isPhone) viewCommand("side-by-side", "Show side by side with a draft", (view) => void this.sideBySide.open(view));
    const rehearsalCommand = (id: string, name: string, title: string) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const view = this.app.workspace.getActiveViewOfType(FountainView);
          const action = view && this.rehearsalActions(view).find((a) => a.title === title);
          if (!action) return false;
          if (!checking) action.run();
          return true;
        },
      });
    rehearsalCommand("lock-rehearsal-script", "Lock rehearsal script", "Lock rehearsal script");
    rehearsalCommand("unlock-rehearsal-script", "Unlock rehearsal script", "Unlock rehearsal script");
    rehearsalCommand("issue-revised-pages", "Issue revised pages", "Issue revised pages");
    scriptCommand("set-play-target", "Set runtime target for the play", (view) => setPlayTarget(this.app, view));
    scriptCommand("set-target", "Set runtime target for this scene", (view) => setTargetHere(this.app, view));
    viewCommand("toggle-typewriter", "Toggle typewriter mode", () => this.toggleTypewriter());
    scriptCommand("start-sprint", "Start a sprint", (view) => this.sprints.start(view));
    viewCommand("time-read-through", "Time a read-through", (view) => this.readThroughs.start(view));
    viewCommand("table-read", "Start a table read", (view) => void this.tableReads.start(view));
    const tableReadCommand = (id: string, name: string, run: () => void) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          if (!this.tableReads.running()) return false;
          if (!checking) run();
          return true;
        },
      });
    tableReadCommand("table-read-next", "Go on in the table read", () => this.tableReads.next());
    tableReadCommand("table-read-pause", "Pause or resume the table read", () => this.tableReads.pause());
    tableReadCommand("table-read-stop", "Stop the table read", () => this.tableReads.stop());
    const readThroughCommand = (id: string, name: string, run: () => void) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          if (!this.readThroughs.running()) return false;
          if (!checking) run();
          return true;
        },
      });
    readThroughCommand("read-through-next-scene", "Next scene in the read-through", () => this.readThroughs.next());
    readThroughCommand("read-through-pause", "Pause or resume the read-through", () => this.readThroughs.pause());
    readThroughCommand("read-through-finish", "Finish the read-through", () => void this.readThroughs.finish());
    this.addCommand({
      id: "stop-sprint",
      name: "Stop the sprint",
      checkCallback: (checking) => {
        if (!this.sprints.running()) return false;
        if (!checking) void this.sprints.stop();
        return true;
      },
    });
    viewCommand("show-checks", "Show checks", (view) => void this.showChecks(view));
    viewCommand("mark-check-findings", "Mark check findings", () => this.setCheckMarks(!this.settings.showCheckMarks, true));
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
    const open = this.scriptViews().find((view) => view.file?.path === file.path);
    const source = open ? open.getViewData() : await this.app.vault.read(file);
    await exportScript(this.app, this.library, file, source, this.settings.export, (choices) => {
      this.settings.export = choices;
      // Nothing else depends on these, so there's nothing to refresh.
      void this.saveData(this.settings);
    });
  }

  private renumberScenes(view: FountainView): void {
    renumber(this.app, view, this.settings.renumberRestart, (restart) => {
      this.settings.renumberRestart = restart;
      // Nothing else depends on this, so there's nothing to refresh.
      void this.saveData(this.settings);
    });
  }

  private freezeDraft(view: FountainView): void {
    freezeDraft(this.app, view, this.draftsFolder(), (file) => void this.exportPdf(file));
  }

  /** The drafts folder, or the default if the setting is blank. */
  private draftsFolder(): string {
    return normalizePath(this.settings.draftsFolder.trim() || DEFAULT_SETTINGS.draftsFolder);
  }

  /** The open scripts. */
  /** Opening and previewing the notes a script's links name. */
  private linkHost(view: FountainView): LinkHost {
    const from = () => view.file?.path ?? "";
    return {
      resolves: (target) => resolveTarget(this.app, target, from()) !== null,
      open: (target, event) => void this.app.workspace.openLinkText(target, from(), Keymap.isModEvent(event)),
      hover: (event, targetEl, target, reading) => {
        this.app.workspace.trigger("hover-link", {
          event,
          source: reading ? HOVER_READING : HOVER_EDITING,
          hoverParent: view,
          targetEl,
          linktext: target,
          sourcePath: from(),
        });
      },
    };
  }

  /** Follows renamed notes in the scripts that link to them, and restyles links as notes come and go. */
  private watchLinkedNotes(): void {
    this.registerHoverLinkSource(HOVER_READING, { display: "Fountain Stage scripts in reading view", defaultMod: false });
    this.registerHoverLinkSource(HOVER_EDITING, { display: "Fountain Stage scripts while editing", defaultMod: true });
    const refresh = () => {
      for (const view of this.scriptViews()) view.refreshLinks();
    };
    // Not while the vault loads, when every file is announced as created.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on("create", refresh));
      this.registerEvent(this.app.vault.on("delete", refresh));
      this.registerEvent(
        this.app.vault.on("rename", (file, oldPath) => {
          if (!(file instanceof TFile) || file.extension !== "md") return refresh();
          void followRename(
            this.app,
            file,
            oldPath,
            (script) => this.cuts.isFrozen(script),
            (script) => {
              const view = this.scriptViews().find((v) => v.file === script);
              return view && { text: view.getViewData(), apply: (edits) => view.applyChanges(edits) };
            },
          )
            .catch((error: unknown) => console.error("[fountain-stage] couldn't follow a renamed note", error))
            .finally(refresh);
        }),
      );
    });
  }

  private scriptViews(): FountainView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FOUNTAIN)
      .map((leaf) => leaf.view)
      .filter((view): view is FountainView => view instanceof FountainView);
  }

  private async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const view of this.scriptViews()) {
      view.refreshPages();
      view.refreshFrozen();
    }
    this.checks.changed();
    this.redrawStoryViews();
  }

  /** Draws the outline and beat map again, after their settings change. */
  private redrawStoryViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE)) if (leaf.view instanceof OutlineView) leaf.view.redraw();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BEAT_MAP)) if (leaf.view instanceof BeatMapView) leaf.view.redraw();
  }

  /** Shows the beat map of a script in a tab beside it, opening one if there isn't one. */
  private async showBeatMap(view: FountainView): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_BEAT_MAP)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("split", "horizontal");
      await leaf.setViewState({ type: VIEW_TYPE_BEAT_MAP, active: false });
    }
    if (leaf.view instanceof BeatMapView) leaf.view.setScript(view);
    await workspace.revealLeaf(leaf);
  }

  /** The script's runtime, line by line, by the method in settings. Undefined by pages until they're laid out. */
  private timelineOf(view: FountainView): Timeline | undefined {
    const { runtimeMethod, wordsPerMinute, minutesPerPage, pauseWords } = this.settings;
    return timeline(view.script(), view.scriptPages()?.placements, { method: runtimeMethod, wordsPerMinute, minutesPerPage, pauses: pauseWords });
  }

  /**
   * Shows, while you're in a script, what the cursor's line is (Character,
   * Dialogue, Stage direction…), who's on stage, the page you're on, and the runtime.
   */
  private showStatusBar(): void {
    const lineTypeEl = this.addStatusBarItem();
    lineTypeEl.addClass("fountain-stage-line-type");
    const stageEl = this.addStatusBarItem();
    stageEl.addClass("fountain-stage-on-stage");
    const pageEl = this.addStatusBarItem();
    pageEl.addClass("fountain-stage-page");
    const runtimeEl = this.addStatusBarItem();
    runtimeEl.addClass("fountain-stage-runtime");
    let script: FountainView | null = null;
    let unsubscribe: (() => void) | null = null;
    let frame: number | null = null;
    // The runtime changes only with the text or layout, not as you move about.
    let runtimeStale = true;
    // Who's on stage is worked out again once you stop typing, not at every keystroke.
    let stageFresh = true;
    let stageTimer: number | null = null;

    const showStage = (view: FountainView) => {
      const names = this.onStage.namesAt(view, view.currentLine(), stageFresh);
      stageFresh = false;
      stageEl.toggle(names !== undefined);
      if (names === undefined) return;
      const { text, label } = this.onStage.statusText(names);
      stageEl.setText(text);
      stageEl.setAttribute("aria-label", label);
      stageEl.setAttribute("data-tooltip-position", "top");
    };

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
      const target = playTarget(view.script());
      const delta = target === undefined ? undefined : targetDelta(t.total, target);
      const against = delta === undefined ? "" : delta.on ? ", on target" : `, ${formatDuration(delta.seconds)} ${delta.over ? "over" : "under"}`;
      runtimeEl.setText(`Runtime ${formatDuration(t.total)}${against}`);
      const method = this.settings.runtimeMethod === "words" ? "from the words spoken" : "from the number of pages";
      runtimeEl.setAttribute("aria-label", [`Estimated runtime, ${method}`, target === undefined ? "" : `Target ${formatDuration(target)}`].filter(Boolean).join("\n"));
      runtimeEl.setAttribute("data-tooltip-position", "top");
    };
    const update = () => {
      frame = null;
      for (const el of [lineTypeEl, stageEl, pageEl, runtimeEl]) el.toggle(script !== null);
      if (!script) return;
      lineTypeEl.setText(script.cursorLineType());
      showStage(script);
      showPage(script);
      if (runtimeStale) showRuntime(script);
      runtimeStale = false;
    };
    const updateSoon = (change?: ScriptChange) => {
      if (change !== "position" && change !== "scroll") runtimeStale = true;
      if (change === "text") {
        if (stageTimer !== null) window.clearTimeout(stageTimer);
        stageTimer = window.setTimeout(() => {
          stageTimer = null;
          stageFresh = true;
          updateSoon("position");
        }, 800);
      }
      frame ??= window.requestAnimationFrame(update);
    };
    const follow = () => {
      const active = this.app.workspace.getActiveViewOfType(FountainView);
      if (active === script) return;
      unsubscribe?.();
      script = active;
      unsubscribe = active?.subscribe(updateSoon) ?? null;
      stageFresh = true;
      updateSoon();
    };

    this.registerEvent(this.app.workspace.on("active-leaf-change", follow));
    this.app.workspace.onLayoutReady(follow);
    this.register(() => {
      unsubscribe?.();
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (stageTimer !== null) window.clearTimeout(stageTimer);
    });
  }

  /** The script's report, with lengths by the runtime method in settings. */
  private reportOf(view: FountainView): ScriptReport {
    const pages = view.scriptPages();
    return buildReport(view.script(), buildOutline(view.getViewData(), view.isAct()), {
      wordsPerMinute: this.settings.wordsPerMinute,
      timeline: this.timelineOf(view),
      positions: pages ? pagePositions(pages.placements) : undefined,
      pageCount: pages?.pageCount,
      pauses: this.settings.pauseWords,
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

  /** The report on a script that isn't open, such as a frozen draft, laying it out first for a runtime by pages. */
  private async reportOfVersion(version: ScriptVersion): Promise<ScriptReport> {
    const { runtimeMethod, wordsPerMinute, minutesPerPage, pauseWords } = this.settings;
    const pages = runtimeMethod === "pages" ? await this.paginator.paginate(version.script).catch(() => undefined) : undefined;
    return buildReport(version.script, version.outline, {
      wordsPerMinute,
      timeline: timeline(version.script, pages?.placements, { method: runtimeMethod, wordsPerMinute, minutesPerPage, pauses: pauseWords }),
      positions: pages ? pagePositions(pages.placements) : undefined,
      pageCount: pages?.pageCount,
      pauses: pauseWords,
    });
  }

  /** Shows the changes in a script since a frozen draft, in a tab beside it, opening one if there isn't one. */
  private async showChanges(view: FountainView): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHANGES)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("split", "vertical");
      await leaf.setViewState({ type: VIEW_TYPE_CHANGES, active: false });
    }
    if (leaf.view instanceof ChangesView) leaf.view.setScript(view);
    await workspace.revealLeaf(leaf);
  }

  /** A script's pages: as its locked rehearsal script has them, if its play has one, otherwise as its PDF would. */
  private async paginate(view: FountainView, source: string, script: ParsedScript): Promise<PaginatedScript> {
    try {
      const locked = await this.rehearsal.paginate(view, source, script);
      if (locked) return locked;
    } catch (error) {
      console.error("[fountain-stage] couldn't lay the script over its rehearsal pages", error);
    }
    return this.paginator.paginate(script);
  }

  /** Locking and unlocking the rehearsal script, and issuing revised pages, as they apply to a script. */
  private rehearsalActions(view: FountainView): { title: string; icon: string; run: () => void }[] {
    const file = view.file;
    if (!file || this.cuts.isLineBank(file) || this.cuts.isCutsFile(file)) return [];
    const done = () => {
      this.changes.changed();
      for (const v of this.scriptViews()) v.refreshPages();
    };
    const lock = { title: "Lock rehearsal script", icon: "lock", run: () => void this.rehearsal.lock(view, done) };
    const unlock = { title: "Unlock rehearsal script", icon: "lock-open", run: () => void this.rehearsal.unlock(view, done) };
    if (view.isDraft()) return (view.script().titleValues.locked ?? []).join("").trim() ? [unlock] : [lock];
    if (!this.rehearsal.isLocked(view)) return [lock];
    return [{ title: "Issue revised pages", icon: "file-stack", run: () => void this.rehearsal.issue(view, done) }, lock, unlock];
  }

  /** Shows the checks on a script in a tab beside it, opening one if there isn't one. */
  private async showChecks(view: FountainView): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHECKS)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("split", "vertical");
      await leaf.setViewState({ type: VIEW_TYPE_CHECKS, active: false });
    }
    if (leaf.view instanceof ChecksView) leaf.view.setScript(view);
    await workspace.revealLeaf(leaf);
  }

  /** Turns the marks on what the checks find on or off, in every script. */
  private setCheckMarks(on: boolean, notice = false): void {
    this.settings.showCheckMarks = on;
    // Nothing else depends on this; the marks are redone below.
    void this.saveData(this.settings);
    this.checks.changed();
    if (notice) new Notice(on ? "Marking what the checks find in each script." : "Stopped marking what the checks find.");
  }

  /** Turns the tint on changed lines on or off, in every script. */
  /** Scales the runtime estimate, by the method in use, so it takes `factor` times as long. */
  private async calibrateRuntime(factor: number): Promise<void> {
    const { wordsPerMinute, minutesPerPage, pauseWords } = this.settings;
    const rates = calibrate({ wordsPerMinute, minutesPerPage, pauses: pauseWords }, factor);
    if (this.settings.runtimeMethod === "words") {
      this.settings.wordsPerMinute = rates.wordsPerMinute;
      this.settings.pauseWords = rates.pauses;
      new Notice(`Runtime now estimated at ${rates.wordsPerMinute} words a minute, with pauses ${factor > 1 ? "longer" : "shorter"} to match.`);
    } else {
      this.settings.minutesPerPage = rates.minutesPerPage;
      new Notice(`Runtime now estimated at ${rates.minutesPerPage} minutes a page.`);
    }
    await this.saveData(this.settings);
    for (const view of this.scriptViews()) view.refreshPages();
  }

  /** Turns typewriter mode on or off in every script, and remembers it. */
  private toggleTypewriter(): void {
    this.settings.typewriter = !this.settings.typewriter;
    void this.saveData(this.settings);
    for (const view of this.scriptViews()) view.refreshTypewriter();
  }

  private toggleChangeTint(): void {
    this.settings.showChanges = !this.settings.showChanges;
    // Nothing else depends on this; the tint is redrawn below.
    void this.saveData(this.settings);
    this.retint();
    new Notice(this.settings.showChanges ? "Tinting lines changed since the draft each script is compared with." : "Stopped tinting changed lines.");
  }

  /**
   * Keeps the tint on changed lines up to date in each open script while
   * it's on: compared again a moment after you stop typing, and when the
   * script is compared with another draft or a draft is frozen.
   */
  private tintChanges(): void {
    const { workspace } = this.app;
    const watched = new Map<FountainView, { unsubscribe: () => void; timer: number | null; run: number }>();
    const tint = async (view: FountainView) => {
      const entry = watched.get(view);
      if (!entry) return;
      const run = ++entry.run;
      if (!this.settings.showChanges) {
        view.showChangedLines(null);
        return;
      }
      try {
        const result = await this.changes.compare(view);
        if (run === entry.run) view.showChangedLines(result?.comparison.changedLines ?? null);
      } catch (error) {
        console.error("[fountain-stage] couldn't compare with the draft", error);
      }
    };
    const tintSoon = (view: FountainView, delay: number) => {
      const entry = watched.get(view);
      if (!entry) return;
      if (entry.timer !== null) window.clearTimeout(entry.timer);
      entry.timer = window.setTimeout(() => {
        entry.timer = null;
        void tint(view);
      }, delay);
    };
    const forget = (view: FountainView) => {
      const entry = watched.get(view);
      if (!entry) return;
      entry.unsubscribe();
      if (entry.timer !== null) window.clearTimeout(entry.timer);
      watched.delete(view);
    };
    // Follows scripts as they open and close.
    const sync = () => {
      const open = new Set(this.scriptViews());
      for (const view of [...watched.keys()]) if (!open.has(view)) forget(view);
      for (const view of open) {
        if (watched.has(view)) continue;
        const entry = { unsubscribe: () => undefined as unknown, timer: null, run: 0 };
        watched.set(view, entry);
        entry.unsubscribe = view.subscribe((change) => change === "text" && this.settings.showChanges && tintSoon(view, CHANGE_TINT_DELAY_MS));
        if (this.settings.showChanges) tintSoon(view, 0);
      }
    };
    this.retint = () => {
      for (const view of watched.keys()) tintSoon(view, 0);
    };
    workspace.onLayoutReady(() => {
      sync();
      this.registerEvent(workspace.on("layout-change", sync));
    });
    this.register(this.changes.onChange((view) => (view ? tintSoon(view, 0) : this.retint())));
    this.register(() => {
      for (const view of [...watched.keys()]) forget(view);
    });
  }

  /** Saves the report on a script as a Markdown note beside it, replacing an earlier one, and opens it. */
  private async saveReport(view: FountainView): Promise<void> {
    const file = view.file;
    if (!file) return;
    const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const method = this.settings.runtimeMethod === "words" ? "the words spoken" : "the number of pages";
    const text = reportMarkdown(this.reportOf(view), { title: file.basename, date, method, castSize: this.settings.castSize || undefined });
    const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
    const path = normalizePath(`${folder}${file.basename} - Report.md`);
    try {
      const { vault, workspace } = this.app;
      const existing = vault.getAbstractFileByPath(path);
      let note: TFile;
      if (existing instanceof TFile) {
        await vault.process(existing, () => text);
        note = existing;
      } else if (existing) {
        throw new Error(`${path} is a folder`);
      } else {
        note = await vault.create(path, text);
      }
      await workspace.getLeaf("tab").openFile(note);
      new Notice(`Saved the report as ${note.name}`);
    } catch (error) {
      console.error("[fountain-stage] couldn't save the report", error);
      new Notice(`Couldn't save the report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Shows the Search scripts panel, opening it in the left sidebar if it isn't open yet, with the cursor in its search box. Text selected on one line of a script becomes the search. */
  private async showSearch(): Promise<void> {
    const { workspace } = this.app;
    const selected = workspace.getActiveViewOfType(FountainView)?.selectedText() ?? "";
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false) ?? workspace.getLeaf("split");
      await leaf.setViewState({ type: VIEW_TYPE_SEARCH, active: true });
    }
    await workspace.revealLeaf(leaf);
    if (leaf.view instanceof SearchView) leaf.view.focusSearch(selected && !selected.includes("\n") ? selected : undefined);
  }

  /** Shows the script outline, opening it in the right sidebar if it isn't open yet. Without `reveal`, it's opened but not brought into view. */
  private async showOutline(reveal = true): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OUTLINE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf("split");
      await leaf.setViewState({ type: VIEW_TYPE_OUTLINE, active: false });
    }
    if (reveal) await workspace.revealLeaf(leaf);
  }

  /**
   * Opens the outline in the right sidebar the first time a script is open
   * in the vault. Only once: after that, Obsidian keeps it where you leave
   * it, and if you close it, it stays closed until Show script outline. On
   * a phone it's added to the sidebar without opening the sidebar over the
   * script.
   */
  private addOutlineOnce(): void {
    const { workspace } = this.app;
    const add = () => {
      if (this.settings.outlineAdded || !workspace.getActiveViewOfType(FountainView)) return;
      this.settings.outlineAdded = true;
      // Nothing else depends on this, so there's nothing to refresh.
      void this.saveData(this.settings);
      if (workspace.getLeavesOfType(VIEW_TYPE_OUTLINE).length === 0) void this.showOutline(!Platform.isMobile);
    };
    workspace.onLayoutReady(() => {
      add();
      this.registerEvent(workspace.on("active-leaf-change", add));
    });
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
