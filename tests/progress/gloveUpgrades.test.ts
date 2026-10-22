import { describe, expect, it } from 'vitest';
import {
  chipsNeeded,
  GLOVE_UPGRADES,
  gloveFeatures,
  MAX_GLOVE_LEVEL,
  nextUpgrade,
  tryUpgrade,
  upgradeStatus,
} from '../../src/progress/gloveUpgrades';

describe('推演手套升級樹', () => {
  it('三層：Lv2 花 2 片、Lv3 花 3 片', () => {
    expect(MAX_GLOVE_LEVEL).toBe(3);
    expect(GLOVE_UPGRADES.levels.map((l) => l.cost)).toEqual([0, 2, 3]);
  });

  it('下一級與還差幾片', () => {
    expect(nextUpgrade(1)?.level).toBe(2);
    expect(nextUpgrade(3)).toBeNull();
    expect(chipsNeeded(1, 0)).toBe(2);
    expect(chipsNeeded(1, 5)).toBe(0);
    expect(chipsNeeded(2, 1)).toBe(2);
    expect(chipsNeeded(3, 10)).toBeNull();
  });

  it('卡片狀態：已解鎖／可升級／晶片不足／要先解鎖前一級', () => {
    expect(upgradeStatus(2, 1, 2)).toBe('available');
    expect(upgradeStatus(2, 1, 1)).toBe('insufficient');
    expect(upgradeStatus(3, 1, 99)).toBe('locked');
    expect(upgradeStatus(2, 2, 0)).toBe('unlocked');
    expect(upgradeStatus(3, 2, 3)).toBe('available');
  });

  it('必須依序升級，扣掉花費', () => {
    expect(tryUpgrade({ level: 1, chips: 10 }, 3).ok).toBe(false);
    const a = tryUpgrade({ level: 1, chips: 5 }, 2);
    expect(a).toEqual({ ok: true, state: { level: 2, chips: 3 } });
    const b = tryUpgrade(a.state, 3);
    expect(b).toEqual({ ok: true, state: { level: 3, chips: 0 } });
  });

  it('晶片不足、已解鎖都不能升（不可重複、不可重置）', () => {
    expect(tryUpgrade({ level: 1, chips: 1 }, 2).ok).toBe(false);
    expect(tryUpgrade({ level: 2, chips: 9 }, 2).ok).toBe(false);
    expect(tryUpgrade({ level: 3, chips: 9 }, 2).ok).toBe(false);
  });

  it('能力累加：Lv2 有試算，Lv3 再加上提示句', () => {
    expect(gloveFeatures(1)).toEqual({ trial: false, stepHint: false });
    expect(gloveFeatures(2)).toEqual({ trial: true, stepHint: false });
    expect(gloveFeatures(3)).toEqual({ trial: true, stepHint: true });
  });

  it('卡片文案不含任何除法算式', () => {
    for (const l of GLOVE_UPGRADES.levels) expect(l.effect).not.toMatch(/÷|\//);
  });
});
