/**
 * Styles of your own: JSON files that extend another style and change only
 * the settings that differ, grouped as in PlayStyle:
 *
 *   { "extends": "apt", "name": "My theatre", "character": { "bold": true },
 *     "page": { "margins": { "top": "30mm" } } }
 *
 * Lengths are points, or strings with a unit ("25mm", "2.5cm", "1in",
 * "12pt"). Keys starting with "_" are ignored, for comments. Every problem in
 * a file is reported with the setting and the reason.
 */

import { actPatternProblem } from "../fountain/acts";
import { A4, INCH, LETTER, MM, type PlayStyle } from "./style";

export interface StyleFile {
  /** Vault path, used in messages and as the default id. */
  path: string;
  text: string;
}

export interface StyleProblem {
  path: string;
  messages: string[];
}

export interface LoadedStyles {
  /** Built-in styles first, then the vault's valid styles. */
  styles: PlayStyle[];
  problems: StyleProblem[];
}

type Kind =
  | { kind: "length"; positive?: boolean }
  | { kind: "boolean" }
  | { kind: "number"; min: number; max: number }
  | { kind: "string" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "color" }
  | { kind: "families" }
  | { kind: "pageSize" }
  | { kind: "pattern" }
  /** A setting that no longer does anything, accepted so older style files still load. */
  | { kind: "retired" };
interface Group {
  [key: string]: Kind | Group;
}

const length: Kind = { kind: "length" };
const size: Kind = { kind: "length", positive: true };
const bool: Kind = { kind: "boolean" };
const text: Kind = { kind: "string" };
const choice = (...values: string[]): Kind => ({ kind: "enum", values });
const alignment = choice("left", "center", "right");
const face = choice("regular", "bold", "italic", "boldItalic");
const color: Kind = { kind: "color" };
const number = (min: number, max: number): Kind => ({ kind: "number", min, max });

const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  a4: A4,
  a5: { width: 148 * MM, height: 210 * MM },
  letter: LETTER,
  legal: { width: 8.5 * INCH, height: 14 * INCH },
};

/** Every setting a style file may change. */
const SCHEMA: Group = {
  name: text,
  description: text,
  page: {
    size: { kind: "pageSize" },
    width: size,
    height: size,
    margins: { top: length, right: length, bottom: length, left: length },
  },
  fonts: { family: { kind: "families" }, fallback: choice("times", "helvetica", "courier") },
  text: { size, leading: size },
  titlePage: { titleSize: size, bylineSize: size, draft: choice("left", "right", "hide") },
  character: {
    size,
    bold: bool,
    ownLine: bool,
    alignment,
    shortParentheticalInline: bool,
    nameColumnWidth: length,
    gutter: length,
  },
  speech: { gap: length, moreContinued: bool, moreText: text, continuedText: text, dualLabel: text },
  parenthetical: { italic: bool, indent: length },
  action: { size, italic: bool, alignment, leftIndent: length, rightIndent: length, color },
  act: { size, bold: bool, italic: bool, underline: bool, alignment, pattern: { kind: "pattern" }, newPage: bool },
  // uppercaseSections set how `##` scene sections printed. Sections no longer print.
  scene: { size, bold: bool, italic: bool, underline: bool, alignment, uppercaseSections: { kind: "retired" } },
  sceneNumbers: { position: choice("hide", "before", "after"), format: text, inHeader: bool },
  header: { strap: bool },
  pagination: {
    fromBody: bool,
    prefaceRoman: bool,
    face,
    size,
    format: text,
    position: choice("top", "bottom"),
    alignment,
  },
  prelims: { headingBold: bool, headingUnderline: bool, nameUnderline: bool },
  notes: { italic: bool, color },
  synopses: { italic: bool, color },
  watermark: { face, color, opacity: number(0, 1), angle: number(-90, 90), maxSize: size },
  revision: { format: text, face, size, position: choice("top", "bottom"), alignment, mark: text, markGap: length },
  appendix: { titleSize: size, titleBold: bool, titleAlignment: alignment, pagePerNote: bool },
};

const isKind = (node: Kind | Group): node is Kind => typeof (node as Kind).kind === "string";
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Compares style names ignoring case, spaces, hyphens and underscores. */
export const styleKey = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

