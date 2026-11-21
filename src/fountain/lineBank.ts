/**
 * The line bank: lines not yet placed in the script, kept in a Fountain file
 * beside it. Each paragraph is one entry, so a speech (a cue and its
 * dialogue) stays together. New entries go at the end.
 *
 *     # Line bank
 *
 *     I never liked this house.
 *
 *     NORA
 *     You always say that.
 */

const HEADING = "# Line bank";

/** The bank's entries, in order: its paragraphs, other than headings. */
export function bankEntries(source: string): string[] {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((part) => part.replace(/^\s+|\s+$/g, ""))
    .filter((part) => part !== "" && !/^#[^\n]*$/.test(part));
}

/** An entry as it's kept: without blank lines, which would split it, or space at either end. */
function entryText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

/** The bank with an entry added at the end. A new bank starts with a heading, so a first entry can't read as a title page. */
export function addToBank(source: string, text: string): string {
  const entry = entryText(text);
  if (!entry) return source;
  const body = source.trimEnd() || HEADING;
  return `${body}\n\n${entry}\n`;
}

/** The bank without an entry. Unchanged if it isn't there, such as after it's been edited. */
export function removeFromBank(source: string, text: string): string {
  const entry = entryText(text);
  const normal = source.replace(/\r\n/g, "\n");
  const parts = normal.split(/(\n[ \t]*\n)/);
  // Even indexes are paragraphs, odd ones the blank lines between them.
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i].trim() !== entry) continue;
    if (i + 1 < parts.length) parts.splice(i, 2);
    else if (i > 0) parts.splice(i - 1, 2);
    else parts.splice(i, 1);
    const out = parts.join("").trimEnd();
    return out ? `${out}\n` : "";
  }
  return source;
}

/** The file name, without extension, of a script's line bank, such as "Play - Line bank". */
export function lineBankName(title: string): string {
  return `${title} - Line bank`;
}

/** Whether a file name, without extension, is a line bank's. */
export function isLineBankName(basename: string): boolean {
  return / - Line bank$/.test(basename);
}
