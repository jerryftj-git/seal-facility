import type { Counts, SpeciesDef } from './species';

/** 封印艙艙壁上的兩個讀數 */
export interface Readings {
  /** 個體數 */
  readonly N: number;
  /** 觸地受力點 */
  readonly L: number;
}

/**
 * 改變「每隻生物有幾個受力點」的效果，例如之後的重力靴（全體抬起兩隻腳）。
 * legsOf 收到目前的腳數，回傳套用後的腳數；多個 modifier 依序套用。
 */
export interface Modifier {
  readonly id: string;
  legsOf(species: SpeciesDef, legs: number): number;
}

export function effectiveLegs(species: SpeciesDef, modifiers: readonly Modifier[] = []): number {
  return modifiers.reduce((legs, m) => m.legsOf(species, legs), species.legs);
}

export function computeReadings(
  species: readonly SpeciesDef[],
  counts: Counts,
  modifiers: readonly Modifier[] = [],
): Readings {
  let N = 0;
  let L = 0;
  for (const s of species) {
    const n = counts[s.id] ?? 0;
    N += n;
    L += n * effectiveLegs(s, modifiers);
  }
  return { N, L };
}
