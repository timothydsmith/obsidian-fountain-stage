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
import { ScriptTabView } from "./scriptTabView";
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
import { longDate } from "./fountain/titlePage";
import { type CommandTable, registerCommands, scriptMenuItems } from "./commands";
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

type RehearsalAction = "lock" | "unlock" | "issue";

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
  /** Every command, for the palette and the More options menu. */
  private commands!: CommandTable;
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

    this.commands = this.commandTable();
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
          changeCutsFile: (change) => void this.cuts.change(change).catch(() => undefined),
          menuItems: (view) => scriptMenuItems(this.commands, view),
          typewriterMode: () => this.settings.typewriter,
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
          showBeatMap: (view) => void this.showScriptTab(VIEW_TYPE_BEAT_MAP, view),
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

    try {
      this.registerExtensions([FOUNTAIN_EXTENSION], VIEW_TYPE_FOUNTAIN);
    } catch (error) {
      // Only one plugin can claim an extension. Another Fountain plugin
      // (such as "Fountain") that loaded first will have taken it.
      console.error("[fountain-stage] could not register .fountain files", error);
      new Notice("Fountain Stage can't open .fountain files because another plugin already does. Turn that plugin off, then reload Fountain Stage.", 0);
    }

    registerCommands(this, this.commands);
    this.addRibbonIcon("drama", "New script", () => this.newScript());
    // Offered once, the first time the plugin loads in a vault with no scripts.
    this.app.workspace.onLayoutReady(() => void offerSetUp(this.app, this.settings, () => this.saveData(this.settings)));

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

  /**
   * Every command, in the order the palette's search finds them among
   * themselves and the menu shows them. Ids never change; names follow the
   * rules in ROADMAP.md (verbs first, no articles, toggles as "Toggle …").
   */
  private commandTable(): CommandTable {
    const { app } = this;
    const { cuts } = this;
    /** A script you're writing: not a frozen draft, cuts file or line bank. */
    const working = (view: FountainView) => !!view.file && !view.isDraft() && !cuts.isLineBank(view.file);
    /** A script with drafts to compare: not a line bank or cuts file. */
    const comparable = (view: FountainView) => !!view.file && !cuts.isLineBank(view.file) && !cuts.isCutsFile(view.file);
    const rehearsal = (action: RehearsalAction) => ({
      appliesTo: (view: FountainView) => this.rehearsalActions(view).includes(action),
      run: (view: FountainView) => this.rehearse(view, action),
    });
    return {
      app: [
        { id: "new-script", name: "New script", icon: "file-plus", run: () => void this.newScript() },
        { id: "set-up-play", name: "Set up a play", icon: "folder-plus", run: () => setUpPlay(app, this.settings) },
        { id: "show-outline", name: "Show script outline", icon: "list-tree", menu: "panels", run: () => void this.showOutline() },
        { id: "search-scripts", name: "Search scripts", icon: "search", run: () => void this.showSearch() },
        { id: "stop-sprint", name: "Stop sprint", icon: "square", available: () => this.sprints.running(), run: () => void this.sprints.stop() },
        { id: "read-through-next-scene", name: "Go on to next scene in read-through", icon: "skip-forward", available: () => this.readThroughs.running(), run: () => this.readThroughs.next() },
        { id: "read-through-pause", name: "Pause or resume read-through", icon: "pause", available: () => this.readThroughs.running(), run: () => this.readThroughs.pause() },
        { id: "read-through-finish", name: "Finish read-through", icon: "flag", available: () => this.readThroughs.running(), run: () => void this.readThroughs.finish() },
        { id: "table-read-next", name: "Go on in table read", icon: "skip-forward", available: () => this.tableReads.running(), run: () => this.tableReads.next() },
        { id: "table-read-pause", name: "Pause or resume table read", icon: "pause", available: () => this.tableReads.running(), run: () => this.tableReads.pause() },
        { id: "table-read-stop", name: "Stop table read", icon: "square", available: () => this.tableReads.running(), run: () => this.tableReads.stop() },
      ],
      script: [
        // Modes and editing. Obsidian's own mode commands only work in notes;
        // their hotkeys work in scripts too (see FountainView).
        { id: "toggle-reading-view", name: "Toggle reading view", icon: "book-open", run: (view) => view.toggleReading() },
        { id: "toggle-source-mode", name: "Toggle source mode", icon: "code", run: (view) => view.toggleSource() },
        { id: "find-in-script", name: "Find in script", icon: "search", run: (view) => view.find() },
        // For touch keyboards, which have no Tab key: these can go on the mobile toolbar.
        { id: "next-line-type", name: "Change to next line type", icon: "chevrons-right", run: (view) => view.cycleLineType(1) },
        { id: "previous-line-type", name: "Change to previous line type", icon: "chevrons-left", run: (view) => view.cycleLineType(-1) },

        // Drafts.
        { id: "freeze-draft", name: "Freeze draft", icon: "snowflake", menu: "drafts", appliesTo: working, run: (view) => this.freezeDraft(view) },
        { id: "unfreeze-draft", name: "Unfreeze draft", icon: "lock-open", menu: "drafts", appliesTo: (view) => view.isFrozen(), run: (view) => view.unfreeze() },
        { id: "cut-from-draft", name: "Cut from this draft", icon: "scissors", menu: "drafts", appliesTo: working, run: (view) => void cuts.cut(view) },
        { id: "restore-cut", name: "Restore cut", icon: "undo-2", menu: "drafts", appliesTo: (view) => !!view.file && cuts.isCutsFile(view.file), run: (view) => cuts.restore(view) },
        { id: "show-changes", name: "Show changes since a draft", icon: "git-compare", menu: "drafts", appliesTo: comparable, run: (view) => void this.showScriptTab(VIEW_TYPE_CHANGES, view) },
        {
          id: "side-by-side",
          name: "Show side by side with a draft",
          icon: "columns-2",
          menu: "drafts",
          // Phones have no room for two scripts side by side.
          appliesTo: (view) => !Platform.isPhone && comparable(view),
          run: (view) => void this.sideBySide.open(view),
        },
        { id: "tint-changes", name: "Toggle change tint", icon: "highlighter", menu: "drafts", appliesTo: comparable, isOn: () => this.settings.showChanges, run: () => this.toggleChangeTint() },
        { id: "add-to-line-bank", name: "Add to line bank", icon: "archive", appliesTo: working, run: (view) => addToLineBank(app, cuts, view) },
        { id: "drop-from-line-bank", name: "Insert line from line bank", icon: "archive-restore", appliesTo: working, run: (view) => void dropFromLineBank(app, cuts, view) },
        { id: "keep-alternate", name: "Keep as alternate", icon: "copy-plus", run: (view) => keepAsAlternate(view) },
        { id: "next-alternate", name: "Switch to next alternate", icon: "repeat", run: (view) => nextAlternate(view) },
        { id: "choose-alternate", name: "Choose alternate", icon: "list", run: (view) => chooseAlternate(app, view) },
        { id: "start-pass", name: "Start pass", icon: "square-check", appliesTo: working, run: (view) => this.passes.start(view) },
        { id: "open-passes", name: "Open passes note", icon: "file-check", appliesTo: working, run: (view) => void this.passes.open(view) },

        // Rehearsal.
        { id: "issue-revised-pages", name: "Issue revised pages", icon: "file-stack", menu: "rehearsal", ...rehearsal("issue") },
        { id: "lock-rehearsal-script", name: "Lock rehearsal script", icon: "lock", menu: "rehearsal", ...rehearsal("lock") },
        { id: "unlock-rehearsal-script", name: "Unlock rehearsal script", icon: "lock-open", menu: "rehearsal", ...rehearsal("unlock") },

        // Scenes and structure.
        { id: "next-scene", name: "Go to next scene", icon: "chevrons-down", run: (view) => jumpToScene(view, 1) },
        { id: "previous-scene", name: "Go to previous scene", icon: "chevrons-up", run: (view) => jumpToScene(view, -1) },
        { id: "next-speech", name: "Go to this character's next speech", icon: "chevron-down", run: (view) => jumpToSpeech(view, 1) },
        { id: "previous-speech", name: "Go to this character's previous speech", icon: "chevron-up", run: (view) => jumpToSpeech(view, -1) },
        { id: "move-scene-up", name: "Move scene up", icon: "arrow-up", run: (view) => moveSceneBy(view, -1) },
        { id: "move-scene-down", name: "Move scene down", icon: "arrow-down", run: (view) => moveSceneBy(view, 1) },
        { id: "split-scene", name: "Split scene", icon: "split", run: (view) => splitSceneAtCursor(app, view) },
        { id: "merge-scene", name: "Merge with previous scene", icon: "merge", run: (view) => mergeWithPreviousScene(view) },
        { id: "renumber-scenes", name: "Renumber scenes", icon: "list-ordered", run: (view) => this.renumberScenes(view) },
        { id: "set-play-target", name: "Set runtime target for the play", icon: "timer", appliesTo: working, run: (view) => setPlayTarget(app, view) },
        { id: "set-target", name: "Set runtime target for this scene", icon: "timer", appliesTo: working, run: (view) => setTargetHere(app, view) },

        // The story outline: planning beats and scenes.
        { id: "import-framework", name: "Import framework", icon: "layout-template", run: (view) => void importFramework(app, view, this.settings.frameworksFolder) },
        { id: "add-beat", name: "Add beat", icon: "plus", run: (view) => addBeatAfter(app, view, itemAtCursor(view)) },
        { id: "add-scene", name: "Add scene", icon: "plus", run: (view) => addSceneTo(app, view, itemAtCursor(view)) },
        {
          id: "edit-synopsis",
          name: "Edit synopsis",
          icon: "text",
          run: (view) => {
            const item = itemAtCursor(view);
            if (item) editSynopsis(app, view, item);
            else new Notice("Put the cursor in a beat, scene or act to write its synopsis.");
          },
        },
        {
          id: "create-linked-note",
          name: "Create or open linked note",
          icon: "file-text",
          run: (view) => {
            const item = itemAtCursor(view);
            if (item) void openLinkedNote(app, view, item, this.settings.beatNotesFolder);
            else new Notice("Put the cursor in a beat, scene or act to link a note to it.");
          },
        },

        // Cast.
        { id: "rename-character", name: "Rename character", icon: "users", menu: "cast", run: (view) => renameCharacter(app, view) },
        { id: "merge-characters", name: "Merge characters", icon: "merge", menu: "cast", run: (view) => mergeCharacters(app, view) },
        { id: "generate-breakdown", name: "Write cast list and scene breakdown", icon: "list-plus", menu: "cast", run: (view) => generateBreakdown(view) },
        { id: "show-on-stage", name: "Show who's on stage", icon: "users-round", menu: "cast", run: (view) => this.onStage.show(view) },

        // Panels.
        { id: "show-report", name: "Show script report", icon: "table", menu: "panels", run: (view) => void this.showScriptTab(VIEW_TYPE_REPORT, view) },
        { id: "save-report", name: "Save script report as note", icon: "file-text", run: (view) => void this.saveReport(view) },
        { id: "show-checks", name: "Show checks", icon: "list-checks", menu: "panels", appliesTo: comparable, run: (view) => void this.showScriptTab(VIEW_TYPE_CHECKS, view) },
        { id: "mark-check-findings", name: "Toggle check marks", icon: "underline", isOn: () => this.settings.showCheckMarks, run: () => this.setCheckMarks(!this.settings.showCheckMarks, true) },
        { id: "show-beat-map", name: "Show beat map", icon: "gantt-chart", menu: "panels", run: (view) => void this.showScriptTab(VIEW_TYPE_BEAT_MAP, view) },

        // Focus and readings.
        { id: "toggle-typewriter", name: "Toggle typewriter mode", icon: "type", menu: "focus", isOn: () => this.settings.typewriter, run: () => this.toggleTypewriter() },
        { id: "start-sprint", name: "Start sprint", icon: "hourglass", menu: "focus", appliesTo: working, run: (view) => this.sprints.start(view) },
        { id: "time-read-through", name: "Time read-through", icon: "clock", menu: "focus", run: (view) => this.readThroughs.start(view) },
        { id: "table-read", name: "Start table read", icon: "volume-2", menu: "focus", run: (view) => void this.tableReads.start(view) },

        // Export. The file's own menu has it, so not this one.
        { id: "export-pdf", name: "Export to PDF", icon: "file-down", appliesTo: (view) => !!view.file, run: (view) => view.file && void this.exportPdf(view.file) },
      ],
    };
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

  /**
   * Shows a script in one of its tabs (the report, changes, checks or beat
   * map) beside it, opening the tab if it isn't open: to the right, or
   * below for the beat map, which is wide.
   */
  private async showScriptTab(type: string, view: FountainView): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("split", type === VIEW_TYPE_BEAT_MAP ? "horizontal" : "vertical");
      await leaf.setViewState({ type, active: false });
    }
    if (leaf.view instanceof ScriptTabView) leaf.view.setScript(view);
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

  /** Which of locking and unlocking the rehearsal script, and issuing revised pages, apply to a script. */
  private rehearsalActions(view: FountainView): RehearsalAction[] {
    const file = view.file;
    if (!file || this.cuts.isLineBank(file) || this.cuts.isCutsFile(file)) return [];
    if (view.isDraft()) return (view.script().titleValues.locked ?? []).join("").trim() ? ["unlock"] : ["lock"];
    if (!this.rehearsal.isLocked(view)) return ["lock"];
    return ["issue", "lock", "unlock"];
  }

  /** Locks or unlocks a script's rehearsal script, or issues revised pages, then shows the pages as they now are. */
  private rehearse(view: FountainView, action: RehearsalAction): void {
    const done = () => {
      this.changes.changed();
      for (const v of this.scriptViews()) v.refreshPages();
    };
    if (action === "lock") void this.rehearsal.lock(view, done);
    else if (action === "unlock") void this.rehearsal.unlock(view, done);
    else void this.rehearsal.issue(view, done);
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
    const date = longDate(new Date());
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
