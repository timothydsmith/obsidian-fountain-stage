/** Who's on stage at the cursor: in the status bar, and as a command for phones, which have none. */

import { Notice } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { buildOutline } from "./fountain/outline";
import { scriptScenes } from "./fountain/report";
import { onStageAt, type StagePlot, stagePlot } from "./fountain/stage";

/** Names shown in the status bar before "and 2 more". */
const SHOWN = 3;

export class OnStage {
  private cache = new WeakMap<FountainView, { source: string; plot: StagePlot }>();

  /**
   * Who's on stage when in a script. While you type, `fresh` false gives
   * the last one worked out, a few keystrokes old, rather than working it
   * out again at every one.
   */
  plotOf(view: FountainView, fresh = true): StagePlot {
    const cached = this.cache.get(view);
    if (cached && !fresh) return cached.plot;
    const source = view.getViewData();
    if (cached?.source === source) return cached.plot;
    const script = view.script();
    const plot = stagePlot(script, scriptScenes(script, buildOutline(source, view.isAct())));
    this.cache.set(view, { source, plot });
    return plot;
  }

  /** Who's on at a line, or undefined before the play starts or in a script with no scenes. */
  namesAt(view: FountainView, line: number, fresh = true): string[] | undefined {
    const plot = this.plotOf(view, fresh);
    if (plot.scenes.length === 0 || line < plot.scenes[0].line) return undefined;
    return onStageAt(plot, line);
  }

  /** "On stage: ANNA, TOM", for the status bar, with every name in its tooltip. */
  statusText(names: string[]): { text: string; label: string } {
    if (names.length === 0) return { text: "Stage empty", label: "No one's on stage here, going by the entrances and exits" };
    const shown = names.length > SHOWN ? `${names.slice(0, SHOWN).join(", ")} +${names.length - SHOWN}` : names.join(", ");
    return { text: `On stage: ${shown}`, label: `On stage here, going by the entrances and exits:\n${names.join("\n")}` };
  }

  /** Says who's on stage at the cursor, and the next entrance or exit. */
  show(view: FountainView): void {
    const { line } = view.cursorLine();
    const names = this.namesAt(view, line);
    if (names === undefined) {
      new Notice("The cursor isn't in a scene yet.");
      return;
    }
    const plot = this.plotOf(view);
    const next = plot.moves.find((m) => m.line > line);
    const now = names.length === 0 ? "No one's on stage here." : `On stage: ${names.join(", ")}.`;
    const then = next ? ` Next, ${next.name} ${next.kind === "enter" ? "comes on" : "leaves"} on line ${next.line + 1}.` : "";
    new Notice(now + then, 8000);
  }
}
