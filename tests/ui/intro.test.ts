import { describe, expect, it } from 'vitest';
import { SAVE_CONFIG } from '../../src/core/saveData';
import { hasSeenIntro, markIntroSeen } from '../../src/ui/introMemory';
import { INTRO_LINES, INTRO_MAX_CHARS } from '../../src/ui/introScript';
import { introTap, type IntroState } from '../../src/ui/introFlow';

describe('開場的點擊規則', () => {
  const tapN = (n: number, lines = 4) => {
    let s: IntroState = { index: 0, typing: true };
    const actions: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = introTap(s, lines);
      s = r.state;
      actions.push(r.action);
    }
    return { s, actions };
  };

  it('打字中點一下 → 顯示完整；顯示完再點 → 下一句', () => {
    expect(tapN(2).actions).toEqual(['complete', 'next']);
  });

  it('連點三下不會跳進遊戲', () => {
    expect(tapN(3).actions).not.toContain('finish');
  });

  it('最後一句顯示完再點一下才結束（4 句 = 點 8 下）', () => {
    expect(tapN(7).actions).not.toContain('finish');
    expect(tapN(8).actions[7]).toBe('finish');
  });
});

describe('開場文字', () => {
  it('3～4 段', () => {
    expect(INTRO_LINES.length).toBeGreaterThanOrEqual(3);
    expect(INTRO_LINES.length).toBeLessThanOrEqual(4);
  });

  it.each(INTRO_LINES.map((l) => [l.text]))('「%s」不超過 30 字', (text) => {
    expect(Array.from(text).length).toBeLessThanOrEqual(INTRO_MAX_CHARS);
  });
});

describe('開場看過的紀錄', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('一開始沒看過，標記後就是看過了', () => {
    const s = memory();
    expect(hasSeenIntro(s)).toBe(false);
    markIntroSeen(s);
    expect(hasSeenIntro(s)).toBe(true);
    expect(JSON.parse(s.getItem(SAVE_CONFIG.storageKey) ?? '{}').flags.introSeen).toBe(true);
  });

  it('沒有 storage 或 storage 丟錯時不會壞掉', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(hasSeenIntro(null)).toBe(false);
    expect(hasSeenIntro(broken)).toBe(false);
    expect(() => markIntroSeen(broken)).not.toThrow();
  });
});
