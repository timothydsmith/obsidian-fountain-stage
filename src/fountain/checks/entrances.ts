/**
 * Entrances and exits: someone speaking after they've gone or before they
 * come on, coming on twice or going twice, or left on stage a long time
 * without a word.
 */

import { type StageIssue, type StagePlot } from "../stage";
import type { Finding } from "./findings";
import { fingerprint } from "./text";

/** "about 6 minutes", at the speaking rate the silence check counts by. */
function aboutMinutes(words: number): string {
  const minutes = Math.max(1, Math.round(words / 150));
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function message(issue: StageIssue): string {
  const { name } = issue;
  const other = issue.otherLine === undefined ? "" : String(issue.otherLine + 1);
  switch (issue.kind) {
    case "speaks-after-exit":
      return `${name} speaks after leaving on line ${other}, with no entrance between.`;
    case "speaks-before-entrance":
      return `${name} speaks before coming on, on line ${other}. Are they off, or already on?`;
    case "enters-twice":
      return `${name} comes on when they're already on stage, since line ${other}.`;
    case "exits-twice":
      return `${name} leaves when they already left, on line ${other}.`;
    case "silent":
      return `${name} is on stage for ${aboutMinutes(issue.words ?? 0)} without a word or being named. Did they go without an exit?`;
  }
}

export function checkEntrances(source: string, plot: StagePlot): Finding[] {
  const lines = source.split("\n");
  return plot.issues.map((issue) => ({
    check: "entrances",
    key: `entrances:${issue.kind}:${issue.name}:${fingerprint(lines[issue.line] ?? "")}:${fingerprint(issue.otherLine === undefined ? "" : (lines[issue.otherLine] ?? ""))}`,
    line: issue.line,
    message: message(issue),
    lines: issue.otherLine === undefined ? undefined : [issue.otherLine],
  }));
}
