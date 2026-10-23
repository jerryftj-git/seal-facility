/**
 * 開場的點擊規則（純邏輯，可測試）：
 * - 這一句還在打字 → 立刻顯示完整
 * - 這一句已經顯示完 → 下一句（最後一句顯示完再點一下才結束）
 * 點擊永遠不會直接跳進遊戲；只有「跳過 ▸」按鈕會。
 */
export interface IntroState {
  /** 目前第幾句（0 起算） */
  index: number;
  /** 這一句還在打字 */
  typing: boolean;
}

export type IntroAction = 'complete' | 'next' | 'finish';

export function introTap(s: IntroState, lineCount: number): { state: IntroState; action: IntroAction } {
  if (s.typing) return { state: { ...s, typing: false }, action: 'complete' };
  if (s.index + 1 < lineCount) return { state: { index: s.index + 1, typing: true }, action: 'next' };
  return { state: s, action: 'finish' };
}
