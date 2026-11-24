/** What a check finds. */

export type CheckKind = "names" | "directions" | "overlaps" | "phrases" | "pauses" | "entrances";

export interface Finding {
  check: CheckKind;
  /**
   * Names the finding for dismissing it: the check, what it's about, and a
   * fingerprint of the text it's about, so it comes back if that changes.
   */
  key: string;
  /** The line to go to, counting from 0. */
  line: number;
  message: string;
  /** Other lines it's about, such as each place a phrase is repeated. */
  lines?: number[];
  /** Source ranges to mark in the editor. */
  marks?: { from: number; to: number }[];
}
