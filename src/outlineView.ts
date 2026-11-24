/**
 * The script outline sidebar: the script you're in by act (acts, scenes and
 * action beats) or by beat (story beats, scenes and action beats), how long
 * each runs, and planning: adding beats and scenes, synopses and notes.
 */

import { FileView, ItemView, Menu, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { itemAt, type OutlineItem } from "./fountain/outline";
import { buildStoryOutline, hasBeats, type OutlineBy } from "./fountain/storyOutline";
import { addActionBeat, addBeatAfter, addSceneTo, editSynopsis, importFramework, openLinkedNote } from "./planningCommands";
import { formatDuration, outlineRuntimes, type Timeline } from "./fountain/runtime";
import { headingTargets, playTarget, targetDelta } from "./fountain/targets";
import type { CurrentPass } from "./passes";
import { setHeadingTarget, setPlayTarget } from "./targetCommands";

export const VIEW_TYPE_OUTLINE = "fountain-stage-outline";

/** How long after you stop typing the outline catches up. */
const REFRESH_DELAY_MS = 300;

export class OutlineView extends ItemView {
  /** The script being outlined. */
  private script: FountainView | null = null;
  private unsubscribe: (() => void) | null = null;
  private outline: OutlineItem[] = [];
  private runtimes = new Map<OutlineItem, number>();
  /** Runtime targets, by the line of their heading. */
  private targets = new Map<number, number>();
  private rows = new Map<OutlineItem, HTMLElement>();
  private active: HTMLElement | null = null;
  /** Collapsed items, by their path of headings, so they stay collapsed as you type. */
  private collapsed = new Set<string>();
  private refreshTimer: number | null = null;
  private highlightFrame: number | null = null;

  /** The scene being dragged. */
  private dragged: OutlineItem | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: {
      timelineOf: (script: FountainView) => Timeline | undefined;
      /** Moves the scene whose heading is on `sceneLine` to just before or after the heading on `targetLine`. */
      moveScene: (script: FountainView, sceneLine: number, targetLine: number, after: boolean) => void;
      /** Moves the scene whose heading is on `sceneLine` up or down past the heading next to it. */
      moveSceneBy: (script: FountainView, sceneLine: number, direction: -1 | 1) => void;
      /** The script's current pass, if it has one, and each scene's key in it by the line of its heading. */
      passOf: (script: FountainView, outline: OutlineItem[]) => { pass: CurrentPass; keys: Map<number, string> } | undefined;
      /** Ticks or unticks a scene in the current pass. */
      tick: (script: FountainView, key: string, done: boolean) => void;
      /** Calls `listener` when a passes note changes. */
      onPassesChange: (listener: () => void) => () => void;
      /** Moves the story beat whose heading is on `beatLine`, with all it holds, to just before or after the heading on `targetLine`. */
      moveBeat: (script: FountainView, beatLine: number, targetLine: number, after: boolean) => void;
      /** Whether the outline shows acts or story beats, and changing it. */
      outlineBy: () => OutlineBy;
      setOutlineBy: (by: OutlineBy) => void;
      beatNotesFolder: () => string;
      frameworksFolder: () => string;
      showBeatMap: (script: FountainView) => void;
    },
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OUTLINE;
  }

  getDisplayText(): string {
    return "Script outline";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("fountain-stage-outline");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.follow()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.follow()));
    this.register(this.host.onPassesChange(() => this.refreshSoon()));
    this.app.workspace.onLayoutReady(() => this.follow());
  }

  async onClose(): Promise<void> {
    this.setScript(null);
  }

  /** Draws the outline again, such as after a setting changes. */
  redraw(): void {
    this.refresh();
  }

  /** Follows the script you're in. Another file clears the outline; a sidebar leaves it as it is. */
  private follow(): void {
    const active = this.app.workspace.getActiveViewOfType(FountainView);
    if (active) {
      this.setScript(active);
      return;
    }
    const stillOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN).some((leaf) => leaf.view === this.script);
    const otherFile = this.app.workspace.getActiveViewOfType(FileView);
    if (!stillOpen || otherFile) this.setScript(null);
  }

  private setScript(script: FountainView | null): void {
    if (script === this.script) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelTimers();
    this.script = script;
    if (script) {
      this.unsubscribe = script.subscribe((change) => (change === "scroll" ? undefined : change === "position" ? this.highlightSoon() : this.refreshSoon()));
    }
    this.refresh();
  }

  private refreshSoon(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, REFRESH_DELAY_MS);
  }

  private highlightSoon(): void {
    if (this.highlightFrame !== null) return;
    this.highlightFrame = window.requestAnimationFrame(() => {
      this.highlightFrame = null;
      this.highlight();
    });
  }

  private cancelTimers(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.highlightFrame !== null) window.cancelAnimationFrame(this.highlightFrame);
    this.refreshTimer = this.highlightFrame = null;
  }

  private refresh(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.rows.clear();
    this.active = null;
    if (!this.script?.file) {
      this.outline = [];
      contentEl.createDiv({ cls: "pane-empty", text: "Open a Fountain script to see its outline." });
      return;
    }
    const source = this.script.getViewData();
    const script = this.script.script();
    const by = this.host.outlineBy();
    this.toolbar(contentEl, this.script, by);
    this.outline = buildStoryOutline(source, by, this.script.isAct(), this.script.actionDepth());
    const timeline = this.host.timelineOf(this.script);
    this.runtimes = timeline ? outlineRuntimes(this.outline, timeline) : new Map<OutlineItem, number>();
    const lines: number[] = [];
    const collect = (items: OutlineItem[]) => items.forEach((item) => (lines.push(item.line), collect(item.children)));
    collect(this.outline);
    this.targets = headingTargets(source, script, lines);
    const target = playTarget(script);
    if (target !== undefined && timeline) this.playRow(contentEl, timeline.total, target);
    if (by === "beat" && !hasBeats(script, this.script.actionDepth())) {
      contentEl.createDiv({
        cls: "pane-empty fountain-stage-outline-hint",
        text: "No beats yet. Add one with the + button, insert a framework's beats, or start a line with # in the script.",
      });
    }
    if (this.outline.length === 0) {
      if (by === "act") {
        contentEl.createDiv({
          cls: "pane-empty",
          text: "No acts or scenes yet. Start a line with .ACT ONE for an act, or INT., EXT. or a full stop for a scene heading. Or add a scene with the + button.",
        });
      }
      return;
    }
    const pass = this.host.passOf(this.script, this.outline);
    if (pass) {
      const header = contentEl.createDiv({ cls: "fountain-stage-outline-pass" });
      header.createSpan({ cls: "fountain-stage-outline-pass-name", text: pass.pass.name });
      header.createSpan({ cls: "fountain-stage-outline-pass-count", text: `${pass.pass.ticked.size} of ${pass.pass.total} done` });
    }
    this.renderItems(contentEl.createDiv({ cls: "fountain-stage-outline-tree" }), this.outline, "", pass);
    this.highlight();
  }

  private renderItems(parentEl: HTMLElement, items: OutlineItem[], parentPath: string, pass?: { pass: CurrentPass; keys: Map<number, string> }): void {
    const seen = new Map<string, number>();
    for (const item of items) {
      // Two scenes can share a name, so the path counts repeats.
      const count = (seen.get(item.text) ?? 0) + 1;
      seen.set(item.text, count);
      const path = `${parentPath}/${item.text}#${count}`;
      const collapsed = this.collapsed.has(path);

      const itemEl = parentEl.createDiv({ cls: "tree-item" });
      itemEl.toggleClass("is-collapsed", collapsed);
      const selfEl = itemEl.createDiv({ cls: "tree-item-self is-clickable" });
      selfEl.addClass(`fountain-stage-outline-${item.kind}`);
      // By beat, an act shows where it falls, as a divider.
      const marker = item.kind === "act" && this.host.outlineBy() === "beat";
      selfEl.toggleClass("fountain-stage-outline-act-marker", marker);
      this.rows.set(item, selfEl);

      if (item.children.length > 0) {
        selfEl.addClass("mod-collapsible");
        const toggle = selfEl.createDiv({ cls: "tree-item-icon collapse-icon" });
        toggle.toggleClass("is-collapsed", collapsed);
        setIcon(toggle, "right-triangle");
        toggle.addEventListener("click", (evt) => {
          evt.stopPropagation();
          const nowCollapsed = !this.collapsed.has(path);
          if (nowCollapsed) this.collapsed.add(path);
          else this.collapsed.delete(path);
          itemEl.toggleClass("is-collapsed", nowCollapsed);
          toggle.toggleClass("is-collapsed", nowCollapsed);
        });
      }

      const key = pass?.keys.get(item.line);
      if (pass && key && (item.kind === "scene" || item.kind === "act")) {
        const box = selfEl.createEl("input", { type: "checkbox", cls: "task-list-item-checkbox fountain-stage-outline-tick" });
        box.checked = pass.pass.ticked.has(key);
        box.setAttribute("aria-label", `Done in ${pass.pass.name}`);
        box.addEventListener("click", (evt) => {
          evt.stopPropagation();
          if (this.script) this.host.tick(this.script, key, box.checked);
        });
      }
      const inner = selfEl.createDiv({ cls: "tree-item-inner" });
      if (item.sceneNumber) inner.createSpan({ cls: "fountain-stage-outline-number", text: `${item.sceneNumber}. ` });
      inner.createSpan({ text: item.text });
      if (item.synopsis) inner.createDiv({ cls: "fountain-stage-outline-synopsis", text: item.synopsis });
      if (item.link !== undefined) {
        const note = selfEl.createDiv({ cls: "clickable-icon fountain-stage-outline-note", attr: { "aria-label": `Open ${item.link}` } });
        setIcon(note, "file-text");
        note.addEventListener("click", (evt) => {
          evt.stopPropagation();
          if (this.script) void openLinkedNote(this.app, this.script, item, this.host.beatNotesFolder());
        });
      }
      const runtime = marker ? undefined : this.runtimes.get(item);
      if (runtime !== undefined) {
        const flair = selfEl.createDiv({ cls: "tree-item-flair-outer" });
        const target = this.targets.get(item.line);
        if (target !== undefined) this.showDelta(flair, runtime, target);
        flair.createSpan({ cls: "tree-item-flair fountain-stage-outline-runtime", text: formatDuration(runtime) });
      }
      selfEl.addEventListener("click", () => this.reveal(item));
      selfEl.addEventListener("contextmenu", (evt) => this.showItemMenu(evt, item));
      this.dragAndDrop(selfEl, item);

      if (item.children.length > 0) this.renderItems(itemEl.createDiv({ cls: "tree-item-children" }), item.children, path, pass);
    }
  }

  /**
   * The bar above the outline: whether it shows acts or beats, and buttons
   * to add a beat or scene, insert a framework's beats and open the beat map.
   */
  private toolbar(parentEl: HTMLElement, script: FountainView, by: OutlineBy): void {
    const bar = parentEl.createDiv({ cls: "fountain-stage-outline-toolbar" });
    const views = bar.createDiv({ cls: "fountain-stage-outline-views" });
    for (const [value, label] of [
      ["act", "By act"],
      ["beat", "By beat"],
    ] as const) {
      const button = views.createEl("button", { text: label, cls: "fountain-stage-outline-view" });
      button.toggleClass("is-active", by === value);
      button.setAttribute("aria-pressed", String(by === value));
      button.addEventListener("click", () => {
        if (by !== value) this.host.setOutlineBy(value);
      });
    }
    const actions = bar.createDiv({ cls: "fountain-stage-outline-actions" });
    const action = (icon: string, label: string, run: () => void) => {
      const el = actions.createDiv({ cls: "clickable-icon", attr: { "aria-label": label } });
      setIcon(el, icon);
      el.addEventListener("click", run);
    };
    if (!script.isFrozen()) {
      if (by === "beat") action("plus", "Add beat", () => addBeatAfter(this.app, script));
      else action("plus", "Add scene", () => addSceneTo(this.app, script));
      action("list-plus", "Import framework", () => void importFramework(this.app, script, this.host.frameworksFolder()));
    }
    action("gantt-chart", "Show beat map", () => this.host.showBeatMap(script));
  }

  /** The play's runtime against its target, above the outline. */
  private playRow(parentEl: HTMLElement, runtime: number, target: number): void {
    const row = parentEl.createDiv({ cls: "fountain-stage-outline-play" });
    row.createSpan({ cls: "fountain-stage-outline-play-name", text: "Play" });
    const flair = row.createDiv({ cls: "fountain-stage-outline-play-time" });
    this.showDelta(flair, runtime, target);
    flair.createSpan({ cls: "fountain-stage-outline-runtime", text: formatDuration(runtime) });
    row.addEventListener("contextmenu", (evt) => {
      const script = this.script;
      if (!script || script.isFrozen()) return;
      evt.preventDefault();
      new Menu()
        .addItem((menuItem) =>
          menuItem
            .setTitle("Set runtime target for the play")
            .setIcon("timer")
            .onClick(() => setPlayTarget(this.app, script)),
        )
        .showAtMouseEvent(evt);
    });
  }

  /** How far over or under its target an item runs, before its runtime. */
  private showDelta(parentEl: HTMLElement, runtime: number, target: number): void {
    const delta = targetDelta(runtime, target);
    const text = delta.on ? "on target" : `${formatDuration(delta.seconds)} ${delta.over ? "over" : "under"}`;
    const el = parentEl.createSpan({ cls: "fountain-stage-outline-delta", text });
    el.addClass(delta.on ? "is-on-target" : delta.over ? "is-over" : "is-under");
    el.setAttribute("aria-label", `Target ${formatDuration(target)}`);
  }

  /**
   * An item's menu, on right-click or a long press: its runtime target, and
   * for a scene, moving it up or down, for where dragging doesn't work, such
   * as on a phone.
   */
  private showItemMenu(evt: MouseEvent, item: OutlineItem): void {
    const script = this.script;
    if (!script || script.isFrozen()) return;
    evt.preventDefault();
    const menu = new Menu();
    const add = (title: string, icon: string, run: () => void) => menu.addItem((menuItem) => menuItem.setSection("plan").setTitle(title).setIcon(icon).onClick(run));
    if (item.kind === "section") {
      add("Add scene to this beat", "plus", () => addSceneTo(this.app, script, item));
      add("Add beat after", "plus", () => addBeatAfter(this.app, script, item));
    } else if (item.kind === "act") {
      add("Add scene to this act", "plus", () => addSceneTo(this.app, script, item));
    } else if (item.kind === "scene") {
      add("Add scene after", "plus", () => addSceneTo(this.app, script, item));
      add("Add action beat", "plus", () => addActionBeat(this.app, script, item));
    } else {
      add("Add action beat after", "plus", () => addActionBeat(this.app, script, item));
    }
    add(item.synopsis ? "Edit synopsis" : "Add synopsis", "text", () => editSynopsis(this.app, script, item));
    add(item.link !== undefined ? "Open linked note" : "Create linked note", "file-text", () => void openLinkedNote(this.app, script, item, this.host.beatNotesFolder()));
    if (item.kind === "scene") {
      menu.addItem((menuItem) =>
        menuItem
          .setTitle("Move scene up")
          .setIcon("arrow-up")
          .onClick(() => this.host.moveSceneBy(script, item.line, -1)),
      );
      menu.addItem((menuItem) =>
        menuItem
          .setTitle("Move scene down")
          .setIcon("arrow-down")
          .onClick(() => this.host.moveSceneBy(script, item.line, 1)),
      );
    }
    menu.addItem((menuItem) =>
      menuItem
        .setTitle("Set runtime target")
        .setIcon("timer")
        .onClick(() => setHeadingTarget(this.app, script, item)),
    );
    menu.addItem((menuItem) =>
      menuItem
        .setTitle("Set runtime target for the play")
        .setIcon("timer")
        .onClick(() => setPlayTarget(this.app, script)),
    );
    menu.showAtMouseEvent(evt);
  }

  /**
   * Scenes can be dragged to another place in the outline, and the text
   * moves with them: dropped on the top half of a row, a scene goes before
   * it; on the bottom half, after its heading. Not on phones and tablets,
   * where a long press opens the scene's menu instead.
   */
  private dragAndDrop(rowEl: HTMLElement, item: OutlineItem): void {
    if (Platform.isMobile) return;
    const clear = () => rowEl.removeClasses(["is-drop-before", "is-drop-after"]);
    const after = (evt: DragEvent) => evt.offsetY > rowEl.clientHeight / 2;
    const draggable = item.kind === "scene" || (item.kind === "section" && this.host.outlineBy() === "beat");
    if (draggable && !this.script?.isFrozen()) {
      rowEl.draggable = true;
      rowEl.addEventListener("dragstart", (evt) => {
        this.dragged = item;
        evt.dataTransfer?.setData("text/plain", item.text);
        if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
      });
      rowEl.addEventListener("dragend", () => (this.dragged = null));
    }
    rowEl.addEventListener("dragover", (evt) => {
      if (!this.dragged || this.dragged === item || item.kind === "action") return;
      // A beat goes before or after another beat or a scene, not an act.
      if (this.dragged.kind === "section" && item.kind === "act") return;
      evt.preventDefault();
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
      rowEl.toggleClass("is-drop-before", !after(evt));
      rowEl.toggleClass("is-drop-after", after(evt));
    });
    rowEl.addEventListener("dragleave", clear);
    rowEl.addEventListener("drop", (evt) => {
      clear();
      const dragged = this.dragged;
      this.dragged = null;
      if (!dragged || dragged === item || !this.script || item.kind === "action") return;
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

  /** Marks the part of the script you're in. */
  private highlight(): void {
    if (!this.script) return;
    const item = itemAt(this.outline, this.script.currentLine());
    const row = item ? this.rows.get(item) ?? null : null;
    if (row === this.active) return;
    this.active?.removeClass("is-active");
    row?.addClass("is-active");
    row?.scrollIntoView({ block: "nearest" });
    this.active = row;
  }
}
