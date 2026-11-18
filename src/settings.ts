/** Playwright's settings tab: page breaks and runtime in the editor, and the styles and fonts folders and what's in them. */

import { AbstractInputSuggest, type App, normalizePath, type Plugin, PluginSettingTab, Setting, TFolder } from "obsidian";
import type { Library, LoadedFonts, PlaywrightSettings } from "./library";
import { PauseWordsModal } from "./pauseWordsModal";
import type { LoadedStyles } from "./pdf/userStyles";
import { listFamilies } from "./pdf/vaultFonts";

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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.editorSettings(containerEl);

    new Setting(containerEl).setName("PDF export").setHeading();
    this.folderSetting(containerEl, "Styles folder", "JSON files of your own styles. Each one extends another style and changes only what differs.", "stylesFolder");
    this.folderSetting(containerEl, "Fonts folder", "Font files (.ttf or .otf) for styles that name a font family, such as Palatino for APT.", "fontsFolder");

    this.stylesEl = containerEl.createDiv();
    this.fontsEl = containerEl.createDiv();
    void this.showLists();
  }

  private editorSettings(containerEl: HTMLElement): void {
    const { settings } = this;
    new Setting(containerEl).setName("Page breaks and runtime").setHeading();
    new Setting(containerEl)
      .setName("Show page breaks")
      .setDesc("Show where the PDF's pages break, with each page's number, in Live Preview and reading view.")
      .addToggle((toggle) =>
        toggle.setValue(settings.showPageBreaks).onChange(async (value) => {
          settings.showPageBreaks = value;
          await this.save();
        }),
      );
    const styleSetting = new Setting(containerEl)
      .setName("Style for page breaks")
      .setDesc("Pages break as they would in this style, unless a script's title page names one with a Style key.");
    void this.library.loadStyles().then(({ styles }) => {
      styleSetting.addDropdown((dropdown) => {
        for (const style of styles) dropdown.addOption(style.id, style.name);
        if (!styles.some((style) => style.id === settings.pageBreakStyle)) dropdown.addOption(settings.pageBreakStyle, settings.pageBreakStyle);
        dropdown.setValue(settings.pageBreakStyle).onChange(async (value) => {
          settings.pageBreakStyle = value;
          await this.save();
        });
      });
    });

    new Setting(containerEl)
      .setName("Estimate runtime from")
      .setDesc("Words spoken counts dialogue at a speaking rate, stage directions at half that, and the pauses a script asks for, such as (beat) or Silence. Pages counts minutes per page of the PDF.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("words", "Words spoken")
          .addOption("pages", "Pages")
          .setValue(settings.runtimeMethod)
          .onChange(async (value) => {
            settings.runtimeMethod = value === "pages" ? "pages" : "words";
            await this.save();
            this.display();
          }),
      );
    if (settings.runtimeMethod === "words") {
      this.numberSetting(containerEl, "Words per minute", "How fast the dialogue is spoken.", "wordsPerMinute", 150);
      this.pauseSettings(containerEl);
    } else {
      this.numberSetting(containerEl, "Minutes per page", "How long a page of the PDF runs.", "minutesPerPage", 1);
    }
  }

  private numberSetting(containerEl: HTMLElement, name: string, desc: string, key: "wordsPerMinute" | "minutesPerPage", fallback: number): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.setPlaceholder(String(fallback)).setValue(String(this.settings[key])).onChange(async (value) => {
          const n = Number(value);
          this.settings[key] = value.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
          await this.save();
        });
      });
  }

  /** A summary of the pause words, with a button to the page where they're edited. */
  private pauseSettings(containerEl: HTMLElement): void {
    const words = this.settings.pauseWords.map((w) => w.word).filter(Boolean);
    const list = words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
    new Setting(containerEl)
      .setName("Pause words")
      .setDesc(words.length === 0 ? "No words add pauses." : `Add time where a script asks for a pause: ${list}.`)
      .addButton((button) =>
        button.setButtonText("Edit").onClick(() => {
          new PauseWordsModal(
            this.app,
            this.settings.pauseWords,
            (changed) => {
              this.settings.pauseWords = changed;
              void this.save();
            },
            () => this.display(),
          ).open();
        }),
      );
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
    this.showStyles(this.stylesEl, styles);
    this.showFonts(this.fontsEl, fonts);
  }

  hide(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
  }

  private folderSetting(containerEl: HTMLElement, name: string, desc: string, key: "stylesFolder" | "fontsFolder"): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        new FolderSuggest(this.app, text.inputEl);
        text.setPlaceholder("Folder in your vault").setValue(this.settings[key]).onChange(async (value) => {
          this.settings[key] = value.trim() ? normalizePath(value.trim()) : "";
          await this.save();
          this.refreshSoon();
        });
      });
  }

  /** Redraws the lists of styles and fonts once typing in a folder setting pauses. */
  private refreshSoon(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.showLists();
    }, 500);
  }

  private showStyles(el: HTMLElement, { styles, problems }: LoadedStyles): void {
    new Setting(el).setName("Styles").setHeading();
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

  private showFonts(el: HTMLElement, { fonts, problems }: LoadedFonts): void {
    new Setting(el).setName("Fonts").setHeading();
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
