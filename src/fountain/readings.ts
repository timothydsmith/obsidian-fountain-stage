/**
 * Readings: times taken from a read-through, scene by scene, kept in a
 * note beside the script (`Play - Readings.md`), and used to calibrate the
 * runtime estimate.
 *
 * Calibration scales the estimate by one factor: how much longer or shorter
 * the scenes read than they were estimated. By words spoken, words per
 * minute goes down by that factor and every pause time up by it; by pages,
 * minutes per page goes up by it. One factor stays steady even from a
 * single reading, where fitting dialogue, stage directions and pauses
 * separately would swing with every scene.
 */

import { formatDuration } from "./runtime";
import type { PauseWord } from "./pauses";
import { safeFileName } from "./titlePage";

export interface SceneTime {
  /** The scene as the outline shows it, with its number if it has one. */
  title: string;
  /** Seconds it took in the reading. */
  read: number;
  /** Seconds it was estimated to take. */
  estimate: number;
}

export interface Reading {
  /** When it started, as written in the note: "22 November 2026, 14:05". */
  when: string;
  /** The draft read, from the title page: "3 (working)". */
  draft?: string;
  /** How the estimate was worked out: "at 150 words a minute". */
  method: string;
  scenes: SceneTime[];
}

/** The readings note's name, without `.md`. */
export function readingsName(title: string): string {
  return `${safeFileName(title)} - Readings`;
}

/** "4:05" or "1:02:30". */
export function clockTime(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * How much longer the reading ran than the estimate: 1.1 for 10 % longer.
 * Only scenes with an estimate count. Undefined with nothing to go on.
 */
export function calibrationFactor(scenes: SceneTime[]): number | undefined {
  const counted = scenes.filter((s) => s.estimate > 0 && s.read > 0);
  const read = counted.reduce((sum, s) => sum + s.read, 0);
  const estimate = counted.reduce((sum, s) => sum + s.estimate, 0);
  return estimate > 0 && read > 0 ? read / estimate : undefined;
}

/** "14 % slower", "6 % faster" or "as estimated". */
export function describeFactor(factor: number): string {
  const percent = Math.round(Math.abs(factor - 1) * 100);
  if (percent === 0) return "as estimated";
  return `${percent} % ${factor > 1 ? "slower" : "faster"}`;
}

export interface RuntimeRates {
  wordsPerMinute: number;
  minutesPerPage: number;
  pauses: PauseWord[];
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** The rates scaled so the estimate takes `factor` times as long. */
export function calibrate(rates: RuntimeRates, factor: number): RuntimeRates {
  return {
    wordsPerMinute: Math.max(1, Math.round(rates.wordsPerMinute / factor)),
    minutesPerPage: round(rates.minutesPerPage * factor, 2),
    pauses: rates.pauses.map((p) => ({ ...p, seconds: round(p.seconds * factor, 1), short: round(p.short * factor, 1), long: round(p.long * factor, 1) })),
  };
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** The readings note with a reading added at the end. */
export function addReading(text: string, play: string, reading: Reading): string {
  const intro = `# Readings of ${play}\n\nTimes from read-throughs, scene by scene, against the runtime estimate at the time.\n`;
  const body = text.trim() === "" ? intro : `${text.replace(/\s*$/, "")}\n`;
  const read = reading.scenes.reduce((sum, s) => sum + s.read, 0);
  const estimate = reading.scenes.reduce((sum, s) => sum + s.estimate, 0);
  const factor = calibrationFactor(reading.scenes);
  const count = `${reading.scenes.length} ${reading.scenes.length === 1 ? "scene" : "scenes"}`;
  const summary = [
    reading.draft ? `Draft ${reading.draft}.` : "",
    `${count} read in ${formatDuration(read)}, against an estimate of ${formatDuration(estimate)} ${reading.method}${factor === undefined ? "" : ` (${describeFactor(factor)})`}.`,
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [
    `## ${reading.when}`,
    "",
    summary,
    "",
    "| Scene | Read | Estimate |",
    "| --- | --- | --- |",
    ...reading.scenes.map((s) => `| ${cell(s.title)} | ${clockTime(s.read)} | ${clockTime(s.estimate)} |`),
  ];
  return `${body}\n${lines.join("\n")}\n`;
}
