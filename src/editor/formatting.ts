import { type Extension, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { parseInline } from "../fountain/inline";
import { parseFountain, type ParsedScript, type SyntaxSpan } from "../fountain/parser";

/** The parsed script and each line's CSS classes, kept up to date with the document. */
interface Formatting {
  script: ParsedScript;
  /** Classes by line number, counting from 0. Lines with nothing to show are undefined. */
  lineClasses: (string | undefined)[];
  /** Boneyard and notes, which inline emphasis inside them should ignore. */
  hidden: SyntaxSpan[];
}

function lineClassesFor(script: ParsedScript, lineCount: number): (string | undefined)[] {
  const classes: (string | undefined)[] = new Array(lineCount);
  for (const [line, role] of script.lineRoles) classes[line] = `pw-${role}`;
  for (const el of script.elements) {
    let cls = `pw-${el.type.replace(/_/g, "-")}`;
    if (el.type === "section") cls += ` pw-section-${Math.min(el.depth ?? 1, 3)}`;
    if (el.dual) cls += " pw-dual";
    if (el.italic) cls += " pw-lyric";
    for (let line = el.line; line <= el.endLine; line++) classes[line] = cls;
  }
  return classes;
}

function compute(doc: string, lineCount: number): Formatting {
  const script = parseFountain(doc);
  return {
    script,
    lineClasses: lineClassesFor(script, lineCount),
    hidden: script.spans.filter((s) => s.kind === "boneyard" || s.kind === "note"),
  };
}

const formattingField = StateField.define<Formatting>({
  create: (state) => compute(state.doc.toString(), state.doc.lines),
  update: (value, tr) => (tr.docChanged ? compute(tr.newDoc.toString(), tr.newDoc.lines) : value),
});

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
      if (update.docChanged || update.viewportChanged) this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Formats a Fountain script as you type: each line styled by what it is, with markup shown faintly. */
export function fountainFormatting(): Extension {
  return [formattingField, formattingPlugin];
}
