/**
 * Overlap marks: Caryl Churchill's slash in a speech, where the next
 * speaker starts talking over it. A slash between two letters or numbers
 * ("and/or", "24/7") isn't one.
 */

import type { ParsedScript } from "../parser";
import { visibleSource } from "./directions";
import type { Finding } from "./findings";
import { fingerprint, speechesOf } from "./text";

/** Where the overlap slashes are in a piece of dialogue, as offsets into it. */
export function overlapSlashes(text: string): number[] {
  const found: number[] = [];
  const word = /[\p{L}\p{N}]/u;
  for (let i = text.indexOf("/"); i >= 0; i = text.indexOf("/", i + 1)) {
    if (!(word.test(text[i - 1] ?? "") && word.test(text[i + 1] ?? ""))) found.push(i);
  }
  return found;
}

/** Speeches with an overlap slash and no speech straight after them to overlap with. */
export function checkOverlaps(source: string, script: ParsedScript): Finding[] {
  const findings: Finding[] = [];
  const { elements } = script;
  const visible = visibleSource(source, script);
  for (const speech of speechesOf(script)) {
    const marks: { from: number; to: number }[] = [];
    let line = -1;
    for (const d of speech.dialogue) {
      const text = visible.slice(d.from, d.to);
      for (const at of overlapSlashes(text)) {
        marks.push({ from: d.from + at, to: d.from + at + 1 });
        if (line < 0) line = d.line;
      }
    }
    if (marks.length === 0) continue;
    const next = elements.find((el) => el.line > speech.endLine);
    if (next?.type === "character") continue;
    findings.push({
      check: "overlaps",
      key: `overlaps:${speech.name}:${fingerprint(speech.text)}`,
      line,
      message: `${speech.name}'s speech has an overlap slash, but no speech follows it to come in over it.`,
      marks,
    });
  }
  return findings;
}
