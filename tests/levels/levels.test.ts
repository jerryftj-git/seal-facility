import { describe, expect, it } from 'vitest';
import { AREAS, LEVELS, levelAnswer, levelById, puzzleForLevel } from '../../src/levels/levels';
import {
  apply,
  computeReadings,
  convert,
  createDeduction,
  createRng,
  generatePuzzle,
  HUNTER,
  minSteps,
  PHASE1_CONFIG,
  PHASE1_DEDUCTION,
  PHASE1_SPECIES,
  rateDeduction,
  SCOUT,
  type DeductionState,
  type DeductionTools,
} from '../../src/puzzle';

const S = SCOUT.id;
const H = HUNTER.id;

describe('關卡資料', () => {
  it('三關的數字照表：5／18、8／22、10／28', () => {
    expect(LEVELS.map((l) => [l.id, l.creatures, l.contactPoints])).toEqual([
      [1, 5, 18],
      [2, 8, 22],
      [3, 10, 28],
    ]);
  });

  it('組成由生物數與接觸點推回，而且和表一致', () => {
    expect(levelAnswer(levelById(1))).toEqual({ [S]: 1, [H]: 4 });
    expect(levelAnswer(levelById(2))).toEqual({ [S]: 5, [H]: 3 });
    expect(levelAnswer(levelById(3))).toEqual({ [S]: 6, [H]: 4 });
  });

  it('每一關：偵察體 × 2 ＋ 獵獸 × 4 = 地上的接觸點、加起來 = 生物總數', () => {
    for (const def of LEVELS) {
      const a = levelAnswer(def);
      expect(a[S] + a[H]).toBe(def.creatures);
      expect(computeReadings(PHASE1_SPECIES, a).L).toBe(def.contactPoints);
    }
  });

  it('不合理的資料會丟錯', () => {
    expect(() => levelAnswer({ creatures: 5, contactPoints: 19 })).toThrow();
    expect(() => levelAnswer({ creatures: 5, contactPoints: 8 })).toThrow();
    expect(() => levelAnswer({ creatures: 5, contactPoints: 22 })).toThrow();
  });

  it('三關預設都不是隨機出題；只有第二關以後需要掃描', () => {
    expect(LEVELS.every((l) => l.randomPuzzle === false)).toBe(true);
    expect(LEVELS.map((l) => l.requiresScan)).toEqual([false, true, true]);
  });

  it('區域 1 = 第一關＋第二關（第三關只有資料）', () => {
    expect(AREAS[0].levels).toEqual([1, 2]);
  });

  it('隨機出題欄位為 true 時用原本的隨機產題（同一個種子 → 同一題）', () => {
    const def = { ...levelById(1), randomPuzzle: true };
    const a = puzzleForLevel(def, createRng(42));
    const b = generatePuzzle(PHASE1_CONFIG, createRng(42));
    expect(a).toEqual(b);
  });
});

/** 依序按鍵：'D' = 一隻偵察體變獵獸、'A' = 變回、'W'／'Q' = 一次兩隻 */
function play(state: DeductionState, keys: string): DeductionState {
  for (const k of keys) {
    const r =
      k === 'D'
        ? convert(state, S, H)
        : k === 'A'
          ? convert(state, H, S)
          : apply(state, { type: 'batch', from: k === 'W' ? S : H, to: k === 'W' ? H : S, count: 2 });
    state = r.state;
  }
  return state;
}

describe('第一關改成資料驅動後行為不變（和原本 ?seed=7 的隨機題比對）', () => {
  const old = generatePuzzle(PHASE1_CONFIG, createRng(7));
  const now = puzzleForLevel(levelById(1), createRng(7));

  it('?seed=7 的舊隨機題剛好是 1 偵察體 + 4 獵獸（5 隻、18 個接觸點）', () => {
    expect(old.answer).toEqual({ [S]: 1, [H]: 4 });
    expect(old.readings).toEqual({ N: 5, L: 18 });
  });

  it('題目內容完全相同', () => {
    expect(now).toEqual(old);
  });

  const lv1: DeductionTools = { batch: false, fixedCounts: [] };
  const lv2: DeductionTools = { batch: false, fixedCounts: [2] };
  const cases: [string, DeductionTools, string][] = [
    ['手套 Lv1，最少步', lv1, 'DDDD'],
    ['手套 Lv1，多走兩個來回', lv1, 'DDADDADD'],
    ['手套 Lv1，多走很多', lv1, 'DADADADADDDD'],
    ['手套 Lv2，用 W', lv2, 'WW'],
    ['手套 Lv2，混用', lv2, 'WDD'],
    ['手套 Lv2，繞遠路', lv2, 'WWQWDADADD'],
  ];
  for (const [name, tools, keys] of cases) {
    it(`${name}（${keys}）：步數、最少步數、評級都一樣`, () => {
      const opts = { ...PHASE1_DEDUCTION, fixedCounts: tools.fixedCounts };
      const a = play(createDeduction(old, opts), keys);
      const b = play(createDeduction(now, opts), keys);
      expect(b.slots).toEqual(a.slots);
      expect(b.solved).toBe(a.solved);
      expect(rateDeduction(b)).toEqual(rateDeduction(a));
    });
  }

  it('最少步數由關卡資料算出：第一關 Lv1 = 4、Lv2 = 2；第二關 Lv1 = 3、Lv2 = 2', () => {
    const start1 = { [S]: 5, [H]: 0 };
    const start2 = { [S]: 8, [H]: 0 };
    expect(minSteps(start1, levelAnswer(levelById(1)), lv1)).toBe(4);
    expect(minSteps(start1, levelAnswer(levelById(1)), lv2)).toBe(2);
    expect(minSteps(start2, levelAnswer(levelById(2)), lv1)).toBe(3);
    expect(minSteps(start2, levelAnswer(levelById(2)), lv2)).toBe(2);
  });
});
