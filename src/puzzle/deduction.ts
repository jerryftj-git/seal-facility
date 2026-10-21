import type { Puzzle } from './generator';
import { computeReadings } from './readings';
import { findSpecies, type Counts } from './species';

/** 一次轉換：把 slot 上的生物從 from 變成 to */
interface Conversion {
  readonly slot: number;
  readonly from: string;
  readonly to: string;
}

/**
 * 推演手套的狀態（不可變）。
 * slots 是全像投影裡排成一列的生物，index 0 是固定的「那一端」。
 */
export interface DeductionState {
  readonly puzzle: Puzzle;
  readonly slots: readonly string[];
  /** 起始假設（用來算最少步數） */
  readonly start: Counts;
  readonly hypothesis: Counts;
  /** 依目前假設算出的觸地受力點 */
  readonly predicted: number;
  /** 艙壁上的實際讀數 L */
  readonly actual: number;
  /** actual − predicted；正數代表預測不足 */
  readonly diff: number;
  readonly solved: boolean;
  /** 有效轉換次數（擋下的操作不算） */
  readonly steps: number;
  /** 轉換堆疊：轉回時還原最後一隻變形的 */
  readonly history: readonly Conversion[];
}

export type DeductionEvent =
  /** 有一隻生物變形了 */
  | 'converted'
  /** 這次變形之後剛好解開 */
  | 'solved'
  /** 已經沒有可以轉換的生物（到邊界），不計步 */
  | 'blocked'
  /** 已解開，不再接受操作 */
  | 'locked';

export interface ConvertResult {
  readonly state: DeductionState;
  readonly event: DeductionEvent;
  /** 變形的位置，blocked / locked 時為 null */
  readonly slot: number | null;
}

function countSlots(puzzle: Puzzle, slots: readonly string[]): Counts {
  const counts: Record<string, number> = Object.fromEntries(puzzle.species.map((s) => [s.id, 0]));
  for (const id of slots) counts[id]++;
  return counts;
}

function withSlots(
  prev: Pick<DeductionState, 'puzzle' | 'steps' | 'history'> & { start?: Counts },
  slots: readonly string[],
): DeductionState {
  const { puzzle } = prev;
  const hypothesis = countSlots(puzzle, slots);
  const predicted = computeReadings(puzzle.species, hypothesis, puzzle.modifiers).L;
  const actual = puzzle.readings.L;
  return {
    puzzle,
    slots,
    start: prev.start ?? hypothesis,
    hypothesis,
    predicted,
    actual,
    diff: actual - predicted,
    solved: predicted === actual,
    steps: prev.steps,
    history: prev.history,
  };
}

/** 一開始假設全部都是 startSpeciesId（里程碑 1 是全部偵察體） */
export function createDeduction(puzzle: Puzzle, startSpeciesId: string): DeductionState {
  findSpecies(puzzle.species, startSpeciesId);
  const slots = Array.from({ length: puzzle.readings.N }, () => startSpeciesId);
  return withSlots({ puzzle, steps: 0, history: [] }, slots);
}

/** 決定這次要變形哪一隻：剛好是上一步的反向就還原那一隻，否則從 index 0 那端找第一隻 */
function pickSlot(state: DeductionState, from: string, to: string): number {
  const last = state.history[state.history.length - 1];
  if (last && last.from === to && last.to === from) return last.slot;
  return state.slots.indexOf(from);
}

export function canConvert(state: DeductionState, from: string, to: string): boolean {
  return !state.solved && from !== to && state.slots.includes(from);
}

export function convert(state: DeductionState, from: string, to: string): ConvertResult {
  findSpecies(state.puzzle.species, from);
  findSpecies(state.puzzle.species, to);
  if (state.solved) return { state, event: 'locked', slot: null };
  if (!canConvert(state, from, to)) return { state, event: 'blocked', slot: null };

  const slot = pickSlot(state, from, to);
  const last = state.history[state.history.length - 1];
  const isUndo = last !== undefined && last.slot === slot && last.from === to && last.to === from;
  const history = isUndo ? state.history.slice(0, -1) : [...state.history, { slot, from, to }];

  const slots = state.slots.slice();
  slots[slot] = to;
  const next = withSlots({ puzzle: state.puzzle, start: state.start, steps: state.steps + 1, history }, slots);
  return { state: next, event: next.solved ? 'solved' : 'converted', slot };
}

export type DiffDirection = 'under' | 'over' | 'match';

/** 差值的方向：under = 預測不足（▲橘），over = 預測超過（▼紫），match = 相等（綠） */
export function diffDirection(state: Pick<DeductionState, 'diff'>): DiffDirection {
  if (state.diff > 0) return 'under';
  if (state.diff < 0) return 'over';
  return 'match';
}
