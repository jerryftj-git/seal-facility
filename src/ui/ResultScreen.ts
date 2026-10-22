import type { Grade } from '../puzzle';
import { el, ICONS } from './icons';
import './styles/screens.css';

/** 結算：使用步數、評級、取得的晶片、再次潛入。刻意不解釋評級怎麼算。 */
export class ResultScreen {
  private root: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onRetry: () => void,
  ) {}

  show(steps: number, grade: Grade, chips = 1): void {
    this.hide();
    const root = el(
      'div',
      'screen result-screen',
      `<div class="screen-box holo">
        <div class="sub">ZONE 01 · CLEARED</div>
        <h2 style="margin:0;font-size:28px;letter-spacing:.2em">封印區 01 通過</h2>
        <div class="grade stamp" data-grade="${grade}">${grade}</div>
        <dl class="result-rows">
          <dt>使用步數</dt><dd>${steps}</dd>
          <dt>取得</dt><dd style="font-family:var(--font);font-size:18px;color:var(--cyan);display:flex;gap:8px;align-items:center"><span style="width:26px;display:inline-flex">${ICONS.chip}</span>資料晶片 ×${chips}</dd>
        </dl>
        <button class="btn-primary" type="button">再次潛入</button>
      </div>`,
    );
    root.querySelector('button')!.addEventListener('click', () => {
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
