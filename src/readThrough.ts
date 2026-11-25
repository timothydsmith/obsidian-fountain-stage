/**
 * Timing a read-through: tap Next scene as each scene ends, and each
 * scene's time is kept. At the end the times go in the readings note
 * beside the script, with the estimate for each scene, and you can adjust
 * the runtime estimate to match (see ./fountain/readings).
 */

import { type App, Modal, normalizePath, Notice, Setting, TFile } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { buildOutline } from "./fountain/outline";
import { addReading, calibrationFactor, clockTime, describeFactor, type Reading, readingsName, type SceneTime } from "./fountain/readings";
import { type SceneRange, scriptScenes } from "./fountain/report";
import { formatDuration, type Timeline } from "./fountain/runtime";
import { longDate, plainTitle } from "./fountain/titlePage";

export interface ReadThroughHost {
  timelineOf(view: FountainView): Timeline | undefined;
  /** How the estimate is worked out, for the note: "at 150 words a minute". */
  methodDescription(): string;
  /** Scales the runtime estimate so it takes `factor` times as long. */
  calibrate(factor: number): void;
}

interface ReadThrough {
  path: string;
  started: Date;
  scenes: SceneRange[];
  /** The scene being read. */
  index: number;
  /** Seconds each scene took, by index, for those read. */
  times: Map<number, number>;
  /** When the current scene's clock started, less any time paused. */
  sceneStart: number;
  /** When it was paused, if it is. */
  pausedAt: number | null;
  timer: number;
}

const STRIP = "read-through";

