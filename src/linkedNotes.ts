/**
 * The vault notes a script links to: finding them, following renames,
 * keeping a frozen draft's copy of them, and reading them for the PDF's
 * appendix.
 */

import { type App, Modal, normalizePath, Notice, Setting, type TFile } from "obsidian";
import { FOUNTAIN_EXTENSION } from "./files";
import { alwaysUpdateLinks } from "./obsidianConfig";
import { findLinks, linkedTargets, linkPath, renameEdits } from "./fountain/links";
import { parseFountain } from "./fountain/parser";
import { applyEdits } from "./fountain/titlePage";
import type { Appendix, AppendixNote } from "./pdf/appendix";
import { imageData } from "./pdf/images";
import { type MdBlock, parseMarkdown, shiftHeadings, splitLinkedNotes, stripFrontmatter } from "./pdf/markdown";
import type { ImageData } from "./pdf/model";

/** The vault file a link's target names, as Obsidian finds it, or null. */
export function resolveTarget(app: App, target: string, sourcePath: string): TFile | null {
  const path = linkPath(target);
  return path ? app.metadataCache.getFirstLinkpathDest(path, sourcePath) : null;
}

/** A linked note's text, ready to append or keep. */
export interface LinkedNote {
  title: string;
  text: string;
  /** Where links and pictures in it are found from. */
  sourcePath: string;
}

/** The notes a script links to, once each, in order of first link. Links to missing notes, or to files that aren't notes, are left out. */
export function linkedFiles(app: App, source: string, sourcePath: string): TFile[] {
  const files: TFile[] = [];
  for (const target of linkedTargets(findLinks(source))) {
    const file = resolveTarget(app, target, sourcePath);
    if (file && file.extension === "md" && !files.includes(file)) files.push(file);
  }
  return files;
}

