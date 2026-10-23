import { el } from './icons';
import './styles/pause.css';

/**
 * 暫停選單：整個畫面變暗、遮住遊戲（看不到艙上的讀數），計時停止。
 * 「繼續」之後先倒數 3 秒才恢復計時與操作（countdown）。
 * 「？」簡報也用同一層遮罩（cover），只是不顯示按鈕。
 */
export class PauseMenu {
  private readonly root = el(
    'div',
    'pause-menu hidden',
    `<div class="pause-box holo">
      <h2>暫停</h2>
      <button class="btn-primary pause-resume" type="button">繼續</button>
      <button class="btn-secondary pause-menu-btn" type="button">回到主選單</button>
    </div>`,
  );
  private readonly count = el('div', 'resume-count hidden', '<b></b>');

  constructor(parent: HTMLElement, onResume: () => void, onMenu: () => void) {
    parent.append(this.root, this.count);
    this.root.querySelector('.pause-resume')!.addEventListener('click', (e) => {
      e.stopPropagation();
      onResume();
    });
    this.root.querySelector('.pause-menu-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      onMenu();
    });
  }

  /** 暫停選單（有按鈕） */
  show(): void {
    this.root.classList.remove('hidden', 'cover');
  }

  /** 只有遮罩、沒有按鈕（「？」簡報在上面） */
  cover(): void {
    this.root.classList.remove('hidden');
    this.root.classList.add('cover');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** 回到遊戲前的倒數：3、2、1；n = 0 時隱藏 */
  setCountdown(n: number): void {
    this.count.classList.toggle('hidden', n <= 0);
    const b = this.count.querySelector('b')!;
    if (n > 0 && b.textContent !== String(n)) {
      b.textContent = String(n);
      b.classList.remove('tick');
      void b.offsetWidth;
      b.classList.add('tick');
    }
  }
}
