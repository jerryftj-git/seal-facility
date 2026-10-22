/**
 * 推演手套升級樹（3 層、不分支、永久、不可重置）。
 * 花費、效果、顏色都在 GLOVE_UPGRADES 這一個設定物件，要調數值改這裡即可。
 * 純邏輯，不依賴 three.js 與 DOM，可單元測試。
 */
export interface GloveLevelDef {
  readonly level: number;
  /** 從上一級升到這一級要花的晶片（Lv1 是初始，0） */
  readonly cost: number;
  readonly name: string;
  /** 升級卡片上的效果說明 */
  readonly effect: string;
  /** 這一級的手套 UI 邊框顏色（推演面板、HUD 晶片框、互動提示、觸控按鈕） */
  readonly color: string;
  /** 解鎖 Q／W：一次轉換這麼多隻 */
  readonly pairConvert?: number;
  /** 解鎖推演面板的算式提示 */
  readonly formulaHint?: boolean;
}

export const GLOVE_UPGRADES = {
  levels: [
    { level: 1, cost: 0, name: '標準推演手套', effect: '一次轉換 1 隻（A／D）', color: '#2ee6f0' },
    { level: 2, cost: 2, name: '雙重轉換', effect: '新增 Q／W：一次轉換 2 隻', color: '#ff9a2e', pairConvert: 2 },
    { level: 3, cost: 3, name: '推演算式', effect: '提示句下方顯示算式：還差多少、要轉幾隻', color: '#ffd24a', formulaHint: true },
  ] as readonly GloveLevelDef[],
};

export const MAX_GLOVE_LEVEL = GLOVE_UPGRADES.levels.length;

export function levelDef(level: number): GloveLevelDef {
  const d = GLOVE_UPGRADES.levels.find((l) => l.level === level);
  if (!d) throw new Error(`沒有這個手套等級：${level}`);
  return d;
}

/** 下一個可以升的等級；全部解鎖時為 null */
export function nextUpgrade(level: number): GloveLevelDef | null {
  return GLOVE_UPGRADES.levels.find((l) => l.level === level + 1) ?? null;
}

/** 升到下一級還差幾片（0 = 已經可以升）；全部解鎖時為 null */
export function chipsNeeded(level: number, chips: number): number | null {
  const n = nextUpgrade(level);
  return n ? Math.max(0, n.cost - chips) : null;
}

export type UpgradeStatus = 'unlocked' | 'available' | 'insufficient' | 'locked';

/**
 * 升級卡片的狀態：
 * - unlocked：已解鎖
 * - available：就是下一級，而且晶片夠
 * - insufficient：就是下一級，但晶片不夠
 * - locked：要先解鎖前一級（依序升級）
 */
export function upgradeStatus(target: number, level: number, chips: number): UpgradeStatus {
  if (target <= level) return 'unlocked';
  if (target > level + 1) return 'locked';
  return chips >= levelDef(target).cost ? 'available' : 'insufficient';
}

export interface GloveState {
  readonly level: number;
  readonly chips: number;
}

/** 嘗試升級到 target；只有下一級且晶片足夠時成功 */
export function tryUpgrade(s: GloveState, target: number): { ok: boolean; state: GloveState } {
  if (upgradeStatus(target, s.level, s.chips) !== 'available') return { ok: false, state: s };
  return { ok: true, state: { level: target, chips: s.chips - levelDef(target).cost } };
}

/** 目前等級擁有的能力（等級以下所有效果累加） */
export function gloveFeatures(level: number): { pairConvert: number | null; formulaHint: boolean } {
  let pair: number | null = null;
  let formula = false;
  for (const l of GLOVE_UPGRADES.levels) {
    if (l.level > level) break;
    if (l.pairConvert) pair = l.pairConvert;
    if (l.formulaHint) formula = true;
  }
  return { pairConvert: pair, formulaHint: formula };
}

/** 晶片是否第一次達到下一級的門檻 */
export function canAffordNext(level: number, chips: number): boolean {
  return chipsNeeded(level, chips) === 0;
}