const IMAGE_RE = /\.(png|jpe?g|gif|bmp|svg|webp|avif)$/i;
const EMBED_LINE_RE = /^(\s*)!\[\[([^\]|#]+)(#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*$/;

/** The part of a note under a heading, down to the next heading as high or higher. */
function section(text: string, heading: string): string | undefined {
  const lines = text.split("\n");
  const want = heading.replace(/^#/, "").trim().toLowerCase();
  const start = lines.findIndex((l) => {
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    return h !== null && h[2].toLowerCase() === want;
  });
  if (start < 0) return undefined;
  const level = /^#+/.exec(lines[start])![0].length;
  let end = start + 1;
  while (end < lines.length && !(/^(#{1,6})\s/.exec(lines[end]) && /^#+/.exec(lines[end])![0].length <= level)) end++;
  return lines.slice(start, end).join("\n");
}

/**
 * A note's text with frontmatter dropped and notes embedded on lines of
 * their own written in. Embeds go one level deep: a note embedded in an
 * embedded note becomes a link. Pictures stay embedded.
 */
async function expandedText(app: App, file: TFile, depth = 0): Promise<string> {
  const text = stripFrontmatter((await app.vault.cachedRead(file)).replace(/\r\n?/g, "\n"));
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const embed = EMBED_LINE_RE.exec(line);
    if (!embed || IMAGE_RE.test(embed[2].trim())) {
      out.push(line);
      continue;
    }
    const target = embed[2].trim();
    const found = resolveTarget(app, target, file.path);
    if (depth > 0 || !found || found.extension !== "md") {
      out.push(`${embed[1]}[[${target}${embed[3] ?? ""}]]`);
      continue;
    }
    let inner = await expandedText(app, found, depth + 1);
    if (embed[3]) inner = section(inner, embed[3].slice(1)) ?? inner;
    out.push(inner.trim());
  }
  return out.join("\n");
}

/** The notes a script links to, as they are now. */
export async function currentLinkedNotes(app: App, source: string, sourcePath: string): Promise<LinkedNote[]> {
  const notes: LinkedNote[] = [];
  for (const file of linkedFiles(app, source, sourcePath)) {
    notes.push({ title: file.basename, text: await expandedText(app, file), sourcePath: file.path });
  }
  return notes;
}

/** Where a frozen draft keeps its linked notes: beside it, as "<draft> - Linked notes.md". */
export function linkedNotesPath(script: TFile): string {
  const folder = script.parent && !script.parent.isRoot() ? `${script.parent.path}/` : "";
  return normalizePath(`${folder}${script.basename} - Linked notes.md`);
}

/** A frozen draft's linked notes, kept when it was frozen, or undefined if it has none. */
async function keptLinkedNotes(app: App, script: TFile): Promise<LinkedNote[] | undefined> {
  const file = app.vault.getFileByPath(linkedNotesPath(script));
  if (!file) return undefined;
  return splitLinkedNotes(await app.vault.cachedRead(file)).map((n) => ({ ...n, sourcePath: file.path }));
}

/**
 * The notes to append to a script's PDF: a frozen draft's own copy of them,
 * if it has one, otherwise the notes as they are now.
 */
export async function notesToAppend(app: App, script: TFile, source: string): Promise<LinkedNote[]> {
  return (await keptLinkedNotes(app, script)) ?? currentLinkedNotes(app, source, script.path);
}

/**
 * What a script's PDF could append: "kept" for a frozen draft's own copy of
 * its linked notes, the number of notes it links to otherwise, or 0 for none.
 */
export function appendableNotes(app: App, script: TFile, source: string): number | "kept" {
  if (app.vault.getFileByPath(linkedNotesPath(script))) return "kept";
  return linkedFiles(app, source, script.path).length;
}

/**
 * Keeps a copy of the notes a script links to beside its frozen draft, so
 * the draft's PDF can append them as they were. Writes nothing if the
 * script links to no notes.
 */
export async function keepLinkedNotes(app: App, draft: TFile, source: string, sourcePath: string): Promise<TFile | undefined> {
  const notes = await currentLinkedNotes(app, source, sourcePath);
  if (notes.length === 0) return undefined;
  const text = [
    `%% The notes ${draft.basename} links to, as they were when it was frozen. Its PDF appends these. %%`,
    ...notes.map((n) => `# ${n.title}\n\n${shiftHeadings(n.text.trim(), 1)}`),
  ].join("\n\n");
  const path = linkedNotesPath(draft);
  const existing = app.vault.getFileByPath(path);
  if (existing) {
    await app.vault.modify(existing, `${text}\n`);
    return existing;
  }
  return app.vault.create(path, `${text}\n`);
}

/** Finds each picture in the blocks, setting its `src` and reading its file into `images`. */
async function findPictures(app: App, blocks: MdBlock[], sourcePath: string, images: Record<string, ImageData>): Promise<void> {
  for (const block of blocks) {
    if (block.kind === "image") {
      const file = resolveTarget(app, block.target, sourcePath) ?? app.vault.getFileByPath(normalizePath(block.target));
      if (!file) continue;
      if (!(file.path in images)) {
        const data = imageData(new Uint8Array(await app.vault.readBinary(file)));
        if (!data) continue;
        images[file.path] = data;
      }
      block.src = file.path;
    } else if (block.kind === "list") {
      for (const item of block.items) await findPictures(app, item.blocks, sourcePath, images);
    } else if (block.kind === "quote") {
      await findPictures(app, block.blocks, sourcePath, images);
    }
  }
}

/** The appendix for a PDF: the notes' Markdown read, and their pictures found. */
export async function buildAppendix(app: App, notes: readonly LinkedNote[]): Promise<Appendix> {
  const images: Record<string, ImageData> = {};
  const out: AppendixNote[] = [];
  for (const note of notes) {
    const blocks = parseMarkdown(note.text);
    await findPictures(app, blocks, note.sourcePath, images);
    out.push({ title: note.title, blocks });
  }
  return { notes: out, images };
}

/** Asks whether to update the links in scripts to a renamed note, as Obsidian asks for notes. */
class UpdateLinksModal extends Modal {
  private answered = false;

  constructor(
    app: App,
    private readonly message: string,
    private readonly onAnswer: (update: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Update links in scripts?");
    this.contentEl.createEl("p", { text: this.message });
    this.contentEl.createEl("p", {
      text: "Obsidian is set to ask before updating links. Change this with Automatically update internal links in Obsidian's Files and links settings.",
      cls: "setting-item-description",
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Don't update").onClick(() => this.answer(false)))
      .addButton((button) =>
        button
          .setButtonText("Update")
          .setCta()
          .onClick(() => this.answer(true)),
      );
  }

  private answer(update: boolean): void {
    this.answered = true;
    this.close();
    this.onAnswer(update);
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.answered) this.onAnswer(false);
  }
}

function askToUpdate(app: App, message: string): Promise<boolean> {
  return new Promise((resolve) => new UpdateLinksModal(app, message, resolve).open());
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * Follows a renamed note in every script that links to it, keeping each
 * link's form. Frozen drafts are left as they are. A script that's open
 * changes in its view, as one step to undo. As Obsidian does for notes, it
 * asks first unless Obsidian is set to update links automatically.
 */
export async function followRename(
  app: App,
  file: TFile,
  oldPath: string,
  isFrozen: (script: TFile) => boolean,
  openSource: (script: TFile) => { text: string; apply: (edits: { from: number; to: number; insert: string }[]) => void } | undefined,
): Promise<void> {
  const editsFor = (script: TFile, text: string) => {
    if (!text.includes("[[>")) return [];
    const shortName = app.metadataCache.fileToLinktext(file, script.path, true);
    return renameEdits(findLinks(text, parseFountain(text)), oldPath, file.path, shortName, (target) => resolveTarget(app, target, script.path) !== null);
  };

  // The scripts with links to change, and how many, before anything changes.
  const affected: TFile[] = [];
  let found = 0;
  for (const script of app.vault.getFiles()) {
    if (script.extension !== FOUNTAIN_EXTENSION || isFrozen(script)) continue;
    const text = openSource(script)?.text ?? (await app.vault.cachedRead(script));
    const count = editsFor(script, text).length;
    if (count === 0) continue;
    affected.push(script);
    found += count;
  }
  if (found === 0) return;

  const oldName = oldPath.slice(oldPath.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  if (!alwaysUpdateLinks(app)) {
    const message = `${plural(found, "link", "links")} in ${plural(affected.length, "script", "scripts")} ${found === 1 ? "goes" : "go"} to ${oldName}, which is now ${file.basename}. Update ${found === 1 ? "it" : "them"}?`;
    if (!(await askToUpdate(app, message))) return;
  }

  let changedScripts = 0;
  let changedLinks = 0;
  for (const script of affected) {
    // Worked out again, as the script may have changed while the question was open.
    const open = openSource(script);
    let count = 0;
    if (open) {
      const edits = editsFor(script, open.text);
      open.apply(edits);
      count = edits.length;
    } else {
      await app.vault.process(script, (text) => {
        const edits = editsFor(script, text);
        count = edits.length;
        return applyEdits(text, edits);
      });
    }
    if (count > 0) {
      changedScripts++;
      changedLinks += count;
    }
  }
  if (changedLinks > 0) {
    new Notice(`Updated ${plural(changedLinks, "link", "links")} to ${file.basename} in ${plural(changedScripts, "script", "scripts")}.`);
  }
}
