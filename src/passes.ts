/**
 * Pass checklists in Obsidian: the passes note beside a script, the
 * current pass for the outline, and ticking scenes as you change them.
 */

import { type App, Modal, normalizePath, Notice, Setting, TFile } from "obsidian";
import { type Changes, draftLabel } from "./changes";
import type { FountainView } from "./editor/FountainView";
import { addPass, parsePasses, type Pass, passesName, sceneKeys, setTicked, tickedKeys } from "./fountain/passes";
import { scriptScenes } from "./fountain/report";
import { buildOutline, type OutlineItem } from "./fountain/outline";
import { plainTitle } from "./fountain/titlePage";

const lastPass = (text: string): Pass | undefined => parsePasses(text).pop();

/** How long after you stop typing changed scenes tick themselves. */
const AUTO_TICK_DELAY_MS = 2000;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A script's current pass, as the outline shows it. */
export interface CurrentPass {
  name: string;
  /** The scenes ticked, by key (see sceneKeys). */
  ticked: Set<string>;
  /** How many scenes the pass lists. */
  total: number;
}

interface Watch {
  unsubscribe: () => void;
  timer: number | null;
  run: number;
  /** Scenes (by key) that differed from the draft at the last look, or null before the first. */
  changed: Set<string> | null;
}

export class Passes {
  /** The current pass of each passes note, by its path; null if it has none. */
  private cache = new Map<string, CurrentPass | null>();
  private listeners = new Set<() => void>();
  private watched = new Map<FountainView, Watch>();

  constructor(
    private readonly app: App,
    private readonly changes: Changes,
  ) {}

  /** The passes note beside a script. */
  pathFor(view: FountainView): string | undefined {
    const file = view.file;
    if (!file) return undefined;
    const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
    return normalizePath(`${folder}${passesName(plainTitle(view.script()) || file.basename)}.md`);
  }

  /** Calls `listener` when a passes note changes. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Says a file changed, so a passes note is read again. */
  fileChanged(path: string): void {
    if (!this.cache.has(path)) return;
    this.cache.delete(path);
    for (const listener of this.listeners) listener();
  }

  /** A script's current pass, if its note has been read; reads it if not, and says so when it has. */
  current(view: FountainView): CurrentPass | undefined {
    const path = this.pathFor(view);
    if (!path) return undefined;
    if (this.cache.has(path)) return this.cache.get(path) ?? undefined;
    void this.read(path).then(() => {
      for (const listener of this.listeners) listener();
    });
    return undefined;
  }

