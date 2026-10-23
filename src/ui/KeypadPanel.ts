import { CODE_LENGTH } from '../puzzle';
import { el } from './icons';
import './styles/keypad.css';

/**
 * - input：可以輸入
 * - scanFirst：還沒掃描地面，鎖住
 * - alarm：答錯，保全系統啟動，倒數中鎖住
 * - success：答對，封印解除
 */
export type KeypadMode = 'input' | 'scanFirst' | 'alarm' | 'success';

export interface KeypadCallbacks {
  onSubmit(code: string): void;
  onClose(): void;
  /** 按一個數字（音效） */
  onKey(): void;
}

const DESC = '四位數：前兩位是偵察體的數量，後兩位是獵獸的數量';

/**
 * 大門的「封印解除碼」面板。數字鍵 0–9 輸入、Backspace 刪除、Enter 或「確認」送出（沒填滿四位時確認鈕停用）。
 * 觸控版顯示螢幕鍵盤。E 離開（Esc 是暫停）。
 */
export class KeypadPanel {
  private readonly root: HTMLElement;
  private readonly cells: HTMLElement[];
  private readonly ok: HTMLButtonElement;
  private readonly status: HTMLElement;
  private code = '';
  private mode: KeypadMode = 'input';
  private open_ = false;

  constructor(
    parent: HTMLElement,
    private readonly cb: KeypadCallbacks,
  ) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0']
      .map((k) =>
        k === 'back'
          ? '<button class="k-key k-back" type="button" data-key="back" aria-label="刪除">⌫</button>'
          : `<button class="k-key" type="button" data-key="${k}">${k}</button>`,
      )
      .join('');
    this.root = el(
      'div',
      'keypad holo hidden',
      `<div class="k-head"><b>封印解除碼</b><button class="k-exit" type="button">離開 <kbd class="desktop-only">E</kbd></button></div>
      <p class="k-desc">${DESC}</p>
      <div class="k-cells">${'<span class="k-cell"></span>'.repeat(CODE_LENGTH)}</div>
      <div class="k-status"></div>
      <div class="k-pad touch-only">${keys}</div>
      <button class="k-ok btn-primary" type="button">確認 <kbd class="desktop-only">Enter</kbd></button>`,
    );
    parent.appendChild(this.root);
    this.cells = [...this.root.querySelectorAll<HTMLElement>('.k-cell')];
    this.ok = this.root.querySelector('.k-ok')!;
    this.status = this.root.querySelector('.k-status')!;
    this.ok.addEventListener('click', () => this.submit());
    this.root.querySelector('.k-exit')!.addEventListener('click', () => this.cb.onClose());
    this.root.querySelectorAll<HTMLButtonElement>('.k-key').forEach((b) =>
      b.addEventListener('click', () => (b.dataset.key === 'back' ? this.back() : this.type(b.dataset.key!))),
    );
    window.addEventListener('keydown', this.onKeyDown);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(mode: KeypadMode, countdown = 0): void {
    this.open_ = true;
    this.root.classList.remove('hidden', 'closing');
    this.code = '';
    this.setMode(mode, countdown);
  }

  close(): void {
    this.open_ = false;
    this.root.classList.add('closing');
    window.setTimeout(() => {
      if (!this.open_) this.root.classList.add('hidden');
    }, 250);
  }

  setMode(mode: KeypadMode, countdown = 0): void {
    this.mode = mode;
    this.root.dataset.mode = mode;
    if (mode === 'input') this.code = '';
    if (mode === 'alarm') this.setCountdown(countdown);
    else this.status.innerHTML = mode === 'success' ? '封印解除' : mode === 'scanFirst' ? '先掃描地面' : '';
    this.refresh();
  }

  /** 警報倒數（秒） */
  setCountdown(seconds: number): void {
    if (this.mode !== 'alarm') return;
    this.status.innerHTML = `保全系統啟動<span class="k-count">${seconds}</span>`;
  }

  private refresh(): void {
    const locked = this.mode !== 'input';
    this.cells.forEach((c, i) => {
      c.textContent = this.code[i] ?? '';
      c.classList.toggle('filled', i < this.code.length);
    });
    this.ok.disabled = locked || this.code.length < CODE_LENGTH;
    this.root.querySelectorAll<HTMLButtonElement>('.k-key').forEach((b) => (b.disabled = locked));
    this.root.querySelector<HTMLButtonElement>('.k-exit')!.disabled = this.mode === 'success';
  }

  private type(d: string): void {
    if (this.mode !== 'input' || this.code.length >= CODE_LENGTH) return;
    this.code += d;
    this.cb.onKey();
    this.refresh();
  }

  private back(): void {
    if (this.mode !== 'input') return;
    this.code = this.code.slice(0, -1);
    this.refresh();
  }

  private submit(): void {
    if (this.mode !== 'input' || this.code.length < CODE_LENGTH) return;
    this.cb.onSubmit(this.code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.open_) return;
    // E 離開；Esc 交給遊戲打開暫停選單
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (!e.repeat && this.mode !== 'success') this.cb.onClose();
      return;
    }
    const digit = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (digit) {
      e.preventDefault();
      this.type(digit[2]);
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      this.back();
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
      e.preventDefault();
      this.submit();
    }
  };
}
