/** The script outline sidebar: the acts, sections and scenes of the script you're in, and how long each runs. */

import { FileView, ItemView, Menu, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { buildOutline, itemAt, type OutlineItem } from "./fountain/outline";
import { formatDuration, outlineRuntimes, type Timeline } from "./fountain/runtime";
import type { CurrentPass } from "./passes";

export const VIEW_TYPE_OUTLINE = "fountain-stage-outline";

/** How long after you stop typing the outline catches up. */
const REFRESH_DELAY_MS = 300;

export class OutlineView extends ItemView {
  /** The script being outlined. */
  private script: FountainView | null = null;
  private unsubscribe: (() => void) | null = null;
  private outline: OutlineItem[] = [];
  private runtimes = new Map<OutlineItem, number>();
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
    this.outline = buildOutline(this.script.getViewData(), this.script.isAct());
    const timeline = this.host.timelineOf(this.script);
    this.runtimes = timeline ? outlineRuntimes(this.outline, timeline) : new Map<OutlineItem, number>();
    if (this.outline.length === 0) {
      contentEl.createDiv({
        cls: "pane-empty",
        text: "No acts, scenes or sections yet. Start a line with .ACT ONE for an act, INT., EXT. or a full stop for a scene heading, or # for a section.",
      });
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
      if (pass && key && item.kind !== "section") {
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
      const runtime = this.runtimes.get(item);
      if (runtime !== undefined) {
        selfEl.createDiv({ cls: "tree-item-flair-outer" }).createSpan({ cls: "tree-item-flair fountain-stage-outline-runtime", text: formatDuration(runtime) });
      }
      selfEl.addEventListener("click", () => this.reveal(item));
      if (item.kind === "scene") selfEl.addEventListener("contextmenu", (evt) => this.showSceneMenu(evt, item));
      this.dragAndDrop(selfEl, item);

      if (item.children.length > 0) this.renderItems(itemEl.createDiv({ cls: "tree-item-children" }), item.children, path, pass);
    }
  }

  /** A scene's menu, on right-click or a long press: moving it up or down, for where dragging doesn't work, such as on a phone. */
  private showSceneMenu(evt: MouseEvent, item: OutlineItem): void {
    const script = this.script;
    if (!script || script.isFrozen()) return;
    evt.preventDefault();
    const menu = new Menu();
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
    if (item.kind === "scene" && !this.script?.isFrozen()) {
      rowEl.draggable = true;
      rowEl.addEventListener("dragstart", (evt) => {
        this.dragged = item;
        evt.dataTransfer?.setData("text/plain", item.text);
        if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
      });
      rowEl.addEventListener("dragend", () => (this.dragged = null));
    }
    rowEl.addEventListener("dragover", (evt) => {
      if (!this.dragged || this.dragged === item) return;
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
      if (!dragged || dragged === item || !this.script) return;
      evt.preventDefault();
      this.host.moveScene(this.script, dragged.line, item.line, after(evt));
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
