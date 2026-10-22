import type { InputMode } from '../player/deviceDetect';
import { el, ICONS } from './icons';
import './styles/hud.css';

/** 遊戲中的抬頭顯示：晶片數、互動提示、操作提示、暫停遮罩 */
export class Hud {
  readonly root = el('div', 'hud');
  private readonly chip = el(
    'div',
    'hud-chip holo',
    `${ICONS.chip}<span>資料晶片</span><b>×0</b><small class="hud-next"></small>`,
  );
  private readonly glove = el('button', 'hud-glove holo touch-only hidden', `${ICONS.button}<span>手套</span>`);
  private readonly prompt = el('div', 'hud-prompt holo desktop-only hidden');
  private readonly objective = el('div', 'hud-objective holo hidden', '<small></small><span></span>');
  private readonly help = el('button', 'hud-help holo', '？');
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
    onHelp: () => void,
    onGlove: () => void,
  ) {
    this.root.append(this.chip, this.objective, this.help, this.glove, this.prompt, this.hints, this.pause);
    this.glove.type = 'button';
    this.glove.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onGlove();
    });
    parent.appendChild(this.root);
    this.pause.addEventListener('click', onResume);
    this.help.type = 'button';
    this.help.title = '任務說明';
    this.help.addEventListener('click', (e) => {
      e.stopPropagation();
      onHelp();
    });
  }

  /** 畫面上方的任務目標；step 為 null 時隱藏 */
  setObjective(step: number | null, total: number, html = ''): void {
    this.objective.classList.toggle('hidden', step === null);
    if (step === null) return;
    this.objective.querySelector('small')!.textContent = `目標 ${step}/${total}`;
    this.objective.querySelector('span')!.innerHTML = html;
    this.objective.classList.remove('bump');
    void this.objective.offsetWidth;
    this.objective.classList.add('bump');
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

  /** 晶片右側的小字：「下次升級還需 N 片」／「已全部升級」 */
  setUpgradeInfo(text: string): void {
    this.chip.querySelector('.hud-next')!.textContent = text;
  }

  /** 第一次達到升級門檻：晶片圖示閃爍一次 */
  blinkChip(): void {
    const icon = this.chip.querySelector('svg')!;
    icon.classList.remove('blink');
    void (icon as unknown as HTMLElement).getBoundingClientRect();
    icon.classList.add('blink');
  }

  /** 觸控版的手套按鈕（探索時顯示） */
  setGloveButton(on: boolean): void {
    this.glove.classList.toggle('hidden', !on);
  }

  /** 目標列目前占掉的區域（隱藏時 null），給鏡頭構圖避開 */
  objectiveRect(): DOMRect | null {
    if (this.root.classList.contains('hidden') || this.objective.classList.contains('hidden')) return null;
    return this.objective.getBoundingClientRect();
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
