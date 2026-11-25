/**
 * The beat map: the script you're in as a timeline, left to right. Scenes
 * are cards as wide as they run (or all the same width, for shuffling), with
 * their action beats along the bottom; story beats are bands above them; and
 * a framework's beats are marked where they usually fall. Drag a scene to
 * move it, or a beat band to move the beat. Click anything to go there.
 */

import { Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import type { FountainView, ScriptChange } from "./editor/FountainView";
import { type BeatMapLayout, layoutBeatMap, type MapBeat, type MapScene } from "./fountain/beatMap";
import type { Framework } from "./fountain/frameworks";
import type { OutlineItem } from "./fountain/outline";
import { formatDuration, outlineRuntimes, type Timeline } from "./fountain/runtime";
import { buildStoryOutline } from "./fountain/storyOutline";
import { loadFrameworks, scriptFramework } from "./planningCommands";
import { ScriptTabView } from "./scriptTabView";

export const VIEW_TYPE_BEAT_MAP = "fountain-stage-beat-map";

/** The map catches up sooner than the other tabs, as dragging on it changes the script. */
const REFRESH_DELAY_MS = 400;
/** How wide the average scene is drawn, by runtime, before zooming. */
const AVERAGE_SCENE_WIDTH = 160;
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const NO_FRAMEWORK = "";
const TARGET_ROW_HEIGHT = 18;

export class BeatMapView extends ScriptTabView {
  protected refreshDelay = REFRESH_DELAY_MS;
  private zoom = 3;
  /** The framework marked, by id: the script's own (its Framework key) until you choose another. */
  private frameworkId: string | null = null;
  private frameworks: Framework[] = [];
  private dragged: OutlineItem | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: {
      timelineOf: (script: FountainView) => Timeline | undefined;
      moveScene: (script: FountainView, sceneLine: number, targetLine: number, after: boolean) => void;
      moveBeat: (script: FountainView, beatLine: number, targetLine: number, after: boolean) => void;
      equalWidths: () => boolean;
      setEqualWidths: (equal: boolean) => void;
      frameworksFolder: () => string;
    },
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_BEAT_MAP;
  }

  getDisplayText(): string {
    return this.script?.file ? `Beat map: ${this.script.file.basename}` : "Beat map";
  }

  getIcon(): string {
    return "gantt-chart";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("fountain-stage-beat-map");
    await super.onOpen();
    void this.reloadFrameworks();
  }

  /** The text and its layout, but not scrolling or moving the cursor. */
  protected refreshesOn(change: ScriptChange): boolean {
    return change !== "scroll" && change !== "position";
  }

  /** Another script marks its own framework to start with. */
  protected scriptChanged(): void {
    this.frameworkId = null;
  }

  /** Draws the map again, such as after a setting changes, reading the frameworks folder again too. */
  redraw(): void {
    void this.reloadFrameworks();
  }

  private async reloadFrameworks(): Promise<void> {
    this.frameworks = (await loadFrameworks(this.app, this.host.frameworksFolder())).frameworks;
    this.refresh();
  }

  protected refresh(): void {
    const el = this.contentEl;
    const scroll = el.querySelector(".fountain-stage-map-scroller")?.scrollLeft ?? 0;
    el.empty();
    const script = this.script;
    if (!script?.file) {
      el.createDiv({ cls: "pane-empty", text: "Open a Fountain script to see its beat map." });
      return;
    }
    const timeline = this.host.timelineOf(script);
    const equal = this.host.equalWidths();
    const framework = this.chosenFramework(script);
    this.toolbar(el, equal, framework);
    if (!timeline) {
      el.createDiv({ cls: "pane-empty", text: "Working out the runtime…" });
      return;
    }
    const outline = buildStoryOutline(script.getViewData(), "beat", script.isAct(), script.actionDepth());
    const runtimes = outlineRuntimes(outline, timeline);
    const sceneTimes: number[] = [];
    const collect = (items: OutlineItem[]) =>
      items.forEach((item) => {
        if (item.kind === "scene" && (runtimes.get(item) ?? 0) > 0) sceneTimes.push(runtimes.get(item) ?? 0);
        collect(item.children);
      });
    collect(outline);
    if (outline.length === 0) {
      el.createDiv({ cls: "pane-empty", text: "No beats or scenes yet. Add them in the outline, or insert a framework's beats." });
      return;
    }
    const average = sceneTimes.length > 0 ? sceneTimes.reduce((a, b) => a + b, 0) / sceneTimes.length : 60;
    const layout = layoutBeatMap(outline, runtimes, (line) => timeline.at(line), {
      equal,
      scale: (AVERAGE_SCENE_WIDTH / average) * ZOOMS[this.zoom],
      minWidth: 56,
      cardWidth: 180,
      emptyWidth: 120,
      gap: 6,
    });
    const scroller = el.createDiv({ cls: "fountain-stage-map-scroller" });
    this.draw(scroller, layout, timeline.total, framework);
    scroller.scrollLeft = scroll;
  }

  /** The framework marked: the one you chose, or the one the script names, if it's found. */
  private chosenFramework(script: FountainView): Framework | undefined {
    if (this.frameworkId === NO_FRAMEWORK) return undefined;
    if (this.frameworkId !== null) return this.frameworks.find((f) => f.id === this.frameworkId);
    const named = scriptFramework(script)?.toLowerCase();
    return named ? this.frameworks.find((f) => f.name.toLowerCase() === named) : undefined;
  }

  private toolbar(parentEl: HTMLElement, equal: boolean, framework: Framework | undefined): void {
    const bar = parentEl.createDiv({ cls: "fountain-stage-map-toolbar" });
    const toggle = bar.createEl("label", { cls: "fountain-stage-map-toggle" });
    const box = toggle.createEl("input", { type: "checkbox" });
    box.checked = equal;
    toggle.createSpan({ text: "Equal widths" });
    box.addEventListener("change", () => this.host.setEqualWidths(box.checked));

    const pick = bar.createEl("label", { cls: "fountain-stage-map-framework" });
    pick.createSpan({ text: "Mark beats of" });
    const select = pick.createEl("select", { cls: "dropdown" });
    select.createEl("option", { text: "No framework", value: NO_FRAMEWORK });
    for (const f of this.frameworks) select.createEl("option", { text: f.name, value: f.id });
    select.value = framework?.id ?? NO_FRAMEWORK;
    select.addEventListener("change", () => {
      this.frameworkId = select.value;
      this.refresh();
    });

    if (!equal) {
      const zoom = bar.createDiv({ cls: "fountain-stage-map-zoom" });
      const button = (icon: string, label: string, step: number) => {
        const b = zoom.createDiv({ cls: "clickable-icon", attr: { "aria-label": label } });
        setIcon(b, icon);
        const next = this.zoom + step;
        b.toggleClass("is-disabled", next < 0 || next >= ZOOMS.length);
        b.addEventListener("click", () => {
          if (next < 0 || next >= ZOOMS.length) return;
          this.zoom = next;
          this.refresh();
        });
      };
      button("zoom-out", "Zoom out", -1);
      button("zoom-in", "Zoom in", 1);
    }
  }

  private draw(parentEl: HTMLElement, layout: BeatMapLayout, total: number, framework: Framework | undefined): void {
    const pad = 12;
    const canvas = parentEl.createDiv({ cls: "fountain-stage-map-canvas" });
    canvas.style.width = `${layout.width + pad * 2}px`;
    const row = (cls: string) => {
      const r = canvas.createDiv({ cls: `fountain-stage-map-row ${cls}` });
      r.style.paddingLeft = `${pad}px`;
      return r;
    };
    const place = (target: HTMLElement, x: number, width?: number) => {
      target.style.left = `${x + pad}px`;
      if (width !== undefined) target.style.width = `${Math.max(width, 2)}px`;
    };

    const targets = framework ? framework.beats.filter((beat) => beat.position !== undefined) : [];
    if (targets.length > 0) {
      const labels = row("fountain-stage-map-targets");
      // Labels that would run into the one before go on a row below, as many rows as it takes.
      const rowEnds: number[] = [];
      for (const beat of targets) {
        // Before anything is written, there is no runtime to place them by, so they spread across the map.
        const x = layout.timed ? layout.xAt((beat.position ?? 0) * total) : (beat.position ?? 0) * layout.width;
        const label = labels.createDiv({ cls: "fountain-stage-map-target-label", text: beat.name });
        label.setAttribute("aria-label", `${beat.name}, usually ${Math.round((beat.position ?? 0) * 100)}% of the way through. ${beat.description}`);
        place(label, x);
        let level = rowEnds.findIndex((end) => end < x);
        if (level < 0) level = rowEnds.push(0) - 1;
        rowEnds[level] = x + label.offsetWidth + 6;
        label.style.top = `${level * TARGET_ROW_HEIGHT}px`;
        const line = canvas.createDiv({ cls: "fountain-stage-map-target-line" });
        place(line, x);
        line.style.top = `${level * TARGET_ROW_HEIGHT + 4}px`;
      }
      labels.style.height = `${rowEnds.length * TARGET_ROW_HEIGHT}px`;
    }

    if (layout.acts.length > 0) {
      const acts = row("fountain-stage-map-acts");
      for (const act of layout.acts) {
        const marker = acts.createDiv({ cls: "fountain-stage-map-act", text: act.item.text });
        place(marker, act.x);
        marker.addEventListener("click", () => this.reveal(act.item));
      }
    }

    for (let level = 0; level < layout.levels; level++) {
      const beats = row("fountain-stage-map-beats");
      for (const beat of layout.beats.filter((b) => b.level === level)) this.drawBeat(beats, beat, place, framework, total);
    }

    const scenes = row("fountain-stage-map-scenes");
    for (const scene of layout.scenes) this.drawScene(scenes, scene, place);
  }

  private drawBeat(parentEl: HTMLElement, beat: MapBeat, place: (el: HTMLElement, x: number, width?: number) => void, framework: Framework | undefined, total: number): void {
    const band = parentEl.createDiv({ cls: "fountain-stage-map-beat" });
    band.toggleClass("is-empty", beat.empty);
    place(band, beat.x, beat.width);
    band.createDiv({ cls: "fountain-stage-map-beat-name", text: beat.item.text });
    const meta = beat.empty ? "No scenes yet" : formatDuration(beat.runtime);
    band.createDiv({ cls: "fountain-stage-map-beat-meta", text: meta });
    const tip = [beat.item.text, beat.item.synopsis].filter(Boolean);
    const target = framework?.beats.find((b) => b.name.toLowerCase() === beat.item.text.toLowerCase() && b.position !== undefined);
    if (target && total > 0 && this.script) {
      const actual = this.host.timelineOf(this.script)?.at(beat.item.line) ?? 0;
      tip.push(`Starts ${Math.round((actual / total) * 100)}% of the way through; ${framework?.name} puts it at ${Math.round((target.position ?? 0) * 100)}%.`);
    }
    band.setAttribute("aria-label", tip.join("\n"));
    band.addEventListener("click", () => this.reveal(beat.item));
    this.dragAndDrop(band, beat.item);
  }

  private drawScene(parentEl: HTMLElement, scene: MapScene, place: (el: HTMLElement, x: number, width?: number) => void): void {
    const card = parentEl.createDiv({ cls: "fountain-stage-map-scene" });
    card.toggleClass("is-empty", scene.runtime <= 0);
    place(card, scene.x, scene.width);
    const head = card.createDiv({ cls: "fountain-stage-map-scene-head" });
    if (scene.item.sceneNumber) head.createSpan({ cls: "fountain-stage-map-scene-number", text: `${scene.item.sceneNumber}. ` });
    head.createSpan({ text: scene.item.text });
    if (scene.item.synopsis) card.createDiv({ cls: "fountain-stage-map-scene-synopsis", text: scene.item.synopsis });
    card.createDiv({ cls: "fountain-stage-map-scene-runtime", text: scene.runtime > 0 ? formatDuration(scene.runtime) : "Not written yet" });
    card.setAttribute("aria-label", [scene.item.text, scene.item.synopsis].filter(Boolean).join("\n"));
    if (scene.actions.length > 0) {
      const strip = card.createDiv({ cls: "fountain-stage-map-actions" });
      for (const action of scene.actions) {
        const segment = strip.createDiv({ cls: "fountain-stage-map-action", text: action.item.text });
        segment.style.left = `${action.x - scene.x}px`;
        segment.style.width = `${Math.max(action.width - 2, 2)}px`;
        segment.setAttribute("aria-label", [action.item.text, action.item.synopsis].filter(Boolean).join("\n"));
        segment.addEventListener("click", (evt) => {
          evt.stopPropagation();
          this.reveal(action.item);
        });
      }
    }
    card.addEventListener("click", () => this.reveal(scene.item));
    this.dragAndDrop(card, scene.item);
  }

  /**
   * Scenes and beats can be dragged: dropped on the left half of a scene or
   * beat, they go before it; on the right half, after it. A scene dropped on
   * a beat's right half goes to the start of that beat. Not on phones and
   * tablets.
   */
  private dragAndDrop(el: HTMLElement, item: OutlineItem): void {
    if (Platform.isMobile || this.script?.isFrozen()) return;
    const after = (evt: DragEvent) => evt.offsetX > el.clientWidth / 2;
    const clear = () => el.removeClasses(["is-drop-before", "is-drop-after"]);
    el.draggable = true;
    el.addEventListener("dragstart", (evt) => {
      evt.stopPropagation();
      this.dragged = item;
      evt.dataTransfer?.setData("text/plain", item.text);
      if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => (this.dragged = null));
    el.addEventListener("dragover", (evt) => {
      if (!this.dragged || this.dragged === item) return;
      evt.preventDefault();
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
      el.toggleClass("is-drop-before", !after(evt));
      el.toggleClass("is-drop-after", after(evt));
    });
    el.addEventListener("dragleave", clear);
    el.addEventListener("drop", (evt) => {
      clear();
      const dragged = this.dragged;
      this.dragged = null;
      if (!dragged || dragged === item || !this.script) return;
      evt.preventDefault();
      if (dragged.kind === "section") this.host.moveBeat(this.script, dragged.line, item.line, after(evt));
      else this.host.moveScene(this.script, dragged.line, item.line, after(evt));
    });
  }

  private reveal(item: OutlineItem): void {
    const script = this.script;
    if (!script) return;
    this.app.workspace.setActiveLeaf(script.leaf, { focus: true });
    script.revealLine(item.line);
  }
}
