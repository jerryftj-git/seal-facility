import { RUN_CONFIG } from '../run/runConfig';
import { displaySeconds, powerLevel } from '../run/power';
import { el } from './icons';
import './styles/power.css';

/**
 * HUD 上方正中的電池形電力條：剩餘秒數＋填充比例（以起始電力 120 秒為滿格，超過就是滿的）。
 * 低電力（≤ 20 秒）轉橘色並閃爍。撿到電池時從目前值滑到新值（0.5 秒），旁邊飄出「+40」。
 */
export class PowerBar {
  readonly root = el(
    'div',
    'power',
    `<div class="power-cell"><i class="power-fill"></i><span class="power-sec"></span></div><i class="power-nub"></i>`,
  );
  private readonly fill: HTMLElement;
  private readonly sec: HTMLElement;
  /** 畫面上顯示的值（撿到電池時慢慢追上實際值） */
  private shown: number = RUN_CONFIG.startPower;
  private slide: { from: number; t: number } | null = null;

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
    this.fill = this.root.querySelector('.power-fill')!;
    this.sec = this.root.querySelector('.power-sec')!;
  }

  /** 每幀呼叫：actual = 目前電力 */
  update(actual: number, dt: number): void {
    if (this.slide) {
      this.slide.t = Math.min(1, this.slide.t + dt / RUN_CONFIG.batteryAnimSeconds);
      const k = 1 - Math.pow(1 - this.slide.t, 3);
      this.shown = this.slide.from + (actual - this.slide.from) * k;
      if (this.slide.t >= 1) this.slide = null;
    } else {
      this.shown = actual;
    }
    const ratio = Math.max(0, Math.min(1, this.shown / RUN_CONFIG.startPower));
    this.fill.style.width = `${ratio * 100}%`;
    this.sec.textContent = String(displaySeconds(this.shown));
    const level = powerLevel(actual);
    this.root.dataset.level = level;
  }

  /** 撿到電池：電力條滑到新值，飄出「+N」 */
  charge(amount: number, from: number): void {
    this.slide = { from, t: 0 };
    const f = el('div', 'power-float', `+${amount}`);
    this.root.appendChild(f);
    window.setTimeout(() => f.remove(), 1400);
  }

  /** 開新的一局 */
  reset(power: number): void {
    this.slide = null;
    this.shown = power;
    this.update(power, 0);
  }
}
