import { describe, expect, it } from 'vitest';
import { blendToward, findClipIndex, locomotionWeights } from '../../src/player/locomotion';

describe('動畫剪輯名稱', () => {
  it('完全相同（不分大小寫）', () => {
    expect(findClipIndex(['Idle', 'Run'], 'idle')).toBe(0);
    expect(findClipIndex(['Idle', 'Run'], 'run')).toBe(1);
  });

  it('接受 Blender 的「物件|動作」命名', () => {
    expect(findClipIndex(['Armature|idle', 'Armature|run'], 'run')).toBe(1);
  });

  it('找不到時回傳 -1，不會誤抓 mixamo.com 這種預設名', () => {
    expect(findClipIndex(['mixamo.com'], 'idle')).toBe(-1);
    expect(findClipIndex(['running_fast'], 'run')).toBe(-1);
  });
});

describe('動畫混合', () => {
  it('權重平滑趨近目標，不會超過', () => {
    let w = 0;
    for (let i = 0; i < 10; i++) {
      const next = blendToward(w, 1, 1 / 60);
      expect(next).toBeGreaterThan(w);
      expect(next).toBeLessThan(1);
      w = next;
    }
  });

  it('和幀率無關：60fps 跑 6 幀 ≈ 30fps 跑 3 幀', () => {
    let a = 0;
    for (let i = 0; i < 6; i++) a = blendToward(a, 1, 1 / 60);
    let b = 0;
    for (let i = 0; i < 3; i++) b = blendToward(b, 1, 1 / 30);
    expect(a).toBeCloseTo(b, 10);
  });

  it('dt = 0（時間停止）時不變', () => {
    expect(blendToward(0.3, 1, 0)).toBe(0.3);
  });

  it('待機 + 跑步權重總和為 1；慢走時跑步動畫放慢', () => {
    const w = locomotionWeights(0.25, 0.5);
    expect(w.idle + w.run).toBeCloseTo(1);
    expect(w.runTimeScale).toBeCloseTo(0.8);
    expect(locomotionWeights(1.4, 2).run).toBe(1);
  });
});
