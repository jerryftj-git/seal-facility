import { computeReadings, type Modifier, type Readings } from './readings';
import { pickIndex, type Rng } from './rng';
import { HUNTER, PHASE1_SPECIES, SCOUT, type Counts, type SpeciesDef } from './species';

/** 閉區間 [min, max] */
export type Range = readonly [number, number];

export interface PuzzleConfig {
  readonly species: readonly SpeciesDef[];
  /** 總個體數 N 的範圍 */
  readonly total: Range;
  /** 每種生物數量的範圍；沒列出的種類視為 [0, total.max] */
  readonly perSpecies: Readonly<Record<string, Range>>;
  readonly modifiers?: readonly Modifier[];
}

export interface Puzzle {
  readonly species: readonly SpeciesDef[];
  readonly modifiers: readonly Modifier[];
  /** 艙內真正的組成 */
  readonly answer: Counts;
  /** 艙壁顯示的讀數 */
  readonly readings: Readings;
}

/** 里程碑 1：N 5～8、獵獸 1～4、偵察體至少 1 */
export const PHASE1_CONFIG: PuzzleConfig = {
  species: PHASE1_SPECIES,
  total: [5, 8],
  perSpecies: {
    [SCOUT.id]: [1, Infinity],
    [HUNTER.id]: [1, 4],
  },
};

/** 列出所有符合設定的組成（數量很小，直接窮舉） */
export function enumerateCompositions(config: PuzzleConfig): Counts[] {
  const [minTotal, maxTotal] = config.total;
  const ranges = config.species.map((s) => {
    const [lo, hi] = config.perSpecies[s.id] ?? [0, maxTotal];
    return [Math.max(0, lo), Math.min(hi, maxTotal)] as const;
  });

  const out: Counts[] = [];
  const current: number[] = [];
  const walk = (i: number, sum: number) => {
    if (sum > maxTotal) return;
    if (i === config.species.length) {
      if (sum >= minTotal) {
        out.push(Object.fromEntries(config.species.map((s, k) => [s.id, current[k]])));
      }
      return;
    }
    const [lo, hi] = ranges[i];
    for (let n = lo; n <= hi; n++) {
      current[i] = n;
      walk(i + 1, sum + n);
    }
  };
  walk(0, 0);
  return out;
}

/** 從所有合法組成中均勻抽一個 */
export function generatePuzzle(config: PuzzleConfig, rng: Rng): Puzzle {
  const all = enumerateCompositions(config);
  if (all.length === 0) throw new Error('題目設定沒有任何合法組成');
  const answer = all[pickIndex(rng, all.length)];
  const modifiers = config.modifiers ?? [];
  return {
    species: config.species,
    modifiers,
    answer,
    readings: computeReadings(config.species, answer, modifiers),
  };
}
