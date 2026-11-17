/** The file extension the plugin opens, without the dot. */
export const FOUNTAIN_EXTENSION = "fountain";

/**
 * The first free path for a new script in `folder`: "Untitled.fountain",
 * then "Untitled 1.fountain", "Untitled 2.fountain", and so on.
 * `folder` is a vault path, with "" or "/" for the vault root.
 */
export function untitledScriptPath(folder: string, exists: (path: string) => boolean): string {
  const prefix = folder === "" || folder === "/" ? "" : `${folder.replace(/\/+$/, "")}/`;
  for (let n = 0; ; n++) {
    const name = n === 0 ? "Untitled" : `Untitled ${n}`;
    const path = `${prefix}${name}.${FOUNTAIN_EXTENSION}`;
    if (!exists(path)) return path;
  }
}
