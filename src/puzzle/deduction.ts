import type { Puzzle } from './generator';
import { computeReadings } from './readings';
import { pickIndex, type Rng } from './rng';
import { findSpecies, type Counts, type SpeciesDef } from './species';

/**
 * 起始假設：
 * - allBiped：全部都是腳最少的那種（里程碑 1 = 全部偵察體）
 * - random：隨機組成，但不會剛好等於答案，讓「預測超過」有機會出現
 */
export type StartAssumption = 'allBiped' | 'random';

export interface DeductionOptions {
  readonly startAssumption?: StartAssumption;
  /** 手套是否裝了批次轉換轉盤（里程碑 2 升級） */
  readonly batch?: boolean;
  /** 固定數量的多隻轉換（推演手套 Lv2 的 Q／W = [2]） */
  readonly fixedCounts?: readonly number[];
  /** startAssumption = 'random' 時使用，預設 Math.random */
  readonly rng?: Rng;
}

export interface DeductionTools {
  readonly batch: boolean;
  /** 允許的固定轉換數量（例如 [2]）；batch 為 true 時任何數量都可以 */
  readonly fixedCounts?: readonly number[];
}

/** 玩家的一次操作；每個「有實際轉換」的操作算一步 */
export type DeductionAction =
  /** 單步：轉換一隻 */
  | { readonly type: 'convert'; readonly from: string; readonly to: string }
  /** 批次：一次轉換 count 隻（需要 tools.batch，或 count 在 tools.fixedCounts 裡） */
  | { readonly type: 'batch'; readonly from: string; readonly to: string; readonly count: number };

/**
 * 推演手套的狀態（不可變）。
 * slots 是全像投影裡排成一列的生物，依「腳多的在 index 0 那端」分群排列；
 * 轉換永遠發生在兩群的交界，所以同種生物一定是連續的一群，
 * 轉回去時也剛好還原最後一隻變形的（堆疊式）。
 */
export interface DeductionState {
  readonly puzzle: Puzzle;
  readonly tools: DeductionTools;
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
  /** 有效操作次數（擋下的操作不算） */
  readonly steps: number;
}

export type DeductionEvent =
  /** 有生物變形了 */
  | 'converted'
  /** 這次變形之後剛好解開 */
  | 'solved'
  /** 沒有足夠的生物可以轉換（到邊界），不計步 */
  | 'blocked'
  /** 已解開，不再接受操作 */
  | 'locked';

export interface ConvertResult {
  readonly state: DeductionState;
  readonly event: DeductionEvent;
  /** 依序變形的位置；blocked / locked 時為空陣列 */
  readonly slots: readonly number[];
}

/** 投影分群的順序：腳多的排前面（index 0 那端），同腳數依清單順序 */
function groupOrder(species: readonly SpeciesDef[]): string[] {
  return species
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.legs - a.s.legs || a.i - b.i)
    .map(({ s }) => s.id);
}

function layoutSlots(species: readonly SpeciesDef[], counts: Counts): string[] {
  return groupOrder(species).flatMap((id) => Array<string>(counts[id] ?? 0).fill(id));
}

function countSlots(species: readonly SpeciesDef[], slots: readonly string[]): Counts {
  const counts: Record<string, number> = Object.fromEntries(species.map((s) => [s.id, 0]));
  for (const id of slots) counts[id]++;
  return counts;
}

/** 把 total 分給 k 種生物的所有方式 */
function compositions(ids: readonly string[], total: number): Counts[] {
  if (ids.length === 1) return [{ [ids[0]]: total }];
  const [head, ...rest] = ids;
  const out: Counts[] = [];
  for (let n = 0; n <= total; n++) {
    for (const tail of compositions(rest, total - n)) out.push({ [head]: n, ...tail });
  }
  return out;
}

function sameCounts(a: Counts, b: Counts): boolean {
  return Object.keys({ ...a, ...b }).every((id) => (a[id] ?? 0) === (b[id] ?? 0));
}

