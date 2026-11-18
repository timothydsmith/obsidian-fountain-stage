import { Notice, Plugin, TFile } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { PositionStore } from "./editor/positions";
import { exportScript, type ExportOptions } from "./export";
import { FOUNTAIN_EXTENSION, untitledScriptPath } from "./files";
import { DEFAULT_SETTINGS, Library, type PlaywrightSettings } from "./library";
import { PlaywrightSettingTab } from "./settings";

/** Local-storage key (scoped to this vault by Obsidian) for where you were in each script. */
const POSITIONS_KEY = "playwright-positions";

export default class PlaywrightPlugin extends Plugin {
  private positions!: PositionStore;
  private playwrightSettings: PlaywrightSettings = { ...DEFAULT_SETTINGS };
  private library!: Library;

  async onload(): Promise<void> {
    this.playwrightSettings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<PlaywrightSettings> | null) };
    this.library = new Library(this.app, () => this.playwrightSettings);
    this.addSettingTab(new PlaywrightSettingTab(this.app, this, this.playwrightSettings, () => this.saveData(this.playwrightSettings), this.library));

    this.positions = new PositionStore({
      load: () => this.app.loadLocalStorage(POSITIONS_KEY),
      save: (data) => this.app.saveLocalStorage(POSITIONS_KEY, data),
    });
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.positions.rename(oldPath, file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.positions.delete(file.path)));

    this.registerView(
      VIEW_TYPE_FOUNTAIN,
      (leaf) => new FountainView(leaf, this.positions, (view) => view.file && void this.exportPdf(view.file)),
    );

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

    const exportCommand = (id: string, name: string, options: ExportOptions) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (file?.extension !== FOUNTAIN_EXTENSION) return false;
          if (!checking) void this.exportPdf(file, options);
          return true;
        },
      });
    exportCommand("export-pdf", "Export to PDF", {});
    exportCommand("export-pdf-choose-style", "Export to PDF in a chosen style", { chooseStyle: true });

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
  private async exportPdf(file: TFile, options: ExportOptions = {}): Promise<void> {
    const open = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FOUNTAIN)
      .map((leaf) => leaf.view)
      .find((view): view is FountainView => view instanceof FountainView && view.file?.path === file.path);
    const source = open ? open.getViewData() : await this.app.vault.read(file);
    await exportScript(this.app, this.library, file, source, options);
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
