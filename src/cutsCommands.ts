/**
 * Cut from this draft and Restore cut: moving text between a script and its
 * draft's cuts file in the drafts folder, and keeping the cuts file in step
 * with undo and redo in the script.
 */

import { type App, normalizePath, Notice, TFile } from "obsidian";
import type { CutsFileChange } from "./editor/cutHistory";
import type { FountainView } from "./editor/FountainView";
import { FOUNTAIN_EXTENSION, isInFolder } from "./files";
import { addCut, cutAtLine, cutBody, cutHeading, cutsFileName, isFrozenDraftOf, parseCutsFileName, removeCut, restoreText } from "./fountain/cuts";
import { addToBank, bankEntries, isLineBankName, lineBankName, removeFromBank } from "./fountain/lineBank";
import { draftNumber, frozenDraftName, plainTitle } from "./fountain/titlePage";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class CutsFiles {
  /** Changes to cuts files, made one at a time, in order. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly app: App,
    private readonly draftsFolder: () => string,
    private readonly scripts: () => FountainView[],
  ) {}

  /** Whether a file is in the drafts folder. */
  inDraftsFolder(file: TFile): boolean {
    return isInFolder(file.path, this.draftsFolder());
  }

  /** Whether a file is a cuts file in the drafts folder. */
  isCutsFile(file: TFile): boolean {
    return this.inDraftsFolder(file) && parseCutsFileName(file.basename) !== undefined;
  }

  /** Whether a file is read-only until unfrozen: a frozen draft, or a cuts file once its draft is frozen. */
  isFrozen(file: TFile): boolean {
    if (!this.inDraftsFolder(file)) return false;
    const cuts = parseCutsFileName(file.basename);
    if (!cuts) return true;
    return (file.parent?.children ?? []).some(
      (other) => other instanceof TFile && other.extension === FOUNTAIN_EXTENSION && isFrozenDraftOf(other.basename, cuts.prefix),
    );
  }

  /** The cuts file for a script's current draft, named after the frozen copy it will have. */
  private pathFor(view: FountainView): string | undefined {
    if (!view.file) return undefined;
    const script = view.script();
    const name = cutsFileName(frozenDraftName(plainTitle(script) || view.file.basename, draftNumber(script), new Date()));
    return normalizePath(`${this.draftsFolder()}/${name}.${FOUNTAIN_EXTENSION}`);
  }

  /** Moves the selection from a script to its draft's cuts file. */
  async cut(view: FountainView): Promise<void> {
    if (view.isDraft()) {
      new Notice("Cut from this draft works in a script, not in the drafts folder.");
      return;
    }
    const path = this.pathFor(view);
    const { from, to, text } = view.selection();
    const body = cutBody(text);
    if (!path || !body) {
      new Notice("Select the text to cut first.");
      return;
    }
    // Where the cut starts, past any blank lines selected before it.
    const start = from + (text.length - text.replace(/^(?:[ \t]*\r?\n)+/, "").length);
    const cut = { heading: cutHeading(view.script(), view.getViewData(), start, new Date()), body };
    try {
      await this.change({ op: "add", path, cut });
    } catch (error) {
      console.error("[fountain-stage] couldn't save the cut", error);
      new Notice(`Couldn't save the cut, so it's still in the script: ${message(error)}`);
      return;
    }
    const name = path.split("/").pop()?.replace(/\.fountain$/, "") ?? path;
    if (view.removeCut(from, to, text, { op: "add", path, cut, done: true })) {
      new Notice(`Cut to ${name}. Undo puts it back.`);
    } else {
      new Notice(`The script changed while cutting, so the text is still in it, and in ${name} too.`);
    }
  }

  /** Puts the cut at the cursor in a cuts file back into the script, at the script's cursor. */
  restore(view: FountainView): void {
    const file = view.file;
    if (!file || !this.isCutsFile(file)) {
      new Notice("Restore cut works in a cuts file, in the drafts folder.");
      return;
    }
    const cut = cutAtLine(view.getViewData(), view.currentLine());
    if (!cut?.body) {
      new Notice("Put the cursor in a cut to restore it.");
      return;
    }
    const open = this.scripts().filter((script) => script.file && !script.isDraft() && !this.isLineBank(script.file));
    const target = open.find((script) => this.pathFor(script) === file.path) ?? (open.length === 1 ? open[0] : undefined);
    if (!target) {
      new Notice("Open the script, put the cursor where the cut goes, then restore it.");
      return;
    }
    if (target.refuseIfReading()) return;
    // A frozen draft's cuts file keeps its cuts; the working draft's gives them up.
    const frozen = this.isFrozen(file);
    const { from, to } = target.selection();
    target.insertAtCursor(restoreText(target.getViewData(), from, to, cut.body), frozen ? undefined : { op: "remove", path: file.path, cut });
    this.app.workspace.setActiveLeaf(target.leaf, { focus: true });
    new Notice(`Restored the cut to ${target.file?.basename ?? "the script"}. Undo takes it out again.`);
  }

  /** Adds a cut to its cuts file, creating the file if need be, or takes one out. */
  change(change: CutsFileChange): Promise<void> {
    const next = this.queue.then(() => this.write(change));
    // Later changes go ahead even if this one fails.
    this.queue = next.catch((error) => {
      console.error("[fountain-stage] couldn't update the cuts file", error);
      new Notice(`Couldn't update ${change.path}: ${message(error)}`);
    });
    return next;
  }

  private async write({ op, path, cut, bank }: CutsFileChange): Promise<void> {
    const { vault } = this.app;
    const add = (source: string) => (bank ? addToBank(source, cut.body) : addCut(source, cut));
    const remove = (source: string) => (bank ? removeFromBank(source, cut.body) : removeCut(source, cut));
    const file = vault.getFileByPath(path);
    if (file) {
      await vault.process(file, op === "add" ? add : remove);
    } else if (op === "add") {
      const folder = path.split("/").slice(0, -1).join("/");
      if (folder && !vault.getFolderByPath(folder)) await vault.createFolder(folder);
      await vault.create(path, add(""));
    }
  }

  // --- The line bank ------------------------------------------------------

  /** Whether a file is a line bank. */
  isLineBank(file: TFile): boolean {
    return isLineBankName(file.basename);
  }

  /** The line bank beside a script. */
  bankPathFor(view: FountainView): string | undefined {
    const file = view.file;
    if (!file) return undefined;
    const folder = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
    return normalizePath(`${folder}${lineBankName(plainTitle(view.script()) || file.basename)}.${FOUNTAIN_EXTENSION}`);
  }

  /** Reads the line bank beside a script: its entries, or none if there's no bank yet. */
  async bankEntriesFor(view: FountainView): Promise<string[]> {
    const path = this.bankPathFor(view);
    const file = path ? this.app.vault.getFileByPath(path) : null;
    return file ? bankEntries(await this.app.vault.read(file)) : [];
  }
}
