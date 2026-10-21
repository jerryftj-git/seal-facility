import type { DeductionState } from './deduction';
import type { Counts } from './species';

export type Grade = 'S' | 'A' | 'B';

/** A 評級容許比最少步數多幾步（相當於兩次來回） */
export const A_MARGIN = 4;

/** 從起始假設走到正確組成最少要轉換幾次 */
export function minSteps(start: Counts, answer: Counts): number {
  let n = 0;
  for (const id of Object.keys(answer)) n += Math.max(0, answer[id] - (start[id] ?? 0));
  return n;
}

export function rate(steps: number, min: number): Grade {
  if (steps <= min) return 'S';
  if (steps <= min + A_MARGIN) return 'A';
  return 'B';
}

/** 根據一個已解開的推演狀態給評級 */
export function rateDeduction(state: DeductionState): { grade: Grade; steps: number; min: number } {
  const min = minSteps(state.start, state.puzzle.answer);
  return { grade: rate(state.steps, min), steps: state.steps, min };
}
