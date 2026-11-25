/**
 * Rehearsal pages in Obsidian: locking a frozen draft as the rehearsal
 * script, showing its fixed pages (23A and all) in the working script, and
 * issuing revised pages. A play's frozen drafts are the record: the latest
 * with a `Locked:` key is the rehearsal script, and the drafts after it
 * with `Revision: 1`, `Revision: 2` and so on are the revisions issued.
 */

import { type App, Modal, Notice, Setting, type TFile } from "obsidian";
import { type Changes, draftLabel, type FrozenDraft } from "./changes";
import type { FountainView } from "./editor/FountainView";
import { savePdf } from "./export";
import { freeze } from "./freezeDraft";
import { actMatcher } from "./fountain/acts";
import type { ScriptVersion } from "./fountain/compare";
import { buildOutline } from "./fountain/outline";
import { type ParsedScript, parseFountain } from "./fountain/parser";
import { applyEdits, longDate, type TitleKeyChange, titleKeyEdits } from "./fountain/titlePage";
import type { Library } from "./library";
import type { PaginatedScript, Paginator } from "./pagination";
import type { FontSet } from "./pdf/fonts";
import { layoutScript } from "./pdf/layout";
import { addRevisionHeader, lockedPages, type RehearsalPages, rehearsalPages, revise } from "./pdf/revisions";
import { drawPdf } from "./pdf/render";
import type { PlayStyle } from "./pdf/style";
import { findStyle } from "./pdf/styles";

const value = (script: ParsedScript, key: string) => (script.titleValues[key] ?? []).join(" ").trim();

/** A play's rehearsal script and the revisions issued since it was locked. */
export interface RehearsalChain {
  locked: FrozenDraft;
  style: PlayStyle;
  lockedVersion: ScriptVersion;
  revisions: { draft: FrozenDraft; version: ScriptVersion; number: number }[];
}

