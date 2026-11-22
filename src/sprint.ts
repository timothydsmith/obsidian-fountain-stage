/**
 * Sprints: write against the clock for a set time, with a count of the
 * words added to the script since the sprint began. It shows in a strip at
 * the top of the script, and says how it went when the time is up.
 */

import { type App, Modal, Notice, Setting, TFile } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { clockTime } from "./fountain/readings";
import { countWords, wordChange } from "./fountain/runtime";

interface Sprint {
  path: string;
  minutes: number;
  /** Words in the script when the sprint began. */
  startWords: number;
  startedAt: number;
  endsAt: number;
  timer: number;
}

const STRIP = "sprint";

export class Sprints {
  private current: Sprint | null = null;

  constructor(
    private readonly app: App,
    private readonly lastMinutes: () => number,
    private readonly rememberMinutes: (minutes: number) => void,
    private readonly scriptViews: () => FountainView[],
  ) {}

  running(): boolean {
    return this.current !== null;
  }

  /** Asks how long, then starts a sprint on the script. */
  start(view: FountainView): void {
    if (!view.file) return;
    if (this.current) {
      new Notice("A sprint is already going. Stop it first.");
      return;
    }
    new SprintModal(this.app, this.lastMinutes(), (minutes) => {
      if (!view.file) return;
      this.rememberMinutes(minutes);
      const now = Date.now();
      this.current = {
        path: view.file.path,
        minutes,
        startWords: countWords(view.getViewData()),
        startedAt: now,
        endsAt: now + minutes * 60_000,
        timer: window.setInterval(() => void this.tick(), 1000),
      };
      this.show();
    }).open();
  }

  /** Stops the sprint before its time, saying how it went. */
  async stop(): Promise<void> {
    await this.finish(false);
  }

  /** Stops the sprint without a word, as the plugin unloads. */
  cancel(): void {
    if (!this.current) return;
    window.clearInterval(this.current.timer);
    this.current = null;
    for (const view of this.scriptViews()) view.strip(STRIP, false);
  }

  private async tick(): Promise<void> {
    if (!this.current) return;
    if (Date.now() >= this.current.endsAt) await this.finish(true);
    else this.show();
  }

  /** Words in the sprint's script now: from an open view, or the file. */
  private async wordsNow(sprint: Sprint): Promise<number | undefined> {
    const view = this.scriptViews().find((v) => v.file?.path === sprint.path);
    if (view) return countWords(view.getViewData());
    const file = this.app.vault.getAbstractFileByPath(sprint.path);
    return file instanceof TFile ? countWords(await this.app.vault.cachedRead(file)) : undefined;
  }

  /** The strip on each view of the sprint's script, and none on others. */
  private show(): void {
    const sprint = this.current;
    if (!sprint) return;
    const left = sprint.endsAt - Date.now();
    for (const view of this.scriptViews()) {
      if (view.file?.path !== sprint.path) {
        view.strip(STRIP, false);
        continue;
      }
      const el = view.strip(STRIP, true)!;
      el.createSpan({ cls: "fountain-stage-strip-label", text: "Sprint" });
      el.createSpan({
        cls: "fountain-stage-strip-text",
        text: `${clockTime(Math.max(0, Math.ceil(left / 1000)))} left · ${wordChange(countWords(view.getViewData()) - sprint.startWords)}`,
      });
      el.createEl("button", { text: "Stop" }).addEventListener("click", () => void this.stop());
    }
  }

  private async finish(timeUp: boolean): Promise<void> {
    const sprint = this.current;
    if (!sprint) return;
    window.clearInterval(sprint.timer);
    this.current = null;
    for (const view of this.scriptViews()) view.strip(STRIP, false);
    const words = await this.wordsNow(sprint);
    const minutes = Math.round((Math.min(Date.now(), sprint.endsAt) - sprint.startedAt) / 60_000);
    const written = words === undefined ? "" : `${wordChange(words - sprint.startWords)} in `;
    const length = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    new Notice(timeUp ? `Sprint over: ${written}${length}.` : `Sprint stopped: ${written}${length}.`, timeUp ? 0 : undefined);
  }
}

class SprintModal extends Modal {
  private value: string;

  constructor(
    app: App,
    minutes: number,
    private readonly onStart: (minutes: number) => void,
  ) {
    super(app);
    this.value = String(minutes);
  }

  onOpen(): void {
    this.setTitle("Start a sprint");
    new Setting(this.contentEl)
      .setName("Minutes")
      .setDesc("How long to write for. The words you add are counted as you go.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.setValue(this.value).onChange((value) => (this.value = value));
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" && !evt.isComposing) {
            evt.preventDefault();
            this.start();
          }
        });
        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 0);
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Start").setCta().onClick(() => this.start()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private start(): void {
    const minutes = Number(this.value);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      new Notice("Give the sprint a number of minutes.");
      return;
    }
    this.onStart(minutes);
    this.close();
  }
}
