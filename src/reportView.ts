/** The script report tab: totals, characters, scenes, who's in each scene, doubling and the smallest cast, for the script you're in. */

import { FileView, ItemView, type WorkspaceLeaf } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import type { ScriptReport } from "./fountain/report";
import {
  castSummary,
  firstAndLast,
  fitSummary,
  formatCount,
  formatPages,
  formatRuntime,
  formatShare,
  formatSilence,
  sceneLabel,
  totalsRows,
} from "./fountain/reportMarkdown";
import { formatDuration } from "./fountain/runtime";

export const VIEW_TYPE_REPORT = "fountain-stage-report";

/** How long after you stop typing the report catches up. */
const REFRESH_DELAY_MS = 1000;

export interface ReportHost {
  reportOf(script: FountainView): ScriptReport;
  saveReport(script: FountainView): void;
  /** The cast size to check the play against, or 0 for none. */
  castSize(): number;
  setCastSize(actors: number): void;
}

export class ReportView extends ItemView {
  private script: FountainView | null = null;
  private unsubscribe: (() => void) | null = null;
  private refreshTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: ReportHost,
  ) {
    super(leaf);
    this.addAction("file-text", "Save as a note", () => {
      if (this.script) this.host.saveReport(this.script);
    });
  }

  getViewType(): string {
    return VIEW_TYPE_REPORT;
  }

  getDisplayText(): string {
    return "Script report";
  }

  getIcon(): string {
    return "table";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("fountain-stage-report");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.follow()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.follow()));
    this.app.workspace.onLayoutReady(() => this.follow());
  }

  async onClose(): Promise<void> {
    this.setScript(null);
  }

  /** Follows the script you're in. Another file clears the report; this tab or a sidebar leaves it as it is. */
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

  /** Reports on a script, until you go to another. */
  setScript(script: FountainView | null): void {
    if (script === this.script) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelRefresh();
    this.script = script;
    if (script) this.unsubscribe = script.subscribe((change) => (change === "text" || change === "pages") && this.refreshSoon());
    this.refresh();
  }

  /** Redraws on demand, such as when settings change. */
  refreshSoon(): void {
    this.cancelRefresh();
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, REFRESH_DELAY_MS);
  }

  private cancelRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private refresh(): void {
    const { contentEl } = this;
    const scrollTop = contentEl.scrollTop;
    contentEl.empty();
    const script = this.script;
    if (!script?.file) {
      contentEl.createDiv({ cls: "pane-empty", text: "Open a Fountain script to see its report." });
      return;
    }
    const report = this.host.reportOf(script);
    contentEl.createDiv({ cls: "fountain-stage-report-title", text: script.file.basename });
    if (report.scenes.length === 0 && report.totals.speeches === 0) {
      contentEl.createDiv({ cls: "pane-empty", text: "Nothing to report yet. The report counts speeches, scenes and characters once the script has some." });
      return;
    }
    this.renderTotals(contentEl, report);
    this.renderCharacters(contentEl, report);
    this.renderScenes(contentEl, report);
    this.renderChart(contentEl, report);
    this.renderDoubling(contentEl, report);
    this.renderCast(contentEl, report);
    contentEl.scrollTop = scrollTop;
  }

  /** A link that goes to a line of the script. */
  private link(parent: HTMLElement, text: string, line: number | undefined): void {
    if (line === undefined) {
      parent.setText(text);
      return;
    }
    const a = parent.createEl("a", { text, cls: "fountain-stage-report-link", href: "#" });
    a.addEventListener("click", (evt) => {
      evt.preventDefault();
      const script = this.script;
      if (!script) return;
      this.app.workspace.setActiveLeaf(script.leaf, { focus: true });
      script.revealLine(line);
    });
  }

  private table(parent: HTMLElement, header: string[], numeric: boolean[]): HTMLTableSectionElement {
    const wrap = parent.createDiv({ cls: "fountain-stage-report-table-wrap" });
    const table = wrap.createEl("table", { cls: "fountain-stage-report-table" });
    const row = table.createEl("thead").createEl("tr");
    header.forEach((h, i) => row.createEl("th", { text: h, cls: numeric[i] ? "is-number" : undefined }));
    return table.createEl("tbody");
  }

  private renderTotals(el: HTMLElement, report: ScriptReport): void {
    el.createEl("h4", { text: "Totals" });
    const list = el.createDiv({ cls: "fountain-stage-report-totals" });
    for (const [label, value] of totalsRows(report)) {
      const item = list.createDiv({ cls: "fountain-stage-report-total" });
      item.createDiv({ cls: "fountain-stage-report-total-value", text: value });
      item.createDiv({ cls: "fountain-stage-report-total-label", text: label });
    }
  }

  private renderCharacters(el: HTMLElement, { characters, scenes }: ScriptReport): void {
    el.createEl("h4", { text: "Characters" });
    const numeric = [false, true, true, true, true, true, false, false];
    const body = this.table(el, ["Character", "Speeches", "Words", "Share", "Speaking", "Scenes", "First scene", "Last scene"], numeric);
    for (const c of characters) {
      const row = body.createEl("tr");
      this.link(row.createEl("td"), c.name, c.firstLine);
      const [first, last] = firstAndLast(c, scenes);
      const cells = [
        formatCount(c.speeches),
        formatCount(c.words),
        formatShare(c.share),
        c.words > 0 ? formatDuration(c.seconds) : "–",
        formatCount(c.scenes.length),
      ];
      for (const text of cells) row.createEl("td", { text, cls: "is-number" });
      this.link(row.createEl("td"), sceneLabel(first), first?.line);
      this.link(row.createEl("td"), sceneLabel(last), last?.line);
    }
  }

  private renderScenes(el: HTMLElement, { scenes }: ScriptReport): void {
    el.createEl("h4", { text: "Scenes" });
    const numeric = [true, false, false, true, true, true, true, true, false];
    const body = this.table(el, ["#", "Scene", "Act", "Pages", "Runtime", "Silence", "Speeches", "Words", "Characters"], numeric);
    for (const s of scenes) {
      const row = body.createEl("tr");
      row.createEl("td", { text: String(s.number), cls: "is-number" });
      this.link(row.createEl("td"), s.title, s.line);
      row.createEl("td", { text: s.act ?? "" });
      for (const text of [formatPages(s.pages), formatRuntime(s.seconds), formatSilence(s.silence), formatCount(s.speeches), formatCount(s.words)]) {
        row.createEl("td", { text, cls: "is-number" });
      }
      row.createEl("td", { text: s.characters.join(", "), cls: "fountain-stage-report-cast" });
    }
  }

  private renderChart(el: HTMLElement, { characters, scenes }: ScriptReport): void {
    const cast = characters.filter((c) => c.scenes.length > 0);
    if (cast.length === 0 || scenes.length === 0) return;
    el.createEl("h4", { text: "Who's in each scene" });
    el.createEl("p", { cls: "fountain-stage-report-note", text: "Scenes are numbered as in the table above. A character is in a scene if they speak or are named in a stage direction there." });
    const wrap = el.createDiv({ cls: "fountain-stage-report-table-wrap" });
    const table = wrap.createEl("table", { cls: "fountain-stage-report-table fountain-stage-report-chart" });
    const head = table.createEl("thead").createEl("tr");
    head.createEl("th", { text: "Character" });
    for (const s of scenes) {
      const th = head.createEl("th", { cls: "is-scene" });
      this.link(th, String(s.number), s.line);
      th.setAttribute("aria-label", s.act ? `${s.title} (${s.act})` : s.title);
    }
    const body = table.createEl("tbody");
    for (const c of cast) {
      const row = body.createEl("tr");
      this.link(row.createEl("th"), c.name, c.firstLine);
      scenes.forEach((s, i) => {
        const td = row.createEl("td", { cls: "is-scene" });
        if (c.scenes.includes(i)) {
          td.addClass("is-in");
          td.setText("●");
          td.setAttribute("aria-label", `${c.name} in ${s.number}. ${s.title}`);
        }
      });
    }
  }

  private renderDoubling(el: HTMLElement, { characters }: ScriptReport): void {
    const doubles = characters.filter((c) => c.scenes.length > 0 && c.couldDouble.length > 0);
    el.createEl("h4", { text: "Doubling" });
    if (doubles.length === 0) {
      el.createEl("p", { cls: "fountain-stage-report-note", text: "Every character shares a scene with every other, so no one actor can play two of them." });
      return;
    }
    el.createEl("p", { cls: "fountain-stage-report-note", text: "Characters who never share a scene, so one actor could play both:" });
    const list = el.createEl("ul", { cls: "fountain-stage-report-doubling" });
    for (const c of doubles) {
      const item = list.createEl("li");
      item.createEl("strong", { text: c.name });
      item.appendText(` with ${c.couldDouble.join(", ")}`);
    }
  }

  /** The smallest cast, one way to share out the parts, and whether a cast of the size you give can play it. */
  private renderCast(el: HTMLElement, { cast, scenes }: ScriptReport): void {
    if (cast.size === 0) return;
    el.createEl("h4", { text: "Smallest cast" });
    el.createEl("p", { cls: "fountain-stage-report-note", text: castSummary(cast) });

    const row = el.createDiv({ cls: "fountain-stage-report-cast-size" });
    const label = row.createEl("label", { text: "Check a cast of " });
    const input = label.createEl("input", { type: "number", cls: "fountain-stage-report-cast-input" });
    input.min = "1";
    input.step = "1";
    input.placeholder = String(cast.size);
    const size = this.host.castSize();
    if (size > 0) input.value = String(size);
    label.appendText(" actors");
    const fit = el.createEl("p", { cls: "fountain-stage-report-note" });
    const showFit = (actors: number) => {
      fit.setText(actors > 0 ? fitSummary(cast, scenes, actors) : "");
      fit.toggleClass("is-warning", actors > 0 && actors < cast.size);
    };
    showFit(size);
    input.addEventListener("change", () => {
      const actors = Math.max(0, Math.floor(Number(input.value) || 0));
      this.host.setCastSize(actors);
      showFit(actors);
    });

    if (!cast.actors.some((parts) => parts.length > 1)) return;
    el.createEl("p", { cls: "fountain-stage-report-note", text: "One way to share out the parts, an actor to a line:" });
    const list = el.createEl("ol", { cls: "fountain-stage-report-doubling" });
    for (const parts of cast.actors) {
      const item = list.createEl("li");
      item.createEl("strong", { text: parts[0] });
      if (parts.length > 1) item.appendText(`, ${parts.slice(1).join(", ")}`);
    }
  }
}
