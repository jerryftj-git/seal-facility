import { describe, expect, it } from 'vitest';
import {
  answerSlots,
  checkCode,
  createRng,
  formatCode,
  parseCode,
  redeployPuzzle,
} from '../../src/puzzle';
import { makePuzzle } from './helpers';

describe('封印解除碼', () => {
  const lv1 = makePuzzle(1, 4); // 5 隻、18 個接觸點

  it('0104 = 偵察體 1、獵獸 4：答對', () => {
    expect(checkCode('0104', lv1.answer)).toBe(true);
  });

  it('前兩位或後兩位錯都算錯', () => {
    expect(checkCode('0203', lv1.answer)).toBe(false);
    expect(checkCode('0105', lv1.answer)).toBe(false);
    expect(checkCode('0004', lv1.answer)).toBe(false);
    expect(checkCode('0401', lv1.answer)).toBe(false);
  });

  it('兩數相加不等於 N 一定錯（例如 0005 的接觸點也不對）', () => {
    expect(checkCode('0005', lv1.answer)).toBe(false);
    expect(checkCode('0204', lv1.answer)).toBe(false);
  });

  it('不是四位數字就不能送出', () => {
    expect(parseCode('104')).toBeNull();
    expect(parseCode('01a4')).toBeNull();
    expect(parseCode('01045')).toBeNull();
    expect(checkCode('104', lv1.answer)).toBe(false);
  });

  it('格式化：兩位數補零', () => {
    expect(formatCode({ scout: 1, hunter: 4 })).toBe('0104');
    expect(formatCode({ scout: 12, hunter: 3 })).toBe('1203');
    expect(parseCode('1203')).toEqual({ scout: 12, hunter: 3 });
  });
});

describe('答錯換題（重新佈署生物）', () => {
  for (const [scout, hunter] of [
    [1, 4],
    [5, 3],
    [6, 4],
    [1, 1],
  ] as const) {
    const before = makePuzzle(scout, hunter);
    const n = scout + hunter;
    it(`${n} 隻（原本獵獸 ${hunter}）：N 不變、獵獸 1～N−1、和原題不同，L 也不同`, () => {
      for (let seed = 0; seed < 300; seed++) {
        const p = redeployPuzzle(before, createRng(seed));
        expect(p.readings.N).toBe(n);
        expect(p.answer.scout + p.answer.hunter).toBe(n);
        if (n > 2) {
          expect(p.answer.hunter).toBeGreaterThanOrEqual(1);
          expect(p.answer.hunter).toBeLessThanOrEqual(n - 1);
          expect(p.answer.hunter).not.toBe(hunter);
          expect(p.readings.L).not.toBe(before.readings.L);
        }
      }
    });
  }

  it('第一關 5 隻：換題後的 L 在 12～18 之間的偶數、不等於 18', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) seen.add(redeployPuzzle(makePuzzle(1, 4), createRng(seed)).readings.L);
    expect([...seen].sort()).toEqual([12, 14, 16]);
  });
});

describe('投影的排列', () => {
  it('獵獸在 index 0 那端', () => {
    expect(answerSlots({ scout: 2, hunter: 3 })).toEqual(['hunter', 'hunter', 'hunter', 'scout', 'scout']);
  });
});
