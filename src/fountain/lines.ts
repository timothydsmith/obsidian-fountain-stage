/** Lines of a source text: where each starts, which line an offset is on, and the line ending it uses. */

/** The offset each line starts at, counting from 0. A text of n line breaks has n + 1 lines. */
export function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = source.indexOf("\n"); i >= 0; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** The line an offset is on, counting from 0, from the line starts. */
export function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The line ending a text uses, so edits can match it: "\r\n" if it has any, otherwise "\n". */
export function eolOf(source: string): "\r\n" | "\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}
