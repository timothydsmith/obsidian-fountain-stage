import { type EditorState, type Extension, type Range, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { actMatcher, DEFAULT_ACT_PATTERN, type IsAct } from "../fountain/acts";
import { overlapSlashes } from "../fountain/checks/overlaps";
import { parseInline } from "../fountain/inline";
import { parseFountain, type ParsedScript, type SyntaxSpan } from "../fountain/parser";

/** Sets the act pattern of the script's style, once its layout knows the style. */
export const setActPattern = StateEffect.define<string>();

/** The act pattern, kept outside the formatting so it survives switching modes. */
export const actPatternField = StateField.define<string>({
  create: () => DEFAULT_ACT_PATTERN,
  update: (value, tr) => {
    for (const effect of tr.effects) if (effect.is(setActPattern)) value = effect.value;
    return value;
  },
});

/** The parsed script and each line's CSS classes, kept up to date with the document. */
interface Formatting {
  script: ParsedScript;
  actPattern: string;
  /** Classes by line number, counting from 0. Lines with nothing to show are undefined. */
  lineClasses: (string | undefined)[];
  /** Boneyard and notes, which inline emphasis inside them should ignore. */
  hidden: SyntaxSpan[];
}

function lineClassesFor(script: ParsedScript, lineCount: number, isAct: IsAct): (string | undefined)[] {
  const classes = new Array<string | undefined>(lineCount);
  for (const [line, role] of script.lineRoles) classes[line] = `pw-${role}`;
  for (const el of script.elements) {
    let cls = `pw-${el.type.replace(/_/g, "-")}`;
    if (el.type === "scene_heading" && isAct(el.text)) cls += " pw-act";
    if (el.dual) cls += " pw-dual";
    if (el.italic) cls += " pw-lyric";
    for (let line = el.line; line <= el.endLine; line++) classes[line] = cls;
  }
  return classes;
}

function compute(state: EditorState, script = parseFountain(state.doc.toString())): Formatting {
  const actPattern = state.field(actPatternField, false) ?? DEFAULT_ACT_PATTERN;
  return {
    script,
    actPattern,
    lineClasses: lineClassesFor(script, state.doc.lines, actMatcher(actPattern)),
    hidden: script.spans.filter((s) => s.kind === "boneyard" || s.kind === "note"),
  };
}

const formattingField = StateField.define<Formatting>({
  create: (state) => compute(state),
  update: (value, tr) => {
    if (tr.docChanged) return compute(tr.state);
    // A new act pattern changes which headings look like acts, but not the parse.
    if (tr.state.field(actPatternField, false) !== value.actPattern) return compute(tr.state, value.script);
    return value;
  },
});

const parsed = new WeakMap<Text, ParsedScript>();

/**
 * The parsed script: the formatting's own while it's on, otherwise parsed
 * once per version of the document (in source mode, for completion).
 */
export function scriptOf(state: EditorState): ParsedScript {
  const formatting = state.field(formattingField, false);
  if (formatting) return formatting.script;
  let script = parsed.get(state.doc);
  if (!script) {
    script = parseFountain(state.doc.toString());
    parsed.set(state.doc, script);
  }
  return script;
}

const lineDecorations = new Map<string, Decoration>();
function lineDecoration(cls: string): Decoration {
  let deco = lineDecorations.get(cls);
  if (!deco) {
    deco = Decoration.line({ class: `pw-line ${cls}` });
    lineDecorations.set(cls, deco);
  }
  return deco;
}

const spanDecorations: Record<SyntaxSpan["kind"], Decoration> = {
  marker: Decoration.mark({ class: "pw-marker" }),
  "scene-number": Decoration.mark({ class: "pw-scene-number" }),
  "title-key": Decoration.mark({ class: "pw-title-key" }),
  boneyard: Decoration.mark({ class: "pw-boneyard" }),
  note: Decoration.mark({ class: "pw-note" }),
};
const inlineMarker = Decoration.mark({ class: "pw-marker" });
const overlapMark = Decoration.mark({ class: "pw-overlap", attributes: { title: "Overlap: the next speaker comes in here" } });

const inlineDecorations = new Map<string, Decoration>();
function inlineDecoration(cls: string): Decoration {
  let deco = inlineDecorations.get(cls);
  if (!deco) {
    deco = Decoration.mark({ class: cls });
    inlineDecorations.set(cls, deco);
  }
  return deco;
}

/** The line's text with boneyard and notes blanked, so emphasis inside them is ignored. */
function visibleText(text: string, lineFrom: number, hidden: SyntaxSpan[]): string {
  const lineTo = lineFrom + text.length;
  let out = text;
  for (const span of hidden) {
    if (span.to <= lineFrom || span.from >= lineTo) continue;
    const a = Math.max(span.from, lineFrom) - lineFrom;
    const b = Math.min(span.to, lineTo) - lineFrom;
    out = out.slice(0, a) + "\0".repeat(b - a) + out.slice(b);
  }
  return out;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { script, lineClasses, hidden } = view.state.field(formattingField);
  const doc = view.state.doc;
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const cls = lineClasses[line.number - 1];
      if (cls) {
        ranges.push(lineDecoration(cls).range(line.from));
        if (line.length > 0 && !cls.includes("pw-page-break")) {
          const { runs, markers } = parseInline(visibleText(line.text, line.from, hidden));
          for (const m of markers) ranges.push(inlineMarker.range(line.from + m.from, line.from + m.to));
          for (const r of runs) {
            const styles = [r.bold && "pw-bold", r.italic && "pw-italic", r.underline && "pw-underline", r.link && "pw-link"];
            const name = styles.filter(Boolean).join(" ");
            if (name) ranges.push(inlineDecoration(name).range(line.from + r.from, line.from + r.to));
          }
          // Overlap slashes, where the next speaker comes in.
          if (cls === "pw-dialogue" || cls.startsWith("pw-dialogue ")) {
            for (const at of overlapSlashes(visibleText(line.text, line.from, hidden).replace(/\0/g, " "))) {
              ranges.push(overlapMark.range(line.from + at, line.from + at + 1));
            }
          }
        }
      }
      pos = line.to + 1;
    }

    for (const span of script.spans) {
      if (span.to > from && span.from < to && span.to > span.from) {
        ranges.push(spanDecorations[span.kind].range(Math.max(span.from, from), Math.min(span.to, to)));
      }
    }
  }
  return Decoration.set(ranges, true);
}

const formattingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const restyled = update.startState.field(formattingField) !== update.state.field(formattingField);
      if (restyled || update.viewportChanged) this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Formats a Fountain script as you type: each line styled by what it is, with markup shown faintly. */
export function fountainFormatting(): Extension {
  return [formattingField, formattingPlugin];
}
