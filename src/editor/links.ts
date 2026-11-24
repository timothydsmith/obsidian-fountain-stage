/**
 * Links to vault notes in the editor: each link's text is marked as a link,
 * or as a broken one where its note is missing. In reading view a click
 * opens the note; while editing, Ctrl/Cmd-click does. Hovering shows
 * Obsidian's page preview.
 */

import { type Extension, type Range, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { findLinks } from "../fountain/links";
import { scriptOf } from "./formatting";

export interface LinkHost {
  /** Whether a target finds a note. */
  resolves(target: string): boolean;
  /** Opens the note a target names. `event` says whether to open it in a new tab. */
  open(target: string, event: MouseEvent): void;
  /** Shows the page preview of a target's note, from reading view or while editing. */
  hover(event: MouseEvent, targetEl: HTMLElement, target: string, reading: boolean): void;
}

/** Says the vault's notes have changed, so links may have broken or mended. */
export const linksChanged = StateEffect.define<null>();

const LINK_CLASS = "pw-vault-link";

function linkDecorations(view: EditorView, host: LinkHost): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  for (const link of findLinks(state.doc.toString(), scriptOf(state))) {
    if (link.labelTo <= link.labelFrom) continue;
    const broken = !host.resolves(link.target);
    const deco = Decoration.mark({
      class: broken ? `${LINK_CLASS} is-unresolved` : LINK_CLASS,
      attributes: { "data-link": link.target },
    });
    ranges.push(deco.range(link.labelFrom, link.labelTo));
  }
  return Decoration.set(ranges, true);
}

/** The link under a mouse event, if any. */
function linkAt(event: MouseEvent): { el: HTMLElement; target: string } | undefined {
  const node = event.target as Node | null;
  const el = node?.instanceOf(Element) ? node.closest<HTMLElement>(`.${LINK_CLASS}`) : null;
  const target = el?.dataset.link;
  return el && target ? { el, target } : undefined;
}

/** Links to vault notes. `reading` opens them with a plain click; otherwise Ctrl/Cmd-click opens them. */
export function vaultLinks(host: LinkHost, reading: boolean): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = linkDecorations(view, host);
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(linksChanged)));
        if (update.docChanged || refreshed) this.decorations = linkDecorations(update.view, host);
      }
    },
    { decorations: (p) => p.decorations },
  );
  return [
    plugin,
    EditorView.domEventHandlers({
      mousedown(event) {
        // Keep a click that opens a note from moving the cursor first.
        if (event.button !== 0 || !linkAt(event)) return false;
        if (!reading && !(event.ctrlKey || event.metaKey)) return false;
        event.preventDefault();
        return true;
      },
      click(event) {
        const link = event.button === 0 ? linkAt(event) : undefined;
        if (!link || (!reading && !(event.ctrlKey || event.metaKey))) return false;
        event.preventDefault();
        host.open(link.target, event);
        return true;
      },
      mouseover(event) {
        const link = linkAt(event);
        if (link) host.hover(event, link.el, link.target, reading);
        return false;
      },
    }),
  ];
}
