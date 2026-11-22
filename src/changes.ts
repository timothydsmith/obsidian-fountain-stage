/**
 * Changes since a draft, in Obsidian: finding a play's frozen drafts,
 * reading them, and comparing a script with one of them, for the Changes
 * tab, the tint on changed lines and scrolling side by side.
 */

import { type App, TFile } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { FOUNTAIN_EXTENSION, isInFolder } from "./files";
import type { IsAct } from "./fountain/acts";
import { type Comparison, compareScripts, type ScriptVersion } from "./fountain/compare";
import { buildOutline } from "./fountain/outline";
import { parseFountain } from "./fountain/parser";
import { compareFrozenDrafts, type FrozenDraftName, parseFrozenDraftName, plainTitle, safeFileName } from "./fountain/titlePage";

export interface FrozenDraft {
  file: TFile;
  name: FrozenDraftName;
}

/** A short name for a frozen draft, such as "Draft 3, 21 November 2026". */
export function draftLabel({ name }: FrozenDraft): string {
  const [y, m, d] = name.date.split("-").map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return `Draft ${name.draft}, ${date}${name.copy > 1 ? ` (${name.copy})` : ""}`;
}

export class Changes {
  /** Drafts' text, by path, while unchanged. */
  private sources = new Map<string, { mtime: number; source: string }>();
  /** The draft each script is compared with, by the script's path, when one's been chosen. */
  private chosen = new Map<string, string>();
  private listeners = new Set<(view: FountainView | null) => void>();

  constructor(
    private readonly app: App,
    private readonly draftsFolder: () => string,
  ) {}

  /** Whether a script is a frozen draft, by its name and folder. */
  private ownDraft(view: FountainView): FrozenDraftName | undefined {
    const file = view.file;
    return file && isInFolder(file.path, this.draftsFolder()) ? parseFrozenDraftName(file.basename) : undefined;
  }

  /** The play's frozen drafts, oldest first. */
  draftsOf(view: FountainView): FrozenDraft[] {
    const file = view.file;
    const folder = this.app.vault.getFolderByPath(this.draftsFolder());
    if (!file || !folder) return [];
    const title = this.ownDraft(view)?.title ?? safeFileName(plainTitle(view.script()) || file.basename);
    const drafts: FrozenDraft[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== FOUNTAIN_EXTENSION) continue;
      const name = parseFrozenDraftName(child.basename);
      if (name?.title === title) drafts.push({ file: child, name });
    }
    return drafts.sort((a, b) => compareFrozenDrafts(a.name, b.name));
  }

  /** The drafts a script can be compared with: every one, for the working script; those before it, for a frozen draft. */
  earlierDraftsOf(view: FountainView): FrozenDraft[] {
    const own = this.ownDraft(view);
    return this.draftsOf(view).filter((d) => d.file !== view.file && (!own || compareFrozenDrafts(d.name, own) < 0));
  }

  /** The draft a script is compared with: the one chosen in the Changes tab, or the latest before it. */
  baseFor(view: FountainView): FrozenDraft | undefined {
    const drafts = this.earlierDraftsOf(view);
    const chosen = view.file ? this.chosen.get(view.file.path) : undefined;
    return drafts.find((d) => d.file.path === chosen) ?? drafts[drafts.length - 1];
  }

  /** Compares a script with another draft from now on. */
  choose(view: FountainView, draft: TFile): void {
    if (!view.file) return;
    this.chosen.set(view.file.path, draft.path);
    this.changed(view);
  }

  /** Calls `listener` when a script is to be compared with another draft, or (with null) when the drafts change. */
  onChange(listener: (view: FountainView | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Says the drafts may have changed, such as when one's frozen. */
  changed(view: FountainView | null = null): void {
    for (const listener of this.listeners) listener(view);
  }

  /** An open script as it is now, unsaved changes and all. */
  current(view: FountainView): ScriptVersion {
    const source = view.getViewData();
    return { source, script: view.script(), outline: buildOutline(source, view.isAct()) };
  }

  /** A draft as saved, finding acts as `isAct` does. */
  async version(file: TFile, isAct: IsAct): Promise<ScriptVersion> {
    let cached = this.sources.get(file.path);
    if (cached?.mtime !== file.stat.mtime) {
      cached = { mtime: file.stat.mtime, source: await this.app.vault.cachedRead(file) };
      this.sources.set(file.path, cached);
    }
    const { source } = cached;
    return { source, script: parseFountain(source), outline: buildOutline(source, isAct) };
  }

  /** Compares an open script with the draft it's compared with. Undefined if there's no earlier draft. */
  async compare(view: FountainView): Promise<{ base: FrozenDraft; comparison: Comparison } | undefined> {
    const base = this.baseFor(view);
    if (!base) return undefined;
    const earlier = await this.version(base.file, view.isAct());
    return { base, comparison: compareScripts(earlier, this.current(view)) };
  }
}
