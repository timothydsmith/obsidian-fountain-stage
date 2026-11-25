/**
 * A tab about the script you're in: the report, changes, checks and beat
 * map. It follows you from script to script, and catches up soon after the
 * script changes.
 *
 * Going to another file clears it; a sidebar, or the tab itself, leaves it
 * as it is. If its script is closed, it picks up a script still on screen,
 * such as when Obsidian starts with the tab in front.
 */

import { FileView, ItemView, type WorkspaceLeaf } from "obsidian";
import { FountainView, type ScriptChange, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";

/** How long after you stop typing a tab catches up, unless it says otherwise. */
const DEFAULT_REFRESH_DELAY_MS = 1000;

export abstract class ScriptTabView extends ItemView {
  protected script: FountainView | null = null;
  /** How long after a change to the script the tab catches up. */
  protected refreshDelay = DEFAULT_REFRESH_DELAY_MS;
  private unsubscribe: (() => void) | null = null;
  private refreshTimer: number | null = null;

  /** Draws the tab for the script it's showing, or a message when there's none. */
  protected abstract refresh(): void | Promise<void>;

  /** Whether a change to the script calls for the tab to catch up. The text, by default. */
  protected refreshesOn(change: ScriptChange): boolean {
    return change === "text";
  }

  /** Called when the tab moves to another script, or to none, before it's drawn. */
  protected scriptChanged(): void {}

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.follow()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.follow()));
    this.app.workspace.onLayoutReady(() => this.follow());
    this.refreshSoon(0);
  }

  async onClose(): Promise<void> {
    this.setScript(null);
    this.cancelRefresh();
  }

  /** Shows a script, until you go to another. */
  setScript(script: FountainView | null): void {
    if (script === this.script) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelRefresh();
    this.script = script;
    this.scriptChanged();
    if (script) this.unsubscribe = script.subscribe((change) => this.refreshesOn(change) && this.refreshSoon());
    void this.refresh();
    // A tab's title can name its script.
    (this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
  }

  /** Draws the tab again after `delay` milliseconds, or the tab's usual delay. */
  protected refreshSoon(delay = this.refreshDelay): void {
    this.cancelRefresh();
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, delay);
  }

  private cancelRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  /** Follows the script you're in. */
  private follow(): void {
    const { workspace } = this.app;
    const active = workspace.getActiveViewOfType(FountainView);
    if (active) {
      this.setScript(active);
      return;
    }
    if (workspace.getActiveViewOfType(FileView)) {
      this.setScript(null);
      return;
    }
    const scripts = workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN).map((leaf) => leaf.view);
    if (scripts.some((view) => view === this.script)) return;
    this.setScript(scripts.find((view): view is FountainView => view instanceof FountainView && view.containerEl.isShown()) ?? null);
  }
}