/** "22 November 2026, 14:05". */
function when(date: Date): string {
  return `${longDate(date)}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export class ReadThroughs {
  private current: ReadThrough | null = null;

  constructor(
    private readonly app: App,
    private readonly host: ReadThroughHost,
    private readonly scriptViews: () => FountainView[],
  ) {}

  running(): boolean {
    return this.current !== null;
  }

  /** Starts timing at the scene the cursor is in, or the first. */
  start(view: FountainView): void {
    if (!view.file) return;
    if (this.current) {
      new Notice("A read-through is already being timed. Finish or cancel it first.");
      return;
    }
    const scenes = scriptScenes(view.script(), buildOutline(view.getViewData(), view.isAct()));
    if (scenes.length === 0) {
      new Notice("This script has nothing to read yet.");
      return;
    }
    const line = view.cursorLine().line;
    let index = 0;
    scenes.forEach((scene, i) => {
      if (scene.line <= line) index = i;
    });
    this.current = {
      path: view.file.path,
      started: new Date(),
      scenes,
      index,
      times: new Map(),
      sceneStart: Date.now(),
      pausedAt: null,
      timer: window.setInterval(() => this.show(), 1000),
    };
    view.scrollLineToTop(scenes[index].line);
    this.show();
  }

  /** Ends the scene being read and starts the next, or finishes after the last. */
  next(): void {
    const rt = this.current;
    if (!rt) return;
    if (rt.index >= rt.scenes.length - 1) {
      void this.finish();
      return;
    }
    this.endScene(rt);
    rt.index++;
    rt.sceneStart = Date.now();
    rt.pausedAt = null;
    this.viewOf(rt)?.scrollLineToTop(rt.scenes[rt.index].line);
    this.show();
  }

  /** Stops the clock for a break, or starts it again. */
  pause(): void {
    const rt = this.current;
    if (!rt) return;
    if (rt.pausedAt === null) rt.pausedAt = Date.now();
    else {
      rt.sceneStart += Date.now() - rt.pausedAt;
      rt.pausedAt = null;
    }
    this.show();
  }

  /** Stops timing without keeping anything. */
  cancel(): void {
    const rt = this.current;
    if (!rt) return;
    window.clearInterval(rt.timer);
    this.current = null;
    for (const view of this.scriptViews()) view.strip(STRIP, false);
  }

  /** Ends the scene being read, keeps the times in the readings note, and offers to calibrate. */
  async finish(): Promise<void> {
    const rt = this.current;
    if (!rt) return;
    this.endScene(rt);
    const view = this.viewOf(rt);
    this.cancel();
    if (!view?.file) {
      new Notice("The script was closed, so the read-through's times couldn't be kept.");
      return;
    }
    const timeline = this.host.timelineOf(view);
    if (!timeline) {
      new Notice("The runtime estimate isn't ready yet, so the read-through couldn't be compared with it. Try again in a moment.");
      return;
    }
    const scenes: SceneTime[] = [...rt.times.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, read]) => {
        const scene = rt.scenes[i];
        const end = scene.endLine === undefined ? timeline.total : timeline.at(scene.endLine);
        return { title: `${scene.sceneNumber ? `${scene.sceneNumber}. ` : ""}${scene.title}`, read, estimate: Math.max(end - timeline.at(scene.line), 0) };
      });
    if (scenes.length === 0) return;
    const script = view.script();
    const reading: Reading = {
      when: when(rt.started),
      draft: script.titleValues.draft?.join(" "),
      method: this.host.methodDescription(),
      scenes,
    };
    const title = plainTitle(script) || view.file.basename;
    const folder = view.file.parent && !view.file.parent.isRoot() ? `${view.file.parent.path}/` : "";
    const path = normalizePath(`${folder}${readingsName(title)}.md`);
    try {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await this.app.vault.process(existing, (text) => addReading(text, title, reading));
      else await this.app.vault.create(path, addReading("", title, reading));
    } catch (error) {
      console.error("[fountain-stage] couldn't save the reading", error);
      new Notice(`Couldn't save the reading to ${path}.`);
    }
    new CalibrateModal(this.app, scenes, path, (factor) => this.host.calibrate(factor)).open();
  }

  private endScene(rt: ReadThrough): void {
    const now = rt.pausedAt ?? Date.now();
    const seconds = (now - rt.sceneStart) / 1000;
    if (seconds >= 1) rt.times.set(rt.index, (rt.times.get(rt.index) ?? 0) + seconds);
  }

  private viewOf(rt: ReadThrough): FountainView | undefined {
    return this.scriptViews().find((v) => v.file?.path === rt.path);
  }

  /** The strip on each view of the script being read. */
  private show(): void {
    const rt = this.current;
    if (!rt) return;
    const now = rt.pausedAt ?? Date.now();
    const scene = (now - rt.sceneStart) / 1000;
    const total = [...rt.times.values()].reduce((sum, s) => sum + s, 0) + scene;
    const last = rt.index >= rt.scenes.length - 1;
    const { title, sceneNumber } = rt.scenes[rt.index];
    for (const view of this.scriptViews()) {
      if (view.file?.path !== rt.path) {
        view.strip(STRIP, false);
        continue;
      }
      const el = view.strip(STRIP, true)!;
      el.createSpan({ cls: "fountain-stage-strip-label", text: "Read-through" });
      const status = rt.pausedAt === null ? clockTime(scene) : "paused";
      el.createSpan({
        cls: "fountain-stage-strip-text",
        text: `Scene ${rt.index + 1} of ${rt.scenes.length}: ${sceneNumber ? `${sceneNumber}. ` : ""}${title} · ${status} · ${clockTime(total)} in all`,
      });
      const button = (text: string, run: () => void, cta = false) => {
        const b = el.createEl("button", { text });
        if (cta) b.addClass("mod-cta");
        b.addEventListener("click", run);
      };
      button(last ? "Finish" : "Next scene", () => this.next(), true);
      button(rt.pausedAt === null ? "Pause" : "Resume", () => this.pause());
      if (!last) button("Finish", () => void this.finish());
      button("Cancel", () => this.cancel());
    }
  }
}

/** Says how the reading compared with the estimate, and offers to adjust it. */
class CalibrateModal extends Modal {
  constructor(
    app: App,
    private readonly scenes: SceneTime[],
    private readonly path: string,
    private readonly onCalibrate: (factor: number) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Read-through timed");
    const read = this.scenes.reduce((sum, s) => sum + s.read, 0);
    const estimate = this.scenes.reduce((sum, s) => sum + s.estimate, 0);
    const factor = calibrationFactor(this.scenes);
    const count = `${this.scenes.length} ${this.scenes.length === 1 ? "scene" : "scenes"}`;
    this.contentEl.createEl("p", {
      text: `${count} read in ${formatDuration(read)}, against an estimate of ${formatDuration(estimate)}. The times are kept in ${this.path}.`,
    });
    if (factor === undefined || Math.round(Math.abs(factor - 1) * 100) === 0) {
      this.contentEl.createEl("p", { text: factor === undefined ? "There was nothing to compare." : "The estimate was right." });
      new Setting(this.contentEl).addButton((b) => b.setButtonText("Close").setCta().onClick(() => this.close()));
      return;
    }
    this.contentEl.createEl("p", {
      text: `The reading ran ${describeFactor(factor)} than the estimate. Adjust the runtime estimate to match? Every script's runtime changes with it.`,
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Keep the estimate").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Adjust")
          .setCta()
          .onClick(() => {
            this.onCalibrate(factor);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
