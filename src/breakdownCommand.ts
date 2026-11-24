/** Writing the cast list and scene breakdown from the script, as one change that undo takes back. */

import { Notice } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { breakdownEdits } from "./fountain/breakdown";
import { buildOutline, type OutlineItem } from "./fountain/outline";
import { scriptScenes } from "./fountain/report";

/** The lines of every act and scene heading. */
function headingLines(items: OutlineItem[], into = new Set<number>()): Set<number> {
  for (const item of items) {
    if (item.kind !== "section") into.add(item.line);
    headingLines(item.children, into);
  }
  return into;
}

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export function generateBreakdown(view: FountainView): void {
  if (view.refuseIfFrozen()) return;
  const source = view.getViewData();
  const script = view.script();
  const outline = buildOutline(source, view.isAct());
  const result = breakdownEdits(source, script, scriptScenes(script, outline), headingLines(outline));

  const said: string[] = [];
  if (result.added.length > 0) said.push(`Added ${list(result.added)} to the cast list.`);
  if (result.breakdownChanged) said.push(`Wrote the scene breakdown, ${result.scenes} ${result.scenes === 1 ? "scene" : "scenes"}.`);
  if (result.edits.length > 0) said.push("Undo puts it back.");
  else said.push(result.scenes === 0 ? "The cast list is up to date. There are no scene headings for a scene breakdown." : "The cast list and scene breakdown are up to date.");
  if (result.unused.length > 0) said.push(`In the cast list but not the script: ${list(result.unused)}.`);

  if (result.edits.length > 0) view.applyChanges(result.edits);
  new Notice(said.join(" "), result.unused.length > 0 ? 10000 : 6000);
}
