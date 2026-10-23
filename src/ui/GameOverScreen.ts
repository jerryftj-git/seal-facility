import { el } from './icons';
import './styles/screens.css';

export interface GameOverData {
  /** 通過的門數 */
  doors: number;
  score: number;
  /** 這一局撿到的隱藏小電池 */
  batteries: number;
  best: { score: number; doors: number };
  /** 打破最佳紀錄 */
  isNew: boolean;
}

/** 任務結束畫面：通過門數、分數、撿到的小電池、最佳紀錄；「再次潛入」「回到主選單」 */
export class GameOverScreen {
  private root: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onRetry: () => void,
    private readonly onMenu: () => void,
  ) {}

  show(d: GameOverData): void {
    this.hide();
    const root = el(
      'div',
      'screen result-screen game-over',
      `<div class="screen-box holo">
        <div class="sub">MISSION OVER</div>
        <h2 class="go-title">任務結束</h2>
        ${d.isNew ? '<div class="go-new">新紀錄！</div>' : ''}
        <dl class="result-rows">
          <dt>通過門數</dt><dd>${d.doors}</dd>
          <dt>分數</dt><dd>${d.score}</dd>
          <dt>撿到的小電池</dt><dd>${d.batteries}</dd>
          <dt>最佳紀錄</dt><dd class="go-best">${d.best.score} 分 · ${d.best.doors} 門</dd>
        </dl>
        <div class="screen-buttons">
          <button class="btn-primary go-retry" type="button">再次潛入</button>
          <button class="btn-secondary go-menu" type="button">回到主選單</button>
        </div>
      </div>`,
    );
    root.querySelector('.go-retry')!.addEventListener('click', () => {
      this.hide();
      this.onRetry();
    });
    root.querySelector('.go-menu')!.addEventListener('click', () => {
      this.hide();
      this.onMenu();
    });
    this.parent.appendChild(root);
    this.root = root;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}
