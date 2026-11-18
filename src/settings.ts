/**
 * Playwright's settings tab: page breaks and runtime in the editor, and the
 * styles and fonts folders and what's in them. Obsidian 1.13 and later draw
 * it from getSettingDefinitions(), which puts the settings in Obsidian's
 * settings search; older versions draw it with display().
 */

import {
  AbstractInputSuggest,
  type App,
  normalizePath,
  type Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  TFolder,
} from "obsidian";
import type { Library, LoadedFonts, PlaywrightSettings } from "./library";
import { PauseWordsModal } from "./pauseWordsModal";
import type { LoadedStyles } from "./pdf/userStyles";
import { listFamilies } from "./pdf/vaultFonts";

/** Each setting's name and description, the same in both ways of drawing the tab. */
const TEXT = {
  showPageBreaks: ["Show page breaks", "Show where the PDF's pages break, with each page's number, in Live Preview and reading view."],
  pageBreakStyle: ["Style for page breaks", "Pages break as they would in this style, unless a script's title page names one with a Style key."],
  runtimeMethod: [
    "Estimate runtime from",
    "Words spoken counts dialogue at a speaking rate, stage directions at half that, and the pauses a script asks for, such as (beat) or Silence. Pages counts minutes per page of the PDF.",
  ],
  wordsPerMinute: ["Words per minute", "How fast the dialogue is spoken."],
  minutesPerPage: ["Minutes per page", "How long a page of the PDF runs."],
  pauseWords: ["Pause words", "Add time where a script asks for a pause, such as beat or silence."],
  stylesFolder: ["Styles folder", "JSON files of your own styles. Each one extends another style and changes only what differs."],
  fontsFolder: ["Fonts folder", "Font files (.ttf or .otf) for styles that name a font family, such as Palatino for APT."],
} as const;

const FOLDER_PLACEHOLDER = "Folder in your vault";
const RUNTIME_METHODS = { words: "Words spoken", pages: "Pages" };

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    private readonly input: HTMLInputElement,
  ) {
    super(app, input);
  }

  getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && !f.isRoot() && f.path.toLowerCase().includes(q))
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path);
    this.input.dispatchEvent(new Event("input"));
    this.close();
  }
}

/** A positive number, or the reason it isn't. */
const positive = (n: number): string | undefined => (Number.isFinite(n) && n > 0 ? undefined : "Enter a number more than 0.");

