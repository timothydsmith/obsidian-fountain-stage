/**
 * The Markdown of a vault note, read into blocks for the linked-notes
 * appendix: headings, paragraphs, emphasis, lists (nested, numbered and
 * tasks), block quotes and callouts, rules, tables, code, images and
 * embedded notes. Frontmatter and `%%comments%%` are dropped. As in
 * Obsidian (without strict line breaks), each line of a paragraph is a line.
 */

import { targetName } from "../fountain/links";

/** A run of text with its emphasis. `link` is a web address. */
export interface MdSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
}

export type MdAlign = "left" | "center" | "right";

export interface MdListItem {
  /** "•", or the number with its dot ("3."), or a task box ("[ ]", "[x]"). */
  marker: string;
  blocks: MdBlock[];
}

export type MdBlock =
  | { kind: "heading"; level: number; spans: MdSpan[] }
  | { kind: "paragraph"; lines: MdSpan[][] }
  | { kind: "list"; items: MdListItem[] }
  | { kind: "quote"; title?: MdSpan[]; blocks: MdBlock[] }
  | { kind: "rule" }
  | { kind: "table"; align: MdAlign[]; header: MdSpan[][]; rows: MdSpan[][][] }
  | { kind: "code"; lines: string[] }
  /** `![[picture.png|300]]` or `![alt](picture.png)`. `src` is set once the file is found. */
  | { kind: "image"; target: string; alt: string; width?: number; src?: string }
  /** `![[Another note]]` on a line of its own. */
  | { kind: "embed"; target: string };

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|bmp|svg|webp|avif)$/i;

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const WIKI_EMBED_RE = /^\s*!\[\[([^\]|#]+)((?:#[^\]|]*)?)(?:\|([^\]]*))?\]\]\s*$/;
const MD_IMAGE_RE = /^\s*!\[([^\]]*)\]\(<?([^)>]+?)>?(?:\s+"[^"]*")?\)\s*$/;
const CALLOUT_RE = /^\[!([^\]]+)\][+-]?\s*(.*)$/;
const TASK_RE = /^\[( |x|X)\]\s+/;

/** Drops frontmatter at the top of a note. */
export function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/** Reads a note's Markdown into blocks. */
export function parseMarkdown(text: string): MdBlock[] {
  const body = stripFrontmatter(text.replace(/\r\n?/g, "\n")).replace(/%%[\s\S]*?%%/g, "");
  return parseBlocks(body.split("\n"));
}

/** How far in a line starts, counting a tab as four spaces. */
function indentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4 - (n % 4);
    else break;
  }
  return n;
}

/** The line with `n` columns of indent taken off. */
function dedent(line: string, n: number): string {
  let col = 0;
  let i = 0;
  while (i < line.length && col < n && (line[i] === " " || line[i] === "\t")) {
    col += line[i] === "\t" ? 4 - (col % 4) : 1;
    i++;
  }
  return line.slice(i);
}

const isBlank = (line: string) => line.trim() === "";

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && TABLE_SEPARATOR_RE.test(lines[i + 1]);
}

