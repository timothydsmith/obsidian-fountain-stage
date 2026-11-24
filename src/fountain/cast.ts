/**
 * The smallest cast: the fewest actors who can play every part, with no
 * actor playing two characters who are ever in a scene together. And
 * whether a cast of a given size can do it.
 */

import type { CharacterReport, SceneReport } from "./report";

export interface CastPlan {
  /** The fewest actors, or the fewest found if the search ran out of time. */
  size: number;
  /** The parts each actor plays: the actor with the biggest part first, and each actor's biggest part first. */
  actors: string[][];
  /** Whether it's certainly the fewest. */
  exact: boolean;
  /** The most characters in one scene, which no cast can be smaller than. */
  largestScene: number;
}

/** Steps the search may take before settling for the best plan found. */
const SEARCH_LIMIT = 200_000;

/**
 * Colours the graph of characters who share a scene with as few colours
 * as it can: DSatur to start, then a search for one fewer at a time.
 */
export function castPlan(characters: CharacterReport[], scenes: SceneReport[]): CastPlan {
  // The report lists characters most words first, so the leads are first.
  const cast = characters.filter((c) => c.scenes.length > 0);
  const n = cast.length;
  const largestScene = Math.max(0, ...scenes.map((s) => s.characters.length));
  if (n === 0) return { size: 0, actors: [], exact: true, largestScene };

  const sharing: boolean[][] = cast.map((a) => cast.map((b) => a !== b && a.scenes.some((s) => b.scenes.includes(s))));
  const degree = sharing.map((row) => row.filter(Boolean).length);

  /** Tries to colour every character with at most k colours. */
  const colour = (k: number, budget: { steps: number }): number[] | null => {
    const colours = new Array<number>(n).fill(-1);
    const pick = (): number => {
      // The character with the fewest colours left, then the most clashes, then the biggest part.
      let best = -1;
      let bestSat = -1;
      for (let i = 0; i < n; i++) {
        if (colours[i] >= 0) continue;
        const used = new Set<number>();
        for (let j = 0; j < n; j++) if (sharing[i][j] && colours[j] >= 0) used.add(colours[j]);
        if (used.size > bestSat || (used.size === bestSat && degree[i] > degree[best])) {
          best = i;
          bestSat = used.size;
        }
      }
      return best;
    };
    const step = (placed: number, highest: number): boolean => {
      if (placed === n) return true;
      if (--budget.steps < 0) return false;
      const i = pick();
      // A colour no one has used yet is tried once, which saves trying each.
      for (let c = 0; c <= Math.min(highest + 1, k - 1); c++) {
        if (cast.some((_, j) => sharing[i][j] && colours[j] === c)) continue;
        colours[i] = c;
        if (step(placed + 1, Math.max(highest, c))) return true;
        colours[i] = -1;
        if (budget.steps < 0) return false;
      }
      return false;
    };
    return step(0, -1) ? colours : null;
  };

  // A plan to start from, with as many colours as it takes.
  let best = colour(n, { steps: Number.MAX_SAFE_INTEGER })!;
  let size = Math.max(...best) + 1;
  let exact = size <= largestScene;
  const budget = { steps: SEARCH_LIMIT };
  while (!exact && size > largestScene) {
    const fewer = colour(size - 1, budget);
    if (fewer) {
      best = fewer;
      size = Math.max(...fewer) + 1;
    } else if (budget.steps >= 0) {
      exact = true;
    } else break;
  }
  if (size <= largestScene) exact = true;

  // Small parts go to the actors with the smaller leading parts, so leads double as little as can be.
  const words = cast.map((c) => c.words);
  const lead = (c: number) => best.reduce((first, colour, i) => (colour === c && (first < 0 || i < first) ? i : first), -1);
  for (let moved = true, rounds = 0; moved && rounds < n; rounds++) {
    moved = false;
    for (let i = n - 1; i >= 0; i--) {
      if (lead(best[i]) === i) continue;
      const own = words[lead(best[i])];
      let target = -1;
      for (let c = 0; c < size; c++) {
        if (c === best[i] || best.some((other, j) => other === c && sharing[i][j])) continue;
        const l = lead(c);
        if (l > i) continue;
        if (words[l] < (target < 0 ? own : words[lead(target)])) target = c;
      }
      if (target >= 0) {
        best[i] = target;
        moved = true;
      }
    }
  }

  const actors: string[][] = Array.from({ length: size }, () => []);
  // cast is in report order, so each actor's parts are biggest first and actors come in order of their biggest part.
  best.forEach((c, i) => actors[c].push(cast[i].name));
  const first = (parts: string[]) => cast.findIndex((c) => c.name === parts[0]);
  actors.sort((a, b) => first(a) - first(b));
  return { size, actors: actors.filter((a) => a.length > 0), exact, largestScene };
}

export interface CastFit {
  /** Whether the parts can be shared out among that many actors. */
  fits: boolean;
  /** Scenes with more characters than actors. */
  crowded: SceneReport[];
}

/** Whether a cast of a given size can play every part. */
export function castFits(plan: CastPlan, scenes: SceneReport[], actors: number): CastFit {
  return { fits: plan.size <= actors, crowded: scenes.filter((s) => s.characters.length > actors) };
}
