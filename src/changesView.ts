/**
 * The Changes tab: how the script you're in differs from a frozen draft
 * (the latest to start with), or one frozen draft from another. Scenes
 * added, cut, moved or changed, with the runtime and words each gained or
 * lost, and the words each character gained or lost.
 */

import { FileView, ItemView, Platform, type TFile, type WorkspaceLeaf } from "obsidian";
import { type Changes, draftLabel, type FrozenDraft } from "./changes";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import { type Comparison, compareScripts, type SceneComparison, type ScriptVersion } from "./fountain/compare";
import type { ScriptReport } from "./fountain/report";
import { formatCount } from "./fountain/reportMarkdown";
import { formatDuration } from "./fountain/runtime";

export const VIEW_TYPE_CHANGES = "fountain-stage-changes";

/** How long after you stop typing the comparison catches up. */
const REFRESH_DELAY_MS = 1000;

export interface ChangesHost {
  changes: Changes;
  /** The report on an open script, as it is now. */
  reportOf(view: FountainView): ScriptReport;
  /** The report on a draft as saved. */
  reportOfVersion(version: ScriptVersion): Promise<ScriptReport>;
  /** Opens the draft a script is compared with beside it, scrolling with it. */
  showSideBySide(view: FountainView): void;
}

/** A change in a number, signed, or a dash for none. */
function signed(change: number | undefined, format: (n: number) => string): string {
  if (change === undefined || Math.round(change) === 0) return "–";
  return `${change > 0 ? "+" : "−"}${format(Math.abs(change))}`;
}

function statusLabel(scene: SceneComparison): string {
  const status = { same: "Same", changed: "Changed", added: "Added", cut: "Cut" }[scene.status];
  if (!scene.moved) return status;
  return scene.status === "same" ? "Moved" : `Moved, ${status.toLowerCase()}`;
}

