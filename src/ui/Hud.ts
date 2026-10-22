import type { InputMode } from '../player/deviceDetect';
import { el, ICONS } from './icons';
import './styles/hud.css';

/** 遊戲中的抬頭顯示：晶片數、互動提示、操作提示、暫停遮罩 */
export class Hud {
  readonly root = el('div', 'hud');
  private readonly chip = el('div', 'hud-chip holo', `${ICONS.chip}<span>資料晶片</span><b>×0</b>`);
  private readonly prompt = el('div', 'hud-prompt holo desktop-only hidden');
  private readonly hints = el('div', 'hud-hints hidden');
  private readonly pause = el(
    'div',
    'hud-pause hidden',
    `<div class="holo">點擊畫面繼續潛入<small>Esc 可隨時解除滑鼠</small></div>`,
  );
  private hintTimer = 0;

  constructor(
    parent: HTMLElement,
    onResume: () => void,
  ) {
    this.root.append(this.chip, this.prompt, this.hints, this.pause);
    parent.appendChild(this.root);
    this.pause.addEventListener('click', onResume);
  }

  setChips(n: number, pulse = false): void {
    this.chip.querySelector('b')!.textContent = `×${n}`;
    this.chip.classList.toggle('has', n > 0);
    if (pulse) {
      this.chip.classList.remove('pulse');
      void this.chip.offsetWidth;
      this.chip.classList.add('pulse');
    }
  }

  chipRect(): DOMRect {
    return this.chip.querySelector('svg')!.getBoundingClientRect();
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
        : `<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動</span><span><kbd>Shift</kbd> 慢走</span><span>${ICONS.mouse}視角</span><span><kbd>E</kbd> 互動</span><span><kbd>Esc</kbd> 解除滑鼠</span>`;
    this.hints.classList.remove('hidden', 'fade');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hints.classList.add('fade'), seconds * 1000);
  }

  hideHints(): void {
    window.clearTimeout(this.hintTimer);
    this.hints.classList.add('hidden');
  }

  setPaused(on: boolean): void {
    this.pause.classList.toggle('hidden', !on);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  /** 晶片從畫面上的某一點飛進 HUD */
  flyChip(fromX: number, fromY: number): Promise<void> {
    const dot = el('div', 'chip-fly');
    dot.style.left = `${fromX}px`;
    dot.style.top = `${fromY}px`;
    this.root.appendChild(dot);
    const r = this.chipRect();
    return new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          dot.style.left = `${r.left + r.width / 2}px`;
          dot.style.top = `${r.top + r.height / 2}px`;
          dot.style.transform = 'scale(0.7)';
        }),
      );
      window.setTimeout(() => {
        dot.remove();
        resolve();
      }, 800);
    });
  }
}
