import type { PlayStyle } from "../style";
import { apt } from "./apt";
import { modern } from "./modern";
import { samuelFrench } from "./samuelFrench";

/** The styles that ship with the plugin, in the order the picker lists them. */
export const BUILT_IN_STYLES: readonly PlayStyle[] = [modern, apt, samuelFrench];

/** Finds a style by its id, ignoring case, spaces, hyphens and underscores ("Samuel French" finds samuel_french). */
export function findStyle(styles: readonly PlayStyle[], id: string): PlayStyle | undefined {
  const key = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const wanted = key(id);
  return styles.find((s) => key(s.id) === wanted);
}
