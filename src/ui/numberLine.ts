/**
 * 推演面板的數線（純計算，不碰 DOM）。
 * 數線從 0 到 M：M = L 向上取到偶數再 +2（L=18 → 20、L=22 → 24、L=28 → 30）。
 */
export function lineMax(L: number): number {
  const even = Math.ceil(L / 2) * 2;
  return even + 2;
}

/** 還沒掃描（不知道 L）時的數線範圍：用最大可能的 L（全部都是獵獸），不洩漏 L */
export function lineMaxUnknown(n: number, maxLegs: number): number {
  return lineMax(n * maxLegs);
}

/**
 * 刻度數字間隔：預設每 2 一個；寬度不夠（每個數字少於 minPx）就改成每 4、每 8…
 */
export function tickStep(max: number, widthPx: number, minPx = 26): number {
  let step = 2;
  while ((widthPx / max) * step < minPx && step < max) step *= 2;
  return step;
}

export function ticks(max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

/**
 * 括號框住的範圍與文字：L > N×2 →「還差」，L < N×2 →「多了」（換題時的防呆），相等時沒有括號。
 */
export function gapInfo(assumed: number, L: number): { from: number; to: number; word: '還差' | '多了'; value: number } | null {
  if (assumed === L) return null;
  return L > assumed
    ? { from: assumed, to: L, word: '還差', value: L - assumed }
    : { from: L, to: assumed, word: '多了', value: assumed - L };
}
