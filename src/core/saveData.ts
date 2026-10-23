/**
 * 存檔（localStorage）。所有 key 集中在 SAVE_CONFIG。
 * 只存最佳紀錄與「開場看過了沒」；進行中的一局不存檔（重新整理 = 放棄這一局）。
 * localStorage 在私密瀏覽等情況可能不能用：讀不到就用預設值，寫不進去就算了（不影響遊戲進行）。
 */
export const SAVE_CONFIG = {
  /** 存檔本體（JSON）。第 1 版的存檔也在這個 key，讀取時只保留「開場看過」 */
  storageKey: 'sealFacility.save.v1',
  /** 舊版「開場看過了沒」的獨立 key，讀到時併入存檔 */
  legacyIntroSeenKey: 'sealFacility.introSeen.v1',
  version: 2,
} as const;

export interface SaveData {
  version: number;
  /** 最佳紀錄：最高分數、最多通過門數 */
  best: { score: number; doors: number };
  flags: {
    introSeen: boolean;
  };
}

export type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function defaultStorage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function defaultSave(): SaveData {
  return { version: SAVE_CONFIG.version, best: { score: 0, doors: 0 }, flags: { introSeen: false } };
}

const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : fallback;

/** 讀存檔；資料損壞或欄位缺漏時用預設值補齊。舊版存檔只保留「開場看過」 */
export function loadSave(storage: KV | null = defaultStorage()): SaveData {
  const s = defaultSave();
  let raw: unknown = null;
  try {
    const txt = storage?.getItem(SAVE_CONFIG.storageKey);
    raw = txt ? JSON.parse(txt) : null;
  } catch {
    raw = null;
  }
  if (raw && typeof raw === 'object') {
    const r = raw as { version?: unknown; best?: { score?: unknown; doors?: unknown }; flags?: { introSeen?: unknown } };
    if (r.version === SAVE_CONFIG.version && r.best && typeof r.best === 'object') {
      s.best.score = int(r.best.score, 0, 1e6, 0);
      s.best.doors = int(r.best.doors, 0, 1e5, 0);
    }
    s.flags.introSeen = r.flags?.introSeen === true;
  }
  try {
    if (storage?.getItem(SAVE_CONFIG.legacyIntroSeenKey) === '1') s.flags.introSeen = true;
  } catch {
    /* 讀不到就算了 */
  }
  return s;
}

export function writeSave(data: SaveData, storage: KV | null = defaultStorage()): void {
  try {
    storage?.setItem(SAVE_CONFIG.storageKey, JSON.stringify(data));
  } catch {
    /* 存不了就算了 */
  }
}
