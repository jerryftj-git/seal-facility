/*
 * 角色動畫的純邏輯（不依賴 three.js，可單元測試）。
 */

/**
 * 依名稱找動畫剪輯，不分大小寫。也接受 Blender 匯出常見的「物件名|動作名」，
 * 例如 "Armature|run"。找不到回傳 -1。
 */
export function findClipIndex(names: readonly string[], wanted: string): number {
  const w = wanted.toLowerCase();
  const exact = names.findIndex((n) => n.toLowerCase() === w);
  if (exact >= 0) return exact;
  return names.findIndex((n) => n.toLowerCase().split('|').pop() === w);
}

/** 讓權重平滑地趨近目標（指數趨近，和幀率無關） */
export function blendToward(current: number, target: number, dt: number, rate = 8): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * 依移動速度（0～1）決定待機／跑步的權重，以及跑步動畫的播放速度
 * （走得慢時放慢，減少腳底打滑）。
 */
export function locomotionWeights(runBlend: number, speed01: number): { idle: number; run: number; runTimeScale: number } {
  const run = Math.min(1, Math.max(0, runBlend));
  return { idle: 1 - run, run, runTimeScale: 0.6 + 0.4 * Math.min(1, Math.max(0, speed01)) };
}
