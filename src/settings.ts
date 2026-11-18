/**
 * Fountain Stage's settings tab: page breaks and runtime in the editor, and the
 * styles and fonts folders and what's in them. Drawn from
 * getSettingDefinitions(), which also puts the settings in Obsidian's settings
 * search.
 */

import { type App, normalizePath, type Plugin, PluginSettingTab, type Setting, type SettingDefinitionItem } from "obsidian";
import type { Library, LoadedFonts, FountainStageSettings } from "./library";
import { PauseWordsModal } from "./pauseWordsModal";
import type { LoadedStyles } from "./pdf/userStyles";
import { listFamilies } from "./pdf/vaultFonts";

const FOLDER_PLACEHOLDER = "Folder in your vault";
const RUNTIME_METHODS = { words: "Words spoken", pages: "Pages" };

/** A positive number, or the reason it isn't. */
const positive = (n: number): string | undefined => (Number.isFinite(n) && n > 0 ? undefined : "Enter a number more than 0.");

export class FountainStageSettingTab extends PluginSettingTab {
  private refreshTimer: number | null = null;

  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: FountainStageSettings,
    private readonly save: () => Promise<void>,
    private readonly library: Library,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const byWords = () => this.settings.runtimeMethod === "words";
    return [
      {
        type: "group",
        heading: "Page breaks and runtime",
        items: [
          {
            name: "Show page breaks",
            desc: "Show where the PDF's pages break, with each page's number, in Live Preview and reading view.",
            control: { type: "toggle", key: "showPageBreaks" },
          },
          {
            name: "Style for page breaks",
            desc: "Pages break as they would in this style, unless a script's title page names one with a Style key.",
            render: (setting) => this.addStyleDropdown(setting),
          },
          {
            name: "Estimate runtime from",
            desc: "Words spoken counts dialogue at a speaking rate, stage directions at half that, and the pauses a script asks for, such as (beat) or Silence. Pages counts minutes per page of the PDF.",
            aliases: ["Running time", "Length"],
            control: { type: "dropdown", key: "runtimeMethod", options: RUNTIME_METHODS },
          },
          {
            name: "Words per minute",
            desc: "How fast the dialogue is spoken.",
            visible: byWords,
            control: { type: "number", key: "wordsPerMinute", min: 1, placeholder: "150", validate: positive },
          },
          {
            name: "Minutes per page",
            desc: "How long a page of the PDF runs.",
            visible: () => !byWords(),
            control: { type: "number", key: "minutesPerPage", min: 0, step: "any", placeholder: "1", validate: positive },
          },
          {
            name: "Pause words",
            desc: "Add time where a script asks for a pause, such as beat or silence.",
            aliases: ["Beat", "Silence", "Moment"],
            visible: byWords,
            render: (setting) => this.pauseWordsRow(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "PDF export",
        items: [
          {
            name: "Styles folder",
            desc: "JSON files of your own styles. Each one extends another style and changes only what differs.",
            control: { type: "folder", key: "stylesFolder", placeholder: FOLDER_PLACEHOLDER },
          },
          {
            name: "Fonts folder",
            desc: "Font files (.ttf or .otf) for styles that name a font family, such as Palatino for APT.",
            control: { type: "folder", key: "fontsFolder", placeholder: FOLDER_PLACEHOLDER },
          },
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
    // The styles and fonts found, once typing in a folder setting pauses.
    if (folder) this.refreshSoon();
  }

  hide(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
  }

  private refreshSoon(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.update();
    }, 500);
  }

  /** Puts what `fill` draws in a row's description, in place of what's there. */
  private async fillDesc(setting: Setting, fill: (el: HTMLElement) => Promise<void>): Promise<void> {
    const el = createDiv();
    await fill(el);
    setting.descEl.empty();
    setting.descEl.appendChild(el);
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
  private pauseWordsRow(setting: Setting): void {
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
          () => this.update(),
        ).open();
      }),
    );
  }

  private styleList(el: HTMLElement, { styles, problems }: LoadedStyles): void {
    const listEl = el.createEl("ul", { cls: "fountain-stage-settings-list" });
    for (const style of styles) {
      const item = listEl.createEl("li");
      item.createSpan({ text: style.name });
      item.createSpan({ cls: "fountain-stage-settings-detail", text: ` (Style: ${style.id}) ${style.source ?? "built in"}` });
    }
    for (const problem of problems) {
      const item = listEl.createEl("li", { cls: "fountain-stage-settings-problem" });
      item.createSpan({ text: `${problem.path} is left out:` });
      const reasons = item.createEl("ul");
      for (const message of problem.messages) reasons.createEl("li", { text: message });
    }
  }

  private fontList(el: HTMLElement, { fonts, problems }: LoadedFonts): void {
    const listEl = el.createEl("ul", { cls: "fountain-stage-settings-list" });
    const families = listFamilies(fonts);
    if (families.length === 0 && problems.length === 0) {
      listEl.createEl("li", { cls: "fountain-stage-settings-detail", text: "No fonts yet. PDFs use the standard fonts every PDF reader has." });
    }
    for (const { family, count } of families) {
      listEl.createEl("li", { text: `${family} (${count} ${count === 1 ? "face" : "faces"})` });
    }
    for (const { path, message } of problems) {
      listEl.createEl("li", { cls: "fountain-stage-settings-problem", text: `${path} ${message}.` });
    }
  }
}