/** Whether a line starts a block other than a paragraph, so ends a paragraph before it. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    RULE_RE.test(line) ||
    QUOTE_RE.test(line) ||
    (LIST_RE.test(line) && LIST_RE.exec(line)![4].trim() !== "") ||
    WIKI_EMBED_RE.test(line) ||
    MD_IMAGE_RE.test(line) ||
    isTableStart(lines, i)
  );
}

function tableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  // Split on bars that aren't escaped or inside a [[link|alias]].
  const cells: string[] = [];
  let cell = "";
  let depth = 0;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && row[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (row.startsWith("[[", i)) {
      depth++;
      cell += "[[";
      i++;
    } else if (row.startsWith("]]", i) && depth > 0) {
      depth--;
      cell += "]]";
      i++;
    } else if (ch === "|" && depth === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) code.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, spans: parseInlineMarkdown(heading[2]) });
      i++;
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) inner.push(lines[i++].replace(QUOTE_RE, ""));
      const callout = CALLOUT_RE.exec(inner[0] ?? "");
      if (callout) {
        const type = callout[1].trim();
        const title = callout[2].trim() || type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
        blocks.push({ kind: "quote", title: parseInlineMarkdown(title), blocks: parseBlocks(inner.slice(1)) });
      } else {
        blocks.push({ kind: "quote", blocks: parseBlocks(inner) });
      }
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = tableCells(line);
      const align = tableCells(lines[i + 1]).map((c): MdAlign => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) rows.push(tableCells(lines[i++]));
      const columns = Math.max(header.length, ...rows.map((r) => r.length));
      const fill = (cells: string[]) => Array.from({ length: columns }, (_, c) => parseInlineMarkdown(cells[c] ?? ""));
      blocks.push({
        kind: "table",
        align: Array.from({ length: columns }, (_, c) => align[c] ?? "left"),
        header: fill(header),
        rows: rows.map(fill),
      });
      continue;
    }

    const list = LIST_RE.exec(line);
    if (list && list[4].trim() !== "") {
      i = parseList(lines, i, blocks);
      continue;
    }

    const embed = WIKI_EMBED_RE.exec(line);
    if (embed) {
      const target = embed[1].trim();
      if (IMAGE_EXTENSIONS.test(target)) {
        const size = /^\s*(\d+)(?:x\d+)?\s*$/.exec(embed[3] ?? "");
        blocks.push({ kind: "image", target, alt: size ? "" : (embed[3] ?? "").trim(), width: size ? Number(size[1]) : undefined });
      } else {
        blocks.push({ kind: "embed", target: target + embed[2] });
      }
      i++;
      continue;
    }
    const image = MD_IMAGE_RE.exec(line);
    if (image) {
      const alt = image[1].split("|");
      const size = /^\s*(\d+)(?:x\d+)?\s*$/.exec(alt[1] ?? "");
      blocks.push({ kind: "image", target: decodeTarget(image[2].trim()), alt: alt[0].trim(), width: size ? Number(size[1]) : undefined });
      i++;
      continue;
    }

    const paragraph: MdSpan[][] = [];
    while (i < lines.length && !isBlank(lines[i]) && (paragraph.length === 0 || !startsBlock(lines, i))) {
      paragraph.push(parseInlineMarkdown(lines[i].trim()));
      i++;
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return blocks;
}

function decodeTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/** Reads a list starting at line `start` into `blocks`, returning the line after it. */
function parseList(lines: string[], start: number, blocks: MdBlock[]): number {
  const first = LIST_RE.exec(lines[start])!;
  const indent = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const items: MdListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (!m || indentOf(m[1]) !== indent || /\d/.test(m[2]) !== ordered || m[4].trim() === "") break;
    // Lines after the first belong to the item while they're indented past its marker.
    const contentIndent = indent + m[2].length + Math.max(1, Math.min(m[3].length, 4));
    let text = m[4];
    let marker = ordered ? `${parseInt(m[2], 10)}.` : "•";
    const task = TASK_RE.exec(text);
    if (task) {
      marker = task[1] === " " ? "[ ]" : "[x]";
      text = text.slice(task[0].length);
    }
    const body = [text];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        let next = i + 1;
        while (next < lines.length && isBlank(lines[next])) next++;
        if (next < lines.length && indentOf(lines[next]) > indent) {
          body.push("");
          i++;
          continue;
        }
        break;
      }
      if (indentOf(line) <= indent) {
        // Lazy continuation: a plain line straight after the item's text.
        if (body[body.length - 1] !== "" && !startsBlock(lines, i)) {
          body.push(line.trim());
          i++;
          continue;
        }
        break;
      }
      body.push(dedent(line, Math.min(indentOf(line), contentIndent)));
      i++;
    }
    items.push({ marker, blocks: parseBlocks(body) });
  }
  blocks.push({ kind: "list", items });
  return i;
}

const EMPHASIS: { mark: string; bold: boolean; italic: boolean }[] = [
  { mark: "***", bold: true, italic: true },
  { mark: "___", bold: true, italic: true },
  { mark: "**", bold: true, italic: false },
  { mark: "__", bold: true, italic: false },
  { mark: "~~", bold: false, italic: false },
  { mark: "==", bold: false, italic: false },
  { mark: "*", bold: false, italic: true },
  { mark: "_", bold: false, italic: true },
];

const WORD_RE = /[\p{L}\p{N}]/u;

