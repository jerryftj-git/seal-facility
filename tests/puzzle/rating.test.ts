import { describe, expect, it } from 'vitest';
import {
  computeReadings,
  convert,
  createDeduction,
  minSteps,
  PHASE1_SPECIES,
  rate,
  rateDeduction,
  type Puzzle,
} from '../../src/puzzle';

describe('評級', () => {
  it('最少步數 = 四足數（從全雙足出發）', () => {
    expect(minSteps({ scout: 7, hunter: 0 }, { scout: 4, hunter: 3 })).toBe(3);
  });

  it('S = 最少步數；A ≤ 最少 + 4；其他 B', () => {
    expect(rate(3, 3)).toBe('S');
    expect(rate(4, 3)).toBe('A');
    expect(rate(7, 3)).toBe('A');
    expect(rate(8, 3)).toBe('B');
    expect(rate(50, 1)).toBe('B');
  });

  it('從推演狀態算出評級', () => {
    const answer = { scout: 3, hunter: 2 };
    const puzzle: Puzzle = {
      species: PHASE1_SPECIES,
      modifiers: [],
      answer,
      readings: computeReadings(PHASE1_SPECIES, answer),
    };
    let s = createDeduction(puzzle, 'scout');
    s = convert(s, 'scout', 'hunter').state;
    s = convert(s, 'hunter', 'scout').state;
    s = convert(s, 'scout', 'hunter').state;
    s = convert(s, 'scout', 'hunter').state;
    expect(s.solved).toBe(true);
    expect(rateDeduction(s)).toEqual({ grade: 'A', steps: 4, min: 2 });
  });
});
