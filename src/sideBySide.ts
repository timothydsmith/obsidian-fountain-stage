/**
 * Side by side: a script with an earlier draft of it in a pane to its
 * left, the two scrolling together, line for line where they match.
 */

import { type App, Notice, Platform, type TFile, type WorkspaceLeaf } from "obsidian";
import type { Changes } from "./changes";
import { FountainView } from "./editor/FountainView";
import type { Comparison } from "./fountain/compare";
import { compareScripts } from "./fountain/compare";

/** How long after you stop typing the line matches catch up. */
const RECOMPARE_DELAY_MS = 500;

interface Pair {
  script: FountainView;
  draftLeaf: WorkspaceLeaf;
  /** The file the draft pane showed when last compared. */
  draftFile: TFile | null;
  comparison: Comparison | null;
  run: number;
  timer: number | null;
  unsubscribe: (() => void)[];
}

export class SideBySide {
  private pairs: Pair[] = [];

  constructor(
    private readonly app: App,
    private readonly changes: Changes,
  ) {}

  /** Opens the draft a script is compared with to its left, scrolling with it. */
  async open(script: FountainView): Promise<void> {
    if (Platform.isPhone) {
      new Notice("Side by side needs a wider screen than a phone's. The Changes tab shows what's changed.");
      return;
    }
    const base = this.changes.baseFor(script);
    if (!base) {
      new Notice(`There's no earlier frozen draft of ${script.file?.basename ?? "this script"} to show beside it. Freeze a draft first.`);
      return;
    }
    const existing = this.pairs.find((p) => p.script === script);
    const leaf = existing?.draftLeaf ?? this.app.workspace.createLeafBySplit(script.leaf, "vertical", true);
    await leaf.openFile(base.file, { active: false });
    // Splitting makes the new pane active; stay in the script, so tabs that follow it still do.
    this.app.workspace.setActiveLeaf(script.leaf, { focus: true });
    if (!existing) this.start(script, leaf);
    else void this.compare(existing);
  }

  private start(script: FountainView, draftLeaf: WorkspaceLeaf): void {
    const pair: Pair = { script, draftLeaf, draftFile: null, comparison: null, run: 0, timer: null, unsubscribe: [] };
    this.pairs.push(pair);
    pair.unsubscribe.push(
      script.subscribe((change) => {
        if (change === "scroll") this.follow(pair, "script");
        else if (change === "text") this.compareSoon(pair, RECOMPARE_DELAY_MS);
      }),
    );
    this.watchDraft(pair);
    void this.compare(pair);
  }

  /** Follows scrolling in the draft pane, and whichever script it shows. */
  private watchDraft(pair: Pair): void {
    const view = pair.draftLeaf.view;
    if (!(view instanceof FountainView)) return;
    pair.draftFile = view.file;
    pair.unsubscribe.push(view.subscribe((change) => change === "scroll" && this.follow(pair, "draft")));
  }

  /** Catches up with panes closed, or showing other files: a new script in the draft pane is compared instead. */
  layoutChanged(scriptViews: FountainView[]): void {
    for (const pair of [...this.pairs]) {
      const draft = pair.draftLeaf.view;
      const draftOpen = draft instanceof FountainView && draft.file !== null && draft.file !== pair.script.file;
      if (!scriptViews.includes(pair.script) || !draftOpen) this.stop(pair);
      else if (draft.file !== pair.draftFile) {
        for (const unsubscribe of pair.unsubscribe.splice(1)) unsubscribe();
        this.watchDraft(pair);
        void this.compare(pair);
      }
    }
  }

  private compareSoon(pair: Pair, delay: number): void {
    if (pair.timer !== null) window.clearTimeout(pair.timer);
    pair.timer = window.setTimeout(() => {
      pair.timer = null;
      void this.compare(pair);
    }, delay);
  }

  private async compare(pair: Pair): Promise<void> {
    const run = ++pair.run;
    const draft = pair.draftLeaf.view;
    if (!(draft instanceof FountainView) || !draft.file) return;
    try {
      const earlier = await this.changes.version(draft.file, pair.script.isAct());
      if (run !== pair.run) return;
      pair.comparison = compareScripts(earlier, this.changes.current(pair.script));
      this.follow(pair, "script");
    } catch (error) {
      console.error("[fountain-stage] couldn't compare with the draft", error);
    }
  }

  /** Scrolls one pane to match the other, which you scrolled. */
  private follow(pair: Pair, from: "script" | "draft"): void {
    const draft = pair.draftLeaf.view;
    if (!pair.comparison || !(draft instanceof FountainView)) return;
    const [source, target] = from === "script" ? [pair.script, draft] : [draft, pair.script];
    const place = source.scrollPlace();
    if (!place) return;
    const line = from === "script" ? pair.comparison.earlierLine(place.line) : pair.comparison.laterLine(place.line);
    target.scrollToPlace(line, place.fraction);
  }

  private stop(pair: Pair): void {
    for (const unsubscribe of pair.unsubscribe) unsubscribe();
    if (pair.timer !== null) window.clearTimeout(pair.timer);
    this.pairs = this.pairs.filter((p) => p !== pair);
  }

  /** Stops every pair scrolling together, leaving the panes open. */
  stopAll(): void {
    for (const pair of [...this.pairs]) this.stop(pair);
  }
}
