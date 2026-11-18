/** The pause words page of Playwright's settings: which words add pauses to the runtime, and for how long. */

import { type App, ButtonComponent, Modal, setIcon } from "obsidian";
import { defaultPauseWords, LONG_WORDS, normalizeWord, type PauseWord, SHORT_WORDS } from "./fountain/pauses";

/** "a, b or c". */
function either(words: string[]): string {
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

export class PauseWordsModal extends Modal {
  private words: PauseWord[];
  private rowsEl!: HTMLElement;

  constructor(
    app: App,
    words: readonly PauseWord[],
    /** Called with a fresh list on every change. */
    private readonly onChange: (words: PauseWord[]) => void,
    private readonly onClosed: () => void,
  ) {
    super(app);
    this.words = words.map((w) => ({ ...w }));
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle("Pause words");
    contentEl.addClass("playwright-pause-words");

    contentEl.createEl("p", {
      text:
        "When the runtime goes by words spoken, each of these words adds time where a script asks for a pause. " +
        "In a parenthetical, such as (beat) or (a long pause), it always counts. " +
        "In a stage direction, it counts where it stands on its own, as in “Beat.”, “Silence falls.” or “After a pause, she sits”, " +
        "but not in “A moment later” or “She pauses at the door”. Plurals count too.",
    });
    contentEl.createEl("p", {
      text:
        `Each word has three times, in seconds. Short is for when ${either(SHORT_WORDS)} comes before it (“a brief pause”), ` +
        `and Long for ${either(LONG_WORDS)} (“a long silence”). ` +
        "A number multiplies it, so “two beats” is twice a beat. A word can be a phrase, such as “lights fade”.",
    });
    contentEl.createEl("p", {
      cls: "playwright-pause-words-source",
      text: "The defaults for pause and silence follow the Author's Note to Annie Baker's Circle Mirror Transformation.",
    });

    const table = contentEl.createDiv({ cls: "playwright-pause-words-table" });
    const header = table.createDiv({ cls: "playwright-pause-words-row playwright-pause-words-header" });
    for (const label of ["Word", "Seconds", "Short", "Long", ""]) header.createSpan({ text: label });
    this.rowsEl = table.createDiv();
    this.renderRows();

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(buttons).setButtonText("Restore defaults").onClick(() => {
      this.words = defaultPauseWords();
      this.renderRows();
      this.commit();
    });
    new ButtonComponent(buttons)
      .setButtonText("Add a word")
      .setCta()
      .onClick(() => {
        this.words.push({ word: "", seconds: 2, short: 1, long: 4 });
        this.renderRows();
        this.commit();
        this.rowsEl.querySelector<HTMLInputElement>(".playwright-pause-words-row:last-child input")?.focus();
      });
  }

  onClose(): void {
    // A word left blank is dropped.
    const before = this.words.length;
    this.words = this.words.filter((w) => normalizeWord(w.word) !== "");
    if (this.words.length !== before) this.commit();
    this.contentEl.empty();
    this.onClosed();
  }

  private commit(): void {
    this.onChange(this.words.map((w) => ({ ...w })));
  }

  private renderRows(): void {
    this.rowsEl.empty();
    this.words.forEach((pause, i) => {
      const row = this.rowsEl.createDiv({ cls: "playwright-pause-words-row" });

      const word = row.createEl("input", { type: "text", value: pause.word, attr: { "aria-label": "Word", placeholder: "Word" } });
      word.addEventListener("change", () => {
        pause.word = word.value.trim();
        this.commit();
      });

      for (const [key, label] of [
        ["seconds", "Seconds"],
        ["short", "Short"],
        ["long", "Long"],
      ] as const) {
        const input = row.createEl("input", { type: "number", value: String(pause[key]), attr: { "aria-label": `${label} for ${pause.word || "this word"}`, min: "0", step: "0.5" } });
        input.addEventListener("change", () => {
          const n = Number(input.value);
          pause[key] = input.value.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : 0;
          input.value = String(pause[key]);
          this.commit();
        });
      }

      const remove = row.createDiv({ cls: "clickable-icon", attr: { "aria-label": "Remove" } });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => {
        this.words.splice(i, 1);
        this.renderRows();
        this.commit();
      });
    });
  }
}
