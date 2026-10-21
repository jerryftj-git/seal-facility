import { describe, expect, it } from 'vitest';
import {
  createRng,
  enumerateCompositions,
  generatePuzzle,
  HUNTER,
  PHASE1_CONFIG,
  SCOUT,
  type PuzzleConfig,
} from '../../src/puzzle';

const SEEDS = Array.from({ length: 2000 }, (_, i) => i * 7919 + 1);

describe('PHASE1 產題', () => {
  it('合法組成剛好 16 種（N 5～8 × 獵獸 1～4）', () => {
    expect(enumerateCompositions(PHASE1_CONFIG)).toHaveLength(16);
  });

  it.each(SEEDS.map((s) => [s]))('種子 %i 的題目在範圍內', (seed) => {
    const { answer, readings } = generatePuzzle(PHASE1_CONFIG, createRng(seed));
    const c = answer.scout;
    const r = answer.hunter;
    expect(readings.N).toBe(c + r);
    expect(readings.L).toBe(2 * c + 4 * r);
    expect(readings.N).toBeGreaterThanOrEqual(5);
    expect(readings.N).toBeLessThanOrEqual(8);
    expect(r).toBeGreaterThanOrEqual(1);
    expect(r).toBeLessThanOrEqual(4);
    expect(c).toBeGreaterThanOrEqual(1);
  });

  it('不會出現全雙足或全四足', () => {
    for (const seed of SEEDS) {
      const { answer, readings } = generatePuzzle(PHASE1_CONFIG, createRng(seed));
      expect(answer.scout).not.toBe(readings.N);
      expect(answer.hunter).not.toBe(readings.N);
    }
  });

  it('16 種組成都抽得到', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const { answer } = generatePuzzle(PHASE1_CONFIG, createRng(seed));
      seen.add(`${answer.scout}-${answer.hunter}`);
    }
    expect(seen.size).toBe(16);
  });

  it('相同種子產出相同題目', () => {
    const a = generatePuzzle(PHASE1_CONFIG, createRng(42));
    const b = generatePuzzle(PHASE1_CONFIG, createRng(42));
    expect(a).toEqual(b);
  });

  it('邊界值：最小 N=5 時獵獸最多 4、偵察體至少 1', () => {
    const n5 = enumerateCompositions(PHASE1_CONFIG).filter((c) => c.scout + c.hunter === 5);
    expect(n5.map((c) => c.hunter).sort()).toEqual([1, 2, 3, 4]);
    expect(Math.min(...n5.map((c) => c.scout))).toBe(1);
  });

  it('rng 回傳 1 附近的值也不會越界', () => {
    const p = generatePuzzle(PHASE1_CONFIG, () => 0.9999999999);
    expect(enumerateCompositions(PHASE1_CONFIG)).toContainEqual(p.answer);
  });
});

describe('產題設定的擴充性', () => {
  it('沒有合法組成時拋錯', () => {
    const bad: PuzzleConfig = { ...PHASE1_CONFIG, total: [1, 1] };
    expect(() => generatePuzzle(bad, createRng(1))).toThrow();
  });

  it('支援三種生物', () => {
    const SIX = { id: 'crawler', name: '爬行體', legs: 6 };
    const config: PuzzleConfig = {
      species: [SCOUT, HUNTER, SIX],
      total: [6, 6],
      perSpecies: { scout: [1, 6], hunter: [1, 6], crawler: [1, 6] },
    };
    for (let seed = 0; seed < 200; seed++) {
      const { answer, readings } = generatePuzzle(config, createRng(seed));
      expect(answer.scout + answer.hunter + answer.crawler).toBe(6);
      expect(readings.L).toBe(2 * answer.scout + 4 * answer.hunter + 6 * answer.crawler);
    }
  });
});
