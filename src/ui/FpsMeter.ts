/** 網址加 ?fps=1 時在右上角顯示幀率，方便在 iPad 上檢查效能 */
export class FpsMeter {
  private readonly el = document.createElement('div');
  private frames = 0;
  private last = performance.now();

  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'absolute',
      top: 'calc(8px + env(safe-area-inset-top, 0px))',
      right: '10px',
      font: '12px var(--mono)',
      color: '#7fdfff',
      background: 'rgba(0,0,0,.5)',
      padding: '2px 6px',
      borderRadius: '4px',
      zIndex: '50',
    });
    parent.appendChild(this.el);
  }

  tick(info: { calls: number; triangles: number }): void {
    this.frames++;
    const now = performance.now();
    if (now - this.last >= 500) {
      const fps = (this.frames * 1000) / (now - this.last);
      this.el.textContent = `${fps.toFixed(0)} fps · ${info.calls} draws · ${(info.triangles / 1000).toFixed(1)}k tris`;
      this.frames = 0;
      this.last = now;
    }
  }
}