const UNITS: Record<string, number> = { pt: 1, mm: MM, cm: 10 * MM, in: INCH };

/** A length in points, from a number of points or a string such as "25mm". */
export function parseLength(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const m = /^\s*(-?\d+(?:\.\d+)?|-?\.\d+)\s*(pt|mm|cm|in)?\s*$/i.exec(value);
  return m ? parseFloat(m[1]) * UNITS[(m[2] ?? "pt").toLowerCase()] : undefined;
}

function parseColor(value: unknown): [number, number, number] | undefined {
  if (Array.isArray(value) && value.length === 3 && value.every((c) => typeof c === "number" && c >= 0 && c <= 1)) {
    return value as [number, number, number];
  }
  if (typeof value === "string") {
    let hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
    if (!hex) return undefined;
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  }
  return undefined;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}

function suggestion(key: string, options: string[]): string {
  const best = options
    .map((o) => ({ o, d: editDistance(key, o) }))
    .sort((x, y) => x.d - y.d)[0];
  return best && best.d <= Math.max(2, Math.floor(key.length / 3)) ? ` Did you mean "${best.o}"?` : "";
}

/** Checks `overrides` against the schema and writes valid values into `target`. Returns the problems. */
function applyOverrides(target: Record<string, unknown>, overrides: Record<string, unknown>, schema: Group, prefix: string): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith("_")) continue;
    const path = prefix + key;
    const node = schema[key];
    if (!node) {
      const where = prefix ? `in ${prefix.slice(0, -1)}` : "at the top level";
      problems.push(`"${path}" isn't a setting ${where}.${suggestion(key, Object.keys(schema))}`);
      continue;
    }
    if (!isKind(node)) {
      if (!isObject(value)) {
        problems.push(`"${path}" must be a group of settings, such as { "${Object.keys(node)[0]}": … }.`);
        continue;
      }
      const inner = { ...(target[key] as Record<string, unknown>) };
      problems.push(...applyOverrides(inner, value, node, `${path}.`));
      target[key] = inner;
      continue;
    }
    const problem = applyValue(target, key, value, node, path);
    if (problem) problems.push(problem);
  }
  return problems;
}

function applyValue(target: Record<string, unknown>, key: string, value: unknown, kind: Kind, path: string): string | undefined {
  switch (kind.kind) {
    case "length": {
      const points = parseLength(value);
      if (points === undefined) return `"${path}" must be a length, such as 25mm, 1in, 12pt or a number of points.`;
      if (points < 0 || (kind.positive && points === 0)) return `"${path}" must be ${kind.positive ? "more than" : "at least"} 0.`;
      target[key] = points;
      return;
    }
    case "boolean":
      if (typeof value !== "boolean") return `"${path}" must be true or false.`;
      target[key] = value;
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value) || value < kind.min || value > kind.max) {
        return `"${path}" must be a number from ${kind.min} to ${kind.max}.`;
      }
      target[key] = value;
      return;
    case "string":
      if (typeof value !== "string") return `"${path}" must be text in quotes.`;
      target[key] = value;
      return;
    case "enum":
      if (typeof value !== "string" || !kind.values.includes(value)) {
        return `"${path}" must be one of ${kind.values.map((v) => `"${v}"`).join(", ")}.`;
      }
      target[key] = value;
      return;
    case "color": {
      const color = parseColor(value);
      if (!color) return `"${path}" must be a colour, such as "#1a1a1a" or [0.1, 0.1, 0.1].`;
      target[key] = color;
      return;
    }
    case "families":
      if (typeof value === "string") target[key] = value.trim() ? [value.trim()] : [];
      else if (Array.isArray(value) && value.every((v) => typeof v === "string")) target[key] = value.map((v) => v.trim()).filter(Boolean);
      else return `"${path}" must be a font family name, such as "Palatino", or a list of them.`;
      return;
    case "pageSize": {
      const page = typeof value === "string" ? PAGE_SIZES[value.toLowerCase()] : undefined;
      if (!page) return `"${path}" must be one of "A4", "A5", "letter" or "legal". To set another size, use "width" and "height".`;
      target.width = page.width;
      target.height = page.height;
      return;
    }
    case "pattern": {
      if (typeof value !== "string") return `"${path}" must be a regular expression in quotes, such as "^ACT\\\\b".`;
      const problem = actPatternProblem(value);
      if (problem) return `"${path}" isn't a regular expression that can be used: ${problem}.`;
      target[key] = value;
      return;
    }
    case "retired":
      return;
  }
}

