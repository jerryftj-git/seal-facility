import { RUN_CONFIG } from './runConfig';

export type PowerLevel = 'ok' | 'low' | 'critical' | 'out';

/** 電力狀態：ok → low（≤ 20 秒）→ critical（≤ 5 秒）→ out（歸零） */
export function powerLevel(power: number, cfg: Pick<typeof RUN_CONFIG, 'lowPower' | 'criticalPower'> = RUN_CONFIG): PowerLevel {
  if (power <= 0) return 'out';
  if (power <= cfg.criticalPower) return 'critical';
  if (power <= cfg.lowPower) return 'low';
  return 'ok';
}

/** 扣電（不會小於 0） */
export function drain(power: number, dt: number): number {
  return Math.max(0, power - Math.max(0, dt));
}

/** 撿到電池：沒有上限 */
export function charge(power: number, amount: number): number {
  return power + Math.max(0, amount);
}

/** HUD 顯示的秒數：還有電就至少顯示 1（避免 0.4 秒時顯示 0 卻還沒結束） */
export function displaySeconds(power: number): number {
  return power <= 0 ? 0 : Math.ceil(power);
}
