import { el, ICONS } from './icons';
import { RepeatTimer } from './repeat';
import { renderUpgradeTab } from './UpgradeTab';
import './styles/gauntlet.css';
import './styles/upgrade.css';

/** 轉換動作：A／D 一次一隻，Q／W 一次兩隻（推演手套 Lv2） */
export type ConvertDir = 'toBiped' | 'toQuad' | 'pairToBiped' | 'pairToQuad';

/** 面板需要的資料 */
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
  /** 手套 Lv2 以上才有 Q／W；null 表示還沒解鎖 */
  pair: { size: number; canToBiped: boolean; canToQuad: boolean } | null;
  /** 手套 Lv3：顯示算式提示 */
  formula: boolean;
  /** 已經掃描過地面（不需要掃描的關卡固定 true）。false 時地上的接觸點顯示「？？」、按鈕停用 */
  scanned: boolean;
}

export type PanelTab = 'deduce' | 'upgrade';

export interface PanelCallbacks {
  /** 回傳 true 表示有實際轉換（可以繼續連發） */
  onConvert(dir: ConvertDir): boolean;
  /** 點升級卡片或在升級分頁按 Enter（目標等級） */
  onUpgrade(level: number): void;
  onExit(): void;
}

/**
 * 「提示：把偵察體變成獵獸，每變一隻接觸點 +2」提示句。
 * 注意：原始規格是「不顯示每換一隻差 2 之類的提示，讓玩家自己發現」；2026-10-22 使用者要求加上。
 * 改成 false 就拿掉提示句。
 */
export const SHOW_STEP_HINT = true;

const GOAL_TEXT = '目標：算出來的接觸點要達到地上的接觸點，才能開啟大門';
const SCAN_FIRST_TEXT = '先掃描地面才能推演';

const KEYS: Record<string, ConvertDir> = {
  KeyA: 'toBiped',
  ArrowLeft: 'toBiped',
  KeyD: 'toQuad',
  ArrowRight: 'toQuad',
  KeyQ: 'pairToBiped',
  KeyW: 'pairToQuad',
};

const DIRS: readonly ConvertDir[] = ['toBiped', 'toQuad', 'pairToBiped', 'pairToQuad'];

/**
 * 推演手套的全像面板（DOM）。頂端「推演／升級」分頁（Tab 切換）。
 * 左鍵轉雙足、右鍵轉四足，和鍵位方向一致；Lv2 的 Q／W 放在 A／D 外側。
 */
export class GauntletPanel {
  private readonly root: HTMLElement;
  private readonly repeat: Record<ConvertDir, RepeatTimer>;
  private readonly btn: Record<ConvertDir, HTMLButtonElement>;
  private open_ = false;
  private heldKey: string | null = null;
  private heldPointer: number | null = null;
  private tab: PanelTab = 'deduce';
  private canDeduce = true;
  /** 還沒掃描地面：推演按鈕停用 */
  private locked = false;
  private view: PanelView | null = null;
  private upgrade = { level: 1, chips: 0 };

