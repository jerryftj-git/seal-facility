/**
 * 最小存檔系統（localStorage）。所有 key 集中在 SAVE_CONFIG。
 * localStorage 在私密瀏覽等情況可能不能用：讀不到就用預設值，寫不進去就算了（不影響遊戲進行）。
 */
export const SAVE_CONFIG = {
  /** 存檔本體（JSON） */
  storageKey: 'sealFacility.save.v1',
  /** 舊版「開場看過了沒」的獨立 key，讀到時併入存檔 */
  legacyIntroSeenKey: 'sealFacility.introSeen.v1',
  version: 1,
} as const;

export interface SaveData {
  version: number;
  /** 持有的資料晶片 */
  chips: number;
  /** 推演手套等級（1～3） */
  gloveLevel: number;
  /** 每個房間的隱藏晶片是否已拾取（key = 房間 id） */
  roomChips: Record<string, boolean>;
  /** 一次性提示 */
  flags: {
    introSeen: boolean;
    /** 第一次撿到晶片時的提示已顯示 */
    firstChipTip: boolean;
    /** 第一次達到升級門檻時的晶片圖示閃爍已顯示 */
    upgradeReadyBlink: boolean;
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
  return {
    version: SAVE_CONFIG.version,
    chips: 0,
    gloveLevel: 1,
    roomChips: {},
    flags: { introSeen: false, firstChipTip: false, upgradeReadyBlink: false },
  };
}

const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : fallback;

/** 讀存檔；資料損壞或欄位缺漏時用預設值補齊 */
export function loadSave(storage: KV | null = defaultStorage(), maxGloveLevel = 3): SaveData {
  const s = defaultSave();
  let raw: unknown = null;
  try {
    const txt = storage?.getItem(SAVE_CONFIG.storageKey);
    raw = txt ? JSON.parse(txt) : null;
  } catch {
    raw = null;
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<SaveData>;
    s.chips = int(r.chips, 0, 9999, 0);
    s.gloveLevel = int(r.gloveLevel, 1, maxGloveLevel, 1);
    if (r.roomChips && typeof r.roomChips === 'object') {
      for (const [k, v] of Object.entries(r.roomChips)) if (v === true) s.roomChips[k] = true;
    }
    const f = (r.flags ?? {}) as Partial<SaveData['flags']>;
    s.flags.introSeen = f.introSeen === true;
    s.flags.firstChipTip = f.firstChipTip === true;
    s.flags.upgradeReadyBlink = f.upgradeReadyBlink === true;
  }
  // 舊版「開場看過」的獨立 key
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
