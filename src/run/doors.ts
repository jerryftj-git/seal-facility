import { generatePuzzle, HUNTER, PHASE1_SPECIES, SCOUT, type Puzzle, type PuzzleConfig, type Rng } from '../puzzle';
import { RUN_CONFIG } from './runConfig';

/** 第 k 道門（1 起算）的生物數 */
export function creaturesForDoor(k: number, cfg = RUN_CONFIG): number {
  return Math.min(cfg.creatures.base + k, cfg.creatures.max);
}

/** 生物數固定為 N、獵獸 1～N−1 的產題設定（開局出題和答錯換題共用） */
export function doorPuzzleConfig(n: number, cfg = RUN_CONFIG): PuzzleConfig {
  const maxHunter = n + cfg.hunterRange.maxFromN;
  return {
    species: PHASE1_SPECIES,
    total: [n, n],
    perSpecies: { [SCOUT.id]: [1, n - cfg.hunterRange.min], [HUNTER.id]: [cfg.hunterRange.min, maxHunter] },
  };
}

/** 第 k 道門的題目：用原本的隨機產題（generatePuzzle） */
export function doorPuzzle(k: number, rng: Rng, cfg = RUN_CONFIG): Puzzle {
  return generatePuzzle(doorPuzzleConfig(creaturesForDoor(k, cfg), cfg), rng);
}

/** 第 k 段走廊的線條顏色（依序輪流） */
export function corridorColor(k: number, cfg = RUN_CONFIG): number {
  const c = cfg.corridorColors;
  return c[(k - 1) % c.length];
}

/**
 * 有補給的門（寶箱＋側室小電池）排程：lastSupply 是上一道有補給的門。
 * 前 supply.always 道每道都有；之後隨機隔 supply.gaps 其中一個。
 */
export function nextSupplyDoor(lastSupply: number, rng: Rng, cfg = RUN_CONFIG): number {
  if (lastSupply < cfg.supply.always) return lastSupply + 1;
  const g = cfg.supply.gaps;
  return lastSupply + g[Math.min(g.length - 1, Math.floor(rng() * g.length))];
}

/** 每段隨機開一間側室（候選側室的編號） */
export function pickSideRoom(count: number, rng: Rng): number {
  return Math.min(count - 1, Math.floor(rng() * count));
}

/** 分數 = 通過的門數 × 每門分數 */
export function scoreFor(doorsPassed: number, cfg = RUN_CONFIG): number {
  return doorsPassed * cfg.pointsPerDoor;
}
