import { describe, expect, it } from 'vitest';
import {
  blendToward,
  findClipIndex,
  locomotionMix,
  RUN_CLIP_SPEED,
  RUN_SPEED,
  WALK_CLIP_SPEED,
  WALK_SPEED,
} from '../../src/player/locomotion';

const ALL = { idle: true, walk: true, run: true };
const sum = (m: { idle: number; walk: number; run: number }) => m.idle + m.walk + m.run;

describe('動畫剪輯名稱', () => {
  it('完全相同（不分大小寫）', () => {
    expect(findClipIndex(['Idle', 'Walk', 'Run'], 'idle')).toBe(0);
    expect(findClipIndex(['Idle', 'Walk', 'Run'], 'run')).toBe(2);
  });

  it('接受 Blender 的「物件|動作」命名', () => {
    expect(findClipIndex(['Armature|idle', 'Armature|run'], 'run')).toBe(1);
  });

  it('找不到時回傳 -1，不會誤抓 mixamo.com 這種預設名', () => {
    expect(findClipIndex(['Armature|mixamo.com|Layer0'], 'idle')).toBe(-1);
    expect(findClipIndex(['running_fast'], 'run')).toBe(-1);
  });
});

describe('平滑', () => {
  it('趨近目標、不會超過；和幀率無關；dt = 0 時不變', () => {
    let a = 0;
    for (let i = 0; i < 6; i++) a = blendToward(a, 1, 1 / 60);
    let b = 0;
    for (let i = 0; i < 3; i++) b = blendToward(b, 1, 1 / 30);
    expect(a).toBeCloseTo(b, 10);
    expect(a).toBeLessThan(1);
    expect(blendToward(0.3, 1, 0)).toBe(0.3);
  });
});

describe('idle / walk / run 混合', () => {
  it('停下 = 待機、慢走速度 = 走路、全速 = 跑步', () => {
    expect(locomotionMix(0, ALL)).toMatchObject({ idle: 1, walk: 0, run: 0 });
    expect(locomotionMix(WALK_SPEED, ALL)).toMatchObject({ idle: 0, walk: 1, run: 0 });
    expect(locomotionMix(RUN_SPEED, ALL)).toMatchObject({ idle: 0, walk: 0, run: 1 });
  });

  it('中間速度是兩個相鄰剪輯的混合，總和永遠是 1', () => {
    for (let s = 0; s <= RUN_SPEED + 1; s += 0.1) {
      for (const clips of [ALL, { idle: false, walk: true, run: true }, { idle: true, walk: false, run: true }, { idle: true, walk: true, run: false }]) {
        expect(sum(locomotionMix(s, clips))).toBeCloseTo(1);
      }
    }
    const m = locomotionMix((WALK_SPEED + RUN_SPEED) / 2, ALL);
    expect(m.walk).toBeCloseTo(0.5);
    expect(m.run).toBeCloseTo(0.5);
  });

  it('播放速度依實際速度等比調整，腳步才對得上地面', () => {
    expect(locomotionMix(WALK_CLIP_SPEED, ALL).walkTimeScale).toBeCloseTo(1);
    expect(locomotionMix(RUN_SPEED, ALL).runTimeScale).toBeCloseTo(RUN_SPEED / RUN_CLIP_SPEED);
  });

  it('沒有走路剪輯：走路權重交給跑步', () => {
    const m = locomotionMix(WALK_SPEED, { idle: true, walk: false, run: true });
    expect(m.walk).toBe(0);
    expect(m.run).toBe(1);
  });

  it('沒有跑步剪輯：全速時用走路剪輯加速播放', () => {
    const m = locomotionMix(RUN_SPEED, { idle: true, walk: true, run: false });
    expect(m.walk).toBe(1);
    expect(m.walkTimeScale).toBeGreaterThan(2);
  });

  it('沒有待機剪輯：停下時移動剪輯凍結（播放速度 0），不會變成 T-pose', () => {
    const m = locomotionMix(0, { idle: false, walk: true, run: true });
    expect(m.idle).toBe(0);
    expect(m.walk).toBe(1);
    expect(m.walkTimeScale).toBe(0);
  });
});
