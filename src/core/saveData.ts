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
  /** 每個房間的隱藏晶片是否已拾取（key = 房間 id，見 src/levels/levels.ts 的 roomId） */
  roomChips: Record<string, boolean>;
  /** 目前所在的關卡：重新整理後從這一關的走廊入口開始 */
  currentLevel: number;
  /** 這一輪（從第一關開始算）拿到的晶片，給「區域完成」結算用 */
  runChips: number;
  /** 各關的進度與評級（key = 關卡編號） */
  levels: Record<string, LevelSave>;
  /** 一次性提示 */
  flags: {
    introSeen: boolean;
    /** 第一次撿到晶片時的提示已顯示 */
    firstChipTip: boolean;
    /** 第一次達到升級門檻時的晶片圖示閃爍已顯示 */
    upgradeReadyBlink: boolean;
  };
}

export type SavedGrade = 'S' | 'A' | 'B';

export interface LevelSave {
  /** 掃描台已掃描（這一輪有效；重新開始時清掉） */
  scanned: boolean;
  /**
   * 這一關目前題目的地上接觸點（答錯換題後是新的 L；null = 還沒換題，用關卡資料的 L）。
   * 存起來是為了：答錯後重新整理，不能回到原題再猜一次。這一輪有效。
   */
  currentL: number | null;
  /** 這一關觸發過警報（評級最高 B）。這一輪有效。 */
  alarmed: boolean;
  /** 這一關目前送出過幾次封印解除碼（答錯後重新整理，結算的嘗試次數才算得對）。這一輪有效。 */
  attempts: number;
  /** 最近一次的評級與嘗試次數（送出封印解除碼的次數） */
  lastGrade: SavedGrade | null;
  lastAttempts: number | null;
  /** 最佳評級（只會被更好的評級覆蓋） */
  bestGrade: SavedGrade | null;
}

const GRADE_RANK: Record<SavedGrade, number> = { S: 3, A: 2, B: 1 };

/** 兩個評級取比較好的 */
export function betterGrade(a: SavedGrade | null, b: SavedGrade | null): SavedGrade | null {
  if (!a) return b;
  if (!b) return a;
  return GRADE_RANK[b] > GRADE_RANK[a] ? b : a;
}

export function defaultLevelSave(): LevelSave {
  return { scanned: false, currentL: null, alarmed: false, attempts: 0, lastGrade: null, lastAttempts: null, bestGrade: null };
}

/** 取得（必要時建立）某一關的存檔 */
export function levelSave(data: SaveData, level: number): LevelSave {
  return (data.levels[String(level)] ??= defaultLevelSave());
}

/** 記錄一關的結果：最近一次直接覆蓋，最佳只在更好時覆蓋 */
export function recordLevelResult(data: SaveData, level: number, grade: SavedGrade, attempts: number): LevelSave {
  const ls = levelSave(data, level);
  ls.lastGrade = grade;
  ls.lastAttempts = attempts;
  ls.bestGrade = betterGrade(ls.bestGrade, grade);
  return ls;
}

/** 開始新的一輪（從第一關）：晶片、手套、隱藏晶片、評級保留；本輪進度（掃描、換過的題目、警報）清掉 */
export function resetRun(data: SaveData): void {
  data.currentLevel = 1;
  data.runChips = 0;
  for (const ls of Object.values(data.levels)) {
    ls.scanned = false;
    ls.currentL = null;
    ls.alarmed = false;
    ls.attempts = 0;
  }
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
    currentLevel: 1,
    runChips: 0,
    levels: {},
    flags: { introSeen: false, firstChipTip: false, upgradeReadyBlink: false },
  };
}

const isGrade = (v: unknown): v is SavedGrade => v === 'S' || v === 'A' || v === 'B';

const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : fallback;

/** 讀存檔；資料損壞或欄位缺漏時用預設值補齊 */
export function loadSave(storage: KV | null = defaultStorage(), maxGloveLevel = 3, maxLevel = 99): SaveData {
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
    s.currentLevel = int(r.currentLevel, 1, maxLevel, 1);
    s.runChips = int(r.runChips, 0, 9999, 0);
    if (r.levels && typeof r.levels === 'object') {
      for (const [k, v] of Object.entries(r.levels)) {
        if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
        const lv = v as Partial<LevelSave>;
        s.levels[k] = {
          scanned: lv.scanned === true,
          currentL: typeof lv.currentL === 'number' ? int(lv.currentL, 0, 9999, 0) : null,
          alarmed: lv.alarmed === true,
          attempts: int(lv.attempts, 0, 999, 0),
          lastGrade: isGrade(lv.lastGrade) ? lv.lastGrade : null,
          // 舊版存的是「步數」（lastSteps），意思不同，直接不讀
          lastAttempts: typeof lv.lastAttempts === 'number' ? int(lv.lastAttempts, 0, 99999, 0) : null,
          bestGrade: isGrade(lv.bestGrade) ? lv.bestGrade : null,
        };
      }
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
