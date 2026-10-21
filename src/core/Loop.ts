/** requestAnimationFrame 迴圈；dt 上限避免切分頁回來時一次跳太多 */
export class Loop {
  private last = 0;
  private running = false;

  constructor(private readonly tick: (dt: number, now: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.tick(dt, now / 1000);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }
}
