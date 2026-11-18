/**
 * Rules in the editor where the PDF's pages break, labelled with each
 * page's number. The rules are worked out from a layout of the script
 * (see ../pagination), which runs a moment after you stop typing; until
 * then they move with the text around them.
 */

import { type EditorState, type Extension, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { pageLabel, pageRules, type ScriptPages } from "../pdf/pageBreaks";
import { scriptOf } from "./formatting";

class PageRuleWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly partway: boolean,
  ) {
    super();
  }

  eq(other: PageRuleWidget): boolean {
    return other.label === this.label && other.partway === this.partway;
  }

  toDOM(): HTMLElement {
    const el = createDiv({ cls: "playwright-page-rule", attr: { "aria-hidden": "true" } });
    const label = el.createSpan({ cls: "playwright-page-rule-label", text: this.label });
    if (this.partway) {
      label.createSpan({ cls: "playwright-page-rule-note", text: " starts partway through the paragraph above" });
    }
    return el;
  }
}

/** Sets the rules from a new layout, or clears them (null). */
export const setPages = StateEffect.define<ScriptPages | null>();

function rulesFor(state: EditorState, pages: ScriptPages): DecorationSet {
  const { doc } = state;
  const ranges: Range<Decoration>[] = [];
  for (const rule of pageRules(pages, scriptOf(state))) {
    if (rule.line >= doc.lines) continue;
    const line = doc.line(rule.line + 1);
    const widget = new PageRuleWidget(pageLabel(pages, rule.page), rule.after);
    const decoration = Decoration.widget({ widget, block: true, side: rule.after ? 1 : -1 });
    ranges.push(decoration.range(rule.after ? line.to : line.from));
  }
  return Decoration.set(ranges, true);
}

/** The rules, kept whether or not they're showing, so switching modes doesn't lose them. */
export const pageRuleField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(rules, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPages)) return effect.value ? rulesFor(tr.state, effect.value) : Decoration.none;
    }
    return tr.docChanged ? rules.map(tr.changes) : rules;
  },
});

/** Shows the rules. */
export function pageRuleDisplay(): Extension {
  return EditorView.decorations.from(pageRuleField);
}
