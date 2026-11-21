/** The file extension the plugin opens, without the dot. */
export const FOUNTAIN_EXTENSION = "fountain";

/**
 * The first free path for a script called `name` in `folder`:
 * "Name.fountain", then "Name 1.fountain", "Name 2.fountain", and so on.
 * `folder` is a vault path, with "" or "/" for the vault root.
 */
export function freeScriptPath(folder: string, name: string, exists: (path: string) => boolean): string {
  const prefix = folder === "" || folder === "/" ? "" : `${folder.replace(/\/+$/, "")}/`;
  for (let n = 0; ; n++) {
    const path = `${prefix}${n === 0 ? name : `${name} ${n}`}.${FOUNTAIN_EXTENSION}`;
    if (!exists(path)) return path;
  }
}

/** The first free path for a new script in `folder`: "Untitled.fountain", then "Untitled 1.fountain", and so on. */
export function untitledScriptPath(folder: string, exists: (path: string) => boolean): string {
  return freeScriptPath(folder, "Untitled", exists);
}

/** Whether a vault path is inside a folder (a vault path too), at any depth. An empty folder holds nothing. */
export function isInFolder(path: string, folder: string): boolean {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  return prefix !== "" && path.startsWith(`${prefix}/`);
}
