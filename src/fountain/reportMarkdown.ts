/** A script's report as a Markdown note: a snapshot with tables, to keep, share or print. */

import type { CharacterReport, SceneReport, ScriptReport } from "./report";
import { formatDuration } from "./runtime";

/** "1,234". */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en");
}

/** "2.5", or "–" before the script is laid out. */
export function formatPages(pages: number | undefined): string {
  if (pages === undefined) return "–";
  return pages >= 10 ? String(Math.round(pages)) : String(Math.round(pages * 10) / 10);
}

/** "12%", "<1%" for a little, "–" for none. */
export function formatShare(share: number): string {
  if (share === 0) return "–";
  const percent = Math.round(share * 100);
  return percent === 0 ? "<1%" : `${percent}%`;
}

export function formatRuntime(seconds: number | undefined): string {
  return seconds === undefined ? "–" : formatDuration(seconds);
}

/** "3. Scene Two" for a character's first or last scene. */
export function sceneLabel(scene: SceneReport | undefined): string {
  return scene ? `${scene.number}. ${scene.title}` : "–";
}

/** The scenes a character is first and last in. */
export function firstAndLast(c: CharacterReport, scenes: SceneReport[]): [SceneReport | undefined, SceneReport | undefined] {
  return [scenes[c.scenes[0]], scenes[c.scenes[c.scenes.length - 1]]];
}

/** The totals, as label and value. */
export function totalsRows({ totals }: ScriptReport): [string, string][] {
  return [
    ["Pages", totals.pages === undefined ? "–" : formatCount(totals.pages)],
    ["Runtime", formatRuntime(totals.seconds)],
    ["Words spoken", formatCount(totals.words)],
    ["Speeches", formatCount(totals.speeches)],
    ["Acts", formatCount(totals.acts)],
    ["Scenes", formatCount(totals.scenes)],
    ["Characters", formatCount(totals.characters)],
  ];
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function table(header: string[], rows: string[][], align?: ("left" | "right" | "center")[]): string {
  const rule = header.map((_, i) => (align?.[i] === "right" ? "---:" : align?.[i] === "center" ? ":---:" : "---"));
  return [header, rule, ...rows].map((row, i) => `| ${(i === 1 ? row : row.map(cell)).join(" | ")} |`).join("\n");
}

export interface ReportNoteOptions {
  /** The script's name. */
  title: string;
  /** When the report was made, as it should read. */
  date: string;
  /** How the runtime is estimated, as it should read: "the words spoken". */
  method: string;
}

export function reportMarkdown(report: ScriptReport, options: ReportNoteOptions): string {
  const { characters, scenes } = report;
  const out: string[] = [];
  out.push(`# ${options.title}: report`, "", `Made ${options.date}. Runtimes are estimated from ${options.method}.`, "");

  out.push("## Totals", "");
  for (const [label, value] of totalsRows(report)) out.push(`- ${label}: ${value}`);
  out.push("");

  out.push("## Characters", "");
  out.push(
    table(
      ["Character", "Speeches", "Words", "Share", "Speaking", "Scenes", "First scene", "Last scene"],
      characters.map((c) => {
        const [first, last] = firstAndLast(c, scenes);
        return [
          c.name,
          formatCount(c.speeches),
          formatCount(c.words),
          formatShare(c.share),
          c.words > 0 ? formatDuration(c.seconds) : "–",
          formatCount(c.scenes.length),
          sceneLabel(first),
          sceneLabel(last),
        ];
      }),
      ["left", "right", "right", "right", "right", "right", "left", "left"],
    ),
    "",
  );

  out.push("## Scenes", "");
  out.push(
    table(
      ["#", "Scene", "Act", "Pages", "Runtime", "Speeches", "Words", "Characters"],
      scenes.map((s) => [
        String(s.number),
        s.title,
        s.act ?? "",
        formatPages(s.pages),
        formatRuntime(s.seconds),
        formatCount(s.speeches),
        formatCount(s.words),
        s.characters.join(", "),
      ]),
      ["right", "left", "left", "right", "right", "right", "right", "left"],
    ),
    "",
  );

  const cast = characters.filter((c) => c.scenes.length > 0);
  if (cast.length > 0 && scenes.length > 0) {
    out.push("## Who's in each scene", "", "Scenes are numbered as in the table above.", "");
    out.push(
      table(
        ["Character", ...scenes.map((s) => String(s.number))],
        cast.map((c) => [c.name, ...scenes.map((_, i) => (c.scenes.includes(i) ? "●" : ""))]),
        ["left", ...scenes.map(() => "center" as const)],
      ),
      "",
    );
  }

  const doubles = cast.filter((c) => c.couldDouble.length > 0);
  out.push("## Doubling", "");
  if (doubles.length === 0) {
    out.push("Every character shares a scene with every other, so no one actor can play two of them.", "");
  } else {
    out.push("Characters who never share a scene, so one actor could play both:", "");
    for (const c of doubles) out.push(`- **${c.name}** with ${c.couldDouble.join(", ")}`);
    out.push("");
  }
  return out.join("\n");
}
