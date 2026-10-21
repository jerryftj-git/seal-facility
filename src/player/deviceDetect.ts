export type InputMode = 'desktop' | 'touch';

/** 一開始的判斷：主要指標是粗略的（手指）且有觸控點 → 觸控模式。之後依實際輸入動態切換。 */
export function detectInitialMode(): InputMode {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && navigator.maxTouchPoints > 0 ? 'touch' : 'desktop';
}
