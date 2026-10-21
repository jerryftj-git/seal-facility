/** 回傳 [0, 1) 的亂數函式，介面和 Math.random 相同，方便測試時注入種子。 */
export type Rng = () => number;

/** mulberry32：小而快、可重現的種子亂數 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 從 0 ~ length-1 取一個整數 */
export function pickIndex(rng: Rng, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}
