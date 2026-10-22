import type { Grade } from '../puzzle';
import { el, ICONS } from './icons';
import { gradePair } from './ResultScreen';
import './styles/screens.css';

export interface AreaSummaryData {
  /** 例如「區域 1」 */
  name: string;
  /** 各關送出封印解除碼的次數加總 */
  totalAttempts: number;
  /** 這一輪拿到的晶片 */
  chips: number;
  levels: { label: string; last: Grade | null; best: Grade | null }[];
}

/** 區域完成的總結算：總嘗試次數、本次拿到的晶片、各關評級（本次／最佳）；回到主選單或重新開始 */
export class AreaSummary {
  private root: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onMenu: () => void,
    private readonly onRestart: () => void,
  ) {}

  show(d: AreaSummaryData): void {
    this.hide();
    const rows = d.levels.map((l) => `<dt>${l.label}</dt><dd>${gradePair(l.last, l.best)}</dd>`).join('');
    const root = el(
      'div',
      'screen result-screen area-summary',
      `<div class="screen-box holo">
        <div class="sub">AREA 01 · COMPLETE</div>
        <h2 style="margin:0;font-size:30px;letter-spacing:.2em">${d.name} 完成</h2>
        <dl class="result-rows">
          ${rows}
          <dt>總嘗試次數</dt><dd>${d.totalAttempts}</dd>
          <dt>本次拿到</dt><dd style="font-family:var(--font);font-size:18px;color:var(--cyan);display:flex;gap:8px;align-items:center"><span style="width:26px;display:inline-flex">${ICONS.chip}</span>資料晶片 ×${d.chips}</dd>
        </dl>
        <div class="screen-buttons">
          <button class="btn-primary btn-restart" type="button">重新開始</button>
          <button class="btn-secondary btn-menu" type="button">回到主選單</button>
        </div>
      </div>`,
    );
    root.querySelector('.btn-menu')!.addEventListener('click', () => {
      this.hide();
      this.onMenu();
    });
    root.querySelector('.btn-restart')!.addEventListener('click', () => {
      this.hide();
      this.onRestart();
    });
    this.parent.appendChild(root);
    this.root = root;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}
