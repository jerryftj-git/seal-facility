import { el } from './icons';
import { gapInfo, lineMax, lineMaxUnknown, tickStep, ticks } from './numberLine';
import './styles/gauntlet.css';

/** 推演面板需要的資料（推演手套只是思考工具：只顯示，不改變艙裡的生物） */
export interface PanelView {
  /** 看到的生物 N */
  n: number;
  /** 地上的接觸點 L */
  actual: number;
  /** 偵察體、獵獸各有幾隻腳 */
  bipedLegs: number;
  quadLegs: number;
  /** 已經掃描過地面。false：只顯示青色段，L 的位置是「?」 */
  scanned: boolean;
  /** 掃描後第一次打開：L 標記從 0 滑到定位，再出現括號 */
  reveal: boolean;
}

export interface PanelCallbacks {
  onExit(): void;
}

/** L 標記滑入的時間（毫秒） */
const REVEAL_MS = 800;

/** 「地面」小圖示：一條橫線加三個點 */
const GROUND_ICON = `<svg viewBox="0 0 28 16" aria-hidden="true"><circle cx="7" cy="5" r="2.6"/><circle cx="14" cy="5" r="2.6"/><circle cx="21" cy="5" r="2.6"/><rect x="2" y="11" width="24" height="3" rx="1.5"/></svg>`;

/**
 * 推演手套的全像面板：數線版。
 * 頂部是偵察體、獵獸兩張小圖（下方圓點 = 接觸點數），右上「離開 E」；
 * 下面一條數線：青色填到 N×2、L 的位置插標記、中間橘色斜紋、下方括號「還差 X」。
 * 面板上沒有任何文字提示或算式。
 */
