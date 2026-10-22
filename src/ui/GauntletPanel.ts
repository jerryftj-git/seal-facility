import { el } from './icons';
import { renderUpgradeTab } from './UpgradeTab';
import './styles/gauntlet.css';
import './styles/upgrade.css';

/** 推演分頁需要的資料（推演手套只是思考工具：只顯示，不改變艙裡的生物） */
export interface PanelView {
  /** 看到的生物 N */
  n: number;
  /** 地上的接觸點 L */
  actual: number;
  /** 能量條的滿格值（全部是獵獸時的接觸點） */
  barMax: number;
  /** 偵察體有幾隻腳 */
  bipedLegs: number;
  /** 已經掃描過地面（不需要掃描的關卡固定 true）。false 時推演分頁只顯示「先掃描地面才能推演」 */
  scanned: boolean;
  /** 手套 Lv2 的試算；null = 還沒解鎖 */
  trial: { left: number; result: { hunters: number; points: number } | null } | null;
  /** 手套 Lv3：顯示提示句 */
  stepHint: boolean;
}

export type PanelTab = 'deduce' | 'upgrade';

export interface PanelCallbacks {
  /** 送出試算（獵獸數）；由 Game 檢查次數、算結果後再 render */
  onTrial(hunters: number): void;
  /** 點升級卡片或在升級分頁按 Enter（目標等級） */
  onUpgrade(level: number): void;
  onExit(): void;
}

const GOAL_TEXT = '目標：算出偵察體和獵獸各有幾隻，到大門輸入封印解除碼';
const NEAR_POD_TEXT = '靠近封印艙才能推演';
const SCAN_FIRST_TEXT = '先掃描地面才能推演';
/** 手套 Lv3 的提示句（Lv1、Lv2 不顯示） */
const STEP_HINT_TEXT = '提示：把偵察體變成獵獸，每變一隻接觸點 +2';

/**
 * 推演手套的全像面板（DOM）。頂端「推演／升級」分頁（Tab 切換）。
 * 推演分頁固定顯示假設法第一步：假設都是偵察體 → 推演的接觸點 → 地上的接觸點 → 還差幾個。
 * 手套 Lv2 多一個「試算」（每關 1 次），Lv3 多一行提示句。不顯示任何除法算式或答案。
 */
