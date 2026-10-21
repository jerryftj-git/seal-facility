import { el } from './icons';
import './styles/screens.css';

/** 標題畫面：唯一的按鈕「開始潛入」同時用來解鎖音效與 pointer lock（瀏覽器規定要使用者手勢） */
export class TitleScreen {
  private readonly root = el(
    'div',
    'screen title-screen',
    `<div class="screen-box">
      <div class="warning-tag">▲ 生物危害區域 ▲</div>
      <h1>封印設施</h1>
      <div class="sub">SEALED FACILITY · ZONE 01</div>
      <p class="flavor">廢棄研究設施深處，封印艙擋住了去路。</p>
      <button class="btn-primary" type="button">開始潛入</button>
    </div>`,
  );

  constructor(parent: HTMLElement, onStart: () => void) {
    parent.appendChild(this.root);
    this.root.querySelector('button')!.addEventListener('click', () => {
      this.root.classList.add('leaving');
      window.setTimeout(() => this.root.remove(), 600);
      onStart();
    });
  }
}
