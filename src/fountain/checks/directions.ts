/**
 * The stage direction check: directions an actor can't play ("she
 * realises"), film language ("we see"), phrases of your own, and
 * directions that run long.
 */

import type { ParsedScript } from "../parser";
import { countWords, isPreface } from "../runtime";
import type { Finding } from "./findings";
import { findPhrase, fingerprint } from "./text";

/** Thoughts and feelings an audience can't see unless the actor shows them some other way. */
export const UNPLAYABLE_PHRASES = [
  "realises", "realizes", "realised", "realized", "realising", "realizing",
  "remembers", "remembered", "remembering", "recalls", "recalled",
  "wonders", "wondered", "wondering",
  "decides", "decided",
  "knows", "knew",
  "understands", "understood",
  "considers", "wishes", "wished", "hopes", "hoped",
  "thinks", "thought to herself", "thought to himself",
  "is reminded", "can't help but", "cannot help but", "secretly", "inwardly",
];

/** The language of a screenplay. */
export const FILM_PHRASES = [
  "we see", "we hear", "we watch", "we follow", "we cut", "we pan",
  "camera", "close on", "close-up", "close up on", "angle on", "pan to", "pans to",
  "zoom in", "zooms in", "zoom out", "cut to", "smash cut", "dissolve to", "montage", "off screen", "offscreen",
];

/** A direction of more words than this runs long. */
export const LONG_DIRECTION_WORDS = 60;

/** Text with boneyard and notes blanked out, the same length, so offsets still match the source. */
export function visibleSource(source: string, script: ParsedScript): string {
  const hidden = script.spans.filter((s) => s.kind === "note" || s.kind === "boneyard").sort((a, b) => a.from - b.from);
  if (hidden.length === 0) return source;
  const parts: string[] = [];
  let at = 0;
  for (const span of hidden) {
    if (span.from < at) continue;
    parts.push(source.slice(at, span.from), source.slice(span.from, span.to).replace(/[^\n]/g, " "));
    at = span.to;
  }
  parts.push(source.slice(at));
  return parts.join("");
}

export function checkDirections(source: string, script: ParsedScript, ownPhrases: readonly string[] = []): Finding[] {
  const visible = visibleSource(source, script);
  const groups: { kind: string; phrases: readonly string[]; message: (phrase: string) => string }[] = [
    { kind: "unplayable", phrases: UNPLAYABLE_PHRASES, message: (p) => `"${p}": the audience only sees what the actor can play.` },
    { kind: "film", phrases: FILM_PHRASES, message: (p) => `"${p}" is screen language.` },
    { kind: "own", phrases: ownPhrases.map((p) => p.trim()).filter(Boolean), message: (p) => `"${p}" is one of your phrases to check.` },
  ];
  const findings: Finding[] = [];
  for (const el of script.elements) {
    // Stage directions, not lyrics (~), which are sung.
    if (el.type !== "action" || el.italic || isPreface(el)) continue;
    const text = visible.slice(el.from, el.to);
    const print = fingerprint(el.text);
    for (const group of groups) {
      for (const phrase of group.phrases) {
        const found = findPhrase(text, phrase);
        if (found.length === 0) continue;
        const written = text.slice(found[0].from, found[0].to).replace(/\s+/g, " ");
        findings.push({
          check: "directions",
          key: `directions:${group.kind}:${phrase.toLowerCase()}:${print}`,
          line: el.line,
          message: group.message(written),
          marks: found.map((f) => ({ from: el.from + f.from, to: el.from + f.to })),
        });
      }
    }
    const words = countWords(el.text);
    if (words > LONG_DIRECTION_WORDS) {
      findings.push({
        check: "directions",
        key: `directions:long:${print}`,
        line: el.line,
        message: `A stage direction of ${words} words. Could it be shorter, or split up?`,
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}
