import { generatePuzzle, type Puzzle, type PuzzleConfig } from './generator';
import { computeReadings } from './readings';
import type { Rng } from './rng';
import { HUNTER, PHASE1_SPECIES, SCOUT, type Counts } from './species';

/** 封印解除碼的位數：前兩位偵察體、後兩位獵獸 */
export const CODE_LENGTH = 4;

/** 「0104」→ { 偵察體 1, 獵獸 4 }；不是四位數字就回傳 null */
export function parseCode(code: string): Counts | null {
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) return null;
  return { [SCOUT.id]: Number(code.slice(0, 2)), [HUNTER.id]: Number(code.slice(2, 4)) };
}

/** { 偵察體 1, 獵獸 4 } →「0104」 */
export function formatCode(counts: Counts): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return two(counts[SCOUT.id] ?? 0) + two(counts[HUNTER.id] ?? 0);
}

/** 偵察體與獵獸的數量都要對才算對（兩數相加不等於 N 一定是錯的） */
export function checkCode(code: string, answer: Counts): boolean {
  const c = parseCode(code);
  return c !== null && c[SCOUT.id] === (answer[SCOUT.id] ?? 0) && c[HUNTER.id] === (answer[HUNTER.id] ?? 0);
}

/** 答錯換題的設定：生物總數固定為 N，獵獸 1 到 N−1 隻（偵察體也至少 1 隻） */
export function redeployConfig(n: number): PuzzleConfig {
  return {
    species: PHASE1_SPECIES,
    total: [n, n],
    perSpecies: { [SCOUT.id]: [1, n - 1], [HUNTER.id]: [1, n - 1] },
  };
}

/**
 * 封印艙重新佈署生物：N 不變，用原本的隨機產題（generatePuzzle）換一個組成，
 * 獵獸數在 1 到 N−1 之間，而且和原題不同（所以地上的接觸點一定不同）。
 */
export function redeployPuzzle(current: Puzzle, rng: Rng, config: PuzzleConfig = redeployConfig(current.readings.N)): Puzzle {
  const n = current.readings.N;
  const same = (p: Puzzle) => (p.answer[HUNTER.id] ?? 0) === (current.answer[HUNTER.id] ?? 0);
  let p = generatePuzzle(config, rng);
  for (let i = 0; i < 50 && same(p); i++) p = generatePuzzle(config, rng);
  if (same(p)) {
    // 亂數一直抽到同一題（幾乎不可能）：直接換成旁邊的組成
    const h = current.answer[HUNTER.id] ?? 0;
    const next = h + 1 <= n - 1 ? h + 1 : h - 1;
    const answer = { [SCOUT.id]: n - next, [HUNTER.id]: next };
    p = { ...p, answer, readings: computeReadings(p.species, answer, p.modifiers) };
  }
  return p;
}

/** 依目前的組成排出投影的位置：獵獸（腳多）排在 index 0 那端，偵察體在後面 */
export function answerSlots(answer: Counts): string[] {
  return [
    ...Array<string>(answer[HUNTER.id] ?? 0).fill(HUNTER.id),
    ...Array<string>(answer[SCOUT.id] ?? 0).fill(SCOUT.id),
  ];
}
