import { describe, expect, it } from 'vitest';
import { computeReadings, effectiveLegs, HUNTER, PHASE1_SPECIES, SCOUT, type Modifier } from '../../src/puzzle';

describe('讀數計算', () => {
  it('N = c + r，L = 2c + 4r', () => {
    expect(computeReadings(PHASE1_SPECIES, { scout: 3, hunter: 2 })).toEqual({ N: 5, L: 14 });
  });

  it('沒列在 counts 裡的種類當作 0', () => {
    expect(computeReadings(PHASE1_SPECIES, { hunter: 2 })).toEqual({ N: 2, L: 8 });
  });

  it('modifier 可以改變腳數（例：全體抬起兩隻腳）', () => {
    const liftTwo: Modifier = { id: 'lift', legsOf: (_s, legs) => Math.max(0, legs - 2) };
    expect(effectiveLegs(SCOUT, [liftTwo])).toBe(0);
    expect(effectiveLegs(HUNTER, [liftTwo])).toBe(2);
    // 受力讀數變成四足數 × 2
    expect(computeReadings(PHASE1_SPECIES, { scout: 3, hunter: 2 }, [liftTwo]).L).toBe(4);
  });
});
