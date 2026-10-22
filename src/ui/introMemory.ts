import { defaultStorage, loadSave, writeSave, type KV } from '../core/saveData';

/**
 * 「開場看過了沒」記在存檔（src/core/saveData.ts）的 flags.introSeen。
 * 遊戲本身直接讀寫 Game 持有的存檔資料（同一份），這兩個函式留給測試與工具使用。
 */
export function hasSeenIntro(storage: KV | null = defaultStorage()): boolean {
  return loadSave(storage).flags.introSeen;
}

export function markIntroSeen(storage: KV | null = defaultStorage()): void {
  const s = loadSave(storage);
  s.flags.introSeen = true;
  writeSave(s, storage);
}