interface Parsed {
  file: StyleFile;
  id: string;
  raw?: Record<string, unknown>;
  messages: string[];
}

function baseName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.json$/i, "");
}

function parseFile(file: StyleFile): Parsed {
  const fallbackId = baseName(file.path);
  let raw: unknown;
  try {
    raw = JSON.parse(file.text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { file, id: fallbackId, messages: [`This isn't valid JSON: ${reason}`] };
  }
  if (!isObject(raw)) return { file, id: fallbackId, messages: ["The file must hold one { … } object of settings."] };
  const messages: string[] = [];
  let id = fallbackId;
  if ("id" in raw) {
    if (typeof raw.id === "string" && raw.id.trim()) id = raw.id.trim();
    else messages.push(`"id" must be text in quotes, such as "my-theatre".`);
  }
  if (!("extends" in raw)) messages.push(`Add "extends" with the style to start from, such as "extends": "modern".`);
  else if (typeof raw.extends !== "string") messages.push(`"extends" must be the id of a style, such as "modern".`);
  return { file, id, raw, messages };
}

/** Loads style files, resolving each against the style it extends. Files with problems are left out and reported. */
export function loadStyles(builtIns: readonly PlayStyle[], files: readonly StyleFile[]): LoadedStyles {
  const parsed = files.map(parseFile);
  const builtInKeys = new Map(builtIns.map((s) => [styleKey(s.id), s]));

  const byKey = new Map<string, Parsed>();
  for (const p of parsed) {
    const key = styleKey(p.id);
    const builtIn = builtInKeys.get(key);
    if (builtIn) {
      p.messages.push(`There's already a built-in style called "${builtIn.id}". Give this style another "id".`);
    } else if (byKey.has(key)) {
      p.messages.push(`${byKey.get(key)!.file.path} already uses the id "${p.id}". Give this style another "id".`);
    } else {
      byKey.set(key, p);
    }
  }

  const resolved = new Map<Parsed, PlayStyle | undefined>();
  const resolving = new Set<Parsed>();

  const resolve = (p: Parsed): PlayStyle | undefined => {
    if (resolved.has(p)) return resolved.get(p);
    if (p.messages.length > 0 || !p.raw) {
      resolved.set(p, undefined);
      return undefined;
    }
    resolving.add(p);
    const baseId = p.raw.extends as string;
    const baseKey = styleKey(baseId);
    let base = builtInKeys.get(baseKey);
    if (!base) {
      const other = byKey.get(baseKey);
      if (!other) {
        p.messages.push(`"extends" names "${baseId}", but there's no style with that id.`);
      } else if (resolving.has(other)) {
        p.messages.push(`"extends" goes round in a circle back to "${baseId}".`);
      } else {
        base = resolve(other);
        if (!base) p.messages.push(`"extends" names "${baseId}", which has problems of its own (${other.file.path}).`);
      }
    }
    resolving.delete(p);
    if (!base) {
      resolved.set(p, undefined);
      return undefined;
    }

    const style = structuredClone(base) as unknown as Record<string, unknown>;
    const overrides = { ...p.raw };
    delete overrides.id;
    delete overrides.extends;
    p.messages.push(...applyOverrides(style, overrides, SCHEMA, ""));
    if (p.messages.length > 0) {
      resolved.set(p, undefined);
      return undefined;
    }
    const result = style as unknown as PlayStyle;
    result.id = p.id;
    if (typeof p.raw.name !== "string") result.name = p.id;
    if (typeof p.raw.description !== "string") result.description = `Based on ${base.name}.`;
    result.source = p.file.path;
    resolved.set(p, result);
    return result;
  };

  const styles = [...builtIns];
  for (const p of parsed) {
    const style = resolve(p);
    if (style) styles.push(style);
  }
  const problems = parsed.filter((p) => p.messages.length > 0).map((p) => ({ path: p.file.path, messages: p.messages }));
  return { styles, problems };
}
