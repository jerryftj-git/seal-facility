import type { Grade } from '../puzzle';
import { el, ICONS } from './icons';
import './styles/screens.css';

export interface LevelResult {
  steps: number;
  grade: Grade;
  /** 這一關的最佳評級（含這次） */
  best: Grade;
  /** 這一關拿到的晶片 */
  chips: number;
}

/** 「本次 A／最佳 S」 */
export function gradePair(last: Grade | null, best: Grade | null): string {
  const g = (x: Grade | null) => (x ? `<b class="g-mini" data-grade="${x}">${x}</b>` : '<b class="g-mini">—</b>');
  return `<span class="grade-pair">本次 ${g(last)}<i>／</i>最佳 ${g(best)}</span>`;
}

/**
 * 第一關結算：使用步數、評級（本次／最佳）、取得的晶片；「繼續前進」到下一段走廊，「再次潛入」從第一關重來。
 * 刻意不解釋評級怎麼算。
 */
export class ResultScreen {
  private root: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onRetry: () => void,
    private readonly onContinue: () => void,
  ) {}

  show(r: LevelResult): void {
    this.hide();
    const root = el(
      'div',
      'screen result-screen',
      `<div class="screen-box holo">
        <div class="sub">ZONE 01 · CLEARED</div>
        <h2 style="margin:0;font-size:28px;letter-spacing:.2em">封印區 01 通過</h2>
        <div class="grade stamp" data-grade="${r.grade}">${r.grade}</div>
        <dl class="result-rows">
          <dt>評級</dt><dd>${gradePair(r.grade, r.best)}</dd>
          <dt>使用步數</dt><dd>${r.steps}</dd>
          <dt>取得</dt><dd style="font-family:var(--font);font-size:18px;color:var(--cyan);display:flex;gap:8px;align-items:center"><span style="width:26px;display:inline-flex">${ICONS.chip}</span>資料晶片 ×${r.chips}</dd>
        </dl>
        <div class="screen-buttons">
          <button class="btn-primary btn-continue" type="button">繼續前進</button>
          <button class="btn-secondary btn-retry" type="button">再次潛入</button>
        </div>
      </div>`,
    );
    root.querySelector('.btn-continue')!.addEventListener('click', () => {
      this.hide();
      this.onContinue();
    });
    root.querySelector('.btn-retry')!.addEventListener('click', () => {
      this.hide();
      this.onRetry();
    });
    this.parent.appendChild(root);
    this.root = root;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }

  get visible(): boolean {
    return this.root !== null;
  }
}
