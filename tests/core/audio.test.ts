import { describe, expect, it } from 'vitest';
import { morphFrequency } from '../../src/core/Audio';

describe('轉換音效的音高（Q2）', () => {
  it('只接受預測值一個參數', () => {
    expect(morphFrequency.length).toBe(1);
  });

  it('預測值越高音越高', () => {
    for (let p = 2; p < 40; p += 2) expect(morphFrequency(p + 2)).toBeGreaterThan(morphFrequency(p));
  });

  it('每 +2 受力點都是同樣的音程（一個半音）', () => {
    const semitone = 2 ** (1 / 12);
    for (const p of [10, 18, 26]) expect(morphFrequency(p + 2) / morphFrequency(p)).toBeCloseTo(semitone, 10);
  });
});
