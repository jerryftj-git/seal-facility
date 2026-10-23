import { describe, expect, it } from 'vitest';
import { gapInfo, lineMax, lineMaxUnknown, tickStep, ticks } from '../../src/ui/numberLine';

describe('推演面板的數線', () => {
  it('M = L 向上取偶數再 +2', () => {
    expect(lineMax(18)).toBe(20);
    expect(lineMax(22)).toBe(24);
    expect(lineMax(28)).toBe(30);
    expect(lineMax(17)).toBe(20);
  });

  it('第 1 門（5 隻、18 個接觸點）：0～20，每 2 一個刻度；還差 8', () => {
    expect(ticks(lineMax(18), 2)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(gapInfo(10, 18)).toEqual({ from: 10, to: 18, word: '還差', value: 8 });
  });

  it('L 比 N×2 小（防呆）：括號框 L 到 N×2，「多了」', () => {
    expect(gapInfo(16, 12)).toEqual({ from: 12, to: 16, word: '多了', value: 4 });
    expect(gapInfo(10, 10)).toBeNull();
  });

  it('寬度不夠時刻度改成每 4、每 8', () => {
    expect(tickStep(20, 360)).toBe(2);
    expect(tickStep(48, 360)).toBe(4);
    expect(tickStep(48, 160)).toBe(8);
  });

  it('掃描前用最大可能的 L 決定範圍（不洩漏 L）', () => {
    expect(lineMaxUnknown(5, 4)).toBe(22);
  });
});
