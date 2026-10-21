import { describe, expect, it } from 'vitest';
import {
  apply,
  canConvert,
  convert,
  createDeduction,
  createRng,
  diffDirection,
  enumerateCompositions,
  generatePuzzle,
  PHASE1_CONFIG,
  type DeductionState,
} from '../../src/puzzle';
import { makePuzzle, seq, unsolvablePuzzle } from './helpers';

const toHunter = (s: DeductionState) => convert(s, 'scout', 'hunter');
const toScout = (s: DeductionState) => convert(s, 'hunter', 'scout');

/** 四足一定是從 index 0 開始連續的一群 */
function expectContiguous(s: DeductionState) {
  const r = s.hypothesis.hunter;
  expect(s.slots.slice(0, r).every((x) => x === 'hunter')).toBe(true);
  expect(s.slots.slice(r).every((x) => x === 'scout')).toBe(true);
}

describe('起始假設 allBiped（預設）', () => {
  it('初始為全部雙足：預測 2N、差 = L − 2N', () => {
    const s = createDeduction(makePuzzle(4, 3));
    expect(s.hypothesis).toEqual({ scout: 7, hunter: 0 });
    expect(s.start).toEqual({ scout: 7, hunter: 0 });
    expect(s.predicted).toBe(14);
    expect(s.actual).toBe(20);
    expect(s.diff).toBe(6);
    expect(s.steps).toBe(0);
    expect(s.solved).toBe(false);
    expect(diffDirection(s)).toBe('under');
  });

  it('明確指定 allBiped 和預設相同', () => {
    expect(createDeduction(makePuzzle(4, 3), { startAssumption: 'allBiped' })).toEqual(
      createDeduction(makePuzzle(4, 3)),
    );
  });

  it('轉一隻為四足：預測 +2、差 −2、步數 +1，從 index 0 開始', () => {
    const r1 = toHunter(createDeduction(makePuzzle(4, 3)));
    expect(r1.event).toBe('converted');
    expect(r1.slots).toEqual([0]);
    expect(r1.state.predicted).toBe(16);
    expect(r1.state.diff).toBe(4);
    expect(r1.state.steps).toBe(1);
    expect(toHunter(r1.state).slots).toEqual([1]);
  });

  it('不改動原本的狀態', () => {
    const s0 = createDeduction(makePuzzle(4, 3));
    const snapshot = JSON.stringify(s0);
    toHunter(s0);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('全雙足時再轉雙足：被擋下、不計步', () => {
    const s0 = createDeduction(makePuzzle(4, 3));
    const r = toScout(s0);
    expect(r.event).toBe('blocked');
    expect(r.slots).toEqual([]);
    expect(r.state).toBe(s0);
    expect(canConvert(s0, 'hunter', 'scout')).toBe(false);
    expect(canConvert(s0, 'scout', 'hunter')).toBe(true);
  });

  it('剛好 r 次轉換就解開，事件為 solved', () => {
    let s = createDeduction(makePuzzle(4, 3));
    s = toHunter(s).state;
    s = toHunter(s).state;
    const last = toHunter(s);
    expect(last.event).toBe('solved');
    expect(last.state.solved).toBe(true);
    expect(last.state.diff).toBe(0);
    expect(diffDirection(last.state)).toBe('match');
    expect(last.state.steps).toBe(3);
  });

  it('解開後鎖定，不再接受操作也不計步', () => {
    const s = toHunter(createDeduction(makePuzzle(4, 1))).state;
    expect(s.solved).toBe(true);
    for (const r of [toHunter(s), toScout(s)]) {
      expect(r.event).toBe('locked');
      expect(r.state.steps).toBe(1);
    }
    expect(canConvert(s, 'scout', 'hunter')).toBe(false);
  });

  it('可以推到全四足（r\' = N），之後再轉四足被擋下、不計步', () => {
    let s = createDeduction(unsolvablePuzzle(5));
    for (let i = 0; i < 5; i++) s = toHunter(s).state;
    expect(s.hypothesis).toEqual({ scout: 0, hunter: 5 });
    expect(s.steps).toBe(5);
    expect(canConvert(s, 'scout', 'hunter')).toBe(false);
    const r = toHunter(s);
    expect(r.event).toBe('blocked');
    expect(r.state.steps).toBe(5);
  });

  it('來回操作每一次都計步', () => {
    let s = createDeduction(makePuzzle(4, 3));
    s = toHunter(s).state;
    s = toScout(s).state;
    s = toHunter(s).state;
    expect(s.steps).toBe(3);
    expect(s.hypothesis).toEqual({ scout: 6, hunter: 1 });
  });

  it('轉回雙足時還原最後一隻變形的（堆疊式）', () => {
    let s = createDeduction(makePuzzle(2, 4));
    s = toHunter(s).state; // slot 0
    s = toHunter(s).state; // slot 1
    s = toHunter(s).state; // slot 2
    const back = toScout(s);
    expect(back.slots).toEqual([2]);
    expect(back.state.slots.slice(0, 3)).toEqual(['hunter', 'hunter', 'scout']);
    expect(toHunter(back.state).slots).toEqual([2]);
  });

  it('不論怎麼按，四足永遠是從 index 0 開始連續的一群', () => {
    const rng = createRng(7);
    let s = createDeduction(unsolvablePuzzle(8));
    let sawFull = false;
    for (let i = 0; i < 500; i++) {
      s = (rng() < 0.55 ? toHunter(s) : toScout(s)).state;
      expectContiguous(s);
      if (s.hypothesis.hunter === 8) sawFull = true;
    }
    expect(s.steps).toBeGreaterThan(100);
    expect(sawFull).toBe(true);
  });

  it('未知的生物種類拋錯', () => {
    const s = createDeduction(makePuzzle(4, 3));
    expect(() => convert(s, 'chicken', 'hunter')).toThrow();
  });
});

describe('起始假設 random', () => {
  const random = (seed: number) => ({ startAssumption: 'random' as const, rng: createRng(seed) });

  it('起始四足數在 0～N 之間，且不等於答案', () => {
    for (const answer of enumerateCompositions(PHASE1_CONFIG)) {
      const puzzle = makePuzzle(answer.scout, answer.hunter);
      for (let seed = 0; seed < 100; seed++) {
        const s = createDeduction(puzzle, random(seed));
        const r = s.hypothesis.hunter;
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(puzzle.readings.N);
        expect(r).not.toBe(answer.hunter);
        expect(s.hypothesis.scout + r).toBe(puzzle.readings.N);
        expect(s.start).toEqual(s.hypothesis);
        expect(s.solved).toBe(false);
        expectContiguous(s);
      }
    }
  });

  it('0～N 中除了答案以外的值都抽得到（含全雙足、全四足）', () => {
    const puzzle = makePuzzle(4, 2); // N = 6
    const seen = new Set<number>();
    for (let seed = 0; seed < 500; seed++) seen.add(createDeduction(puzzle, random(seed)).hypothesis.hunter);
    expect([...seen].sort()).toEqual([0, 1, 3, 4, 5, 6]);
  });

  it('相同種子得到相同起點', () => {
    const p = makePuzzle(4, 2);
    expect(createDeduction(p, random(9))).toEqual(createDeduction(p, random(9)));
  });

  it('起點四足多於答案時：差為負、方向 over（▼）', () => {
    // N = 6 時除了答案 2 以外有 7 − 1 = 6 個選項 [0,1,3,4,5,6]，0.99 抽到最後一個 = 全四足
    const s = createDeduction(makePuzzle(4, 2), { startAssumption: 'random', rng: seq(0.99) });
    expect(s.hypothesis).toEqual({ scout: 0, hunter: 6 });
    expect(s.predicted).toBe(24);
    expect(s.diff).toBe(-8);
    expect(diffDirection(s)).toBe('over');
  });

  it('從上方往下轉回雙足：轉換的是四足群最後一隻，最後解開', () => {
    let s = createDeduction(makePuzzle(4, 2), { startAssumption: 'random', rng: seq(0.99) });
    const r1 = toScout(s);
    expect(r1.slots).toEqual([5]);
    s = r1.state;
    for (let i = 0; i < 2; i++) s = toScout(s).state;
    const last = toScout(s);
    expect(last.event).toBe('solved');
    expect(last.state.steps).toBe(4);
    expectContiguous(last.state);
  });

  it('隨機操作下四足依然連續', () => {
    const rng = createRng(3);
    let s = createDeduction(unsolvablePuzzle(8), random(11));
    for (let i = 0; i < 300; i++) {
      s = (rng() < 0.5 ? toHunter(s) : toScout(s)).state;
      expectContiguous(s);
    }
  });

  it('任何實際產出的題目都能從隨機起點解開', () => {
    for (let seed = 0; seed < 300; seed++) {
      const puzzle = generatePuzzle(PHASE1_CONFIG, createRng(seed));
      let s = createDeduction(puzzle, random(seed));
      while (!s.solved) s = (s.diff > 0 ? toHunter(s) : toScout(s)).state;
      expect(s.hypothesis).toEqual(puzzle.answer);
    }
  });
});

describe('批次轉換（里程碑 2 手套升級的介面）', () => {
  const withBatch = { batch: true };

  it('沒有批次轉盤時拋錯', () => {
    const s = createDeduction(makePuzzle(4, 3));
    expect(() => apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 3 })).toThrow();
  });

  it('一次轉 r 隻：直接解開，只算 1 步，變形位置依序回報', () => {
    const s = createDeduction(makePuzzle(4, 3), withBatch);
    const r = apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 3 });
    expect(r.event).toBe('solved');
    expect(r.slots).toEqual([0, 1, 2]);
    expect(r.state.steps).toBe(1);
    expectContiguous(r.state);
  });

  it('批次推過頭：差變負，再批次轉回，共 2 步', () => {
    let s = createDeduction(makePuzzle(4, 3), withBatch);
    const over = apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 5 });
    expect(over.event).toBe('converted');
    expect(diffDirection(over.state)).toBe('over');
    s = over.state;
    const back = apply(s, { type: 'batch', from: 'hunter', to: 'scout', count: 2 });
    expect(back.slots).toEqual([4, 3]);
    expect(back.event).toBe('solved');
    expect(back.state.steps).toBe(2);
  });

  it('數量超過可轉換的、或為 0：擋下、不計步', () => {
    const s = createDeduction(makePuzzle(4, 3), withBatch);
    expect(apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 8 }).event).toBe('blocked');
    expect(apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 0 }).event).toBe('blocked');
    expect(apply(s, { type: 'batch', from: 'hunter', to: 'scout', count: 1 }).event).toBe('blocked');
    expect(() => apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 1.5 })).toThrow();
  });

  it('單步和批次可以混用，各自每次算 1 步', () => {
    let s = createDeduction(makePuzzle(2, 4), withBatch);
    s = toHunter(s).state;
    s = apply(s, { type: 'batch', from: 'scout', to: 'hunter', count: 2 }).state;
    expect(s.steps).toBe(2);
    expect(s.hypothesis.hunter).toBe(3);
    const done = toHunter(s);
    expect(done.event).toBe('solved');
    expect(done.state.steps).toBe(3);
  });
});