export class PlaywrightSettingTab extends PluginSettingTab {
  private refreshTimer: number | null = null;

  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: PlaywrightSettings,
    private readonly save: () => Promise<void>,
    private readonly library: Library,
  ) {
    super(app, plugin);
  }

  // --- Obsidian 1.13 and later -----------------------------------------------

  getSettingDefinitions(): SettingDefinitionItem[] {
    const byWords = () => this.settings.runtimeMethod === "words";
    return [
      {
        type: "group",
        heading: "Page breaks and runtime",
        items: [
          { name: TEXT.showPageBreaks[0], desc: TEXT.showPageBreaks[1], control: { type: "toggle", key: "showPageBreaks" } },
          { name: TEXT.pageBreakStyle[0], desc: TEXT.pageBreakStyle[1], render: (setting) => this.addStyleDropdown(setting) },
          {
            name: TEXT.runtimeMethod[0],
            desc: TEXT.runtimeMethod[1],
            aliases: ["Running time", "Length"],
            control: { type: "dropdown", key: "runtimeMethod", options: RUNTIME_METHODS },
          },
          {
            name: TEXT.wordsPerMinute[0],
            desc: TEXT.wordsPerMinute[1],
            visible: byWords,
            control: { type: "number", key: "wordsPerMinute", min: 1, placeholder: "150", validate: positive },
          },
          {
            name: TEXT.minutesPerPage[0],
            desc: TEXT.minutesPerPage[1],
            visible: () => !byWords(),
            control: { type: "number", key: "minutesPerPage", min: 0, step: "any", placeholder: "1", validate: positive },
          },
          {
            name: TEXT.pauseWords[0],
            desc: TEXT.pauseWords[1],
            aliases: ["Beat", "Silence", "Moment"],
            visible: byWords,
            render: (setting) => this.pauseWordsRow(setting, () => this.update()),
          },
        ],
      },
      {
        type: "group",
        heading: "PDF export",
        items: [
          { name: TEXT.stylesFolder[0], desc: TEXT.stylesFolder[1], control: { type: "folder", key: "stylesFolder", placeholder: FOLDER_PLACEHOLDER } },
          { name: TEXT.fontsFolder[0], desc: TEXT.fontsFolder[1], control: { type: "folder", key: "fontsFolder", placeholder: FOLDER_PLACEHOLDER } },
        ],
      },
      {
        type: "group",
        heading: "Styles",
        items: [
          {
            name: "Styles found",
            desc: "The built-in styles, and those in your styles folder.",
            aliases: ["Style key"],
            render: (setting) => void this.fillDesc(setting, async (el) => this.styleList(el, await this.library.loadStyles())),
          },
        ],
      },
      {
        type: "group",
        heading: "Fonts",
        items: [
          {
            name: "Font families found",
            desc: "The font families in your fonts folder.",
            render: (setting) => void this.fillDesc(setting, async (el) => this.fontList(el, await this.library.loadFonts())),
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.settings as unknown as Record<string, unknown>;
    const folder = key === "stylesFolder" || key === "fontsFolder";
    if (folder) {
      const path = typeof value === "string" ? value.trim() : "";
      settings[key] = path ? normalizePath(path) : "";
    } else if (key === "runtimeMethod") {
      settings[key] = value === "pages" ? "pages" : "words";
    } else {
      settings[key] = value;
    }
    await this.save();
    // Words per minute or minutes per page, and pause words, show by the method.
    if (key === "runtimeMethod") this.refreshDomState();
    if (folder) this.refreshSoon(() => this.update());
  }

  /** Puts what `fill` draws in a row's description, in place of what's there. */
  private async fillDesc(setting: Setting, fill: (el: HTMLElement) => Promise<void>): Promise<void> {
    const el = createDiv();
    await fill(el);
    setting.descEl.empty();
    setting.descEl.appendChild(el);
  }

  // --- Obsidian before 1.13 ------------------------------------------------

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.editorSettings(containerEl);

    new Setting(containerEl).setName("PDF export").setHeading();
    this.folderSetting(containerEl, "stylesFolder");
    this.folderSetting(containerEl, "fontsFolder");

    this.stylesEl = containerEl.createDiv();
    this.fontsEl = containerEl.createDiv();
    void this.showLists();
  }

  private editorSettings(containerEl: HTMLElement): void {
    const { settings } = this;
    new Setting(containerEl).setName("Page breaks and runtime").setHeading();
    new Setting(containerEl)
      .setName(TEXT.showPageBreaks[0])
      .setDesc(TEXT.showPageBreaks[1])
      .addToggle((toggle) =>
        toggle.setValue(settings.showPageBreaks).onChange(async (value) => {
          settings.showPageBreaks = value;
          await this.save();
        }),
      );
    this.addStyleDropdown(new Setting(containerEl).setName(TEXT.pageBreakStyle[0]).setDesc(TEXT.pageBreakStyle[1]));

    new Setting(containerEl)
      .setName(TEXT.runtimeMethod[0])
      .setDesc(TEXT.runtimeMethod[1])
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(RUNTIME_METHODS)
          .setValue(settings.runtimeMethod)
          .onChange(async (value) => {
            settings.runtimeMethod = value === "pages" ? "pages" : "words";
            await this.save();
            this.display();
          }),
      );
    if (settings.runtimeMethod === "words") {
      this.numberSetting(containerEl, "wordsPerMinute", 150);
      this.pauseWordsRow(new Setting(containerEl).setName(TEXT.pauseWords[0]), () => this.display());
    } else {
      this.numberSetting(containerEl, "minutesPerPage", 1);
    }
  }

  private numberSetting(containerEl: HTMLElement, key: "wordsPerMinute" | "minutesPerPage", fallback: number): void {
    new Setting(containerEl)
      .setName(TEXT[key][0])
      .setDesc(TEXT[key][1])
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.setPlaceholder(String(fallback)).setValue(String(this.settings[key])).onChange(async (value) => {
          const n = Number(value);
          this.settings[key] = value.trim() !== "" && positive(n) === undefined ? n : fallback;
          await this.save();
        });
      });
  }

  private folderSetting(containerEl: HTMLElement, key: "stylesFolder" | "fontsFolder"): void {
    new Setting(containerEl)
      .setName(TEXT[key][0])
      .setDesc(TEXT[key][1])
      .addText((text) => {
        new FolderSuggest(this.app, text.inputEl);
        text.setPlaceholder(FOLDER_PLACEHOLDER).setValue(this.settings[key]).onChange(async (value) => {
          this.settings[key] = value.trim() ? normalizePath(value.trim()) : "";
          await this.save();
          this.refreshSoon(() => void this.showLists());
        });
      });
  }

  private stylesEl?: HTMLElement;
  private fontsEl?: HTMLElement;
  /** Counts redraws, so a slow one that a newer one has overtaken draws nothing. */
  private generation = 0;

  private async showLists(): Promise<void> {
    const generation = ++this.generation;
    const [styles, fonts] = await Promise.all([this.library.loadStyles(), this.library.loadFonts()]);
    if (generation !== this.generation || !this.stylesEl || !this.fontsEl) return;
    this.stylesEl.empty();
    this.fontsEl.empty();
    new Setting(this.stylesEl).setName("Styles").setHeading();
    this.styleList(this.stylesEl, styles);
    new Setting(this.fontsEl).setName("Fonts").setHeading();
    this.fontList(this.fontsEl, fonts);
  }

  // --- Shared --------------------------------------------------------------

  hide(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
  }

  /** Runs `redraw` once typing in a folder setting pauses. */
  private refreshSoon(redraw: () => void): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      redraw();
    }, 500);
  }

  /** The style dropdown, once the styles (built in and the vault's) are loaded. */
  private addStyleDropdown(setting: Setting): void {
    const { settings } = this;
    void this.library.loadStyles().then(({ styles }) => {
      setting.addDropdown((dropdown) => {
        for (const style of styles) dropdown.addOption(style.id, style.name);
        if (!styles.some((style) => style.id === settings.pageBreakStyle)) dropdown.addOption(settings.pageBreakStyle, settings.pageBreakStyle);
        dropdown.setValue(settings.pageBreakStyle).onChange(async (value) => {
          settings.pageBreakStyle = value;
          await this.save();
        });
      });
    });
  }

  /** A summary of the pause words, with a button to the page where they're edited. */
  private pauseWordsRow(setting: Setting, onClosed: () => void): void {
    const words = this.settings.pauseWords.map((w) => w.word).filter(Boolean);
    const list = words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
    setting.setDesc(words.length === 0 ? "No words add pauses." : `Add time where a script asks for a pause: ${list}.`).addButton((button) =>
      button.setButtonText("Edit").onClick(() => {
        new PauseWordsModal(
          this.app,
          this.settings.pauseWords,
          (changed) => {
            this.settings.pauseWords = changed;
            void this.save();
          },
          onClosed,
        ).open();
      }),
    );
  }

  private styleList(el: HTMLElement, { styles, problems }: LoadedStyles): void {
    const listEl = el.createEl("ul", { cls: "playwright-settings-list" });
    for (const style of styles) {
      const item = listEl.createEl("li");
      item.createSpan({ text: style.name });
      item.createSpan({ cls: "playwright-settings-detail", text: ` (Style: ${style.id}) ${style.source ?? "built in"}` });
    }
    for (const problem of problems) {
      const item = listEl.createEl("li", { cls: "playwright-settings-problem" });
      item.createSpan({ text: `${problem.path} is left out:` });
      const reasons = item.createEl("ul");
      for (const message of problem.messages) reasons.createEl("li", { text: message });
    }
  }

  private fontList(el: HTMLElement, { fonts, problems }: LoadedFonts): void {
    const listEl = el.createEl("ul", { cls: "playwright-settings-list" });
    const families = listFamilies(fonts);
    if (families.length === 0 && problems.length === 0) {
      listEl.createEl("li", { cls: "playwright-settings-detail", text: "No fonts yet. PDFs use the standard fonts every PDF reader has." });
    }
    for (const { family, count } of families) {
      listEl.createEl("li", { text: `${family} (${count} ${count === 1 ? "face" : "faces"})` });
    }
    for (const { path, message } of problems) {
      listEl.createEl("li", { cls: "playwright-settings-problem", text: `${path} ${message}.` });
    }
  }
}