/** Inline Markdown as spans: emphasis, links (web links kept, note links as their text), code, and HTML tags dropped. */
export function parseInlineMarkdown(text: string, style: { bold?: boolean; italic?: boolean } = {}): MdSpan[] {
  const out: MdSpan[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ text: buf, ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}) });
    buf = "";
  };
  let i = 0;
  outer: while (i < text.length) {
    const ch = text[i];
    const rest = text.slice(i);
    if (ch === "\\" && i + 1 < text.length && /[\\`*_{}[\]()#+\-.!|~=<>]/.test(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const ticks = /^`+/.exec(rest)![0];
      const end = text.indexOf(ticks, i + ticks.length);
      if (end > i) {
        buf += text.slice(i + ticks.length, end).trim();
        i = end + ticks.length;
        continue;
      }
    }
    if (rest.startsWith("![[")) {
      const end = text.indexOf("]]", i + 3);
      if (end > 0) {
        i = end + 2;
        continue;
      }
    }
    if (rest.startsWith("[[")) {
      const end = text.indexOf("]]", i + 2);
      if (end > 0) {
        const inner = text.slice(i + 2, end);
        const bar = inner.indexOf("|");
        buf += bar >= 0 ? inner.slice(bar + 1).trim() : wikiText(inner);
        i = end + 2;
        continue;
      }
    }
    if (ch === "!" && text[i + 1] === "[") {
      const m = /^!\[([^\]]*)\]\([^)]*\)/.exec(rest);
      if (m) {
        buf += m[1].split("|")[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === "[") {
      const footnote = /^\[\^[^\]]+\]/.exec(rest);
      if (footnote) {
        i += footnote[0].length;
        continue;
      }
      const m = /^\[([^\]]+)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/.exec(rest);
      if (m) {
        flush();
        const web = /^(https?:|mailto:)/i.test(m[2]);
        for (const span of parseInlineMarkdown(m[1], style)) out.push(web ? { ...span, link: m[2] } : span);
        i += m[0].length;
        continue;
      }
    }
    if (ch === "<") {
      const tag = /^<\/?([A-Za-z][A-Za-z0-9]*)[^>]*>/.exec(rest);
      if (tag) {
        if (tag[1].toLowerCase() === "br") buf += " ";
        i += tag[0].length;
        continue;
      }
    }
    if (ch === "*" || ch === "_" || ch === "~" || ch === "=") {
      for (const { mark, bold, italic } of EMPHASIS) {
        if (!rest.startsWith(mark)) continue;
        const open = i + mark.length;
        if (open >= text.length || /\s/.test(text[open])) continue;
        // Underscores inside a word are just underscores.
        if (mark[0] === "_" && i > 0 && WORD_RE.test(text[i - 1])) continue;
        let close = text.indexOf(mark, open + 1);
        while (close > 0 && (/\s/.test(text[close - 1]) || (mark[0] === "_" && WORD_RE.test(text[close + mark.length] ?? "")))) {
          close = text.indexOf(mark, close + 1);
        }
        if (close < 0) continue;
        flush();
        out.push(...parseInlineMarkdown(text.slice(open, close), { bold: style.bold || bold, italic: style.italic || italic }));
        i = close + mark.length;
        continue outer;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** What a `[[link]]` without display text shows: the note's name, and any heading after it. */
function wikiText(inner: string): string {
  const hash = inner.indexOf("#");
  const name = targetName(inner);
  const heading = hash >= 0 ? inner.slice(hash + 1).replace(/^\^/, "").trim() : "";
  return heading ? (hash === 0 ? heading : `${name} > ${heading}`) : name;
}

/**
 * A note's text with its headings one level deeper (`#` becomes `##`), or one
 * level shallower with `by` -1, leaving code blocks alone. The linked-notes
 * note gives each note a `#` title and its own headings below it.
 */
export function shiftHeadings(text: string, by: 1 | -1): string {
  let fence: string | undefined;
  return text
    .split("\n")
    .map((line) => {
      const f = FENCE_RE.exec(line);
      if (f) {
        if (fence === undefined) fence = f[1][0];
        else if (f[1][0] === fence) fence = undefined;
        return line;
      }
      if (fence !== undefined) return line;
      const h = /^(\s{0,3})(#{1,6})(\s)/.exec(line);
      if (!h) return line;
      const level = Math.min(6, Math.max(1, h[2].length + by));
      return h[1] + "#".repeat(level) + line.slice(h[1].length + h[2].length);
    })
    .join("\n");
}

/**
 * Splits a linked-notes note back into its notes: each `#` heading is a
 * note's title, and its headings come back up a level.
 */
export function splitLinkedNotes(text: string): { title: string; text: string }[] {
  const notes: { title: string; lines: string[] }[] = [];
  let fence: string | undefined;
  for (const line of stripFrontmatter(text.replace(/\r\n?/g, "\n")).split("\n")) {
    const f = FENCE_RE.exec(line);
    if (f) {
      if (fence === undefined) fence = f[1][0];
      else if (f[1][0] === fence) fence = undefined;
    }
    const title = fence === undefined && !f ? /^#\s+(.*?)\s*$/.exec(line) : null;
    if (title) notes.push({ title: title[1], lines: [] });
    else if (notes.length > 0) notes[notes.length - 1].lines.push(line);
  }
  return notes.map(({ title, lines }) => ({ title, text: shiftHeadings(lines.join("\n").trim(), -1) }));
}
