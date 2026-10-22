import { describe, expect, it } from 'vitest';
import { AREAS, LEVELS, levelAnswer, levelById, puzzleForLevel, puzzleWithL } from '../../src/levels/levels';
import { computeReadings, createRng, generatePuzzle, HUNTER, PHASE1_CONFIG, PHASE1_SPECIES, SCOUT } from '../../src/puzzle';

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

describe('答錯換題後存的 L', () => {
  it('用生物數＋新的 L 建回題目', () => {
    const p = puzzleWithL(levelById(1), 14);
    expect(p?.answer).toEqual({ [S]: 3, [H]: 2 });
    expect(p?.readings).toEqual({ N: 5, L: 14 });
  });

  it('不合理的 L 回傳 null（改用關卡資料的題目）', () => {
    expect(puzzleWithL(levelById(1), 19)).toBeNull();
    expect(puzzleWithL(levelById(1), 40)).toBeNull();
  });

  it('?seed=7 的舊隨機題剛好就是第一關的 1 偵察體 + 4 獵獸', () => {
    expect(generatePuzzle(PHASE1_CONFIG, createRng(7)).answer).toEqual(levelAnswer(levelById(1)));
  });
});
