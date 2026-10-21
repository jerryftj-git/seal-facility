import { describe, expect, it } from 'vitest';
import {
  canConvert,
  computeReadings,
  convert,
  createDeduction,
  createRng,
  diffDirection,
  PHASE1_SPECIES,
  type DeductionState,
  type Puzzle,
} from '../../src/puzzle';

function makePuzzle(scout: number, hunter: number): Puzzle {
  const answer = { scout, hunter };
  return { species: PHASE1_SPECIES, modifiers: [], answer, readings: computeReadings(PHASE1_SPECIES, answer) };
}

/** 讀數 L 是奇數，永遠解不開：用來測邊界和隨機操作 */
function unsolvablePuzzle(N: number): Puzzle {
  return { ...makePuzzle(N - 1, 1), readings: { N, L: 1001 } };
}

const toHunter = (s: DeductionState) => convert(s, 'scout', 'hunter');
const toScout = (s: DeductionState) => convert(s, 'hunter', 'scout');

describe('推演狀態機', () => {
  it('初始為全部雙足：預測 2N、差 = L − 2N', () => {
    const s = createDeduction(makePuzzle(4, 3), 'scout');
    expect(s.hypothesis).toEqual({ scout: 7, hunter: 0 });
    expect(s.predicted).toBe(14);
    expect(s.actual).toBe(20);
    expect(s.diff).toBe(6);
    expect(s.steps).toBe(0);
    expect(s.solved).toBe(false);
    expect(diffDirection(s)).toBe('under');
  });

  it('轉一隻為四足：預測 +2、差 −2、步數 +1，從 index 0 開始', () => {
    const s0 = createDeduction(makePuzzle(4, 3), 'scout');
    const r1 = toHunter(s0);
    expect(r1.event).toBe('converted');
    expect(r1.slot).toBe(0);
    expect(r1.state.predicted).toBe(16);
    expect(r1.state.diff).toBe(4);
    expect(r1.state.steps).toBe(1);
    expect(toHunter(r1.state).slot).toBe(1);
  });

  it('不改動原本的狀態', () => {
    const s0 = createDeduction(makePuzzle(4, 3), 'scout');
    const snapshot = JSON.stringify(s0);
    toHunter(s0);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('全雙足時再轉雙足：被擋下、不計步', () => {
    const s0 = createDeduction(makePuzzle(4, 3), 'scout');
    const r = toScout(s0);
    expect(r.event).toBe('blocked');
    expect(r.slot).toBeNull();
    expect(r.state).toBe(s0);
    expect(canConvert(s0, 'hunter', 'scout')).toBe(false);
    expect(canConvert(s0, 'scout', 'hunter')).toBe(true);
  });

  it('剛好 r 次轉換就解開，事件為 solved', () => {
    let s = createDeduction(makePuzzle(4, 3), 'scout');
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
    let s = createDeduction(makePuzzle(4, 1), 'scout');
    s = toHunter(s).state;
    expect(s.solved).toBe(true);
    for (const r of [toHunter(s), toScout(s)]) {
      expect(r.event).toBe('locked');
      expect(r.state.steps).toBe(1);
    }
    expect(canConvert(s, 'scout', 'hunter')).toBe(false);
  });

  it('可以推到全四足（r\' = N），之後再轉四足被擋下、不計步', () => {
    let s = createDeduction(unsolvablePuzzle(5), 'scout');
    for (let i = 0; i < 5; i++) s = toHunter(s).state;
    expect(s.hypothesis).toEqual({ scout: 0, hunter: 5 });
    expect(s.steps).toBe(5);
    expect(canConvert(s, 'scout', 'hunter')).toBe(false);
    const r = toHunter(s);
    expect(r.event).toBe('blocked');
    expect(r.state.steps).toBe(5);
  });

  it('推過頭時差值為負、方向為 over，再轉回可以解開', () => {
    // 答案 5 雙足 1 四足；從全雙足出發，第一步就會解開，所以用全四足當起點測推過頭
    const p = makePuzzle(5, 1);
    let s = createDeduction(p, 'hunter');
    expect(s.predicted).toBe(24);
    expect(s.diff).toBe(-10);
    expect(diffDirection(s)).toBe('over');
    for (let i = 0; i < 4; i++) s = toScout(s).state;
    const r = toScout(s);
    expect(r.event).toBe('solved');
    expect(r.state.steps).toBe(5);
  });

  it('來回操作每一次都計步', () => {
    let s = createDeduction(makePuzzle(4, 3), 'scout');
    s = toHunter(s).state;
    s = toScout(s).state;
    s = toHunter(s).state;
    expect(s.steps).toBe(3);
    expect(s.hypothesis).toEqual({ scout: 6, hunter: 1 });
  });

  it('轉回雙足時還原最後一隻變形的（堆疊式）', () => {
    let s = createDeduction(makePuzzle(2, 4), 'scout');
    s = toHunter(s).state; // slot 0
    s = toHunter(s).state; // slot 1
    s = toHunter(s).state; // slot 2
    const back = toScout(s);
    expect(back.slot).toBe(2);
    expect(back.state.slots.slice(0, 3)).toEqual(['hunter', 'hunter', 'scout']);
    expect(toHunter(back.state).slot).toBe(2);
  });

  it('不論怎麼按，四足永遠是從 index 0 開始連續的一群', () => {
    const rng = createRng(7);
    let s = createDeduction(unsolvablePuzzle(8), 'scout');
    let sawFull = false;
    for (let i = 0; i < 500; i++) {
      s = (rng() < 0.55 ? toHunter(s) : toScout(s)).state;
      const r = s.hypothesis.hunter;
      expect(s.slots.slice(0, r).every((x) => x === 'hunter')).toBe(true);
      expect(s.slots.slice(r).every((x) => x === 'scout')).toBe(true);
      if (r === 8) sawFull = true;
    }
    expect(s.steps).toBeGreaterThan(100);
    expect(sawFull).toBe(true);
  });

  it('未知的生物種類拋錯', () => {
    const s = createDeduction(makePuzzle(4, 3), 'scout');
    expect(() => convert(s, 'chicken', 'hunter')).toThrow();
    expect(() => createDeduction(makePuzzle(4, 3), 'rabbit')).toThrow();
  });
});
