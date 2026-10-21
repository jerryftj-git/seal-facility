export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
} satisfies Record<string, Ease>;

interface Tween {
  key?: string;
  elapsed: number;
  duration: number;
  update: (t: number) => void;
  ease: Ease;
  resolve: () => void;
}

/** 由遊戲迴圈驅動的補間動畫；回傳 Promise，方便用 async/await 寫演出順序 */
export class Tweens {
  private list: Tween[] = [];

  /**
   * key：同一個 key 的新補間會取代舊的（舊的 Promise 立刻 resolve），
   * 用在鏡頭這種可能被中途打斷的動畫。
   */
  to(duration: number, update: (t: number) => void, e: Ease = ease.inOut, key?: string): Promise<void> {
    if (key) {
      const old = this.list.filter((tw) => tw.key === key);
      this.list = this.list.filter((tw) => tw.key !== key);
      old.forEach((tw) => tw.resolve());
    }
    return new Promise((resolve) => {
      update(e(0));
      this.list.push({ key, elapsed: 0, duration: Math.max(1e-4, duration), update, ease: e, resolve });
    });
  }

  wait(duration: number): Promise<void> {
    return this.to(duration, () => {});
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const done: Tween[] = [];
    for (const tw of this.list) {
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.update(tw.ease(t));
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((tw) => !done.includes(tw));
      done.forEach((tw) => tw.resolve());
    }
  }

  clear(): void {
    this.list = [];
  }
}
