/**
 * Planning a play from its outline or the command palette: adding beats,
 * scenes and action beats, writing synopses, importing a framework's
 * beats, and creating a linked note for a beat or scene.
 */

import { type App, FuzzySuggestModal, Modal, normalizePath, Notice, Setting, TFile, TFolder } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { builtInFrameworks, type Framework, parseFramework } from "./fountain/frameworks";
import type { OutlineItem } from "./fountain/outline";
import type { ParsedScript } from "./fountain/parser";
import { addScene, addSection, blockEnd, frameworkLines, insertParagraph, linkEdits, type PlanEdit, synopsisEdits } from "./fountain/planning";
import { buildStoryOutline, flattenOutline } from "./fountain/storyOutline";
import { safeFileName, type TextEdit, titleKeyEdits } from "./fountain/titlePage";

/** Asks for a name (or heading) and a synopsis. */
class PlanModal extends Modal {
  private name = "";
  private synopsis = "";

  constructor(
    app: App,
    private readonly options: { title: string; nameLabel: string; placeholder: string; button: string },
    private readonly onAdd: (name: string, synopsis: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.options.title);
    new Setting(this.contentEl).setName(this.options.nameLabel).addText((text) => {
      text.setPlaceholder(this.options.placeholder).onChange((value) => (this.name = value));
      text.inputEl.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" && !evt.isComposing) {
          evt.preventDefault();
          this.add();
        }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(this.contentEl)
      .setName("Synopsis")
      .setDesc("What happens, in a line or two. It never prints.")
      .addTextArea((area) => {
        area.onChange((value) => (this.synopsis = value));
        area.inputEl.rows = 3;
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText(this.options.button).setCta().onClick(() => this.add()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private add(): void {
    if (!this.name.trim()) {
      new Notice(`Enter a ${this.options.nameLabel.toLowerCase()} first.`);
      return;
    }
    this.onAdd(this.name.trim(), this.synopsis);
    this.close();
  }
}

/** Asks for a synopsis, starting from the one there. */
class SynopsisModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly item: OutlineItem,
    private readonly onSet: (text: string) => void,
  ) {
    super(app);
    this.value = item.synopsis ?? "";
  }

  onOpen(): void {
    this.setTitle("Synopsis");
    this.contentEl.createEl("p", { text: this.item.text });
    new Setting(this.contentEl)
      .setDesc("What happens, in a line or two. It never prints. Leave it blank for none.")
      .addTextArea((area) => {
        area.setValue(this.value).onChange((value) => (this.value = value));
        area.inputEl.rows = 4;
        area.inputEl.addClass("fountain-stage-synopsis-input");
        window.setTimeout(() => area.inputEl.focus(), 0);
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onSet(this.value);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Makes an edit, unless the script is frozen, and brings the cursor to it. */
function apply(view: FountainView, edit: PlanEdit): void {
  view.applyEdit([edit], edit.cursor);
}

/** Adds a story beat at the start of `line` (past the last line for the end), as deep as `depth`. */
export function addBeat(app: App, view: FountainView, line: number, depth = 1): void {
  if (view.refuseIfFrozen()) return;
  new PlanModal(app, { title: "Add beat", nameLabel: "Name", placeholder: "Catalyst", button: "Add" }, (name, synopsis) =>
    apply(view, addSection(view.getViewData(), line, name, depth, synopsis)),
  ).open();
}

/** Adds a beat after an item's block (as deep as a beat it follows), or at the end of the script. */
export function addBeatAfter(app: App, view: FountainView, item?: OutlineItem): void {
  const source = view.getViewData();
  const line = item ? blockEnd(source, view.script(), view.isAct(), item.line, view.actionDepth()) : Number.MAX_SAFE_INTEGER;
  addBeat(app, view, line, item?.kind === "section" ? item.depth : 1);
}

/** Adds a scene at the end of a beat or act (or after a scene), or at the end of the script. */
export function addSceneTo(app: App, view: FountainView, item?: OutlineItem): void {
  if (view.refuseIfFrozen()) return;
  new PlanModal(app, { title: "Add scene", nameLabel: "Heading", placeholder: "INT. KITCHEN - DAY", button: "Add" }, (heading, synopsis) => {
    const source = view.getViewData();
    const line = item ? blockEnd(source, view.script(), view.isAct(), item.line, view.actionDepth()) : Number.MAX_SAFE_INTEGER;
    apply(view, addScene(source, line, heading, synopsis));
  }).open();
}

/** Adds an action beat at the end of a scene, or after an action beat. */
export function addActionBeat(app: App, view: FountainView, item: OutlineItem): void {
  if (view.refuseIfFrozen()) return;
  new PlanModal(app, { title: "Add action beat", nameLabel: "Name", placeholder: "Anna finds the letter", button: "Add" }, (name, synopsis) => {
    const source = view.getViewData();
    const line = blockEnd(source, view.script(), view.isAct(), item.line, view.actionDepth());
    apply(view, addSection(source, line, name, view.actionDepth(), synopsis));
  }).open();
}

/** Asks for an item's synopsis and writes it under its heading. */
export function editSynopsis(app: App, view: FountainView, item: OutlineItem): void {
  if (view.refuseIfFrozen()) return;
  new SynopsisModal(app, item, (text) => {
    const edits = synopsisEdits(view.getViewData(), view.script(), item.line, text);
    if (edits.length > 0) view.applyEdit(edits);
  }).open();
}

/** The beat, scene, action beat or act that the cursor is in. */
export function itemAtCursor(view: FountainView): OutlineItem | undefined {
  const items = flattenOutline(buildStoryOutline(view.getViewData(), "beat", view.isAct(), view.actionDepth()));
  const line = view.cursorLine().line;
  return items.filter((item) => item.line <= line).pop();
}

// --- Linked notes ------------------------------------------------------------

const NOTE_PREFIX: Record<OutlineItem["kind"], string> = { act: "Act", section: "Beat", scene: "Scene", action: "Beat" };

/** A path in `folder` for a note named `name`, numbered if one of that name is there already. */
function freePath(app: App, folder: string, name: string): string {
  const base = folder ? `${folder}/${name}` : name;
  let path = normalizePath(`${base}.md`);
  for (let n = 2; app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${base} ${n}.md`);
  return path;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  if (!folder || app.vault.getAbstractFileByPath(folder) instanceof TFolder) return;
  await app.vault.createFolder(folder);
}

/**
 * Opens the note linked under a beat's or scene's heading, or creates one
 * in the beat notes folder and links it (`[[>Beat - Catalyst]]`).
 */
export async function openLinkedNote(app: App, view: FountainView, item: OutlineItem, folder: string): Promise<void> {
  const from = view.file?.path ?? "";
  if (item.link !== undefined) {
    const existing = app.metadataCache.getFirstLinkpathDest(item.link, from);
    if (existing) {
      await app.workspace.getLeaf("tab").openFile(existing);
      return;
    }
  }
  if (view.refuseIfFrozen()) return;
  try {
    const folderPath = normalizePath(folder.trim() || "/").replace(/^\/$/, "");
    await ensureFolder(app, folderPath);
    const name = item.link ?? `${NOTE_PREFIX[item.kind]} - ${safeFileName(item.text)}`;
    const path = item.link !== undefined ? normalizePath(`${folderPath ? `${folderPath}/` : ""}${safeFileName(item.link)}.md`) : freePath(app, folderPath, name);
    const body = item.synopsis ? `${item.synopsis}\n` : "";
    const file = await app.vault.create(path, `# ${item.text}\n\n${body}`);
    if (item.link === undefined) {
      const linktext = app.metadataCache.fileToLinktext(file, from, true);
      const edits = linkEdits(view.getViewData(), view.script(), item.line, linktext);
      if (edits.length > 0) view.applyChanges(edits);
    }
    await app.workspace.getLeaf("tab").openFile(file);
  } catch (error) {
    console.error("[fountain-stage] couldn't create a linked note", error);
    new Notice(`Couldn't create the note: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// --- Frameworks ----------------------------------------------------------------

/** The built-in frameworks and those in the frameworks folder. A note that can't be read is reported, not listed. */
export async function loadFrameworks(app: App, folder: string): Promise<{ frameworks: Framework[]; errors: string[] }> {
  const frameworks = builtInFrameworks();
  const errors: string[] = [];
  const dir = folder.trim() ? app.vault.getAbstractFileByPath(normalizePath(folder)) : null;
  if (dir instanceof TFolder) {
    const notes: TFile[] = [];
    const walk = (f: TFolder) => f.children.forEach((child) => (child instanceof TFolder ? walk(child) : child instanceof TFile && child.extension === "md" && notes.push(child)));
    walk(dir);
    for (const note of notes.sort((a, b) => a.path.localeCompare(b.path))) {
      const result = parseFramework(await app.vault.cachedRead(note), note.path, note.basename);
      if ("error" in result) errors.push(`${note.basename}: ${result.error}`);
      else frameworks.push(result.framework);
    }
  }
  return { frameworks, errors };
}

class FrameworkModal extends FuzzySuggestModal<Framework> {
  constructor(
    app: App,
    private readonly frameworks: Framework[],
    private readonly onChoose: (framework: Framework) => void,
  ) {
    super(app);
    this.setPlaceholder("Choose a framework to insert its beats");
  }

  getItems(): Framework[] {
    return this.frameworks;
  }

  getItemText(framework: Framework): string {
    return framework.name;
  }

  onChooseItem(framework: Framework): void {
    this.onChoose(framework);
  }
}

/**
 * Inserts a framework's beats at the cursor, as empty sections with their
 * descriptions as synopses, and names the framework on the title page (if
 * there is one), where the beat map finds it.
 */
export async function importFramework(app: App, view: FountainView, folder: string): Promise<void> {
  if (view.refuseIfFrozen()) return;
  const { frameworks, errors } = await loadFrameworks(app, folder);
  if (errors.length > 0) new Notice(`Some frameworks couldn't be read:\n${errors.join("\n")}`);
  new FrameworkModal(app, frameworks, (framework) => {
    const source = view.getViewData();
    const script = view.script();
    const lines = source.split("\n");
    // On a blank line, there; otherwise after the paragraph the cursor's in.
    let line = view.cursorLine().line;
    while (line < lines.length && lines[line].trim() !== "") line++;
    if (script.lineRoles.get(line) === "title-page" || line < firstLineAfterTitlePage(script)) line = firstLineAfterTitlePage(script);
    const insert = insertParagraph(source, line, frameworkLines(framework.beats));
    const titleEdits: TextEdit[] = script.titlePage.length > 0 ? titleKeyEdits(source, script, [["Framework", framework.name]], "") : [];
    const shift = titleEdits.filter((e) => e.from <= insert.from).reduce((sum, e) => sum + e.insert.length - (e.to - e.from), 0);
    view.applyEdit([...titleEdits, insert], insert.cursor + shift);
    new Notice(`Added ${framework.beats.length} beats from ${framework.name}.`);
  }).open();
}

/** The first line after the title page and the blank line ending it, or 0 with none. */
function firstLineAfterTitlePage(script: ParsedScript): number {
  if (script.titlePage.length === 0) return 0;
  return Math.max(...script.titlePage.map((entry) => entry.endLine)) + 2;
}

/** The framework a script names on its title page (`Framework: Save the Cat`), if any. */
export function scriptFramework(view: FountainView): string | undefined {
  return view.script().titlePage.find((entry) => entry.key === "framework")?.values.join(" ").trim() || undefined;
}
