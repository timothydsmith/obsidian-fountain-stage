import type { PlayStyle } from "../style";
import { styleKey } from "../userStyles";
import { apt } from "./apt";
import { modern } from "./modern";
import { samuelFrench } from "./samuelFrench";

/** The styles that ship with the plugin, in the order the picker lists them. */
export const BUILT_IN_STYLES: readonly PlayStyle[] = [modern, apt, samuelFrench];

/**
 * Finds a style by its id or name, ignoring case, spaces, hyphens and
 * underscores ("Samuel French" finds samuel_french).
 */
export function findStyle(styles: readonly PlayStyle[], id: string): PlayStyle | undefined {
  const wanted = styleKey(id);
  return styles.find((s) => styleKey(s.id) === wanted) ?? styles.find((s) => styleKey(s.name) === wanted);
}