  private async read(path: string): Promise<{ file: TFile; text: string; pass: Pass } | undefined> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      this.cache.set(path, null);
      return undefined;
    }
    const text = await this.app.vault.cachedRead(file);
    const pass = lastPass(text);
    this.cache.set(path, pass ? { name: pass.name, ticked: tickedKeys(pass), total: pass.items.length } : null);
    return pass ? { file, text, pass } : undefined;
  }

  /** The keys of a script's scenes, in order. */
  sceneKeysOf(view: FountainView): string[] {
    return sceneKeys(scriptScenes(view.script(), buildOutline(view.getViewData(), view.isAct())).map((s) => s.title));
  }

  /** The key of each scene in an outline, by the line its heading is on. */
  keysByLine(view: FountainView, outline: OutlineItem[]): Map<number, string> {
    const scenes = scriptScenes(view.script(), outline);
    const keys = sceneKeys(scenes.map((s) => s.title));
    return new Map(scenes.map((s, i) => [s.line, keys[i]]));
  }

  /** Asks for a name, then starts a pass listing every scene. */
  start(view: FountainView): void {
    const path = this.pathFor(view);
    if (!path || !view.file) return;
    const scenes = scriptScenes(view.script(), buildOutline(view.getViewData(), view.isAct())).map((s) => s.title);
    if (scenes.length === 0) {
      new Notice("This script has no scenes yet to make a checklist of.");
      return;
    }
    const base = this.changes.baseFor(view);
    new PassNameModal(this.app, path, async (name) => {
      try {
        const play = plainTitle(view.script()) || view.file?.basename || "the play";
        const since = base ? draftLabel(base) : undefined;
        const existing = this.app.vault.getFileByPath(path);
        if (existing) await this.app.vault.process(existing, (text) => addPass(text, play, name, scenes, since));
        else await this.app.vault.create(path, addPass("", play, name, scenes, since));
        this.cache.delete(path);
        // What already differs from the draft doesn't count as this pass's work.
        const watch = this.watched.get(view);
        if (watch) watch.changed = null;
        this.checkSoon(view, 0);
        for (const listener of this.listeners) listener();
        new Notice(`Started ${name}. Tick scenes in the outline, or in ${path}.`);
      } catch (error) {
        new Notice(`Couldn't start the pass: ${message(error)}`);
      }
    }).open();
  }

  /** Ticks or unticks a scene, by its key, in a script's current pass. */
  async tick(view: FountainView, key: string, done: boolean): Promise<void> {
    const path = this.pathFor(view);
    const file = path ? this.app.vault.getFileByPath(path) : null;
    if (!path || !file) return;
    try {
      await this.app.vault.process(file, (text) => {
        const pass = lastPass(text);
        return pass ? setTicked(text, pass, key, done) : text;
      });
      this.cache.delete(path);
      for (const listener of this.listeners) listener();
    } catch (error) {
      new Notice(`Couldn't tick the scene in ${path}: ${message(error)}`);
    }
  }

  /** Opens a script's passes note, if it has one. */
  async open(view: FountainView): Promise<void> {
    const path = this.pathFor(view);
    const file = path ? this.app.vault.getFileByPath(path) : null;
    if (!file) {
      new Notice("No passes yet. Start a pass to make a checklist of scenes.");
      return;
    }
    await this.app.workspace.getLeaf("split", "vertical").openFile(file);
  }

  /** Watches open scripts as they open and close, so scenes you change tick themselves. */
  sync(views: FountainView[]): void {
    const open = new Set(views);
    for (const view of [...this.watched.keys()]) if (!open.has(view)) this.forget(view);
    for (const view of open) {
      if (this.watched.has(view) || view.isDraft() || view.file?.extension !== "fountain") continue;
      const watch: Watch = { unsubscribe: () => undefined, timer: null, run: 0, changed: null };
      this.watched.set(view, watch);
      watch.unsubscribe = view.subscribe((change) => change === "text" && this.checkSoon(view, AUTO_TICK_DELAY_MS));
      this.checkSoon(view, 0);
    }
  }

  private forget(view: FountainView): void {
    const watch = this.watched.get(view);
    if (!watch) return;
    watch.unsubscribe();
    if (watch.timer !== null) window.clearTimeout(watch.timer);
    this.watched.delete(view);
  }

  /** Looks for scenes changed since the last look again, such as when a draft is frozen. */
  recheck(): void {
    for (const [view, watch] of this.watched) {
      watch.changed = null;
      this.checkSoon(view, 0);
    }
  }

  private checkSoon(view: FountainView, delay: number): void {
    const watch = this.watched.get(view);
    if (!watch) return;
    if (watch.timer !== null) window.clearTimeout(watch.timer);
    watch.timer = window.setTimeout(() => {
      watch.timer = null;
      void this.check(view, watch);
    }, delay);
  }

  /**
   * Ticks scenes that have come to differ from the draft since the last
   * look. Scenes that already differed don't tick, so neither does one you
   * untick, until it's frozen and changed again.
   */
  private async check(view: FountainView, watch: Watch): Promise<void> {
    const run = ++watch.run;
    const path = this.pathFor(view);
    if (!path || !this.app.vault.getFileByPath(path)) return;
    try {
      const result = await this.changes.compare(view);
      if (run !== watch.run || !result) return;
      const keys = this.sceneKeysOf(view);
      const changed = new Set<string>();
      result.comparison.scenes.forEach((scene) => {
        if ((scene.status === "changed" || scene.status === "added") && scene.after) changed.add(keys[scene.after.number - 1]);
      });
      const before = watch.changed;
      watch.changed = changed;
      if (!before) return;
      const fresh = [...changed].filter((key) => key && !before.has(key));
      if (fresh.length === 0) return;
      const ticked = (await this.read(path))?.pass;
      if (!ticked) return;
      const already = tickedKeys(ticked);
      for (const key of fresh) if (!already.has(key)) await this.tick(view, key, true);
    } catch (error) {
      console.error("[fountain-stage] couldn't tick changed scenes", error);
    }
  }

  stopAll(): void {
    for (const view of [...this.watched.keys()]) this.forget(view);
  }
}

class PassNameModal extends Modal {
  private name = "";

  constructor(
    app: App,
    private readonly path: string,
    private readonly done: (name: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Start a pass");
    this.contentEl.createEl("p", { text: `A checklist of every scene, added to ${this.path}. Scenes you change from now on tick themselves.` });
    new Setting(this.contentEl).setName("Name").addText((text) => {
      text.setPlaceholder("Dialogue pass").onChange((value) => (this.name = value));
      text.inputEl.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Start").setCta().onClick(() => this.submit()));
  }

  private submit(): void {
    const name = this.name.replace(/\s+/g, " ").trim();
    if (!name) {
      new Notice("Give the pass a name.");
      return;
    }
    this.close();
    void this.done(name);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
