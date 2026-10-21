import type { InputMode } from './deviceDetect';

export type Action = 'interact';

/**
 * 統一的輸入狀態。各個來源（鍵盤滑鼠、觸控）把資料寫進來，遊戲只讀這裡，
 * 不需要知道玩家用的是什麼裝置。
 */
export class Input {
  private keyboardMove = { x: 0, y: 0 };
  private touchMove = { x: 0, y: 0 };
  private touchMoveActive = false;
  private lookX = 0;
  private lookY = 0;
  private pressed = new Set<Action>();
  private modeListeners: ((m: InputMode) => void)[] = [];

  constructor(public mode: InputMode) {}

  /** 前進為 +y、右為 +x，長度 ≤ 1 */
  get move(): { x: number; y: number } {
    const m = this.touchMoveActive ? this.touchMove : this.keyboardMove;
    const len = Math.hypot(m.x, m.y);
    return len > 1 ? { x: m.x / len, y: m.y / len } : m;
  }

  setKeyboardMove(x: number, y: number): void {
    this.keyboardMove = { x, y };
  }

  setTouchMove(x: number, y: number, active: boolean): void {
    this.touchMove = { x, y };
    this.touchMoveActive = active;
  }

  /** 視角增量（弧度） */
  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  press(a: Action): void {
    this.pressed.add(a);
  }

  consume(a: Action): boolean {
    return this.pressed.delete(a);
  }

  /** 清掉累積的輸入（切換遊戲狀態時用） */
  reset(): void {
    this.keyboardMove = { x: 0, y: 0 };
    this.touchMove = { x: 0, y: 0 };
    this.touchMoveActive = false;
    this.consumeLook();
    this.pressed.clear();
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.modeListeners.forEach((fn) => fn(mode));
  }

  onModeChange(fn: (m: InputMode) => void): void {
    this.modeListeners.push(fn);
  }
}
