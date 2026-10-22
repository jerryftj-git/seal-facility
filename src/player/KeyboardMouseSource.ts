import type { Input } from './Input';
import { RUN_SPEED, WALK_SPEED } from './locomotion';

/** 按住 Shift 時的移動幅度（慢走） */
const WALK_INPUT = WALK_SPEED / RUN_SPEED;

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const SENSITIVITY = 0.0022;

/** PC：WASD 移動、滑鼠視角（pointer lock）、E 互動 */
export class KeyboardMouseSource {
  private held = new Set<string>();
  /** 推演模式等時候暫停（按鍵交給面板處理） */
  enabled = true;

  constructor(
    private readonly input: Input,
    private readonly canvas: HTMLElement,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* 沒有使用者手勢時會失敗，交給「點擊畫面繼續」處理 */
    }
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  private sync(): void {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      for (const k of this.held) {
        const v = MOVE_KEYS[k];
        if (v) {
          x += v[0];
          y += v[1];
        }
      }
    }
    let mx = Math.sign(x);
    let my = Math.sign(y);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      // 斜向移動不加速；按住 Shift 慢走
      const k = (this.held.has('ShiftLeft') || this.held.has('ShiftRight') ? WALK_INPUT : 1) / len;
      mx *= k;
      my *= k;
    }
    this.input.setKeyboardMove(mx, my);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (MOVE_KEYS[e.code] || e.code === 'KeyE') this.input.setMode('desktop');
    if (!this.enabled) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.held.add(e.code);
      this.sync();
    }
    if (MOVE_KEYS[e.code]) {
      this.held.add(e.code);
      this.sync();
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
    if (e.code === 'KeyE' && !e.repeat) this.input.press('interact');
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    this.sync();
  };

  private onBlur = () => {
    this.held.clear();
    this.sync();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    this.input.setMode('desktop');
    this.input.addLook(e.movementX * SENSITIVITY, e.movementY * SENSITIVITY);
  };

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.held.clear();
    this.sync();
  }
}