export class ChangesView extends ItemView {
  private script: FountainView | null = null;
  private unsubscribe: (() => void) | null = null;
  private refreshTimer: number | null = null;
  /** Each refresh's number, so an older one that finishes late is dropped. */
  private refreshing = 0;
  /** The later side when comparing two drafts; null for the script itself. */
  private later: string | null = null;
  /** The earlier side when comparing two drafts. */
  private earlier: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: ChangesHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CHANGES;
  }

  getDisplayText(): string {
    return "Changes";
  }

  getIcon(): string {
    return "git-compare";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("fountain-stage-report", "fountain-stage-changes");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.follow()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.follow()));
    this.register(this.host.changes.onChange((view) => (view === null || view === this.script) && this.refreshSoon(0)));
    this.app.workspace.onLayoutReady(() => this.follow());
  }

  async onClose(): Promise<void> {
    this.setScript(null);
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  /** Follows the script you're in. Another file clears the tab; this tab or a sidebar leaves it as it is. */
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

  /** Shows the changes in a script, until you go to another. */
  setScript(script: FountainView | null): void {
    if (script === this.script) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.script = script;
    this.later = this.earlier = null;
    if (script) this.unsubscribe = script.subscribe((change) => change === "text" && this.later === null && this.refreshSoon(REFRESH_DELAY_MS));
    this.refreshSoon(0);
  }

  private refreshSoon(delay: number): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, delay);
  }

  private async refresh(): Promise<void> {
    const run = ++this.refreshing;
    const script = this.script;
    const { changes } = this.host;
    if (!script?.file) {
      this.contentEl.empty();
      this.contentEl.createDiv({ cls: "pane-empty", text: "Open a Fountain script to see what's changed since a frozen draft." });
      return;
    }
    const drafts = changes.draftsOf(script);
    const laterDraft = drafts.find((d) => d.file.path === this.later);
    const earlierChoices = laterDraft ? drafts.filter((d) => drafts.indexOf(d) < drafts.indexOf(laterDraft)) : changes.earlierDraftsOf(script);
    const earlier = laterDraft
      ? earlierChoices.find((d) => d.file.path === this.earlier) ?? earlierChoices[earlierChoices.length - 1]
      : changes.baseFor(script);
    if (!earlier) {
      this.contentEl.empty();
      this.contentEl.createDiv({ cls: "fountain-stage-report-title", text: script.file.basename });
      this.contentEl.createDiv({
        cls: "pane-empty",
        text: "There's no earlier frozen draft to compare with. Freeze a draft (in the script's More options menu), and what changes after that shows here.",
      });
      return;
    }

    const isAct = script.isAct();
    const earlierVersion = await changes.version(earlier.file, isAct);
    const laterVersion = laterDraft ? await changes.version(laterDraft.file, isAct) : changes.current(script);
    const comparison = compareScripts(earlierVersion, laterVersion);
    const earlierReport = await this.host.reportOfVersion(earlierVersion);
    const laterReport = laterDraft ? await this.host.reportOfVersion(laterVersion) : this.host.reportOf(script);
    if (run !== this.refreshing || script !== this.script) return;

    const { contentEl } = this;
    const scrollTop = contentEl.scrollTop;
    contentEl.empty();
    contentEl.createDiv({ cls: "fountain-stage-report-title", text: `Changes in ${script.file.basename}` });
    this.renderChoices(contentEl, script, drafts, earlierChoices, earlier, laterDraft);
    const laterFile = laterDraft?.file ?? script.file;
    this.renderTotals(contentEl, comparison, earlierReport, laterReport);
    this.renderScenes(contentEl, comparison, earlierReport, laterReport, earlier.file, laterFile);
    this.renderCharacters(contentEl, earlierReport, laterReport);
    contentEl.scrollTop = scrollTop;
  }

  private renderChoices(el: HTMLElement, script: FountainView, drafts: FrozenDraft[], earlierChoices: FrozenDraft[], earlier: FrozenDraft, laterDraft: FrozenDraft | undefined): void {
    const row = el.createDiv({ cls: "fountain-stage-changes-choices" });
    row.createSpan({ text: "Compare " });
    const from = row.createEl("select", { cls: "dropdown" });
    for (const d of earlierChoices) from.createEl("option", { text: draftLabel(d), value: d.file.path });
    from.value = earlier.file.path;
    row.createSpan({ text: " with " });
    const to = row.createEl("select", { cls: "dropdown" });
    const own = drafts.some((d) => d.file === script.file);
    if (!own) to.createEl("option", { text: "this script, as it is now", value: "" });
    for (const d of drafts) if (drafts.indexOf(d) > 0) to.createEl("option", { text: draftLabel(d), value: d.file.path });
    to.value = laterDraft?.file.path ?? (own ? script.file?.path ?? "" : "");
    if (!laterDraft && !Platform.isPhone) {
      const button = row.createEl("button", { text: "Side by side", attr: { "aria-label": "Show the draft beside the script, scrolling with it" } });
      button.addEventListener("click", () => this.host.showSideBySide(script));
    }

    from.addEventListener("change", () => {
      const draft = earlierChoices.find((d) => d.file.path === from.value);
      if (!draft) return;
      if (this.later === null) this.host.changes.choose(script, draft.file);
      else {
        this.earlier = draft.file.path;
        this.refreshSoon(0);
      }
    });
    to.addEventListener("change", () => {
      this.later = to.value === "" || to.value === script.file?.path ? null : to.value;
      this.earlier = null;
      this.refreshSoon(0);
    });
  }

  private renderTotals(el: HTMLElement, comparison: Comparison, earlier: ScriptReport, later: ScriptReport): void {
    const count = (test: (s: SceneComparison) => boolean) => comparison.scenes.filter(test).length;
    const list = el.createDiv({ cls: "fountain-stage-report-totals" });
    const total = (value: string, label: string) => {
      const item = list.createDiv({ cls: "fountain-stage-report-total" });
      item.createDiv({ cls: "fountain-stage-report-total-value", text: value });
      item.createDiv({ cls: "fountain-stage-report-total-label", text: label });
    };
    const { seconds: before } = earlier.totals;
    const { seconds: after } = later.totals;
    if (before !== undefined && after !== undefined) total(signed(after - before, formatDuration), "Runtime");
    total(signed(later.totals.words - earlier.totals.words, formatCount), "Words spoken");
    total(formatCount(count((s) => s.status === "added")), "Scenes added");
    total(formatCount(count((s) => s.status === "cut")), "Scenes cut");
    total(formatCount(count((s) => s.moved)), "Scenes moved");
    total(formatCount(count((s) => s.status === "changed")), "Scenes changed");
  }

  /** A link that goes to a line of a script: the one this tab follows, or a draft. */
  private link(parent: HTMLElement, text: string, file: TFile, line: number): void {
    const a = parent.createEl("a", { text, cls: "fountain-stage-report-link", href: "#" });
    a.addEventListener("click", (evt) => {
      evt.preventDefault();
      const { workspace } = this.app;
      const open = workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN).find((leaf) => leaf.view instanceof FountainView && leaf.view.file === file);
      if (open?.view instanceof FountainView) {
        workspace.setActiveLeaf(open, { focus: true });
        open.view.revealLine(line);
      } else {
        void workspace.getLeaf("tab").openFile(file, { eState: { line } });
      }
    });
  }

  private renderScenes(el: HTMLElement, comparison: Comparison, earlier: ScriptReport, later: ScriptReport, earlierFile: TFile, laterFile: TFile): void {
    el.createEl("h4", { text: "Scenes" });
    const wrap = el.createDiv({ cls: "fountain-stage-report-table-wrap" });
    const table = wrap.createEl("table", { cls: "fountain-stage-report-table" });
    const head = table.createEl("thead").createEl("tr");
    const numeric = [false, false, true, true, true];
    ["Change", "Scene", "Lines", "Runtime", "Words"].forEach((h, i) => head.createEl("th", { text: h, cls: numeric[i] ? "is-number" : undefined }));
    const body = table.createEl("tbody");
    for (const scene of comparison.scenes) {
      const was = scene.before ? earlier.scenes[scene.before.number - 1] : undefined;
      const now = scene.after ? later.scenes[scene.after.number - 1] : undefined;
      const row = body.createEl("tr", { cls: `fountain-stage-changes-${scene.status}` });
      row.createEl("td", { text: statusLabel(scene) });
      const cell = row.createEl("td");
      if (scene.after) this.link(cell, scene.after.title, laterFile, scene.after.line);
      else if (scene.before) this.link(cell, scene.before.title, earlierFile, scene.before.line);
      if (scene.before && scene.after && scene.before.title !== scene.after.title) {
        cell.createEl("small", { cls: "fountain-stage-changes-was", text: ` was ${scene.before.title}` });
      }
      const lines = [scene.linesAdded ? `+${scene.linesAdded}` : "", scene.linesRemoved ? `−${scene.linesRemoved}` : ""].filter(Boolean).join(" ") || "–";
      // Unknown if either side's runtime is (by pages, before they're laid out).
      const unknown = (scene.before && was?.seconds === undefined) || (scene.after && now?.seconds === undefined);
      const seconds = unknown ? undefined : (now?.seconds ?? 0) - (was?.seconds ?? 0);
      const words = (now?.words ?? 0) - (was?.words ?? 0);
      for (const text of [lines, signed(seconds, formatDuration), signed(words, formatCount)]) row.createEl("td", { text, cls: "is-number" });
    }
  }

  private renderCharacters(el: HTMLElement, earlier: ScriptReport, later: ScriptReport): void {
    const before = new Map(earlier.characters.map((c) => [c.name, c]));
    const after = new Map(later.characters.map((c) => [c.name, c]));
    const names = [...new Set([...before.keys(), ...after.keys()])].filter((name) => (before.get(name)?.speeches ?? 0) + (after.get(name)?.speeches ?? 0) > 0);
    if (names.length === 0) return;
    const words = (name: string) => [before.get(name)?.words ?? 0, after.get(name)?.words ?? 0];
    names.sort((a, b) => {
      const [a0, a1] = words(a);
      const [b0, b1] = words(b);
      return Math.abs(b1 - b0) - Math.abs(a1 - a0) || b1 - a1 || a.localeCompare(b);
    });
    el.createEl("h4", { text: "Characters" });
    const wrap = el.createDiv({ cls: "fountain-stage-report-table-wrap" });
    const table = wrap.createEl("table", { cls: "fountain-stage-report-table" });
    const head = table.createEl("thead").createEl("tr");
    const numeric = [false, true, true, true, true];
    ["Character", "Words then", "Words now", "Change", "Speeches"].forEach((h, i) => head.createEl("th", { text: h, cls: numeric[i] ? "is-number" : undefined }));
    const body = table.createEl("tbody");
    for (const name of names) {
      const [then, now] = words(name);
      const speeches = (after.get(name)?.speeches ?? 0) - (before.get(name)?.speeches ?? 0);
      const row = body.createEl("tr", { cls: then === now ? "fountain-stage-changes-same" : undefined });
      row.createEl("td", { text: name });
      for (const text of [formatCount(then), formatCount(now), signed(now - then, formatCount), signed(speeches, formatCount)]) row.createEl("td", { text, cls: "is-number" });
    }
  }
}