function startCounts(puzzle: Puzzle, assumption: StartAssumption, rng: Rng): Counts {
  const { species, readings, answer } = puzzle;
  if (assumption === 'allBiped') {
    const fewest = species.reduce((a, b) => (b.legs < a.legs ? b : a));
    return { ...Object.fromEntries(species.map((s) => [s.id, 0])), [fewest.id]: readings.N };
  }
  // 依預測受力點由小到大排，讓同一個亂數值對應到直覺的順序（兩種生物時 = 四足數由少到多）
  const legsOf = (c: Counts) => computeReadings(species, c, puzzle.modifiers).L;
  const options = compositions(
    species.map((s) => s.id),
    readings.N,
  )
    .filter((c) => !sameCounts(c, answer))
    .sort((a, b) => legsOf(a) - legsOf(b));
  if (options.length === 0) throw new Error('沒有和答案不同的起始假設');
  return options[pickIndex(rng, options.length)];
}

function withSlots(
  base: Pick<DeductionState, 'puzzle' | 'tools' | 'start' | 'steps'>,
  slots: readonly string[],
): DeductionState {
  const { puzzle } = base;
  const hypothesis = countSlots(puzzle.species, slots);
  const predicted = computeReadings(puzzle.species, hypothesis, puzzle.modifiers).L;
  const actual = puzzle.readings.L;
  return { ...base, slots, hypothesis, predicted, actual, diff: actual - predicted, solved: predicted === actual };
}

export function createDeduction(puzzle: Puzzle, options: DeductionOptions = {}): DeductionState {
  const start = startCounts(puzzle, options.startAssumption ?? 'allBiped', options.rng ?? Math.random);
  const tools: DeductionTools = { batch: options.batch ?? false, fixedCounts: options.fixedCounts ?? [] };
  return withSlots({ puzzle, tools, start, steps: 0 }, layoutSlots(puzzle.species, start));
}

/** 這次要變形哪一隻：from 那一群裡最靠近 to 那一群的那隻 */
function pickSlot(state: DeductionState, from: string, to: string): number {
  const order = groupOrder(state.puzzle.species);
  return order.indexOf(to) < order.indexOf(from) ? state.slots.indexOf(from) : state.slots.lastIndexOf(from);
}

function available(state: DeductionState, from: string): number {
  return state.hypothesis[from] ?? 0;
}

export function canConvert(state: DeductionState, from: string, to: string, count = 1): boolean {
  return !state.solved && from !== to && count >= 1 && available(state, from) >= count;
}

export function apply(state: DeductionState, action: DeductionAction): ConvertResult {
  const { from, to } = action;
  findSpecies(state.puzzle.species, from);
  findSpecies(state.puzzle.species, to);
  const count = action.type === 'batch' ? action.count : 1;
  if (action.type === 'batch' && !state.tools.batch && !(state.tools.fixedCounts ?? []).includes(count)) {
    throw new Error(`手套不能一次轉換 ${count} 隻`);
  }
  if (!Number.isInteger(count)) throw new Error(`轉換數量必須是整數：${count}`);

  if (state.solved) return { state, event: 'locked', slots: [] };
  if (!canConvert(state, from, to, count)) return { state, event: 'blocked', slots: [] };

  let slots = state.slots;
  const changed: number[] = [];
  for (let i = 0; i < count; i++) {
    const slot = pickSlot({ ...state, slots }, from, to);
    const next = slots.slice();
    next[slot] = to;
    slots = next;
    changed.push(slot);
  }
  const next = withSlots({ ...state, steps: state.steps + 1 }, slots);
  return { state: next, event: next.solved ? 'solved' : 'converted', slots: changed };
}

/** 單步轉換一隻的捷徑 */
export function convert(state: DeductionState, from: string, to: string): ConvertResult {
  return apply(state, { type: 'convert', from, to });
}

export type DiffDirection = 'under' | 'over' | 'match';

/** 差值的方向：under = 預測不足（▲橘），over = 預測超過（▼紫），match = 相等（綠） */
export function diffDirection(state: Pick<DeductionState, 'diff'>): DiffDirection {
  if (state.diff > 0) return 'under';
  if (state.diff < 0) return 'over';
  return 'match';
}

/** 換手套工具（例如中途升級）；步數與目前的假設保留 */
export function setTools(state: DeductionState, tools: DeductionTools): DeductionState {
  return { ...state, tools };
}

/** 里程碑 1 的手套設定：從全雙足出發，只有單步轉換 */
export const PHASE1_DEDUCTION: DeductionOptions = { startAssumption: 'allBiped', batch: false };
