import { computeReadings, PHASE1_SPECIES, type Puzzle } from '../../src/puzzle';

export function makePuzzle(scout: number, hunter: number): Puzzle {
  const answer = { scout, hunter };
  return { species: PHASE1_SPECIES, modifiers: [], answer, readings: computeReadings(PHASE1_SPECIES, answer) };
}

/** 讀數 L 是奇數，永遠解不開：用來測邊界和隨機操作 */
export function unsolvablePuzzle(N: number): Puzzle {
  return { ...makePuzzle(N - 1, 1), readings: { N, L: 1001 } };
}

/** 回傳固定序列的假亂數 */
export function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}
