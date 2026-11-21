/** Putting text into a script so that it reads as Fountain: a phrase in a line, or a paragraph of its own. */

/**
 * The text to put in place of the selection from `from` to `to`.
 * Partway along a line it goes in as it is, such as a phrase back in a
 * speech. At the start of a line of text, or on a blank line, it goes in as
 * a paragraph of its own, with blank lines around it, so a cue after it is
 * still a cue and a heading before it is still a heading.
 */
export function insertionText(source: string, from: number, to: number, text: string): string {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const end = source.indexOf("\n", to);
  const lineEnd = end < 0 ? source.length : end;
  if (source.slice(lineStart, from).trim() !== "") return text;
  const lineOf = (start: number) => {
    const stop = source.indexOf("\n", start);
    return source.slice(start, stop < 0 ? source.length : stop);
  };
  const previous = lineStart > 0 ? lineOf(source.lastIndexOf("\n", lineStart - 2) + 1) : "";
  const before = previous.trim() !== "" ? "\n" : "";
  if (source.slice(to, lineEnd).trim() !== "") return `${before}${text}\n\n`;
  const next = lineEnd < source.length ? lineOf(lineEnd + 1) : "";
  return before + text + (next.trim() !== "" ? "\n" : "");
}
