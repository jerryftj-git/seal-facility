import { describe, expect, it } from 'vitest';
import { apply, convert, createDeduction, minSteps, rate, rateDeduction, type DeductionState } from '../../src/puzzle';
import { makePuzzle, seq } from './helpers';

function solveDirectly(s: DeductionState): DeductionState {
  while (!s.solved) s = (s.diff > 0 ? convert(s, 'scout', 'hunter') : convert(s, 'hunter', 'scout')).state;
  return s;
}

describe('最少步數', () => {
  it('單步、從全雙足出發 = 四足數', () => {
    expect(minSteps({ scout: 7, hunter: 0 }, { scout: 4, hunter: 3 })).toBe(3);
  });

  it('單步、從隨機起點出發 = 起點與答案的四足數之差', () => {
    expect(minSteps({ scout: 1, hunter: 6 }, { scout: 4, hunter: 3 })).toBe(3);
    expect(minSteps({ scout: 6, hunter: 1 }, { scout: 4, hunter: 3 })).toBe(2);
  });

  it('批次 = 1（一次到位），起點等於答案時為 0', () => {
    expect(minSteps({ scout: 7, hunter: 0 }, { scout: 4, hunter: 3 }, { batch: true })).toBe(1);
    expect(minSteps({ scout: 0, hunter: 7 }, { scout: 4, hunter: 3 }, { batch: true })).toBe(1);
    expect(minSteps({ scout: 4, hunter: 3 }, { scout: 4, hunter: 3 }, { batch: true })).toBe(0);
  });

  it('批次、三種生物', () => {
    expect(minSteps({ a: 6, b: 0, c: 0 }, { a: 2, b: 2, c: 2 }, { batch: true })).toBe(2);
  });
});

describe('評級', () => {
  it('S = 最少步數；A ≤ 最少 + 4；其他 B', () => {
    expect(rate(3, 3)).toBe('S');
    expect(rate(4, 3)).toBe('A');
    expect(rate(7, 3)).toBe('A');
    expect(rate(8, 3)).toBe('B');
    expect(rate(50, 1)).toBe('B');
  });

  it('allBiped：直接轉到答案拿 S', () => {
    const s = solveDirectly(createDeduction(makePuzzle(3, 2)));
    expect(rateDeduction(s)).toEqual({ grade: 'S', steps: 2, min: 2 });
  });

  it('allBiped：來回一次拿 A', () => {
    let s = createDeduction(makePuzzle(3, 2));
    s = convert(s, 'scout', 'hunter').state;
    s = convert(s, 'hunter', 'scout').state;
    s = solveDirectly(s);
    expect(rateDeduction(s)).toEqual({ grade: 'A', steps: 4, min: 2 });
  });

  it('random：從全四足往下直接解開拿 S', () => {
    const s = solveDirectly(createDeduction(makePuzzle(4, 2), { startAssumption: 'random', rng: seq(0.99) }));
    expect(rateDeduction(s)).toEqual({ grade: 'S', steps: 4, min: 4 });
  });

  it('random：在邊界往錯的方向按被擋下，不計步，仍是 S', () => {
    // 起點 = 全四足（6），答案 2；先往上被擋下（不計步），再往下 4 步
    let s = createDeduction(makePuzzle(4, 2), { startAssumption: 'random', rng: seq(0.99) });
    s = convert(s, 'scout', 'hunter').state;
    expect(s.steps).toBe(0);
    s = solveDirectly(s);
    expect(rateDeduction(s).grade).toBe('S');
  });

  it('批次：一次到位 S，兩次 A', () => {
    const p = makePuzzle(4, 3);
    const one = apply(createDeduction(p, { batch: true }), { type: 'batch', from: 'scout', to: 'hunter', count: 3 });
    expect(rateDeduction(one.state)).toEqual({ grade: 'S', steps: 1, min: 1 });

    let s = createDeduction(p, { batch: true });
    s = apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 2 }).state;
    s = apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 1 }).state;
    expect(rateDeduction(s)).toEqual({ grade: 'A', steps: 2, min: 1 });
  });
});

describe('random 起點的評級（繞路）', () => {
  it('起點在答案下方卻先往下走，多出的步數讓評級掉到 A', () => {
    // N = 6、答案 2：選項 [0,1,3,4,5,6]，0.2 → index 1 → 起點 1 隻四足
    let s = createDeduction(makePuzzle(4, 2), { startAssumption: 'random', rng: seq(0.2) });
    expect(s.hypothesis.hunter).toBe(1);
    s = convert(s, 'hunter', 'scout').state;
    s = solveDirectly(s);
    expect(rateDeduction(s)).toEqual({ grade: 'A', steps: 3, min: 1 });
  });
});
