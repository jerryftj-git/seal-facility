import { describe, expect, it } from 'vitest';
import { charge, displaySeconds, drain, powerLevel } from '../../src/run/power';
import { corridorColor, creaturesForDoor, doorPuzzle, nextSupplyDoor, pickSideRoom, scoreFor } from '../../src/run/doors';
import { updateBest } from '../../src/run/record';
import { RUN_CONFIG } from '../../src/run/runConfig';
import { computeReadings, createRng, PHASE1_SPECIES } from '../../src/puzzle';

describe('設定', () => {
  it('預設值照規格', () => {
    expect(RUN_CONFIG.startPower).toBe(120);
    expect(RUN_CONFIG.chestBattery).toBe(40);
    expect(RUN_CONFIG.hiddenBattery).toBe(15);
    expect(RUN_CONFIG.alarmSeconds).toBe(20);
    expect(RUN_CONFIG.lowPower).toBe(20);
    expect(RUN_CONFIG.pointsPerDoor).toBe(10);
    expect(RUN_CONFIG.maxSegments).toBe(2);
  });
});

describe('電力', () => {
  it('扣電到 0 為止、加電沒有上限', () => {
    expect(drain(10, 3)).toBe(7);
    expect(drain(1, 3)).toBe(0);
    expect(drain(5, -1)).toBe(5);
    expect(charge(130, 40)).toBe(170);
  });

  it('狀態：> 20 正常、≤ 20 低電力、≤ 5 危急、0 耗盡', () => {
    expect(powerLevel(120)).toBe('ok');
    expect(powerLevel(20.5)).toBe('ok');
    expect(powerLevel(20)).toBe('low');
    expect(powerLevel(5)).toBe('critical');
    expect(powerLevel(0)).toBe('out');
  });

  it('顯示秒數：無條件進位，歸零才顯示 0', () => {
    expect(displaySeconds(119.2)).toBe(120);
    expect(displaySeconds(0.3)).toBe(1);
    expect(displaySeconds(0)).toBe(0);
  });
});

describe('門與題目', () => {
  it('第 k 道門 N = 4 + k，上限 12', () => {
    expect([1, 2, 3, 4, 8, 9, 20].map((k) => creaturesForDoor(k))).toEqual([5, 6, 7, 8, 12, 12, 12]);
  });

  it('每道門的題目：N 隻、獵獸 1～N−1、L 和組成一致', () => {
    for (let k = 1; k <= 12; k++) {
      for (let seed = 0; seed < 60; seed++) {
        const p = doorPuzzle(k, createRng(seed * 31 + k));
        const n = creaturesForDoor(k);
        expect(p.readings.N).toBe(n);
        expect(p.answer.hunter).toBeGreaterThanOrEqual(1);
        expect(p.answer.hunter).toBeLessThanOrEqual(n - 1);
        expect(p.answer.scout + p.answer.hunter).toBe(n);
        expect(computeReadings(PHASE1_SPECIES, p.answer).L).toBe(p.readings.L);
      }
    }
  });

  it('配色輪流：青 → 紫 → 橘 → 青', () => {
    const c = RUN_CONFIG.corridorColors;
    expect([1, 2, 3, 4, 5].map((k) => corridorColor(k))).toEqual([c[0], c[1], c[2], c[0], c[1]]);
  });

  it('側室：三選一，每一間都抽得到', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 50; seed++) seen.add(pickSideRoom(3, createRng(seed)));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('分數 = 通過門數 × 10', () => {
    expect(scoreFor(0)).toBe(0);
    expect(scoreFor(7)).toBe(70);
  });
});

describe('最佳紀錄', () => {
  it('超過舊紀錄才算新紀錄', () => {
    expect(updateBest({ score: 30, doors: 3 }, { score: 40, doors: 4 })).toEqual({ best: { score: 40, doors: 4 }, isNew: true });
    expect(updateBest({ score: 30, doors: 3 }, { score: 30, doors: 3 })).toEqual({ best: { score: 30, doors: 3 }, isNew: false });
    expect(updateBest({ score: 30, doors: 3 }, { score: 10, doors: 1 })).toEqual({ best: { score: 30, doors: 3 }, isNew: false });
  });
});

describe('補給（寶箱＋側室電池）的排程', () => {
  /** 模擬一局：回傳第 1～count 道門有沒有補給 */
  const plan = (seed: number, count = 40) => {
    const rng = createRng(seed);
    let next = 1;
    const has: boolean[] = [];
    for (let k = 1; k <= count; k++) {
      const yes = k === next;
      if (yes) next = nextSupplyDoor(k, rng);
      has.push(yes);
    }
    return has;
  };

  it('前 3 道門每道都有', () => {
    for (let seed = 0; seed < 50; seed++) expect(plan(seed).slice(0, 3)).toEqual([true, true, true]);
  });

  it('第 3 門之後，有補給的門之間隔 3 或 5 道（兩種都會出現）', () => {
    const gaps = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      const doors = plan(seed).flatMap((h, i) => (h ? [i + 1] : []));
      for (let i = 3; i < doors.length; i++) {
        const gap = doors[i] - doors[i - 1];
        expect([3, 5]).toContain(gap);
        gaps.add(gap);
      }
      expect(doors[3] === 6 || doors[3] === 8).toBe(true);
    }
    expect([...gaps].sort()).toEqual([3, 5]);
  });
});