  constructor(
    parent: HTMLElement,
    private readonly cb: PanelCallbacks,
  ) {
    this.root = el(
      'div',
      'gauntlet holo hidden',
      `<div class="g-tabs" role="tablist">
        <button class="g-tab" type="button" data-tab="deduce">推演</button>
        <button class="g-tab" type="button" data-tab="upgrade">升級</button>
        <kbd class="desktop-only">Tab</kbd>
        <button class="g-exit" type="button">離開 <kbd class="desktop-only">E</kbd></button>
      </div>
      <div class="g-page g-page-deduce">
        <div class="g-head"><span class="g-title"><i class="g-dot"></i><span class="g-title-text">推演模式</span></span></div>
        <div class="g-nodeduce hidden">靠近封印艙才能推演</div>
        <div class="g-deduce-body">
          <div class="g-goal">${GOAL_TEXT}</div>
          <div class="g-hyp"></div>
          <div class="g-counts">
            <span class="g-count biped">${ICONS.scout}<span>偵察體<small>兩隻腳</small></span><b></b></span>
            <span class="g-count quad">${ICONS.hunter}<span>獵獸<small>四隻腳</small></span><b></b></span>
          </div>
          <div class="g-bars">
            <div class="g-row act"><label>地上的接觸點</label><div class="g-bar"><i class="fill"></i></div><output></output></div>
            <div class="g-row pred"><label>推演的接觸點</label><div class="g-bar"><i class="fill"></i><i class="gap"></i><i class="mark"></i></div><output></output></div>
          </div>
          <div class="g-diff"><span class="g-diff-text"></span><small class="g-hint"></small><small class="g-formula"></small></div>
        </div>
        <div class="g-buttons">
          <button class="g-btn g-pair pair-to-biped hidden" type="button" data-dir="pairToBiped"><kbd class="desktop-only">Q</kbd><span class="g-btn-label"><span>變回</span><span>兩隻</span></span></button>
          <button class="g-btn to-biped" type="button" data-dir="toBiped"><span class="g-btn-arrow">◀</span><span class="g-btn-label"><span>把一隻獵獸</span><span>變回偵察體</span></span><kbd class="desktop-only">A</kbd></button>
          <button class="g-btn to-quad" type="button" data-dir="toQuad"><kbd class="desktop-only">D</kbd><span class="g-btn-label"><span>把一隻偵察體</span><span>變為獵獸</span></span><span class="g-btn-arrow">▶</span></button>
          <button class="g-btn g-pair pair-to-quad hidden" type="button" data-dir="pairToQuad"><kbd class="desktop-only">W</kbd><span class="g-btn-label"><span>變為</span><span>兩隻</span></span></button>
        </div>
      </div>
      <div class="g-page g-page-upgrade hidden"></div>`,
    );
    parent.appendChild(this.root);

    this.repeat = Object.fromEntries(DIRS.map((d) => [d, new RepeatTimer(() => this.cb.onConvert(d))])) as Record<
      ConvertDir,
      RepeatTimer
    >;
    this.btn = {
      toBiped: this.root.querySelector('.to-biped')!,
      toQuad: this.root.querySelector('.to-quad')!,
      pairToBiped: this.root.querySelector('.pair-to-biped')!,
      pairToQuad: this.root.querySelector('.pair-to-quad')!,
    };

    for (const dir of DIRS) {
      const b = this.btn[dir];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.heldPointer !== null || b.disabled) return;
        this.heldPointer = e.pointerId;
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* 合成事件或已失效的 pointer 無法 capture，不影響操作 */
        }
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
    this.root.querySelectorAll<HTMLButtonElement>('.g-tab').forEach((t) =>
      t.addEventListener('click', () => this.setTab(t.dataset.tab as PanelTab)),
    );
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
  }

  get isOpen(): boolean {
    return this.open_;
  }

  get currentTab(): PanelTab {
    return this.tab;
  }

  /** 面板占掉的區域，給鏡頭偏移用 */
  get rect(): DOMRect {
    return this.root.getBoundingClientRect();
  }

  get side(): 'right' | 'bottom' {
    return window.innerWidth > window.innerHeight * 1.05 ? 'right' : 'bottom';
  }

  /**
   * 打開面板。view 為 null 代表不在封印艙前（只能看升級分頁，推演分頁顯示「靠近封印艙才能推演」）。
   */
  open(view: PanelView | null, tab: PanelTab = view ? 'deduce' : 'upgrade'): void {
    this.open_ = true;
    this.canDeduce = view !== null;
    this.root.dataset.side = this.side;
    this.root.classList.remove('hidden', 'closing');
    if (view) this.render(view);
    this.root.querySelector('.g-nodeduce')!.classList.toggle('hidden', this.canDeduce);
    this.root.querySelector('.g-deduce-body')!.classList.toggle('hidden', !this.canDeduce);
    this.applyDisabled();
    this.setTab(tab);
  }

  private applyDisabled(): void {
    for (const d of DIRS) this.btn[d].disabled = !this.canDeduce || this.locked;
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

  setTab(tab: PanelTab): void {
    this.tab = tab;
    this.releaseAll();
    this.root.dataset.tab = tab;
    this.root.querySelector('.g-page-deduce')!.classList.toggle('hidden', tab !== 'deduce');
    this.root.querySelector('.g-page-upgrade')!.classList.toggle('hidden', tab !== 'upgrade');
    this.root.querySelectorAll<HTMLElement>('.g-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'upgrade') this.renderUpgrade();
  }

  /** 升級分頁的資料（晶片數、手套等級）有變時呼叫 */
  setUpgradeState(level: number, chips: number): void {
    this.upgrade = { level, chips };
    if (this.open_ && this.tab === 'upgrade') this.renderUpgrade();
    if (this.view) this.render({ ...this.view });
  }

  private renderUpgrade(): void {
    renderUpgradeTab(this.root.querySelector('.g-page-upgrade')!, this.upgrade.level, this.upgrade.chips, (lv) =>
      this.cb.onUpgrade(lv),
    );
  }

  /** 升級瞬間：面板閃一下 */
  flash(): void {
    this.root.classList.remove('upgrade-flash');
    void this.root.offsetWidth;
    this.root.classList.add('upgrade-flash');
  }

  tick(now: number): void {
    if (!this.open_) return;
    for (const d of DIRS) this.repeat[d].tick(now);
  }

  render(v: PanelView): void {
    this.view = v;
    this.locked = !v.scanned;
    this.applyDisabled();
    const r = this.root;
    const dir = !v.scanned ? 'locked' : v.diff > 0 ? 'under' : v.diff < 0 ? 'over' : 'match';
    r.dataset.dir = dir;
    r.classList.toggle('solved', v.solved);
    r.querySelector('.g-title-text')!.textContent = v.solved ? '封印解除' : '推演模式';
    r.querySelector('.g-goal')!.textContent = v.solved ? '一樣多了！封印解除，大門正在打開' : GOAL_TEXT;
    r.querySelector('.g-hyp')!.textContent =
      v.quad === 0 ? `你的猜法：${v.biped} 隻都是兩隻腳` : `你的猜法：${v.biped} 隻兩隻腳、${v.quad} 隻四隻腳`;
    r.querySelector('.biped b')!.textContent = String(v.biped);
    r.querySelector('.quad b')!.textContent = String(v.quad);

    const pct = (x: number) => `${Math.max(0, Math.min(100, (x / v.barMax) * 100))}%`;
    const pred = r.querySelector('.pred')!;
    const act = r.querySelector('.act')!;
    pred.querySelector<HTMLElement>('.fill')!.style.width = pct(v.predicted);
    // 還沒掃描：地上的接觸點未知（「？？」、能量條空白、預測條上不標差距）
    act.querySelector<HTMLElement>('.fill')!.style.width = v.scanned ? pct(v.actual) : '0%';
    const gap = pred.querySelector<HTMLElement>('.gap')!;
    gap.style.left = pct(Math.min(v.predicted, v.actual));
    gap.style.width = v.scanned ? pct(Math.abs(v.diff)) : '0%';
    const mark = pred.querySelector<HTMLElement>('.mark')!;
    mark.style.left = pct(v.actual);
    mark.style.visibility = v.scanned ? '' : 'hidden';
    pred.querySelector('output')!.textContent = String(v.predicted);
    act.querySelector('output')!.textContent = v.scanned ? String(v.actual) : '？？';

    // 差距的文字與顏色狀態（顏色由 data-dir 控制：under／over = 橘、match = 綠，見 gauntlet.css）
    const diffText = r.querySelector('.g-diff-text')!;
    const hint = r.querySelector<HTMLElement>('.g-hint')!;
    const formula = r.querySelector<HTMLElement>('.g-formula')!;
    const abs = Math.abs(v.diff);
    if (dir === 'locked') {
      diffText.textContent = SCAN_FIRST_TEXT;
      hint.textContent = '';
    } else if (dir === 'match') {
      diffText.innerHTML = '<b>符合！</b>';
      hint.textContent = '';
    } else if (dir === 'under') {
      diffText.innerHTML = `還差 <b>${v.diff}</b> 個接觸點`;
      hint.textContent = SHOW_STEP_HINT ? '提示：把偵察體變成獵獸，每變一隻接觸點 +2' : '';
    } else {
      diffText.innerHTML = `多了 <b>${abs}</b> 個接觸點`;
      hint.textContent = SHOW_STEP_HINT ? '提示：把獵獸變回偵察體，每變一隻接觸點 −2' : '';
    }
    hint.hidden = !hint.textContent;
    // 手套 Lv3 的算式提示（差值為 0 時不顯示）
    formula.textContent =
      v.formula && (dir === 'under' || dir === 'over') ? `${dir === 'under' ? '還差' : '多了'} ${abs}，${abs} ÷ 2 = ${abs / 2} 隻` : '';
    formula.hidden = !formula.textContent;

    this.btn.toBiped.classList.toggle('dim', !v.canToBiped);
    this.btn.toQuad.classList.toggle('dim', !v.canToQuad);
    const hasPair = v.pair !== null;
    r.querySelector('.g-buttons')!.classList.toggle('with-pair', hasPair);
    r.dataset.pair = hasPair ? '1' : '0';
    this.btn.pairToBiped.classList.toggle('hidden', !hasPair);
    this.btn.pairToQuad.classList.toggle('hidden', !hasPair);
    this.btn.pairToBiped.classList.toggle('dim', !v.pair?.canToBiped);
    this.btn.pairToQuad.classList.toggle('dim', !v.pair?.canToQuad);
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
    for (const d of DIRS) {
      this.repeat[d].release();
      this.btn[d].classList.remove('down');
    }
    this.heldKey = null;
    this.heldPointer = null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.open_) return;
    if (e.code === 'KeyE' || e.code === 'Escape') {
      if (!e.repeat) this.cb.onExit();
      e.preventDefault();
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.setTab(this.tab === 'deduce' ? 'upgrade' : 'deduce');
      return;
    }
    if (this.tab === 'upgrade') {
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
        e.preventDefault();
        this.cb.onUpgrade(this.upgrade.level + 1);
      }
      return;
    }
    const dir = KEYS[e.code];
    if (!dir || !this.canDeduce || this.locked) return;
    if ((dir === 'pairToBiped' || dir === 'pairToQuad') && this.btn[dir].classList.contains('hidden')) return;
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
