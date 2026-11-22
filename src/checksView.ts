/**
 * The Checks tab: what the checks find in the script you're in (names
 * written two ways, stage directions an actor can't play, overlap slashes
 * with no one to come in, repeated phrases, scenes thick with pauses), each
 * with a link to its line and a button to dismiss it; then each
 * character's voice, filler words, and a map of how long the speeches are.
 */

import { FileView, ItemView, setIcon, ToggleComponent, type WorkspaceLeaf } from "obsidian";
import type { Checks } from "./checks";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./editor/FountainView";
import type { CheckKind, CheckResults, Finding } from "./fountain/checks";
import { MONOLOGUE_WORDS, type SpeechLength } from "./fountain/checks/speeches";
import { VOICE_MIN_SPEECHES } from "./fountain/checks/voice";
import { formatCount } from "./fountain/reportMarkdown";
import type { FountainStageSettings } from "./library";

export const VIEW_TYPE_CHECKS = "fountain-stage-checks";

/** How long after you stop typing the checks run again. */
const REFRESH_DELAY_MS = 1000;

export interface ChecksHost {
  checks: Checks;
  settings: () => FountainStageSettings;
  /** Turns the marks in the editor on or off. */
  setMarks: (on: boolean) => void;
}

const SECTIONS: { check: CheckKind; heading: string; about: string }[] = [
  { check: "names", heading: "Names", about: "Characters whose names are written two ways, and names in the cast list that never speak or speakers missing from it." },
  { check: "directions", heading: "Stage directions", about: "What an actor can't play, screen language, your own phrases from settings, and long stage directions." },
  { check: "overlaps", heading: "Overlaps", about: "Speeches with an overlap slash where no one comes in after them." },
  { check: "phrases", heading: "Repeated phrases", about: "Phrases of three words or more that come three times or more." },
  { check: "pauses", heading: "Pauses", about: "Scenes with many more pauses, such as (beat), than the play as a whole." },
];

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 120;