export class GauntletPanel {
  private readonly root: HTMLElement;
  private open_ = false;
  private view: PanelView | null = null;
  private revealTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly cb: PanelCallbacks,
  ) {
    this.root = el(
      'div',
      'gauntlet holo hidden',
      `<div class="g-top">
        <div class="g-legend">
          <figure class="g-sp scout"><div class="g-tile"><img alt="偵察體" /></div><i class="dots" data-n="2"></i></figure>
          <figure class="g-sp hunter"><div class="g-tile"><img alt="獵獸" /></div><i class="dots" data-n="4"></i></figure>
        </div>
        <button class="g-exit" type="button">離開 <kbd>E</kbd></button>
      </div>
      <div class="g-card">
        <div class="nl-scan">先掃描地面</div>
        <div class="nl">
          <div class="nl-who"><img class="nl-scout" alt="" /><span>× <b class="nl-n"></b></span></div>
          <div class="nl-label nl-assumed"></div>
          <div class="nl-label nl-l"><span class="nl-ground">${GROUND_ICON}</span><b></b></div>
          <div class="nl-bar">
            <i class="nl-fill"></i><i class="nl-hatch"></i><i class="nl-mark nl-mark-a"></i><i class="nl-mark nl-mark-l"></i>
          </div>
          <div class="nl-ticks"></div>
          <div class="nl-bracket"></div>
          <div class="nl-gap"><span class="nl-word"></span><b class="nl-value"></b></div>
        </div>
      </div>`,
    );
    parent.appendChild(this.root);
    this.root.querySelector('.g-exit')!.addEventListener('click', () => this.cb.onExit());
    this.root.querySelectorAll<HTMLElement>('.dots').forEach((d) => (d.innerHTML = '<b></b>'.repeat(Number(d.dataset.n))));
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', () => this.view && this.layout(this.view, false));
  }

  /** 生物小圖（離屏渲染好的 data URL） */
  setIcons(icons: Record<string, string>): void {
    const set = (sel: string, src?: string) => this.root.querySelectorAll<HTMLImageElement>(sel).forEach((img) => src && (img.src = src));
    set('.scout img, .nl-scout', icons.scout);
    set('.hunter img', icons.hunter);
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
    window.clearTimeout(this.revealTimer);
    this.root.classList.add('closing');
    window.setTimeout(() => {
      if (!this.open_) this.root.classList.add('hidden');
    }, 250);
  }

  relayout(): void {
    this.root.dataset.side = this.side;
    if (this.view) this.layout(this.view, false);
  }

  render(v: PanelView): void {
    const prev = this.view;
    this.view = v;
    this.root.querySelector('.nl-n')!.textContent = String(v.n);
    this.root.classList.toggle('unscanned', !v.scanned);
    // 換題（L 改變）時標記從舊位置滑到新位置；掃描後第一次打開時從 0 滑進來
    const animateL = v.reveal || (!!prev && prev.scanned && v.scanned && prev.actual !== v.actual);
    this.layout(v, animateL);
  }

  /** 依目前寬度擺好數線上的所有東西 */
  private layout(v: PanelView, animateL: boolean): void {
    const r = this.root;
    const assumed = v.n * v.bipedLegs;
    const max = v.scanned ? lineMax(v.actual) : lineMaxUnknown(v.n, v.quadLegs);
    const pct = (x: number) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
    const bar = r.querySelector<HTMLElement>('.nl-bar')!;
    const width = bar.getBoundingClientRect().width || 320;

    // 刻度：每 2 一個，太擠就每 4、每 8
    const step = tickStep(max, width, window.innerWidth < 480 ? 30 : 24);
    r.querySelector('.nl-ticks')!.innerHTML = ticks(max, step)
      .map((t) => `<span style="left:${pct(t)}">${t}</span>`)
      .join('');

    r.querySelector<HTMLElement>('.nl-fill')!.style.width = pct(assumed);
    r.querySelector<HTMLElement>('.nl-mark-a')!.style.left = pct(assumed);
    const a = r.querySelector<HTMLElement>('.nl-assumed')!;
    a.textContent = String(assumed);
    a.style.left = pct(assumed);

    const lLabel = r.querySelector<HTMLElement>('.nl-l')!;
    const lMark = r.querySelector<HTMLElement>('.nl-mark-l')!;
    const hatch = r.querySelector<HTMLElement>('.nl-hatch')!;
    const bracket = r.querySelector<HTMLElement>('.nl-bracket')!;
    const gapEl = r.querySelector<HTMLElement>('.nl-gap')!;

    if (!v.scanned) {
      // 還沒掃描：L 的位置是灰色「?」（放在已知段之後，不洩漏 L）
      lLabel.querySelector('b')!.textContent = '?';
      const qx = pct((assumed + max) / 2);
      lLabel.style.left = qx;
      lMark.style.left = qx;
      hatch.style.width = '0%';
      bracket.classList.add('off');
      gapEl.classList.add('off');
      this.spread(a, lLabel, 0.5);
      return;
    }

    const g = gapInfo(assumed, v.actual);
    lLabel.querySelector('b')!.textContent = String(v.actual);
    const place = () => {
      lLabel.style.left = pct(v.actual);
      lMark.style.left = pct(v.actual);
      hatch.style.left = pct(g ? g.from : assumed);
      hatch.style.width = g ? pct(g.to - g.from) : '0%';
      this.spread(a, lLabel, (v.actual - assumed) / max);
    };
    const showGap = () => {
      if (!g) {
        bracket.classList.add('off');
        gapEl.classList.add('off');
        return;
      }
      bracket.style.left = pct(g.from);
      bracket.style.width = pct(g.to - g.from);
      gapEl.style.left = pct((g.from + g.to) / 2);
      r.querySelector('.nl-word')!.textContent = g.word;
      r.querySelector('.nl-value')!.textContent = String(g.value);
      bracket.classList.remove('off');
      gapEl.classList.remove('off');
    };

    window.clearTimeout(this.revealTimer);
    if (!animateL) {
      r.classList.remove('sliding');
      place();
      showGap();
      return;
    }
    // 滑入：先放在起點（第一次是 0，換題時是舊位置），下一幀開始 0.8 秒滑到定位，滑完才出現括號
    bracket.classList.add('off');
    gapEl.classList.add('off');
    if (v.reveal) {
      r.classList.remove('sliding');
      lLabel.style.left = '0%';
      lMark.style.left = '0%';
      hatch.style.left = pct(0);
      hatch.style.width = '0%';
    }
    // 強制排版一次，讓起點生效，再加上過渡、設定終點（不用 requestAnimationFrame：分頁在背景時它不會執行）
    void r.offsetWidth;
    r.classList.add('sliding');
    void r.offsetWidth;
    place();
    this.revealTimer = window.setTimeout(() => {
      r.classList.remove('sliding');
      showGap();
    }, REVEAL_MS);
  }

  /** N×2 和 L 的大字太靠近時，往兩邊錯開（N×2 靠右對齊到它的位置、L 靠左） */
  private spread(a: HTMLElement, l: HTMLElement, gapFrac: number): void {
    const close = Math.abs(gapFrac) < 0.2;
    a.dataset.align = close ? (gapFrac >= 0 ? 'end' : 'start') : 'center';
    l.dataset.align = close ? (gapFrac >= 0 ? 'start' : 'end') : 'center';
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.open_) return;
    if (e.code === 'KeyE') {
      if (!e.repeat) this.cb.onExit();
      e.preventDefault();
    }
  };
}
