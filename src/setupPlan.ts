/**
 * What Set up a play makes: the folders named in settings that aren't there
 * yet, and a first script for a vault with none. Kept apart from the dialog
 * so it can be tested.
 */

import type { FountainStageSettings } from "./library";

/** A folder Fountain Stage uses, by the name of its setting. */
export interface SetupFolder {
  name: string;
  path: string;
}

type FolderSettings = Pick<FountainStageSettings, "draftsFolder" | "stylesFolder" | "fontsFolder" | "frameworksFolder" | "beatNotesFolder">;

/** A vault path without slashes at either end, or "" for none or the vault root. */
function trimPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}

/** The folders in settings, in the order settings show them. Blank ones are left out, and a folder named twice is listed once. */
export function setupFolders(settings: FolderSettings): SetupFolder[] {
  const all: SetupFolder[] = [
    { name: "Drafts folder", path: settings.draftsFolder },
    { name: "Beat notes folder", path: settings.beatNotesFolder },
    { name: "Frameworks folder", path: settings.frameworksFolder },
    { name: "Styles folder", path: settings.stylesFolder },
    { name: "Fonts folder", path: settings.fontsFolder },
  ];
  const seen = new Set<string>();
  const out: SetupFolder[] = [];
  for (const folder of all) {
    const path = trimPath(folder.path);
    if (path === "" || seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    out.push({ name: folder.name, path });
  }
  return out;
}

/**
 * The folders to make, parents first, for each path that isn't there:
 * "Fountain Stage", then "Fountain Stage/Styles". Each is made once.
 */
export function foldersToMake(paths: string[], exists: (path: string) => boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const parts = trimPath(path).split("/").filter((part) => part !== "");
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join("/");
      if (seen.has(sub)) continue;
      seen.add(sub);
      if (!exists(sub)) out.push(sub);
    }
  }
  return out;
}

/** A script's file name from its title: without the characters file names can't have, or "Untitled". */
export function scriptFileName(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return name || "Untitled";
}

/** The text of a first script: a title page with the title, and the author if given. */
export function firstScriptText(title: string, author: string): string {
  const lines = [`Title: ${title.trim() || "Untitled"}`];
  if (author.trim()) lines.push("Credit: Written by", `Author: ${author.trim()}`);
  return `${lines.join("\n")}\n\n`;
}
