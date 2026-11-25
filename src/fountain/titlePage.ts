/**
 * Reading and rewriting title-page keys in a script's source, for freezing
 * drafts: the draft number, the draft date and the draft's notes.
 */

import { eolOf, lineStarts } from "./lines";
import type { ParsedScript } from "./parser";

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** A title-page key to set, or to remove with `null`. Keys match in any case. */
export type TitleKeyChange = [key: string, value: string | null];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Characters that can't be in a file name on some system Obsidian runs on, or that Obsidian's links treat specially. */
const UNSAFE_FILE_NAME_RE = /[\\/:*?"<>|#^[\]]/g;

/** The draft number in the `Draft:` key, such as 4 from "4 (working)". No key, or no number in it, is draft 1. */
export function draftNumber(script: ParsedScript): number {
  const value = (script.titleValues.draft ?? []).join(" ");
  const m = /\d+/.exec(value);
  const n = m ? parseInt(m[0], 10) : 1;
  return n > 0 ? n : 1;
}

/** A date written out, such as "21 November 2026": in draft dates, cuts, reports and draft names. */
export function longDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** A date as it goes in a file name, such as "2026-11-21". */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The play's title as plain text, without emphasis marks, or "" if there's none. */
export function plainTitle(script: ParsedScript): string {
  return (script.titleValues.title ?? [])
    .join(" ")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The file name, without the extension, of a frozen draft, such as "Play - Draft 03 - 2026-11-21". */
export function frozenDraftName(title: string, draft: number, date: Date): string {
  return `${safeFileName(title)} - Draft ${String(draft).padStart(2, "0")} - ${isoDate(date)}`;
}

export interface FrozenDraftName {
  /** The play's title, as made safe for the file name. */
  title: string;
  draft: number;
  /** As in the name, "2026-11-21". */
  date: string;
  /** A second freeze of the same draft on the same day is "2026-11-21 2". */
  copy: number;
}

/** Reads a frozen draft's file name (without extension), such as "Play - Draft 03 - 2026-11-21". */
export function parseFrozenDraftName(basename: string): FrozenDraftName | undefined {
  const m = /^(.*) - Draft (\d+) - (\d{4}-\d{2}-\d{2})(?: (\d+))?$/.exec(basename);
  return m ? { title: m[1], draft: parseInt(m[2], 10), date: m[3], copy: m[4] ? parseInt(m[4], 10) : 1 } : undefined;
}

/** Orders frozen drafts oldest first: by draft number, then date, then copy. */
export function compareFrozenDrafts(a: FrozenDraftName, b: FrozenDraftName): number {
  return a.draft - b.draft || a.date.localeCompare(b.date) || a.copy - b.copy;
}

/** A title made safe to name a file with: characters some systems refuse taken out, and "Untitled" if nothing's left. */
export function safeFileName(title: string): string {
  return title.replace(UNSAFE_FILE_NAME_RE, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "") || "Untitled";
}

/**
 * Edits to a script's source that set or remove title-page keys. A key
 * that's there is rewritten in place, keeping how its name was written;
 * one that isn't is added at the end of the title page. A script with no
 * title page gets one, starting with `Title:`.
 */
export function titleKeyEdits(source: string, script: ParsedScript, changes: TitleKeyChange[], title: string): TextEdit[] {
  const eol = eolOf(source);
  const starts = lineStarts(source);
  /** Where a line's text ends, before its line break. */
  const lineEnd = (line: number) => {
    if (line + 1 >= starts.length) return source.length;
    const next = starts[line + 1];
    return source.slice(next - 2, next) === "\r\n" ? next - 2 : next - 1;
  };

  const edits: TextEdit[] = [];
  const additions: string[] = [];
  for (const [key, value] of changes) {
    const lower = key.toLowerCase();
    const entries = script.titlePage.filter((entry) => entry.key === lower);
    if (entries.length === 0) {
      if (value !== null) additions.push(`${key}: ${value}`);
      continue;
    }
    entries.forEach((entry, i) => {
      if (i === 0 && value !== null) {
        const from = starts[entry.line];
        const written = source.slice(from, lineEnd(entry.line)).split(":")[0];
        edits.push({ from, to: lineEnd(entry.endLine), insert: `${written}: ${value}` });
      } else if (entry.endLine + 1 < starts.length) {
        edits.push({ from: starts[entry.line], to: starts[entry.endLine + 1], insert: "" });
      } else {
        // The last line of the file: take the line break before it instead.
        edits.push({ from: entry.line > 0 ? lineEnd(entry.line - 1) : 0, to: source.length, insert: "" });
      }
    });
  }
  if (additions.length === 0) return edits;

  if (script.titlePage.length === 0) {
    const page = [`Title: ${title}`, ...additions].join(eol) + eol;
    // A blank line ends the title page, unless the script starts with one already.
    const blank = source.length === 0 || /^[ \t]*\r?\n/.test(source) ? "" : eol;
    edits.push({ from: 0, to: 0, insert: page + blank });
    return edits;
  }
  const last = Math.max(...script.titlePage.map((entry) => entry.endLine));
  if (last + 1 < starts.length) {
    edits.push({ from: starts[last + 1], to: starts[last + 1], insert: additions.map((line) => line + eol).join("") });
  } else {
    edits.push({ from: source.length, to: source.length, insert: additions.map((line) => eol + line).join("") });
  }
  return edits;
}

/** The source with edits made, as CodeMirror would make them: positions are in the original text, and edits don't overlap. */
export function applyEdits(source: string, edits: TextEdit[]): string {
  let out = source;
  for (const edit of [...edits].sort((a, b) => b.from - a.from || b.to - a.to)) {
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
  }
  return out;
}
