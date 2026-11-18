/**
 * What reading view hides: the markup (forcing marks, section #s, emphasis
 * marks, link syntax), and the parts of a script that aren't part of the
 * play (notes, boneyard and synopses). Lines left with nothing to show are
 * removed altogether, without leaving a doubled blank line behind.
 */

import { parseInline } from "./inline";
import { parseFountain } from "./parser";

export interface HiddenRange {
  from: number;
  to: number;
}

const isBlank = (text: string) => text.trim() === "";

/** The ranges of `source` that reading view hides, in order and not overlapping. */
export function readingHiddenRanges(source: string): HiddenRange[] {
  const script = parseFountain(source);
  const hidden = new Uint8Array(source.length);
  const hide = (from: number, to: number) => hidden.fill(1, Math.max(from, 0), Math.min(to, source.length));

  // Notes and boneyard are blanked before inline emphasis is looked for, so
  // a stray * inside one can't pair with one outside it.
  let blanked = source;
  for (const span of script.spans) {
    if (span.kind === "marker") hide(span.from, span.to);
    if (span.kind === "note" || span.kind === "boneyard") {
      hide(span.from, span.to);
      blanked = blanked.slice(0, span.from) + source.slice(span.from, span.to).replace(/[^\n]/g, "\0") + blanked.slice(span.to);
    }
  }

  // Line starts, and which lines have inline emphasis or are hidden whole.
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  const lineCount = starts.length;
  const lineFrom = (n: number) => starts[n];
  const lineTo = (n: number) => (n + 1 < lineCount ? starts[n + 1] - 1 : source.length);

  const formatted = new Set<number>();
  for (const [line, role] of script.lineRoles) {
    if (role === "synopsis") hide(lineFrom(line), lineTo(line));
    else formatted.add(line);
  }
  for (const el of script.elements) {
    if (el.type === "page_break") continue;
    for (let line = el.line; line <= el.endLine; line++) formatted.add(line);
  }
  for (const line of formatted) {
    const from = lineFrom(line);
    for (const m of parseInline(blanked.slice(from, lineTo(line))).markers) hide(from + m.from, from + m.to);
  }

  // Each line is shown whole, partly hidden, or hidden whole.
  const ranges: HiddenRange[] = [];
  const add = (from: number, to: number) => {
    const last = ranges[ranges.length - 1];
    if (last && last.to >= from) last.to = Math.max(last.to, to);
    else if (to > from) ranges.push({ from, to });
  };
  const text = (n: number) => source.slice(lineFrom(n), lineTo(n));
  const fullyHidden = (n: number) => {
    let any = false;
    for (let i = lineFrom(n); i < lineTo(n); i++) {
      if (/\s/.test(source[i])) continue;
      if (!hidden[i]) return false;
      any = true;
    }
    return any;
  };

  for (let n = 0; n < lineCount; n++) {
    if (fullyHidden(n)) {
      let last = n;
      while (last + 1 < lineCount && fullyHidden(last + 1)) last++;
      // Removing the lines would leave the blank lines either side of them
      // together, so one of those goes too.
      if ((n === 0 || isBlank(text(n - 1))) && last + 1 < lineCount && isBlank(text(last + 1))) last++;
      if (last + 1 < lineCount) add(lineFrom(n), lineFrom(last + 1));
      else add(n > 0 ? lineTo(n - 1) : 0, source.length);
      n = last;
      continue;
    }

    // Partly hidden: the hidden runs, plus any space left at either end of
    // the line by hiding the markup there (the space after a section's #).
    const from = lineFrom(n);
    const to = lineTo(n);
    let first = from;
    while (first < to && (hidden[first] || /\s/.test(source[first]))) first++;
    let end = to;
    while (end > first && (hidden[end - 1] || /\s/.test(source[end - 1]))) end--;
    const hiddenBefore = hidden.subarray(from, first).includes(1);
    const hiddenAfter = hidden.subarray(end, to).includes(1);
    if (hiddenBefore) add(from, first);
    for (let i = first; i < end; ) {
      if (!hidden[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < end && hidden[j]) j++;
      add(i, j);
      i = j;
    }
    if (hiddenAfter) add(end, to);
  }
  return ranges;
}

/** The text reading view shows: `source` with the hidden ranges taken out. */
export function readingText(source: string): string {
  let out = "";
  let pos = 0;
  for (const { from, to } of readingHiddenRanges(source)) {
    out += source.slice(pos, from);
    pos = to;
  }
  return out + source.slice(pos);
}
