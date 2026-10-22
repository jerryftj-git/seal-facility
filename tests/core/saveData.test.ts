import { describe, expect, it } from 'vitest';
import {
  betterGrade,
  defaultSave,
  levelSave,
  loadSave,
  recordLevelResult,
  resetRun,
  SAVE_CONFIG,
  writeSave,
} from '../../src/core/saveData';

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

  it('關卡進度：目前關卡、各關掃描、換過的題目、警報、評級、本輪晶片寫入後讀回來一樣', () => {
    const s = memory();
    const d = defaultSave();
    d.currentLevel = 2;
    d.runChips = 3;
    d.roomChips = { zone01: true, zone02: true };
    levelSave(d, 2).scanned = true;
    levelSave(d, 1).currentL = 14;
    levelSave(d, 1).alarmed = true;
    recordLevelResult(d, 1, 'B', 2);
    writeSave(d, s);
    expect(loadSave(s)).toEqual(d);
  });

  it('關卡進度的不合理資料會被修正', () => {
    const s = memory();
    s.setItem(
      SAVE_CONFIG.storageKey,
      JSON.stringify({
        currentLevel: 7,
        runChips: -1,
        levels: { '1': { scanned: 'yes', lastGrade: 'Z', bestGrade: 'S', lastAttempts: 4.7, lastSteps: 9, currentL: 16, alarmed: 1 }, x: {} },
      }),
    );
    const r = loadSave(s, 3, 2);
    expect(r.currentLevel).toBe(2);
    expect(r.runChips).toBe(0);
    expect(r.levels).toEqual({
      '1': { scanned: false, currentL: 16, alarmed: false, attempts: 0, lastGrade: null, lastAttempts: 4, bestGrade: 'S' },
    });
  });

  it('最佳評級只會被更好的評級覆蓋，最近一次每次都覆蓋', () => {
    const d = defaultSave();
    recordLevelResult(d, 1, 'A', 1);
    expect(levelSave(d, 1)).toMatchObject({ lastGrade: 'A', bestGrade: 'A', lastAttempts: 1 });
    recordLevelResult(d, 1, 'S', 1);
    expect(levelSave(d, 1)).toMatchObject({ lastGrade: 'S', bestGrade: 'S', lastAttempts: 1 });
    recordLevelResult(d, 1, 'B', 3);
    expect(levelSave(d, 1)).toMatchObject({ lastGrade: 'B', bestGrade: 'S', lastAttempts: 3 });
    expect(betterGrade(null, 'B')).toBe('B');
    expect(betterGrade('A', 'B')).toBe('A');
  });

  it('重新開始：回第一關、清掉本輪晶片、掃描、換過的題目與警報；晶片、手套、隱藏晶片、評級保留', () => {
    const d = defaultSave();
    d.chips = 5;
    d.gloveLevel = 2;
    d.currentLevel = 2;
    d.runChips = 4;
    d.roomChips = { zone02: true };
    levelSave(d, 2).scanned = true;
    levelSave(d, 2).currentL = 20;
    levelSave(d, 2).alarmed = true;
    levelSave(d, 2).attempts = 2;
    recordLevelResult(d, 1, 'S', 1);
    resetRun(d);
    expect(d.currentLevel).toBe(1);
    expect(d.runChips).toBe(0);
    expect(levelSave(d, 2)).toMatchObject({ scanned: false, currentL: null, alarmed: false, attempts: 0 });
    expect(d.chips).toBe(5);
    expect(d.gloveLevel).toBe(2);
    expect(d.roomChips).toEqual({ zone02: true });
    expect(levelSave(d, 1).bestGrade).toBe('S');
  });
});
