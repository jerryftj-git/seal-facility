import { el, ICONS } from './icons';
import { RepeatTimer } from './repeat';
import './styles/gauntlet.css';

export type ConvertDir = 'toBiped' | 'toQuad';

/** 面板需要的資料。刻意只有預測、實際、差值和目前數量，沒有任何提示或答案。 */
export interface PanelView {
  biped: number;
  quad: number;
  predicted: number;
  actual: number;
  /** actual − predicted */
  diff: number;
  /** 能量條的滿格值 */
  barMax: number;
  solved: boolean;
  canToBiped: boolean;
  canToQuad: boolean;
}

export interface PanelCallbacks {
  /** 回傳 true 表示有實際轉換（可以繼續連發） */
  onConvert(dir: ConvertDir): boolean;
  onExit(): void;
}

const KEYS: Record<string, ConvertDir> = {
  KeyA: 'toBiped',
  ArrowLeft: 'toBiped',
  KeyD: 'toQuad',
  ArrowRight: 'toQuad',
};

/** 推演手套的全像面板（DOM）。左鍵轉雙足、右鍵轉四足，和鍵位方向一致。 */
export class GauntletPanel {
  private readonly root: HTMLElement;
  private readonly repeat: Record<ConvertDir, RepeatTimer>;
  private readonly btn: Record<ConvertDir, HTMLButtonElement>;
  private open_ = false;
  private heldKey: string | null = null;
  private heldPointer: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly cb: PanelCallbacks,
  ) {
    this.root = el(
      'div',
      'gauntlet holo hidden',
      `<div class="g-head">
        <span class="g-title"><i class="g-dot"></i><span class="g-title-text">推演模式</span></span>
        <button class="g-exit" type="button">離開 <kbd class="desktop-only">E</kbd></button>
      </div>
      <div class="g-hyp"></div>
      <div class="g-counts">
        <span class="g-count biped">${ICONS.scout}<span>雙足</span><b></b></span>
        <span class="g-count quad">${ICONS.hunter}<span>四足</span><b></b></span>
      </div>
      <div class="g-bars">
        <div class="g-row pred"><label>預測觸地</label><div class="g-bar"><i class="fill"></i><i class="gap"></i><i class="mark"></i></div><output></output></div>
        <div class="g-row act"><label>實際觸地</label><div class="g-bar"><i class="fill"></i></div><output></output></div>
      </div>
      <div class="g-diff"><span class="g-arrow"></span><span>差</span><b></b></div>
      <div class="g-buttons">
        <button class="g-btn to-biped" type="button" data-dir="toBiped"><span class="g-btn-arrow">◀</span><span>轉換一隻為雙足</span><kbd class="desktop-only">A</kbd></button>
        <button class="g-btn to-quad" type="button" data-dir="toQuad"><kbd class="desktop-only">D</kbd><span>轉換一隻為四足</span><span class="g-btn-arrow">▶</span></button>
      </div>`,
    );
    parent.appendChild(this.root);

    this.repeat = {
      toBiped: new RepeatTimer(() => this.cb.onConvert('toBiped')),
      toQuad: new RepeatTimer(() => this.cb.onConvert('toQuad')),
    };
    this.btn = {
      toBiped: this.root.querySelector('.to-biped')!,
      toQuad: this.root.querySelector('.to-quad')!,
    };

    for (const dir of ['toBiped', 'toQuad'] as const) {
      const b = this.btn[dir];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.heldPointer !== null) return;
        this.heldPointer = e.pointerId;
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('down');
        this.repeat[dir].press(performance.now());
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== this.heldPointer) return;
        this.heldPointer = null;
        b.classList.remove('down');
        this.repeat[dir].release();
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.root.querySelector('.g-exit')!.addEventListener('click', () => this.cb.onExit());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
  }

  get isOpen(): boolean {
    return this.open_;
  }

  /** 面板占掉的區域，給鏡頭偏移用 */
  get rect(): DOMRect {
    return this.root.getBoundingClientRect();
  }

  get side(): 'right' | 'bottom' {
    return window.innerWidth > window.innerHeight * 1.05 ? 'right' : 'bottom';
  }

  open(view: PanelView): void {
    this.open_ = true;
    this.root.dataset.side = this.side;
    this.root.classList.remove('hidden', 'closing');
    this.render(view);
  }

  close(): void {
    this.open_ = false;
    this.releaseAll();
    this.root.classList.add('closing');
    window.setTimeout(() => {
      if (!this.open_) this.root.classList.add('hidden');
    }, 250);
  }

  relayout(): void {
    this.root.dataset.side = this.side;
  }

  tick(now: number): void {
    if (!this.open_) return;
    this.repeat.toBiped.tick(now);
    this.repeat.toQuad.tick(now);
  }

  render(v: PanelView): void {
    const r = this.root;
    const dir = v.diff > 0 ? 'under' : v.diff < 0 ? 'over' : 'match';
    r.dataset.dir = dir;
    r.classList.toggle('solved', v.solved);
    r.querySelector('.g-title-text')!.textContent = v.solved ? '封印解除' : '推演模式';
    r.querySelector('.g-hyp')!.textContent =
      v.quad === 0 ? '假設：全部為雙足' : v.biped === 0 ? '假設：全部為四足' : `假設：雙足 ${v.biped}・四足 ${v.quad}`;
    r.querySelector('.biped b')!.textContent = String(v.biped);
    r.querySelector('.quad b')!.textContent = String(v.quad);

    const pct = (x: number) => `${Math.max(0, Math.min(100, (x / v.barMax) * 100))}%`;
    const pred = r.querySelector('.pred')!;
    const act = r.querySelector('.act')!;
    pred.querySelector<HTMLElement>('.fill')!.style.width = pct(v.predicted);
    act.querySelector<HTMLElement>('.fill')!.style.width = pct(v.actual);
    const gap = pred.querySelector<HTMLElement>('.gap')!;
    gap.style.left = pct(Math.min(v.predicted, v.actual));
    gap.style.width = pct(Math.abs(v.diff));
    pred.querySelector<HTMLElement>('.mark')!.style.left = pct(v.actual);
    pred.querySelector('output')!.textContent = String(v.predicted);
    act.querySelector('output')!.textContent = String(v.actual);

    r.querySelector('.g-arrow')!.textContent = dir === 'under' ? '▲' : dir === 'over' ? '▼' : '●';
    r.querySelector('.g-diff b')!.textContent = String(Math.abs(v.diff));

    this.btn.toBiped.classList.toggle('dim', !v.canToBiped);
    this.btn.toQuad.classList.toggle('dim', !v.canToQuad);
    if (v.solved) this.releaseAll();
  }

  /** 每次轉換時讓數字跳一下 */
  pulse(): void {
    const d = this.root.querySelector('.g-diff')!;
    d.classList.remove('bump');
    void (d as HTMLElement).offsetWidth;
    d.classList.add('bump');
  }

  private releaseAll(): void {
    this.repeat.toBiped.release();
    this.repeat.toQuad.release();
    this.heldKey = null;
    this.heldPointer = null;
    this.btn.toBiped.classList.remove('down');
    this.btn.toQuad.classList.remove('down');
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.open_) return;
    if (e.code === 'KeyE' || e.code === 'Escape') {
      if (!e.repeat) this.cb.onExit();
      e.preventDefault();
      return;
    }
    const dir = KEYS[e.code];
    if (!dir) return;
    e.preventDefault();
    if (e.repeat || this.heldKey) return; // 連發由 RepeatTimer 處理，忽略系統的按鍵重複
    this.heldKey = e.code;
    this.btn[dir].classList.add('down');
    this.repeat[dir].press(performance.now());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== this.heldKey) return;
    const dir = KEYS[e.code];
    this.heldKey = null;
    this.btn[dir].classList.remove('down');
    this.repeat[dir].release();
  };
}
