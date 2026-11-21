/**
 * Act headings: scene headings that a style's `act.pattern` picks out, such
 * as `.ACT ONE`. The PDF prints them in the act style, and the outline,
 * report and editor treat them as acts, so all of them agree.
 */

/** Scene headings starting with the word "Act", in any case. */
export const DEFAULT_ACT_PATTERN = "^ACT\\b";

/** Whether a scene heading's text is an act heading. */
export type IsAct = (heading: string) => boolean;

/** Why a pattern can't be used, or undefined if it can. */
export function actPatternProblem(pattern: string): string | undefined {
  try {
    new RegExp(pattern, "iu");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Matches scene headings against a pattern, ignoring case. A pattern that can't be used matches nothing. */
export function actMatcher(pattern: string = DEFAULT_ACT_PATTERN): IsAct {
  if (actPatternProblem(pattern) !== undefined) return () => false;
  const re = new RegExp(pattern, "iu");
  return (heading) => re.test(heading.trim());
}
