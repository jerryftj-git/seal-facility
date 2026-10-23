import type { InputMode } from '../player/deviceDetect';
import { el, ICONS } from './icons';
import { PowerBar } from './PowerBar';
import './styles/hud.css';

/**
 * 遊戲中的抬頭顯示：
 * 上方正中電力條、下面一行目標；右上「第 k 門 · 分數」、觸控版暫停鈕、「？」；
 * 互動提示、操作提示、滑鼠沒鎖住時的「點擊畫面繼續潛入」。
 */
export class Hud {
  readonly root = el('div', 'hud');
  readonly power: PowerBar;
  private readonly score = el('div', 'hud-score holo', '<span class="hud-door"></span><i>·</i><span>分數 <b class="hud-points">0</b></span>');
  private readonly pauseBtn = el('button', 'hud-pausebtn holo touch-only', '<i></i><i></i>');
  private readonly prompt = el('div', 'hud-prompt holo desktop-only hidden');
  private readonly objective = el('div', 'hud-objective holo hidden', '<span></span>');
  private readonly help = el('button', 'hud-help holo', '？');
  private readonly hints = el('div', 'hud-hints hidden');
  private readonly lock = el('div', 'hud-lock hidden', `<div class="holo">點擊畫面繼續潛入</div>`);
  private hintTimer = 0;

  constructor(
    parent: HTMLElement,
    onLock: () => void,
    onHelp: () => void,
    onPause: () => void,
  ) {
    this.root.append(this.objective, this.score, this.pauseBtn, this.help, this.prompt, this.hints, this.lock);
    this.power = new PowerBar(this.root);
    parent.appendChild(this.root);
    this.lock.addEventListener('click', onLock);
    this.help.type = 'button';
    this.help.title = '任務說明';
    this.help.addEventListener('click', (e) => {
      e.stopPropagation();
      onHelp();
    });
    this.pauseBtn.type = 'button';
    this.pauseBtn.setAttribute('aria-label', '暫停');
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPause();
    });
  }

  /** 畫面上方（電力條下面）的任務目標：單一句子；空字串隱藏 */
  setObjective(html: string): void {
    this.objective.classList.toggle('hidden', !html);
    if (!html) return;
    this.objective.querySelector('span')!.innerHTML = html;
    this.objective.classList.remove('bump');
    void this.objective.offsetWidth;
    this.objective.classList.add('bump');
  }

  /** 右上「第 k 門 · 分數」 */
  setScore(door: number, points: number): void {
    this.score.querySelector('.hud-door')!.textContent = `第 ${door} 門`;
    this.score.querySelector('.hud-points')!.textContent = String(points);
  }

  /** 目標列目前占掉的區域（隱藏時 null），給鏡頭構圖避開 */
  objectiveRect(): DOMRect | null {
    if (this.root.classList.contains('hidden') || this.objective.classList.contains('hidden')) return null;
    return this.objective.getBoundingClientRect();
  }

  setPrompt(label: string | null): void {
    this.prompt.classList.toggle('hidden', !label);
    if (label) this.prompt.innerHTML = `<kbd>E</kbd> ${label}`;
  }

  /** 操作提示：顯示幾秒後淡出 */
  showHints(mode: InputMode, seconds = 6): void {
    this.hints.innerHTML =
      mode === 'touch'
        ? `<span>${ICONS.joystick}移動</span><span>${ICONS.drag}拖曳視角</span><span>${ICONS.button}互動</span>`
        : `<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動</span><span><kbd>Shift</kbd> 慢走</span><span>${ICONS.mouse}視角</span><span><kbd>E</kbd> 互動</span><span><kbd>Esc</kbd> 暫停</span>`;
    this.hints.classList.remove('hidden', 'fade');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hints.classList.add('fade'), seconds * 1000);
  }

  hideHints(): void {
    window.clearTimeout(this.hintTimer);
    this.hints.classList.add('hidden');
  }

  /** 電腦版滑鼠還沒鎖住（例如瀏覽器擋下）：「點擊畫面繼續潛入」。這不是暫停，計時照跑 */
  setLockPrompt(on: boolean): void {
    this.lock.classList.toggle('hidden', !on);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }
}
