/**
 * Links to vault notes, written as the Fountain plugin writes them: a note
 * that starts with `>`, as in `[[>target]]` or `[[>target|display text]]`.
 * The target is found as Obsidian finds a link's: by name or path, with or
 * without `.md`. Being notes, links print only when notes do, and then as
 * their display text.
 */

import { parseFountain, type ParsedScript } from "./parser";

/** A link in a script, with its offsets in the source. */
export interface ScriptLink {
  /** The whole `[[>…]]`. */
  from: number;
  to: number;
  /** The target as written, trimmed. */
  target: string;
  targetFrom: number;
  targetTo: number;
  /** The display text as written, if any, trimmed. */
  display?: string;
  /** The text the link shows: its display text, or else its target's name. */
  label: string;
  labelFrom: number;
  labelTo: number;
}

const LINK_NOTE_RE = /^\s*>/;

/** Whether a note's text (between `[[` and `]]`) is a link. */
export function isLinkNote(text: string): boolean {
  return LINK_NOTE_RE.test(text);
}

/** A target's name, as a link without display text shows it: the file name without its folder, `.md` or heading. */
export function targetName(target: string): string {
  const path = linkPath(target);
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "") || target;
}

/** The part of a target that names a file, without any `#heading`. */
export function linkPath(target: string): string {
  const hash = target.indexOf("#");
  return (hash >= 0 ? target.slice(0, hash) : target).trim();
}

/** The target and display text of a link note's text, or undefined if it isn't a link. */
export function parseLinkNote(text: string): { target: string; display?: string } | undefined {
  if (!isLinkNote(text)) return undefined;
  const body = text.replace(LINK_NOTE_RE, "");
  const bar = body.indexOf("|");
  const target = (bar >= 0 ? body.slice(0, bar) : body).trim();
  if (!target) return undefined;
  const display = bar >= 0 ? body.slice(bar + 1).trim() : "";
  return display ? { target, display } : { target };
}

/** What a link note prints as, with notes included: its display text, or its target's name. */
export function linkNoteLabel(text: string): string | undefined {
  const link = parseLinkNote(text);
  return link && (link.display ?? targetName(link.target));
}

/** Trims a slice of the source, returning its offsets. */
function trimmed(source: string, from: number, to: number): [number, number] {
  while (from < to && /\s/.test(source[from])) from++;
  while (to > from && /\s/.test(source[to - 1])) to--;
  return [from, to];
}

/** The links in a script, in order. Links can't run across lines. */
export function findLinks(source: string, script: ParsedScript = parseFountain(source)): ScriptLink[] {
  const links: ScriptLink[] = [];
  for (const span of script.spans) {
    if (span.kind !== "note") continue;
    const innerFrom = span.from + 2;
    const innerTo = span.to - 2;
    const inner = source.slice(innerFrom, innerTo);
    if (!isLinkNote(inner) || inner.includes("\n")) continue;
    const start = innerFrom + inner.indexOf(">") + 1;
    const bar = source.indexOf("|", start);
    const targetEnd = bar >= 0 && bar < innerTo ? bar : innerTo;
    const [targetFrom, targetTo] = trimmed(source, start, targetEnd);
    if (targetFrom === targetTo) continue;
    const target = source.slice(targetFrom, targetTo);
    const link: ScriptLink = { from: span.from, to: span.to, target, targetFrom, targetTo, label: "", labelFrom: 0, labelTo: 0 };
    const [displayFrom, displayTo] = targetEnd < innerTo ? trimmed(source, targetEnd + 1, innerTo) : [innerTo, innerTo];
    if (displayTo > displayFrom) {
      link.display = source.slice(displayFrom, displayTo);
      link.label = link.display;
      link.labelFrom = displayFrom;
      link.labelTo = displayTo;
    } else {
      // The name within the target: after any folder, before `.md` or a heading.
      const name = targetName(target);
      const at = target.lastIndexOf(name, target.indexOf("#") >= 0 ? target.indexOf("#") : target.length);
      link.label = name;
      link.labelFrom = targetFrom + Math.max(0, at);
      link.labelTo = link.labelFrom + (at >= 0 ? name.length : target.length);
    }
    links.push(link);
  }
  return links;
}

/** A text change, in the source as it was. */
export interface LinkEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * Whether a link's target named the file that was at `oldPath`: the whole
 * path, or its end ("Notes/Ibsen" or "Ibsen" for `Research/Notes/Ibsen.md`),
 * with or without `.md`. Case doesn't matter, as in Obsidian.
 */
export function targetNames(target: string, oldPath: string): boolean {
  const path = linkPath(target).replace(/\.md$/i, "").toLowerCase();
  const old = oldPath.replace(/\.md$/i, "").toLowerCase();
  return path !== "" && (old === path || old.endsWith(`/${path}`));
}

/**
 * The target rewritten for the file's new path, in the form it was written:
 * a target written with folders gets the new path, one written as a name
 * gets `shortName` (the new name, with as much of its path as it needs to
 * be unambiguous). `.md` and any heading are kept.
 */
export function renamedTarget(target: string, newPath: string, shortName: string): string {
  const path = linkPath(target);
  const heading = target.slice(path.length);
  const withMd = /\.md$/i.test(path);
  const bare = path.includes("/") ? newPath.replace(/\.md$/i, "") : shortName.replace(/\.md$/i, "");
  return `${bare}${withMd ? ".md" : ""}${heading}`;
}

/**
 * The edits that follow a renamed note: each link whose target named the
 * file at `oldPath`, and doesn't now name some other file (`stillResolves`),
 * gets the new target.
 */
export function renameEdits(
  links: readonly ScriptLink[],
  oldPath: string,
  newPath: string,
  shortName: string,
  stillResolves: (target: string) => boolean,
): LinkEdit[] {
  const edits: LinkEdit[] = [];
  for (const link of links) {
    if (!targetNames(link.target, oldPath) || stillResolves(link.target)) continue;
    const insert = renamedTarget(link.target, newPath, shortName);
    if (insert !== link.target) edits.push({ from: link.targetFrom, to: link.targetTo, insert });
  }
  return edits;
}

/** Each target linked to, once, in order of its first link. Targets that differ only in case or `.md` count as one. */
export function linkedTargets(links: readonly ScriptLink[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of links) {
    const key = linkPath(link.target).replace(/\.md$/i, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link.target);
  }
  return out;
}
