import type { DeductionState, DeductionTools } from './deduction';
import type { Counts } from './species';

export type Grade = 'S' | 'A' | 'B';

/** A 評級容許比最少步數多幾步（相當於兩次來回） */
export const A_MARGIN = 4;

/**
 * 從起始假設走到正確組成最少要幾步。
 * - 單步轉換：每隻要換的生物都要一步（兩種生物時 = 起點與答案的四足數之差）
 * - 批次轉換：每一對「多的種類 → 少的種類」一次到位。貪婪配對，兩種生物時是精確值。
 */
export function minSteps(start: Counts, answer: Counts, tools: DeductionTools = { batch: false }): number {
  const ids = Object.keys({ ...start, ...answer });
  const delta = ids.map((id) => (answer[id] ?? 0) - (start[id] ?? 0));
  if (!tools.batch) return delta.reduce((sum, d) => sum + Math.max(0, d), 0);

  const surplus = delta.filter((d) => d < 0).map((d) => -d).sort((a, b) => b - a);
  const deficit = delta.filter((d) => d > 0).sort((a, b) => b - a);
  let actions = 0;
  while (surplus.length > 0 && deficit.length > 0) {
    const moved = Math.min(surplus[0], deficit[0]);
    surplus[0] -= moved;
    deficit[0] -= moved;
    actions++;
    if (surplus[0] === 0) surplus.shift();
    if (deficit[0] === 0) deficit.shift();
    surplus.sort((a, b) => b - a);
    deficit.sort((a, b) => b - a);
  }
  return actions;
}

export function rate(steps: number, min: number): Grade {
  if (steps <= min) return 'S';
  if (steps <= min + A_MARGIN) return 'A';
  return 'B';
}

/** 根據一個已解開的推演狀態給評級 */
export function rateDeduction(state: DeductionState): { grade: Grade; steps: number; min: number } {
  const min = minSteps(state.start, state.puzzle.answer, state.tools);
  return { grade: rate(state.steps, min), steps: state.steps, min };
}
