/**
 * The indexes of a longest run of `values` in order: rising (`strict`) or
 * never falling. Undefined values are left out. Used to tell which matched
 * lines kept their order when two versions of a script are compared.
 */
export function longestRun(values: (number | undefined)[], strict: boolean): Set<number> {
  const index: number[] = [];
  values.forEach((v, i) => v !== undefined && index.push(i));
  const tails: number[] = [];
  const previous = new Array<number>(index.length).fill(-1);
  index.forEach((i, k) => {
    const value = values[i] as number;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const tail = values[index[tails[mid]]] as number;
      if (strict ? tail < value : tail <= value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[k] = tails[lo - 1];
    tails[lo] = k;
  });
  const kept = new Set<number>();
  for (let k = tails.length > 0 ? tails[tails.length - 1] : -1; k >= 0; k = previous[k]) kept.add(index[k]);
  return kept;
}