/** "pages 12, 23 and 23A" */
function pageList(labels: string[]): string {
  const list = labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${labels.length === 1 ? "page" : "pages"} ${list}`;
}

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly heading: string,
    private readonly paragraphs: string[],
    private readonly action: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.heading);
    for (const text of this.paragraphs) this.contentEl.createEl("p", { text });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(this.action)
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class Rehearsal {
  /** The rehearsal pages after the last revision, while the drafts, style and fonts are unchanged. */
  private cached: { key: string; pages: RehearsalPages } | null = null;
  private fontsOf: FontSet | null = null;
  /** Whether each play (by a script's path) had a locked draft when last looked at, for menus. */
  private lockedPlays = new Map<string, boolean>();
  /** Drafts read and parsed, by path, while unchanged. */
  private parsedDrafts = new Map<string, { mtime: number; source: string; script: ParsedScript }>();

  constructor(
    private readonly app: App,
    private readonly changes: Changes,
    private readonly library: Library,
    private readonly paginator: Paginator,
    private readonly draftsFolder: () => string,
  ) {}

  /** Whether a script's play had a locked rehearsal script when last looked at. */
  isLocked(view: FountainView): boolean {
    return view.file ? this.lockedPlays.get(view.file.path) === true : false;
  }

  /** The play's rehearsal script and revisions, or undefined if no draft is locked. */
  async chain(view: FountainView): Promise<RehearsalChain | undefined> {
    const drafts = this.changes.draftsOf(view);
    const parsed = await Promise.all(drafts.map(async (draft) => ({ draft, ...(await this.read(draft.file)) })));
    let lock = -1;
    parsed.forEach((d, i) => value(d.script, "locked") && (lock = i));
    if (view.file) this.lockedPlays.set(view.file.path, lock >= 0);
    if (lock < 0) return undefined;

    const locked = parsed[lock];
    const { styles } = await this.library.loadStyles();
    const style = findStyle(styles, value(locked.script, "style")) ?? (await this.paginator.styleFor(locked.script));
    const isAct = actMatcher(style.act.pattern);
    const version = (d: { source: string; script: ParsedScript }): ScriptVersion => ({ source: d.source, script: d.script, outline: buildOutline(d.source, isAct) });

    const revisions: RehearsalChain["revisions"] = [];
    for (const d of parsed.slice(lock + 1)) {
      if (Number(value(d.script, "revision")) === revisions.length + 1) revisions.push({ draft: d.draft, version: version(d), number: revisions.length + 1 });
    }
    return { locked: locked.draft, style, lockedVersion: version(locked), revisions };
  }

  /** A draft's text, parsed. */
  private async read(file: TFile): Promise<{ source: string; script: ParsedScript }> {
    let entry = this.parsedDrafts.get(file.path);
    if (entry?.mtime !== file.stat.mtime) {
      const source = await this.app.vault.cachedRead(file);
      entry = { mtime: file.stat.mtime, source, script: parseFountain(source) };
      this.parsedDrafts.set(file.path, entry);
    }
    return entry;
  }

  /** The rehearsal pages after every revision, measured with `fonts`. */
  private pagesAfterRevisions(chain: RehearsalChain, fonts: FontSet): RehearsalPages {
    const locked = lockedPages(layoutScript(chain.lockedVersion.script, chain.style, fonts), chain.lockedVersion);
    return rehearsalPages(
      locked,
      chain.revisions.map((r) => r.version),
      chain.style,
      fonts,
    );
  }

  /** The working script as it is now, laid over the rehearsal pages. */
  private current(view: FountainView, source: string, script: ParsedScript, style: PlayStyle): ScriptVersion {
    return { source, script, outline: buildOutline(source, actMatcher(style.act.pattern)) };
  }

  /**
   * The working script's pages as the rehearsal script has them, with the
   * numbers revised pages would get. Undefined for a play with no locked
   * draft, and for frozen drafts themselves.
   */
  async paginate(view: FountainView, source: string, script: ParsedScript): Promise<PaginatedScript | undefined> {
    if (!view.file || view.isDraft()) return undefined;
    const chain = await this.chain(view);
    if (!chain) return undefined;
    const { fonts, notice } = await this.paginator.measuring(chain.style);
    const key = JSON.stringify([chain.locked.file.path, chain.locked.file.stat.mtime, chain.revisions.map((r) => [r.draft.file.path, r.draft.file.stat.mtime]), chain.style.id]);
    let base = this.cached?.key === key ? this.cached.pages : null;
    if (!base || this.fontsOf !== fonts) {
      base = this.pagesAfterRevisions(chain, fonts);
      this.cached = { key, pages: base };
      this.fontsOf = fonts;
    }
    const { pages } = revise(base, this.current(view, source, script, chain.style), chain.style, fonts).pages;
    const placements = pages.flatMap((p) => p.placements);
    return {
      styleName: `${chain.style.name}, locked in ${draftLabel(chain.locked)}`,
      actPattern: chain.style.act.pattern,
      pageCount: pages.length,
      pageNumbers: pages.map((p) => p.label || undefined),
      placements,
      fontNotice: notice,
    };
  }

  /** Edits title-page keys in a frozen draft's file. */
  private async setKeys(file: TFile, changes: TitleKeyChange[]): Promise<void> {
    await this.app.vault.process(file, (source) => applyEdits(source, titleKeyEdits(source, parseFountain(source), changes, file.basename)));
  }

  /** Locks a frozen draft as the rehearsal script: the one open, or the play's latest. */
  async lock(view: FountainView, done: () => void): Promise<void> {
    const drafts = this.changes.draftsOf(view);
    const target = drafts.find((d) => d.file === view.file) ?? drafts[drafts.length - 1];
    if (!target) {
      new Notice("Freeze a draft first: the rehearsal script is a frozen draft.");
      return;
    }
    const chain = await this.chain(view);
    if (chain?.locked.file === target.file) {
      new Notice(`${draftLabel(target)} is already the rehearsal script.`);
      return;
    }
    const paragraphs = [
      `${draftLabel(target)} becomes the rehearsal script. Its page breaks are fixed from now on, and the working script shows its pages.`,
      "Issue revised pages, from the working script, then prints only the pages that change, numbered to fit around the others: 23A after 23, or 23–24 for a page that loses all its text.",
    ];
    if (chain) {
      const revised = chain.revisions.length;
      paragraphs.push(
        `${draftLabel(chain.locked)} is locked now${revised ? `, with ${revised} ${revised === 1 ? "revision" : "revisions"}` : ""}. Locking another draft fixes its pages instead, and revisions count from Rev. 1 again.`,
      );
    }
    new ConfirmModal(this.app, "Lock rehearsal script", paragraphs, "Lock", () => {
      void (async () => {
        try {
          const { script } = await this.read(target.file);
          const style = value(script, "style") ? null : await this.paginator.styleFor(script);
          for (const d of drafts) {
            if (d.file === target.file) continue;
            if (value((await this.read(d.file)).script, "locked")) await this.setKeys(d.file, [["Locked", null]]);
          }
          await this.setKeys(target.file, [["Locked", longDate(new Date())], ...(style ? ([["Style", style.id]] as TitleKeyChange[]) : [])]);
          new Notice(`Locked ${draftLabel(target)} as the rehearsal script.`);
          done();
        } catch (error) {
          console.error("[fountain-stage] couldn't lock the rehearsal script", error);
          new Notice(`Couldn't lock the rehearsal script: ${error instanceof Error ? error.message : String(error)}`);
        }
      })();
    }).open();
  }

  /** Unlocks the rehearsal script: page breaks go back to following the text. */
  async unlock(view: FountainView, done: () => void): Promise<void> {
    const chain = await this.chain(view);
    if (!chain) {
      new Notice("No draft of this play is locked.");
      return;
    }
    new ConfirmModal(
      this.app,
      "Unlock rehearsal script",
      [`${draftLabel(chain.locked)} stops being the rehearsal script, and page breaks follow the text again. The revisions issued stay in their frozen drafts.`],
      "Unlock",
      () => {
        this.setKeys(chain.locked.file, [["Locked", null]]).then(
          () => {
            new Notice(`Unlocked ${draftLabel(chain.locked)}.`);
            done();
          },
          (error: unknown) => {
            console.error("[fountain-stage] couldn't unlock the rehearsal script", error);
            new Notice(`Couldn't unlock the rehearsal script: ${error instanceof Error ? error.message : String(error)}`);
          },
        );
      },
    ).open();
  }

  /**
   * Issues revised pages from the working script: a PDF of the pages that
   * changed since the last revision, and a frozen draft recording it.
   */
  async issue(view: FountainView, done: () => void): Promise<void> {
    const file = view.file;
    if (!file || view.isDraft()) return;
    const chain = await this.chain(view);
    if (!chain) {
      new Notice("Lock a rehearsal script first: a frozen draft whose pages stay fixed.");
      return;
    }
    const source = view.getViewData();
    const script = view.script();
    const { fonts } = await this.paginator.measuring(chain.style);
    const current = this.current(view, source, script, chain.style);
    const { issued } = revise(this.pagesAfterRevisions(chain, fonts), current, chain.style, fonts);
    const number = chain.revisions.length + 1;
    const since = chain.revisions.length > 0 ? `Rev. ${chain.revisions.length}` : `${draftLabel(chain.locked)} was locked`;
    if (issued.length === 0) {
      new Notice(`No locked page has changed since ${since}.`);
      return;
    }
    const labels = issued.map((p) => p.label);
    new ConfirmModal(
      this.app,
      `Issue Rev. ${number}`,
      [
        `${pageList(labels)} changed since ${since}.`.replace(/^./, (c) => c.toUpperCase()),
        `A PDF of ${labels.length === 1 ? "that page" : "those pages"} is saved beside the script as ${file.basename} - Rev. ${number}.pdf, and the script is frozen as a draft that records Rev. ${number}.`,
      ],
      "Issue",
      () => void this.writeRevision(view, file, chain, current, number, done),
    ).open();
  }

  private async writeRevision(view: FountainView, file: TFile, chain: RehearsalChain, current: ScriptVersion, number: number, done: () => void): Promise<void> {
    try {
      const date = longDate(new Date());
      const { choice, notice } = await this.library.fontsFor(chain.style);
      if (notice) new Notice(notice);
      const { bytes, layout } = await drawPdf(choice, (fonts) => {
        const { issued } = revise(this.pagesAfterRevisions(chain, fonts), current, chain.style, fonts);
        for (const { page } of issued) addRevisionHeader(page, chain.style, fonts, number, date);
        return {
          width: chain.style.page.width,
          height: chain.style.page.height,
          title: value(current.script, "title") || file.basename,
          author: value(current.script, "author"),
          pages: issued.map((p) => p.page),
          placements: [],
          pageNumbers: issued.map((p) => p.label),
        };
      });
      const copy = await freeze(this.app, view, this.draftsFolder(), { notes: `Rev. ${number}`, exportPdf: false }, [["Revision", String(number)]]);
      if (!copy) return;
      const pdf = await savePdf(this.app, file, `${file.basename} - Rev. ${number}`, bytes);
      new Notice(`Issued Rev. ${number}: ${pageList(layout.pageNumbers.filter((n): n is string => n !== undefined))}, saved as ${pdf.name}.`);
      done();
    } catch (error) {
      console.error("[fountain-stage] couldn't issue revised pages", error);
      new Notice(`Couldn't issue revised pages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
