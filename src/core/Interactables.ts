export interface Interactable {
  id: 'pod' | 'chest' | 'chip';
  /** 互動提示文字 */
  label: string;
  x: number;
  z: number;
  radius: number;
  enabled: () => boolean;
}

/** 回傳玩家範圍內最近、且目前可互動的物件 */
export function nearestInteractable(list: readonly Interactable[], px: number, pz: number): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of list) {
    if (!it.enabled()) continue;
    const d = Math.hypot(px - it.x, pz - it.z);
    if (d <= it.radius && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}