export class GauntletPanel {
  private readonly root: HTMLElement;
  private open_ = false;
  private tab: PanelTab = 'deduce';
  private view: PanelView | null = null;
  private upgrade = { level: 1, chips: 0 };
  /** 試算輸入框目前的數字 */
  private trialValue = 0;

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
        <div class="g-nodeduce hidden"></div>
        <div class="g-deduce-body">
          <div class="g-goal">${GOAL_TEXT}</div>
          <div class="g-seen"></div>
          <div class="g-step pred">
            <div class="g-step-text"></div>
            <div class="g-bar"><i class="fill"></i><i class="gap"></i><i class="mark"></i></div>
          </div>
          <div class="g-step act">
            <div class="g-step-text"></div>
            <div class="g-bar"><i class="fill"></i></div>
          </div>
          <div class="g-diff"><span class="g-diff-text"></span><small class="g-hint"></small></div>
          <div class="g-trial hidden">
            <div class="g-trial-row">
              <span>如果獵獸有</span>
              <button class="g-trial-minus" type="button" aria-label="減一">−</button>
              <output class="g-trial-value">0</output>
              <button class="g-trial-plus" type="button" aria-label="加一">+</button>
              <span>隻</span>
              <button class="g-trial-ok" type="button">確認 <kbd class="desktop-only">Enter</kbd></button>
            </div>
            <div class="g-trial-result hidden">
              <div class="g-step-text"></div>
              <div class="g-bar"><i class="fill"></i></div>
            </div>
            <div class="g-trial-used hidden">本關試算已用完</div>
          </div>
        </div>
      </div>
      <div class="g-page g-page-upgrade hidden"></div>`,
    );
    parent.appendChild(this.root);

    this.root.querySelector('.g-exit')!.addEventListener('click', () => this.cb.onExit());
    this.root.querySelectorAll<HTMLButtonElement>('.g-tab').forEach((t) =>
      t.addEventListener('click', () => this.setTab(t.dataset.tab as PanelTab)),
    );
    this.root.querySelector('.g-trial-minus')!.addEventListener('click', () => this.setTrialValue(this.trialValue - 1));
    this.root.querySelector('.g-trial-plus')!.addEventListener('click', () => this.setTrialValue(this.trialValue + 1));
    this.root.querySelector('.g-trial-ok')!.addEventListener('click', () => this.submitTrial());
    window.addEventListener('keydown', this.onKeyDown);
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
    this.root.dataset.side = this.side;
    this.root.classList.remove('hidden', 'closing');
    this.render(view);
    this.setTab(tab);
  }

  close(): void {
    this.open_ = false;
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

  render(v: PanelView | null): void {
    this.view = v;
    const r = this.root;
    const note = r.querySelector<HTMLElement>('.g-nodeduce')!;
    const body = r.querySelector<HTMLElement>('.g-deduce-body')!;
    const blocked = v === null ? NEAR_POD_TEXT : !v.scanned ? SCAN_FIRST_TEXT : null;
    note.textContent = blocked ?? '';
    note.classList.toggle('hidden', blocked === null);
    body.classList.toggle('hidden', blocked !== null);
    if (!v || blocked) return;

    const assumed = v.n * v.bipedLegs;
    const diff = v.actual - assumed;
    const pct = (x: number) => `${Math.max(0, Math.min(100, (x / v.barMax) * 100))}%`;
    r.querySelector('.g-seen')!.innerHTML = `看到的生物：<b>${v.n}</b> 隻`;

    const pred = r.querySelector('.g-step.pred')!;
    pred.querySelector('.g-step-text')!.innerHTML = `假設 ${v.n} 隻都是偵察體 → 推演的接觸點 <b>${assumed}</b>`;
    pred.querySelector<HTMLElement>('.fill')!.style.width = pct(assumed);
    const gap = pred.querySelector<HTMLElement>('.gap')!;
    gap.style.left = pct(Math.min(assumed, v.actual));
    gap.style.width = pct(Math.abs(diff));
    pred.querySelector<HTMLElement>('.mark')!.style.left = pct(v.actual);

    const act = r.querySelector('.g-step.act')!;
    act.querySelector('.g-step-text')!.innerHTML = `地上的接觸點 <b>${v.actual}</b>`;
    act.querySelector<HTMLElement>('.fill')!.style.width = pct(v.actual);

    r.querySelector('.g-diff-text')!.innerHTML = `還差 <b>${diff}</b> 個接觸點`;
    const hint = r.querySelector<HTMLElement>('.g-hint')!;
    hint.textContent = v.stepHint ? STEP_HINT_TEXT : '';
    hint.hidden = !v.stepHint;

    // 手套 Lv2：試算
    const trial = r.querySelector<HTMLElement>('.g-trial')!;
    trial.classList.toggle('hidden', v.trial === null);
    if (v.trial) {
      const used = v.trial.left <= 0;
      this.setTrialValue(v.trial.result?.hunters ?? (used ? this.trialValue : 0));
      trial.classList.toggle('used', used);
      trial.querySelectorAll<HTMLButtonElement>('.g-trial-row button').forEach((b) => (b.disabled = used));
      trial.querySelector('.g-trial-used')!.classList.toggle('hidden', !used);
      const res = trial.querySelector<HTMLElement>('.g-trial-result')!;
      res.classList.toggle('hidden', v.trial.result === null);
      if (v.trial.result) {
        res.querySelector('.g-step-text')!.innerHTML = `這樣推演出來的接觸點是 <b>${v.trial.result.points}</b>`;
        res.querySelector<HTMLElement>('.fill')!.style.width = pct(v.trial.result.points);
      }
    }
  }

  private setTrialValue(n: number): void {
    const max = this.view?.n ?? 0;
    this.trialValue = Math.max(0, Math.min(max, n));
    this.root.querySelector('.g-trial-value')!.textContent = String(this.trialValue);
  }

  private trialReady(): boolean {
    const v = this.view;
    return this.open_ && this.tab === 'deduce' && !!v && v.scanned && !!v.trial && v.trial.left > 0;
  }

  private submitTrial(): void {
    if (this.trialReady()) this.cb.onTrial(this.trialValue);
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
    const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
    if (this.tab === 'upgrade') {
      if (enter && !e.repeat) {
        e.preventDefault();
        this.cb.onUpgrade(this.upgrade.level + 1);
      }
      return;
    }
    // 推演分頁：數字鍵輸入試算的獵獸數，Backspace 刪一位，Enter 確認
    if (!this.trialReady()) return;
    const digit = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (digit) {
      e.preventDefault();
      const d = Number(digit[2]);
      // 可以打兩位數（例如 10 隻）；超過 N 就從這一位重新開始
      const two = this.trialValue * 10 + d;
      this.setTrialValue(this.trialValue > 0 && two <= this.view!.n ? two : d);
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      this.setTrialValue(Math.floor(this.trialValue / 10));
    } else if (enter && !e.repeat) {
      e.preventDefault();
      this.submitTrial();
    }
  };
}