export class ChecksView extends ItemView {
  private script: FountainView | null = null;
  private unsubscribe: (() => void) | null = null;
  private refreshTimer: number | null = null;
  private showDismissed = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: ChecksHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CHECKS;
  }

  getDisplayText(): string {
    return "Checks";
  }

  getIcon(): string {
    return "list-checks";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("fountain-stage-report", "fountain-stage-checks");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.follow()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.follow()));
    this.register(this.host.checks.onChange(() => this.refreshSoon(0)));
    this.app.workspace.onLayoutReady(() => this.follow());
    this.refreshSoon(0);
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
    const scripts = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOUNTAIN).map((leaf) => leaf.view);
    const stillOpen = scripts.some((view) => view === this.script);
    const otherFile = this.app.workspace.getActiveViewOfType(FileView);
    if (otherFile) this.setScript(null);
    // Opened with this tab active, as Obsidian starts: a script on screen.
    else if (!stillOpen) this.setScript(scripts.find((view): view is FountainView => view instanceof FountainView && view.containerEl.isShown()) ?? null);
  }

  /** Shows the checks on a script, until you go to another. */
  setScript(script: FountainView | null): void {
    if (script === this.script) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.script = script;
    if (script) this.unsubscribe = script.subscribe((change) => change === "text" && this.refreshSoon(REFRESH_DELAY_MS));
    this.refreshSoon(0);
  }

  private refreshSoon(delay: number): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, delay);
  }

  private refresh(): void {
    const { contentEl } = this;
    const script = this.script;
    if (!script?.file) {
      contentEl.empty();
      contentEl.createDiv({ cls: "pane-empty", text: "Open a Fountain script to check it." });
      return;
    }
    let results: CheckResults;
    try {
      results = this.host.checks.results(script);
    } catch (error) {
      console.error("[fountain-stage] couldn't check the script", error);
      contentEl.empty();
      contentEl.createDiv({ cls: "pane-empty", text: "Couldn't check this script. The console has the details." });
      return;
    }
    const scrollTop = contentEl.scrollTop;
    contentEl.empty();
    contentEl.createDiv({ cls: "fountain-stage-report-title", text: `Checks on ${script.file.basename}` });
    const dismissed = results.findings.filter((f) => this.host.checks.isDismissed(f));
    this.renderControls(contentEl, dismissed.length);
    for (const section of SECTIONS) this.renderFindings(contentEl, section, results.findings.filter((f) => f.check === section.check));
    this.renderVoices(contentEl, results);
    this.renderFillers(contentEl, results);
    this.renderSpeeches(contentEl, results);
    contentEl.scrollTop = scrollTop;
  }

  private renderControls(el: HTMLElement, dismissed: number): void {
    const row = el.createDiv({ cls: "fountain-stage-checks-controls" });
    const toggle = (label: string, value: boolean, onChange: (on: boolean) => void) => {
      const item = row.createEl("label", { cls: "fountain-stage-checks-toggle" });
      new ToggleComponent(item).setValue(value).onChange(onChange);
      item.createSpan({ text: label });
    };
    toggle("Mark in editor", this.host.settings().showCheckMarks, (on) => this.host.setMarks(on));
    if (dismissed > 0 || this.showDismissed) {
      toggle(`Show dismissed (${dismissed})`, this.showDismissed, (on) => {
        this.showDismissed = on;
        this.refreshSoon(0);
      });
    }
  }

  /** A link that goes to a line of the script, counting from 0. */
  private link(parent: HTMLElement, text: string, line: number, label?: string): HTMLAnchorElement {
    const a = parent.createEl("a", { text, cls: "fountain-stage-report-link", href: "#" });
    if (label) a.setAttribute("aria-label", label);
    a.addEventListener("click", (evt) => {
      evt.preventDefault();
      this.goTo(line);
    });
    return a;
  }

  private goTo(line: number): void {
    const script = this.script;
    if (!script) return;
    this.app.workspace.setActiveLeaf(script.leaf, { focus: true });
    script.goToLine(line);
  }

  private renderFindings(el: HTMLElement, section: (typeof SECTIONS)[number], findings: Finding[]): void {
    const { checks } = this.host;
    const shown = this.showDismissed ? findings : findings.filter((f) => !checks.isDismissed(f));
    const heading = el.createEl("h4", { text: section.heading });
    if (shown.length > 0) heading.createSpan({ cls: "fountain-stage-checks-count", text: ` ${formatCount(shown.length)}` });
    el.createDiv({ cls: "fountain-stage-report-note", text: section.about });
    if (shown.length === 0) {
      const hidden = findings.length - shown.length;
      el.createDiv({ cls: "fountain-stage-checks-none", text: hidden > 0 ? `Nothing else found. ${hidden} dismissed.` : "Nothing found." });
      return;
    }
    const list = el.createDiv({ cls: "fountain-stage-checks-list" });
    for (const finding of shown) {
      const isDismissed = checks.isDismissed(finding);
      const row = list.createDiv({ cls: "fountain-stage-checks-finding" });
      row.toggleClass("is-dismissed", isDismissed);
      const where = row.createDiv({ cls: "fountain-stage-checks-where" });
      this.link(where, `Line ${finding.line + 1}`, finding.line);
      const body = row.createDiv({ cls: "fountain-stage-checks-body" });
      body.createDiv({ text: finding.message });
      const others = [...new Set(finding.lines ?? [])].filter((line) => line !== finding.line);
      if (others.length > 0) {
        const also = body.createDiv({ cls: "fountain-stage-checks-also", text: "Also on lines " });
        others.forEach((line, i) => {
          if (i > 0) also.appendText(", ");
          this.link(also, String(line + 1), line);
        });
      }
      const button = row.createEl("button", {
        cls: "clickable-icon fountain-stage-checks-dismiss",
        attr: { "aria-label": isDismissed ? "Bring back" : "Dismiss until the text changes" },
      });
      setIcon(button, isDismissed ? "undo-2" : "x");
      button.addEventListener("click", () => (isDismissed ? checks.restore(finding) : checks.dismiss(finding)));
    }
  }

  private table(parent: HTMLElement, header: string[], numeric: boolean[]): HTMLTableSectionElement {
    const wrap = parent.createDiv({ cls: "fountain-stage-report-table-wrap" });
    const table = wrap.createEl("table", { cls: "fountain-stage-report-table" });
    const row = table.createEl("thead").createEl("tr");
    header.forEach((h, i) => row.createEl("th", { text: h, cls: numeric[i] ? "is-number" : undefined }));
    return table.createEl("tbody");
  }

  private renderVoices(el: HTMLElement, { voices }: CheckResults): void {
    el.createEl("h4", { text: "Voices" });
    el.createDiv({
      cls: "fountain-stage-report-note",
      text: `Characters with ${VOICE_MIN_SPEECHES} speeches or more: how long they typically speak, words only they use, phrases they come back to, and whose words are most like theirs.`,
    });
    if (voices.length === 0) {
      el.createDiv({ cls: "fountain-stage-checks-none", text: "No character speaks often enough yet." });
      return;
    }
    const numeric = [false, true, true, true, false, false, false];
    const body = this.table(el, ["Character", "Speeches", "Typical", "Longest", "Own words", "Comes back to", "Closest to"], numeric);
    for (const voice of voices) {
      const row = body.createEl("tr");
      row.createEl("td", { text: voice.name });
      for (const n of [voice.speeches, voice.typical, voice.longest]) row.createEl("td", { text: formatCount(n), cls: "is-number" });
      row.createEl("td", { text: voice.own.join(", ") || "–" });
      row.createEl("td", { text: voice.repeats.map((p) => `"${p}"`).join(", ") || "–" });
      const closest = voice.closest;
      row.createEl("td", { text: closest ? `${closest.name} (${Math.round(closest.similarity * 100)}%)` : "–" });
    }
  }

  private renderFillers(el: HTMLElement, { fillers }: CheckResults): void {
    el.createEl("h4", { text: "Filler words" });
    el.createDiv({ cls: "fountain-stage-report-note", text: "Words that can pad out dialogue, such as just, really and you know." });
    if (fillers.length === 0) {
      el.createDiv({ cls: "fountain-stage-checks-none", text: "None found." });
      return;
    }
    const body = this.table(el, ["Word", "Times", "Said most by"], [false, true, false]);
    for (const filler of fillers) {
      const row = body.createEl("tr");
      row.createEl("td", { text: filler.word });
      row.createEl("td", { text: formatCount(filler.count), cls: "is-number" });
      row.createEl("td", { text: `${filler.most} (${formatCount(filler.mostCount)})` });
    }
  }

  private renderSpeeches(el: HTMLElement, { speeches, scenes }: CheckResults): void {
    el.createEl("h4", { text: "Speech lengths" });
    if (speeches.speeches.length === 0) {
      el.createDiv({ cls: "fountain-stage-checks-none", text: "No speeches yet." });
      return;
    }
    const monologues = speeches.speeches.filter((s) => s.words >= MONOLOGUE_WORDS).length;
    el.createDiv({
      cls: "fountain-stage-report-note",
      text:
        `Each speech, through the play from left to right, as tall as it's long. The dashed line is ${MONOLOGUE_WORDS} words, about a minute. ` +
        (monologues === 0 ? "No speech reaches it." : `${formatCount(monologues)} ${monologues === 1 ? "speech reaches" : "speeches reach"} it.`),
    });
    this.renderMap(el, speeches.speeches, speeches.sceneStarts);

    const sceneTitle = (s: SpeechLength) => (s.scene >= 0 ? scenes[s.scene]?.title ?? "" : "");
    const body = this.table(el, ["Character", "Words", "Scene", "Line"], [false, true, false, true]);
    for (const speech of speeches.longest) {
      const row = body.createEl("tr", { cls: speech.words >= MONOLOGUE_WORDS ? "is-monologue" : undefined });
      row.createEl("td", { text: speech.name });
      row.createEl("td", { text: formatCount(speech.words), cls: "is-number" });
      row.createEl("td", { text: sceneTitle(speech) || "–" });
      this.link(row.createEl("td", { cls: "is-number" }), String(speech.line + 1), speech.line);
    }
  }

  /** Bars for every speech along the play, with scene starts and the monologue line. Hover for the speech; click to go to it. */
  private renderMap(el: HTMLElement, speeches: SpeechLength[], sceneStarts: number[]): void {
    const wrap = el.createDiv({ cls: "fountain-stage-checks-map" });
    const svg = wrap.createSvg("svg", {
      attr: {
        viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
        preserveAspectRatio: "none",
        // The table below says the same for screen readers. (An aria-label would give Obsidian's tooltip an SVG, which it can't show.)
        "aria-hidden": "true",
      },
    });
    const add = (tag: keyof SVGElementTagNameMap, attr: Record<string, number>, cls: string | string[]): SVGElement => svg.createSvg(tag, { attr, cls });

    const top = Math.max(...speeches.map((s) => s.words), MONOLOGUE_WORDS * 1.2);
    const y = (words: number) => MAP_HEIGHT - (words / top) * (MAP_HEIGHT - 4);
    const barWidth = Math.min(6, Math.max(1.5, (MAP_WIDTH / speeches.length) * 0.6));
    const x = (at: number) => Math.min(Math.max(at * MAP_WIDTH, barWidth / 2), MAP_WIDTH - barWidth / 2);

    for (const at of sceneStarts.slice(1)) add("line", { x1: at * MAP_WIDTH, x2: at * MAP_WIDTH, y1: 0, y2: MAP_HEIGHT }, "fountain-stage-checks-map-scene");
    const bars = speeches.map((s) =>
      add(
        "rect",
        { x: x(s.at) - barWidth / 2, y: y(s.words), width: barWidth, height: MAP_HEIGHT - y(s.words) },
        s.words >= MONOLOGUE_WORDS ? ["fountain-stage-checks-map-bar", "is-monologue"] : "fountain-stage-checks-map-bar",
      ),
    );
    add("line", { x1: 0, x2: MAP_WIDTH, y1: y(MONOLOGUE_WORDS), y2: y(MONOLOGUE_WORDS) }, "fountain-stage-checks-map-limit");
    add("line", { x1: 0, x2: MAP_WIDTH, y1: MAP_HEIGHT, y2: MAP_HEIGHT }, "fountain-stage-checks-map-base");

    // The speech nearest the pointer, so thin bars are easy to hit.
    const tip = wrap.createDiv({ cls: "fountain-stage-checks-map-tip" });
    tip.hide();
    let hovered = -1;
    const nearest = (evt: MouseEvent): number => {
      const box = svg.getBoundingClientRect();
      if (box.width === 0) return -1;
      const at = (evt.clientX - box.left) / box.width;
      let best = -1;
      let distance = Infinity;
      speeches.forEach((s, i) => {
        const d = Math.abs(s.at - at);
        if (d < distance || (d === distance && s.words > speeches[best].words)) {
          best = i;
          distance = d;
        }
      });
      // Within about 12 pixels.
      return distance * box.width <= 12 ? best : -1;
    };
    const show = (i: number, evt: MouseEvent) => {
      if (hovered >= 0) bars[hovered].classList.remove("is-hovered");
      hovered = i;
      svg.classList.toggle("is-pointing", i >= 0);
      if (i < 0) {
        tip.hide();
        return;
      }
      bars[i].classList.add("is-hovered");
      const s = speeches[i];
      tip.setText(`${s.name}, ${formatCount(s.words)} ${s.words === 1 ? "word" : "words"} (line ${s.line + 1})`);
      tip.show();
      const box = wrap.getBoundingClientRect();
      const left = Math.min(Math.max(evt.clientX - box.left, 0), box.width);
      tip.setCssProps({ "--tip-left": `${left}px` });
      tip.toggleClass("is-right", left > box.width / 2);
    };
    svg.addEventListener("mousemove", (evt) => show(nearest(evt), evt));
    svg.addEventListener("mouseleave", (evt) => show(-1, evt));
    svg.addEventListener("click", (evt) => {
      const i = nearest(evt);
      if (i >= 0) this.goTo(speeches[i].line);
    });
    const scale = wrap.createDiv({ cls: "fountain-stage-checks-map-scale" });
    scale.createSpan({ text: "Start" });
    scale.createSpan({ text: "End" });
  }
}
