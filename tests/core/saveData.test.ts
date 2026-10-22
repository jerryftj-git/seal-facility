import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, SAVE_CONFIG, writeSave } from '../../src/core/saveData';

const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('存檔', () => {
  it('沒有存檔時是預設值', () => {
    expect(loadSave(memory())).toEqual(defaultSave());
  });

  it('寫入後讀回來一樣', () => {
    const s = memory();
    const d = { ...defaultSave(), chips: 7, gloveLevel: 2, roomChips: { zone01: true } };
    d.flags.firstChipTip = true;
    writeSave(d, s);
    expect(loadSave(s)).toEqual(d);
  });

  it('損壞或不合理的資料用預設值補齊', () => {
    const s = memory();
    s.setItem(SAVE_CONFIG.storageKey, '{not json');
    expect(loadSave(s)).toEqual(defaultSave());
    s.setItem(SAVE_CONFIG.storageKey, JSON.stringify({ chips: -5, gloveLevel: 99, roomChips: { a: 'yes' } }));
    const r = loadSave(s);
    expect(r.chips).toBe(0);
    expect(r.gloveLevel).toBe(3);
    expect(r.roomChips).toEqual({});
  });

  it('舊版「開場看過」的 key 會併進存檔', () => {
    const s = memory();
    s.setItem(SAVE_CONFIG.legacyIntroSeenKey, '1');
    expect(loadSave(s).flags.introSeen).toBe(true);
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
    expect(loadSave(null)).toEqual(defaultSave());
    expect(loadSave(broken)).toEqual(defaultSave());
    expect(() => writeSave(defaultSave(), broken)).not.toThrow();
  });
});
