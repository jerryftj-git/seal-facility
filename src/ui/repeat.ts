export interface RepeatOptions {
  /** 按下後多久開始連發（毫秒） */
  delay: number;
  /** 連發間隔（毫秒） */
  interval: number;
}

export const DEFAULT_REPEAT: RepeatOptions = { delay: 380, interval: 140 };

/**
 * 按住連按：按下立刻觸發一次，過 delay 後每 interval 觸發一次。
 * fire 回傳 false（例如到邊界、已解開）就停止連發。時間由呼叫端提供，方便測試。
 */
export class RepeatTimer {
  private nextAt = -1;

  constructor(
    private readonly fire: () => boolean,
    private readonly opts: RepeatOptions = DEFAULT_REPEAT,
  ) {}

  get active(): boolean {
    return this.nextAt >= 0;
  }

  press(now: number): void {
    this.nextAt = this.fire() ? now + this.opts.delay : -1;
  }

  release(): void {
    this.nextAt = -1;
  }

  tick(now: number): void {
    // 一幀最多補發 3 次，避免分頁切回來時連發太多
    for (let i = 0; i < 3 && this.nextAt >= 0 && now >= this.nextAt; i++) {
      if (!this.fire()) {
        this.nextAt = -1;
        return;
      }
      this.nextAt += this.opts.interval;
    }
    if (this.nextAt >= 0 && now >= this.nextAt) this.nextAt = now + this.opts.interval;
  }
}
