import { el } from './icons';
import './styles/screens.css';

/**
 * 標題畫面：「開始潛入」同時用來解鎖音效與 pointer lock（瀏覽器規定要使用者手勢）。
 * 看過開場之後，多一個小小的「重看開場」。
 */
export class TitleScreen {
  private readonly root: HTMLElement;

  /**
   * @param best 各關最佳評級（例如 [['第一關', 'S'], ['第二關', 'A']]）；有的話在按鈕下方顯示一行小字
   */
  constructor(parent: HTMLElement, introSeen: boolean, onStart: (playIntro: boolean) => void, best: [string, string][] = []) {
    this.root = el(
      'div',
      'screen title-screen',
      `<div class="screen-box">
        <div class="warning-tag">▲ 生物危害區域 ▲</div>
        <h1>封印設施</h1>
        <div class="sub">SEALED FACILITY · ZONE 01</div>
        <p class="flavor">廢棄研究設施深處，封印艙擋住了去路。</p>
        <button class="btn-primary" type="button">開始潛入</button>
        ${introSeen ? '<button class="btn-link" type="button">重看開場</button>' : ''}
        ${best.length ? `<div class="title-best">最佳評級　${best.map(([n, g]) => `${n}<b>${g}</b>`).join('　')}</div>` : ''}
      </div>`,
    );
    parent.appendChild(this.root);
    const go = (playIntro: boolean) => {
      this.root.classList.add('leaving');
      window.setTimeout(() => this.root.remove(), 600);
      onStart(playIntro);
    };
    this.root.querySelector('.btn-primary')!.addEventListener('click', () => go(!introSeen));
    this.root.querySelector('.btn-link')?.addEventListener('click', () => go(true));
  }
}
