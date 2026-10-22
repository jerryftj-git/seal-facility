import { describe, expect, it } from 'vitest';
import { SAVE_CONFIG } from '../../src/core/saveData';
import { hasSeenIntro, markIntroSeen } from '../../src/ui/introMemory';
import { INTRO_LINES, INTRO_MAX_CHARS } from '../../src/ui/introScript';

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
