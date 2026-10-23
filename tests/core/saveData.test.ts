import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, SAVE_CONFIG, writeSave } from '../../src/core/saveData';

const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('存檔（只存最佳紀錄與開場看過）', () => {
  it('沒有存檔時是預設值', () => {
    expect(loadSave(memory())).toEqual(defaultSave());
  });

  it('寫入後讀回來一樣', () => {
    const s = memory();
    const d = { ...defaultSave(), best: { score: 70, doors: 7 }, flags: { introSeen: true } };
    writeSave(d, s);
    expect(loadSave(s)).toEqual(d);
  });

  it('只有這三個欄位：版本、最佳紀錄、開場看過', () => {
    expect(Object.keys(defaultSave()).sort()).toEqual(['best', 'flags', 'version']);
    expect(Object.keys(defaultSave().flags)).toEqual(['introSeen']);
  });

  it('舊版存檔（資料晶片、手套、關卡評級）只保留「開場看過」', () => {
    const s = memory();
    s.setItem(
      SAVE_CONFIG.storageKey,
      JSON.stringify({ version: 1, chips: 9, gloveLevel: 3, roomChips: { zone01: true }, levels: {}, flags: { introSeen: true, firstChipTip: true } }),
    );
    expect(loadSave(s)).toEqual({ ...defaultSave(), flags: { introSeen: true } });
  });

  it('損壞或不合理的資料用預設值補齊', () => {
    const s = memory();
    s.setItem(SAVE_CONFIG.storageKey, '{not json');
    expect(loadSave(s)).toEqual(defaultSave());
    s.setItem(SAVE_CONFIG.storageKey, JSON.stringify({ version: 2, best: { score: -5, doors: 'x' } }));
    expect(loadSave(s).best).toEqual({ score: 0, doors: 0 });
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
