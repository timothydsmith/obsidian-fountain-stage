/**
 * Checks in Obsidian: running every check on an open script (once per
 * version of its text), remembering dismissed findings, and keeping the
 * marks in each open script up to date while they're on.
 */

import type { FountainView } from "./editor/FountainView";
import type { CheckMark } from "./editor/checkMarks";
import { type CheckResults, type Finding, runChecks } from "./fountain/checks";
import { buildOutline } from "./fountain/outline";
import type { FountainStageSettings } from "./library";

/** How long after you stop typing the marks catch up. */
const MARKS_DELAY_MS = 700;
/** Dismissed findings remembered, the oldest forgotten first. */
const MOST_DISMISSED = 2000;

interface Watch {
  unsubscribe: () => void;
  timer: number | null;
}

export class Checks {
  private cache = new WeakMap<FountainView, { source: string; settings: string; results: CheckResults }>();
  private listeners = new Set<() => void>();
  private watched = new Map<FountainView, Watch>();

  constructor(
    private readonly settings: () => FountainStageSettings,
    private readonly save: () => void,
  ) {}

  /** Every check's results on a script as it is now. */
  results(view: FountainView): CheckResults {
    const source = view.getViewData();
    const { directionPhrases, pauseWords } = this.settings();
    const settings = JSON.stringify([directionPhrases, pauseWords]);
    const cached = this.cache.get(view);
    if (cached && cached.source === source && cached.settings === settings) return cached.results;
    const results = runChecks(source, view.script(), buildOutline(source, view.isAct()), { directionPhrases, pauseWords });
    this.cache.set(view, { source, settings, results });
    return results;
  }

  isDismissed(finding: Finding): boolean {
    return this.settings().dismissedFindings.includes(finding.key);
  }

  /** Hides a finding until the text it's about changes. */
  dismiss(finding: Finding): void {
    const list = this.settings().dismissedFindings.filter((k) => k !== finding.key);
    list.push(finding.key);
    this.settings().dismissedFindings = list.slice(-MOST_DISMISSED);
    this.save();
    this.changed();
  }

  /** Shows a dismissed finding again. */
  restore(finding: Finding): void {
    const settings = this.settings();
    settings.dismissedFindings = settings.dismissedFindings.filter((k) => k !== finding.key);
    this.save();
    this.changed();
  }

  /** Calls `listener` when findings are dismissed or brought back, or the settings change. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Says findings or settings changed: the tab redraws, and the marks are redone. */
  changed(): void {
    for (const listener of this.listeners) listener();
    for (const view of this.watched.keys()) this.markSoon(view, 0);
  }

  /** Watches open scripts as they open and close, to keep their marks up to date. */
  sync(views: FountainView[]): void {
    const open = new Set(views);
    for (const view of [...this.watched.keys()]) if (!open.has(view)) this.forget(view);
    for (const view of open) {
      if (this.watched.has(view)) continue;
      const watch: Watch = { unsubscribe: () => undefined, timer: null };
      this.watched.set(view, watch);
      watch.unsubscribe = view.subscribe((change) => change === "text" && this.settings().showCheckMarks && this.markSoon(view, MARKS_DELAY_MS));
      if (this.settings().showCheckMarks) this.markSoon(view, 0);
    }
  }

  private forget(view: FountainView): void {
    const watch = this.watched.get(view);
    if (!watch) return;
    watch.unsubscribe();
    if (watch.timer !== null) window.clearTimeout(watch.timer);
    this.watched.delete(view);
  }

  private markSoon(view: FountainView, delay: number): void {
    const watch = this.watched.get(view);
    if (!watch) return;
    if (watch.timer !== null) window.clearTimeout(watch.timer);
    watch.timer = window.setTimeout(() => {
      watch.timer = null;
      this.mark(view);
    }, delay);
  }

  private mark(view: FountainView): void {
    if (!this.settings().showCheckMarks || !view.file) {
      view.showCheckMarks(null);
      return;
    }
    try {
      const marks: CheckMark[] = [];
      for (const finding of this.results(view).findings) {
        if (this.isDismissed(finding)) continue;
        for (const { from, to } of finding.marks ?? []) marks.push({ from, to, message: finding.message });
      }
      view.showCheckMarks(marks);
    } catch (error) {
      console.error("[fountain-stage] couldn't check the script", error);
    }
  }

  stopAll(): void {
    for (const view of [...this.watched.keys()]) {
      view.showCheckMarks(null);
      this.forget(view);
    }
  }
}
