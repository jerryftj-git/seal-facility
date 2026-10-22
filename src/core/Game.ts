import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { HUNTER, SCOUT } from '../puzzle/species';
import {
  answerSlots,
  checkCode,
  createRng,
  rateLevel,
  redeployPuzzle,
  trialPoints,
  type Grade,
  type Puzzle,
  type Rng,
} from '../puzzle';
import { canAffordNext, chipsNeeded, gloveFeatures, levelDef, tryUpgrade } from '../progress/gloveUpgrades';
import { showToast } from '../ui/Toast';
import { levelSave, loadSave, recordLevelResult, resetRun, writeSave, type SaveData } from './saveData';
import { AREAS, levelById, levelLabel, puzzleForLevel, puzzleWithL, type LevelDef } from '../levels/levels';
import type { Segment } from '../world/Segment';
import { AreaSummary } from '../ui/AreaSummary';
import { CameraRig } from '../player/CameraRig';
import { detectInitialMode, type InputMode } from '../player/deviceDetect';
import { Input } from '../player/Input';
import { KeyboardMouseSource } from '../player/KeyboardMouseSource';
import { PlayerController } from '../player/PlayerController';
import { ThirdPersonCamera, type CameraPose } from '../player/ThirdPersonCamera';
import { FpsMeter } from '../ui/FpsMeter';
import { GauntletPanel, type PanelView } from '../ui/GauntletPanel';
import { KeypadPanel, type KeypadMode } from '../ui/KeypadPanel';
import { showBriefing } from '../ui/Briefing';
import { Hud } from '../ui/Hud';
import { playIntro } from '../ui/IntroSequence';
import { ResultScreen } from '../ui/ResultScreen';
import { TitleScreen } from '../ui/TitleScreen';
import { TouchControls } from '../ui/TouchControls';
import { GameAudio } from './Audio';
import { AGENT_LOOK, captureEnvMap, RimLight } from './agentLook';
import { PostFX } from './PostFX';
import { nearestInteractable, type Interactable } from './Interactables';
import { Level, type LevelSetup } from './Level';
import { Loop } from './Loop';
import { PALETTE } from './palette';
import { Waypoint } from '../world/Waypoint';
import { createRenderer } from './Renderer';
import { ease, Tweens } from './Tweens';

export type GameState = 'loading' | 'title' | 'briefing' | 'explore' | 'deduction' | 'glove' | 'keypad' | 'cinematic' | 'result';

/**
 * 任務進度：決定畫面上方的目標文字與 ◆ 標記的位置。
 * 不需要掃描的關卡（第一關）：pod → solve → chest；需要掃描的關卡（第二關）：scan → solve → cross。
 */
type Objective = 'pod' | 'solve' | 'chest' | 'scan' | 'cross' | 'done';

/** 目前的區域（區域 1 = 第一關＋第二關） */
const AREA = AREAS[0];

/** 掃描台的地面掃描動畫長度（秒） */
const SCAN_TIME = 1.5;

/** 答錯後保全系統鎖定的秒數 */
const ALARM_TIME = 20;

/** 答對後全像投影逐隻變形的總時間（秒） */
const MORPH_TIME = 1.5;

/**
 * 一關的作答狀態。大部分只在記憶體裡；存檔只記「目前題目的 L」和「觸發過警報」
 * （答錯後重新整理不能回到原題再猜，評級上限也還是 B）。
 */
interface LevelRun {
  readonly def: LevelDef;
  /** 目前的題目（答錯換題後會變） */
  puzzle: Puzzle;
  /** 警報倒數結束後要換上的新題目 */
  pending: Puzzle | null;
  /** 試算剩餘次數（每關 1 次，換題後重置；手套 Lv2 以上才用得到） */
  trialsLeft: number;
  trial: { hunters: number; points: number } | null;
  /** 這一關用過試算（評級最高 A） */
  trialUsed: boolean;
  /** 送出封印解除碼的次數 */
  attempts: number;
  /** 觸發過警報（評級最高 B） */
  alarmed: boolean;
}

export class Game {
  state: GameState = 'loading';
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 80);
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  readonly assets = new AssetLoader();
  readonly audio = new GameAudio();
  readonly tweens = new Tweens();

  private readonly rig = new CameraRig(this.camera);
  private readonly tpc = new ThirdPersonCamera();
  private readonly kbm: KeyboardMouseSource;
  private readonly ui: HTMLElement;
  private readonly hud: Hud;
  private readonly touch: TouchControls;
  private readonly panel: GauntletPanel;
  private readonly keypad: KeypadPanel;
  private readonly result: ResultScreen;
  private readonly areaSummary: AreaSummary;
  private readonly loop = new Loop((dt, now) => this.tick(dt, now));
  private readonly rng: Rng;
  private readonly fps: FpsMeter | null;

  /** 整個區域（各關的走廊段） */
  level!: Level;
  player!: PlayerController;
  /** 目前所在的關卡編號 */
  cur = 1;
  /** 各關的作答狀態（key = 關卡編號） */
  private readonly runs = new Map<number, LevelRun>();
  /** 保全警報剩下的秒數（0 = 沒有警報） */
  private alarmLeft = 0;
  /** 存檔（晶片數、手套等級、隱藏晶片、關卡進度與評級、一次性提示） */
  private save: SaveData = loadSave(undefined, undefined, Math.max(...AREA.levels));
  /** 這一關拿到的晶片（第一關結算顯示用；整輪的在 save.runChips） */
  private levelChips = 0;
  private worldTime = 0;
  /** 上一輪各關的題目（隨機出題的關卡避免連續兩次同一題） */
  private lastAnswers = new Map<number, string>();
  private realTime = 0;
  private near: Interactable | null = null;
  private followPose: CameraPose | null = null;
  private objective: Objective = 'pod';
  private readonly waypoint = new Waypoint();
  private readonly rim = new RimLight();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly post: PostFX;

  constructor(container: HTMLElement) {
    this.input = new Input(detectInitialMode());
    this.renderer = createRenderer(container, this.input.mode === 'touch');
    this.ui = document.getElementById('ui')!;
    this.kbm = new KeyboardMouseSource(this.input, this.renderer.domElement);
    this.hud = new Hud(
      this.ui,
      () => this.kbm.requestLock(),
      () => void this.openHelp(),
      () => this.openGlove(),
    );
    this.touch = new TouchControls(this.ui, this.input);
    this.panel = new GauntletPanel(this.ui, {
      onTrial: (h) => this.onTrial(h),
      onUpgrade: (lv) => this.upgradeGlove(lv),
      onExit: () => this.closePanel(),
    });
    this.keypad = new KeypadPanel(this.ui, {
      onSubmit: (code) => this.submitCode(code),
      onClose: () => this.closeKeypad(),
      onKey: () => this.audio.keyTick(),
    });
    this.result = new ResultScreen(
      this.ui,
      () => this.retry(),
      () => this.continueToNext(),
    );
    this.areaSummary = new AreaSummary(
      this.ui,
      () => this.backToMenu(),
      () => this.retry(),
    );

    const params = new URLSearchParams(location.search);
    this.fps = params.get('fps') === '1' ? new FpsMeter(this.ui) : null;
    const seed = params.get('seed');
    this.rng = seed !== null && Number.isFinite(Number(seed)) ? createRng(Number(seed)) : Math.random;

    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.06);

    this.scene.add(this.waypoint.object, this.rim.light);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.applyMode(this.input.mode);
    this.input.onModeChange((m) => this.applyMode(m));
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.input.setMode('touch');
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'explore' && this.input.mode === 'desktop') this.kbm.requestLock();
    });
    document.addEventListener('pointerlockchange', () => this.refreshPause());
    window.addEventListener('resize', () => this.onResize());
    this.hud.setVisible(false);
    this.applyGloveTheme();
    this.refreshChipHud(false);
  }

  /** 目前這一關的作答狀態 */
  get run(): LevelRun {
    return this.runs.get(this.cur)!;
  }

  get puzzle(): Puzzle {
    return this.run.puzzle;
  }

  /** 目前這一關的走廊段 */
  get seg(): Segment {
    return this.level.segment(this.cur);
  }

  async init(): Promise<void> {
    await this.assets.preload();
    // 有存檔就從存檔的關卡繼續（第二關：從第二段走廊入口開始）。
    // 重新整理不算新的一輪：答錯換過的題目、警報紀錄都保留
    this.newRun(this.save.currentLevel, false);
    this.loop.start();
    this.showTitle();
  }

  private showTitle(): void {
    this.state = 'title';
    const best = AREA.levels
      .map((id) => [levelLabel(id), levelSave(this.save, id).bestGrade] as const)
      .filter((x): x is [string, 'S' | 'A' | 'B'] => x[1] !== null);
    new TitleScreen(this.ui, this.save.flags.introSeen, (intro) => void this.start(intro), best);
  }

  // ───────────────────────── 流程 ─────────────────────────

  private async start(intro: boolean): Promise<void> {
    this.audio.unlock();
    if (intro) {
      await playIntro(this.ui, this.input.mode, {
        onType: () => this.audio.typeTick(),
        onMessage: () => this.audio.incoming(),
      });
      // 存檔只由 Game 這一份資料寫入，避免兩個地方各存一份互相覆蓋
      this.save.flags.introSeen = true;
      writeSave(this.save);
    }
    this.state = 'briefing';
    await showBriefing(this.ui, this.input.mode);
    this.audio.startHum();
    this.enterExplore();
    this.hud.setVisible(true);
    this.setObjective(this.objective);
    this.hud.showHints(this.input.mode);
    // 從存檔的關卡繼續時說一聲（第二段的入口和第一關的出生點長得很像）
    if (this.cur !== AREA.levels[0]) showToast(this.ui, `從${levelLabel(this.cur)}繼續`, 'tip');
  }

  /** 右上角「？」：遊戲中重看任務簡報 */
  private async openHelp(): Promise<void> {
    if (this.state !== 'explore') return;
    this.state = 'briefing';
    this.kbm.exitLock();
    this.input.reset();
    this.syncControls();
    await showBriefing(this.ui, this.input.mode);
    this.enterExplore();
  }

  private setObjective(o: Objective): void {
    this.objective = o;
    const press = this.input.mode === 'touch' ? '按<b>互動鍵</b>' : '按 <kbd>E</kbd>';
    const seg = this.seg;
    const text: Record<Objective, [number | null, string, THREE.Vector3 | null]> = {
      pod: [1, `走到<b>封印艙</b>，靠近後${press}打開推演手套`, seg.marker('pod')],
      solve: [2, `推算偵察體和獵獸各有幾隻，到大門輸入<b>封印解除碼</b>`, seg.marker('keypad')],
      chest: [3, `穿過大門，打開走廊盡頭的<b>寶箱</b>`, seg.marker('chest')],
      // 需要掃描的關卡（第二關）
      scan: [1, `走到<b>掃描台</b>，${press}掃描地面的接觸點`, seg.marker('scan')],
      cross: [3, `穿過<b>大門</b>`, seg.marker('chest')],
      done: [null, '', null],
    };
    const [step, html, target] = text[o];
    this.hud.setObjective(step, 3, html);
    this.waypoint.set(target);
  }

  /**
   * 建立整個區域，玩家放在 startLevel 那一段的走廊入口。
   * fresh = 新的一輪（再次潛入、重新開始、回到主選單）：晶片、手套等級、隱藏晶片、評級保留，本輪進度清掉。
   */
  private newRun(startLevel = 1, fresh = true): void {
    if (this.level) {
      this.scene.remove(this.level.root);
      this.level.dispose();
    }
    if (this.player) this.scene.remove(this.player.object);
    this.tweens.clear();
    this.stopAlarm();
    if (!AREA.levels.includes(startLevel)) startLevel = AREA.levels[0];
    if (fresh) resetRun(this.save);
    this.save.currentLevel = startLevel;
    writeSave(this.save);

    // 各關的題目與作答狀態（題目來自 src/levels/levels.ts；答錯換過題的關卡用存檔裡的新 L）
    this.runs.clear();
    const setups: LevelSetup[] = AREA.levels.map((id) => {
      const def = levelById(id);
      const ls = levelSave(this.save, id);
      let puzzle = ls.currentL !== null ? puzzleWithL(def, ls.currentL) : null;
      if (!puzzle) {
        puzzle = puzzleForLevel(def, this.rng);
        // 隨機出題的關卡：再次潛入時避免連續兩次同一題
        const prev = this.lastAnswers.get(id);
        for (let i = 0; def.randomPuzzle && i < 5 && JSON.stringify(puzzle.answer) === prev; i++) puzzle = puzzleForLevel(def, this.rng);
        this.lastAnswers.set(id, JSON.stringify(puzzle.answer));
      }
      this.runs.set(id, {
        def,
        puzzle,
        pending: null,
        trialsLeft: 1,
        trial: null,
        trialUsed: false,
        attempts: ls.attempts,
        alarmed: ls.alarmed,
      });
      return {
        def,
        puzzle,
        // 艙內的投影一開始全部是偵察體（假設法的第一步）
        initialSlots: Array<string>(puzzle.readings.N).fill(SCOUT.id),
        hiddenChipPicked: this.save.roomChips[def.roomId] === true,
        scanned: ls.scanned,
      };
    });
    this.cur = startLevel;
    this.level = new Level(this.assets, setups);
    this.scene.add(this.level.root);

    const seg = this.seg;
    this.player = new PlayerController(this.assets.get('agent'));
    this.player.place(seg.spawn.x, seg.spawn.z, seg.spawn.facing);
    this.scene.add(this.player.object);
    this.level.updateLights(0, this.player.position, true);
    this.level.updateVisibility(this.player.position);
    // 從走廊拍環境貼圖給主角反射用（拍的時候藏起主角、標記、邊緣光）
    this.envTarget?.dispose();
    const envAt = AGENT_LOOK.envMap.position.clone().add(new THREE.Vector3(0, 0, seg.oz));
    this.envTarget = captureEnvMap(this.renderer, this.scene, [this.player.object, this.waypoint.object], envAt);
    this.player.setEnvMap(this.envTarget?.texture ?? null);
    this.tpc.yaw = 0;
    this.tpc.pitch = 0.28;
    this.rig.focus = null;
    this.rig.weight = 0;
    this.rig.offset = { x: 0, y: 0 };
    this.levelChips = 0;
    this.refreshChipHud(false);
    this.worldTime = 0;
    this.setObjective(this.firstObjective());
  }

  /** 一關開始時的目標 */
  private firstObjective(): Objective {
    const seg = this.seg;
    if (!seg.def.requiresScan) return 'pod';
    return seg.scanned ? 'solve' : 'scan';
  }

  /** 第一關結算的「繼續前進」：打開隔門，進入下一關 */
  private continueToNext(): void {
    const next = AREA.levels[AREA.levels.indexOf(this.cur) + 1];
    if (next === undefined) return;
    this.cur = next;
    this.levelChips = 0;
    // 按下「繼續前進」就存檔：還沒走過隔門就重新整理，也會從下一段的入口開始
    this.save.currentLevel = next;
    writeSave(this.save);
    this.enterExplore();
    this.hud.setVisible(true);
    this.setObjective(this.firstObjective());
    void this.level.openGate(next, this.tweens, this.audio);
  }

  /** 總結算的「回到主選單」 */
  private backToMenu(): void {
    this.newRun(1);
    this.kbm.exitLock();
    this.hud.setVisible(false);
    this.syncControls();
    this.showTitle();
  }

  private retry(): void {
    this.newRun(1);
    this.enterExplore();
    this.hud.setVisible(true);
    this.hud.showHints(this.input.mode, 4);
  }

  private enterExplore(): void {
    this.state = 'explore';
    this.input.reset();
    this.kbm.setEnabled(true);
    if (this.input.mode === 'desktop') this.kbm.requestLock();
    this.syncControls();
  }

  // ───────────────────────── 推演模式 ─────────────────────────

  private panelView(): PanelView {
    const run = this.run;
    const { N, L } = run.puzzle.readings;
    const features = gloveFeatures(this.save.gloveLevel);
    return {
      n: N,
      actual: L,
      barMax: HUNTER.legs * N,
      bipedLegs: SCOUT.legs,
      scanned: this.seg.scanned,
      trial: features.trial ? { left: run.trialsLeft, result: run.trial } : null,
      stepHint: features.stepHint,
    };
  }

  /** 手套 Lv2 試算：每關 1 次，只顯示接觸點，不開門、不觸發警報 */
  private onTrial(hunters: number): void {
    const run = this.run;
    if (this.state !== 'deduction' || run.trialsLeft <= 0 || !gloveFeatures(this.save.gloveLevel).trial) return;
    run.trialsLeft--;
    run.trialUsed = true;
    run.trial = { hunters, points: trialPoints(run.puzzle, hunters) };
    this.audio.uiOpen();
    this.panel.render(this.panelView());
  }

  private enterDeduction(): void {
    this.state = 'deduction';
    this.input.reset();
    this.kbm.setEnabled(false);
    this.kbm.exitLock();
    this.syncControls();
    if (this.objective === 'pod') this.setObjective('solve');
    this.audio.uiOpen();
    this.panel.setUpgradeState(this.save.gloveLevel, this.save.chips);
    this.panel.open(this.panelView());
    this.rig.focus = this.deductionPose();
    const fromW = this.rig.weight;
    void this.tweens.to(0.7, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');
    this.animateOffset(this.panelOffset(), 0.7);
    void this.tweens.to(0.5, (t) => this.seg.holo.setOpacity(t), ease.out, 'holo');
  }

  private exitDeduction(): void {
    if (this.state !== 'deduction') return;
    this.audio.uiClose();
    this.panel.close();
    this.leaveFocus(0.6);
    void this.tweens.to(0.35, (t) => this.seg.holo.setOpacity(1 - t), ease.out, 'holo');
    this.enterExplore();
  }

  private leaveFocus(duration: number): Promise<void> {
    const fromW = this.rig.weight;
    this.animateOffset({ x: 0, y: 0 }, duration);
    return this.tweens.to(duration, (t) => (this.rig.weight = fromW * (1 - t)), ease.inOut, 'cam');
  }

  private animateOffset(to: { x: number; y: number }, duration: number): void {
    const from = { ...this.rig.offset };
    void this.tweens.to(
      duration,
      (t) => (this.rig.offset = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
      ease.inOut,
      'offset',
    );
  }

  /**
   * 看封印艙時畫面上能用的區域：扣掉上方的目標列，以及推演面板（右側或下方）。
   * 讀數面板和生物都要落在這個區域裡，不會被目標列蓋到。
   */
  private viewArea(withPanel: boolean): { left: number; top: number; right: number; bottom: number } {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const obj = this.hud.objectiveRect();
    const area = { left: 0, top: obj ? obj.bottom + 8 : 0, right: W, bottom: H };
    if (withPanel) {
      const r = this.panel.rect;
      if (this.panel.side === 'right') area.right = Math.max(200, r.left);
      else area.bottom = Math.max(area.top + 200, r.top);
    }
    return area;
  }

  /** 鏡頭的畫面偏移：讓艙體落在可用區域的中央 */
  private areaOffset(withPanel: boolean): { x: number; y: number } {
    const a = this.viewArea(withPanel);
    return { x: window.innerWidth / 2 - (a.left + a.right) / 2, y: window.innerHeight / 2 - (a.top + a.bottom) / 2 };
  }

  private panelOffset(): { x: number; y: number } {
    return this.areaOffset(true);
  }

  /** 推演特寫：從走廊中央看向艙體，FOV 依可見區域調整，確保整排生物和讀數都在畫面內 */
  private deductionPose(): CameraPose {
    const a = this.viewArea(true);
    return this.podPose(a.right - a.left, a.bottom - a.top);
  }

  /** 不開面板看艙體（掃描、答對演出）：只避開目標列 */
  private podShot(): CameraPose {
    const a = this.viewArea(false);
    return this.podPose((a.right - a.left) * 0.92, (a.bottom - a.top) * 0.92);
  }

  /** 看封印艙正面的鏡位；availW／availH 是沒被擋住的區域 */
  private podPose(availW: number, availH: number): CameraPose {
    const H = window.innerHeight;
    // 稍微俯視：前後兩排生物在畫面上錯開，腳下的觸地點也看得到
    const focus = this.seg.podFocus;
    const target = focus.clone().setY(1.6);
    const position = new THREE.Vector3(2.4, 2.6, focus.z);
    const d = position.x - -1.6;
    const tanW = 3.05 / (d * (availW / H));
    const tanH = 1.95 / (d * (availH / H));
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(tanW, tanH))), 40, 95);
    return { position, target, fov };
  }

  /** 不在封印艙前按 E（或觸控的手套按鈕）：打開手套，停在「升級」分頁 */
  private openGlove(): void {
    if (this.state !== 'explore') return;
    this.state = 'glove';
    this.input.reset();
    this.kbm.setEnabled(false);
    this.kbm.exitLock();
    this.syncControls();
    this.audio.uiOpen();
    this.panel.setUpgradeState(this.save.gloveLevel, this.save.chips);
    this.panel.open(null, 'upgrade');
  }

  // ───────────────────────── 大門的封印解除碼 ─────────────────────────

  private keypadMode(): KeypadMode {
    if (this.alarmLeft > 0) return 'alarm';
    if (!this.seg.scanned) return 'scanFirst';
    return 'input';
  }

  private openKeypad(): void {
    if (this.state !== 'explore') return;
    this.state = 'keypad';
    this.input.reset();
    this.kbm.setEnabled(false);
    this.kbm.exitLock();
    this.syncControls();
    this.audio.uiOpen();
    this.keypad.open(this.keypadMode(), Math.ceil(this.alarmLeft));
  }

  private closeKeypad(): void {
    if (this.state !== 'keypad') return;
    this.audio.uiClose();
    this.keypad.close();
    this.enterExplore();
  }

  /** 送出封印解除碼：只有一次機會，答錯觸發警報、換題 */
  private submitCode(code: string): void {
    if (this.state !== 'keypad' || this.keypadMode() !== 'input') return;
    const run = this.run;
    run.attempts++;
    levelSave(this.save, run.def.id).attempts = run.attempts;
    writeSave(this.save);
    if (checkCode(code, run.puzzle.answer)) void this.solvedSequence();
    else this.triggerAlarm();
  }

  /** 答錯：面板變紅、走廊燈轉紅、警報 20 秒。新題目現在就決定並存檔（重新整理也回不去原題） */
  private triggerAlarm(): void {
    const run = this.run;
    run.alarmed = true;
    run.pending = redeployPuzzle(run.puzzle, this.rng);
    const ls = levelSave(this.save, run.def.id);
    ls.alarmed = true;
    ls.currentL = run.pending.readings.L;
    writeSave(this.save);
    this.alarmLeft = ALARM_TIME;
    this.seg.keypad.setState('alarm');
    this.keypad.setMode('alarm', ALARM_TIME);
    this.audio.wrong();
    this.audio.alarm(ALARM_TIME);
  }

  /** 警報倒數（每幀）：燈光紅色呼吸，結束時重新佈署生物 */
  private updateAlarm(dt: number): void {
    if (this.alarmLeft <= 0) return;
    const before = Math.ceil(this.alarmLeft);
    this.alarmLeft = Math.max(0, this.alarmLeft - dt);
    const fade = Math.min(1, (ALARM_TIME - this.alarmLeft) / 0.4, this.alarmLeft / 0.6);
    this.level.setAlarm(fade * (0.75 + 0.25 * Math.sin(this.realTime * 8)));
    if (Math.ceil(this.alarmLeft) !== before) this.keypad.setCountdown(Math.ceil(this.alarmLeft));
    if (this.alarmLeft === 0) void this.redeploy();
  }

  private stopAlarm(): void {
    this.alarmLeft = 0;
    this.level?.setAlarm(0);
    this.audio.stopAlarm();
  }

  /** 倒數結束：燈光恢復、封印艙重新佈署生物（N 不變、換一個 L），手套的顯示與試算次數重置，密碼盤重新開放 */
  private async redeploy(): Promise<void> {
    this.stopAlarm();
    const run = this.run;
    const seg = this.seg;
    if (!run.pending) return;
    run.puzzle = run.pending;
    run.pending = null;
    run.trialsLeft = 1;
    run.trial = null;
    seg.keypad.setState('idle');
    this.audio.redeploy();
    if (this.state === 'deduction') this.panel.render(this.panelView());
    if (this.state === 'keypad') this.keypad.setMode('input');
    // 第二關不用重新掃描：新的 L 直接顯示
    await seg.pod.redeploy(this.tweens, run.puzzle.readings, seg.scanned);
  }

  /** 面板的「離開」／E／Esc */
  private closePanel(): void {
    if (this.state === 'deduction') this.exitDeduction();
    else if (this.state === 'glove') {
      this.audio.uiClose();
      this.panel.close();
      this.enterExplore();
    }
  }

  // ───────────────────────── 解開後的演出 ─────────────────────────

  /**
   * 答對：面板變綠「封印解除」→ 鏡頭轉向封印艙，全像投影有 {獵獸數} 隻從偵察體逐隻變成獵獸（1.5 秒）
   * → 艙體除霧、真實生物顯形 → 鏡頭轉向大門、大門開啟 → 寶箱與結算照舊。
   */
  private async solvedSequence(): Promise<void> {
    const { tweens, audio } = this;
    const level = this.seg;
    const answer = this.run.puzzle.answer;
    this.state = 'cinematic';
    this.keypad.setMode('success');
    level.keypad.setState('ok');
    audio.solved();
    this.syncControls();
    await tweens.wait(1.1);
    this.keypad.close();

    // 鏡頭轉向封印艙，投影浮現
    this.rig.focus = this.podShot();
    const fromW = this.rig.weight;
    this.animateOffset(this.areaOffset(false), 0.8);
    void tweens.to(0.8, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');
    await tweens.to(0.8, (t) => level.holo.setOpacity(t), ease.out, 'holo');

    // 獵獸那一端的投影逐隻變形（音高跟著推演的接觸點往上）
    const N = this.puzzle.readings.N;
    const hunters = answer[HUNTER.id] ?? 0;
    for (let i = 0; i < hunters; i++) {
      level.holo.morph(i, HUNTER.id);
      audio.morph(SCOUT.legs * N + (HUNTER.legs - SCOUT.legs) * (i + 1), true);
      await tweens.wait(MORPH_TIME / hunters);
    }
    await tweens.wait(0.4);
    level.holo.setColor(PALETTE.green);
    level.pod.setSolvedLook();
    await tweens.wait(0.6);

    // 艙體除霧、真實生物顯形（和投影一致）
    audio.defog();
    void tweens.to(1.2, (t) => level.holo.setOpacity(1 - t), ease.inOut, 'holo');
    await level.pod.reveal(tweens, answerSlots(answer));
    await tweens.wait(0.7);

    // 鏡頭轉向門
    const from = this.rig.focus ?? this.podShot();
    const shot = level.doorShot;
    const focus: CameraPose = { position: from.position.clone(), target: from.target.clone(), fov: from.fov };
    this.rig.focus = focus;
    await tweens.to(1.3, (t) => {
      focus.position.lerpVectors(from.position, shot.position, t);
      focus.target.lerpVectors(from.target, shot.target, t);
      focus.fov = THREE.MathUtils.lerp(from.fov, 62, t);
    });

    // 門分段滑開
    level.beacons.forEach((b) => b.setClear());
    await level.door.open(tweens, audio);
    level.doorObstacle.enabled = false;
    // 開門獎勵：資料晶片 +1（每次重玩都給）
    this.addChips(1);
    await tweens.wait(0.6);

    await this.leaveFocus(1.0);
    this.setObjective(level.def.requiresScan ? 'cross' : 'chest');
    this.enterExplore();
  }

  // ───────────────────────── 掃描台（第二關） ─────────────────────────

  /** 鏡頭轉向封印艙 → 一道光線掃過艙底、接觸點從 0 數上去 → 解鎖推演 */
  private async scanSequence(): Promise<void> {
    const seg = this.seg;
    const station = seg.scanStation;
    if (!station || station.done) return;
    this.state = 'cinematic';
    this.syncControls();
    // 全螢幕看艙體（避開上方的目標列）
    this.rig.focus = this.podShot();
    this.animateOffset(this.areaOffset(false), 0.6);
    const fromW = this.rig.weight;
    await this.tweens.to(0.6, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');
    this.audio.scan(SCAN_TIME);
    await seg.pod.scan(this.tweens, SCAN_TIME);
    station.setDone();
    // 掃描一次就好：存檔記住
    levelSave(this.save, seg.def.id).scanned = true;
    writeSave(this.save);
    this.setObjective('solve');
    await this.tweens.wait(0.5);
    await this.leaveFocus(0.7);
    this.enterExplore();
  }

  private async openChest(): Promise<void> {
    this.state = 'cinematic';
    this.syncControls();
    const chest = this.seg.chest;
    const worldPos = await chest.open(this.tweens, this.audio);
    const p = worldPos.project(this.camera);
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    chest.chip.visible = false;
    this.audio.chip();
    await this.hud.flyChip(x, y);
    this.addChips(1);
    this.setObjective('done');
    // 記錄這一關的評級（最近一次、最佳）
    const run = this.run;
    const grade = rateLevel({ alarmed: run.alarmed, trialUsed: run.trialUsed });
    const attempts = Math.max(1, run.attempts);
    recordLevelResult(this.save, this.cur, grade, attempts);
    writeSave(this.save);
    await this.tweens.wait(2.0);
    const last = AREA.levels[AREA.levels.length - 1] === this.cur;
    if (last) this.showAreaSummary();
    else this.showResult(grade, attempts);
  }

  private enterResultState(): void {
    this.state = 'result';
    this.kbm.exitLock();
    this.syncControls();
    this.hud.setVisible(false);
  }

  /** 一關的結算（第一關）：嘗試次數、評級（本次／最佳）、這一關拿到的晶片 */
  private showResult(grade: Grade, attempts: number): void {
    this.enterResultState();
    const best = levelSave(this.save, this.cur).bestGrade ?? grade;
    this.result.show({ attempts, grade, best, chips: this.levelChips });
  }

  /** 區域完成：總嘗試次數、這一輪拿到的晶片、各關評級（本次／最佳） */
  private showAreaSummary(): void {
    this.enterResultState();
    const levels = AREA.levels.map((id) => {
      const ls = levelSave(this.save, id);
      return { label: levelLabel(id), last: ls.lastGrade, best: ls.bestGrade };
    });
    const totalAttempts = AREA.levels.reduce((sum, id) => sum + (levelSave(this.save, id).lastAttempts ?? 0), 0);
    this.areaSummary.show({ name: AREA.name, totalAttempts, chips: this.save.runChips, levels });
    // 這一輪結束：下次「開始潛入」從第一關開始新的一輪
    resetRun(this.save);
    writeSave(this.save);
  }

  // ───────────────────────── 每幀 ─────────────────────────

  private tick(dt: number, now: number): void {
    this.realTime = now;
    const timeFlows = this.state !== 'deduction';
    if (timeFlows) this.worldTime += dt;
    this.tweens.update(dt);

    const look = this.input.consumeLook();
    if (this.state === 'explore') {
      this.tpc.addLook(look.dx, look.dy);
      this.player.update(dt, this.input.move, this.tpc.yaw, this.level.world);
      this.checkAutoSave();
      this.updateInteraction();
    } else {
      this.player.idle(timeFlows ? dt : 0);
    }
    this.updateAlarm(dt);

    this.level.update(timeFlows ? dt : 0, this.worldTime);
    for (const seg of this.level.segments) seg.holo.update(dt, this.realTime);
    this.level.updateLights(dt, this.player.position);
    this.waypoint.update(this.realTime, this.player.position, this.camera, this.state === 'explore');

    // 特寫時把探員藏起來，避免擋住艙體
    this.player.object.visible = this.rig.weight < 0.5 || !this.rig.focus;
    this.followPose = this.tpc.pose(this.player.position, this.level.world, this.level.ceiling, dt);
    this.rig.apply(this.followPose);
    this.level.updateVisibility(this.camera.position);
    this.rim.update(this.player.position, this.camera, this.player.object.visible);
    this.post.render();
    this.fps?.tick(this.renderer.info.render);
  }

  /** 從隔門走進下一段走廊時自動存檔（重新整理後從這一段的入口開始） */
  private checkAutoSave(): void {
    if (this.save.currentLevel === this.cur) return;
    if (this.level.segmentAt(this.player.position.z).def.id !== this.cur) return;
    this.save.currentLevel = this.cur;
    writeSave(this.save);
  }

  private updateInteraction(): void {
    const p = this.player.position;
    const near = nearestInteractable(this.level.interactables, p.x, p.z);
    if (near !== this.near) {
      this.near = near;
      this.hud.setPrompt(near?.label ?? null);
      this.touch.setInteract(near?.label ?? null);
    }
    if (this.input.consume('interact')) {
      if (!near) {
        this.openGlove();
        return;
      }
      this.near = null;
      this.hud.setPrompt(null);
      this.touch.setInteract(null);
      if (near.id === 'chip') this.pickHiddenChip(this.level.segment(near.level));
      else if (near.level !== this.cur) return;
      else if (near.id === 'pod') this.enterDeduction();
      else if (near.id === 'chest') void this.openChest();
      else if (near.id === 'scan') void this.scanSequence();
      else if (near.id === 'keypad') this.openKeypad();
    }
  }

  // ───────────────────────── 資料晶片與手套升級 ─────────────────────────

  private pickHiddenChip(seg: Segment): void {
    const chip = seg.hiddenChip;
    if (chip.picked) return;
    chip.pick();
    this.audio.pickup();
    this.save.roomChips[seg.def.roomId] = true;
    this.addChips(1);
  }

  /** 拿到晶片：存檔、HUD 跳動、第一次的提示 */
  private addChips(n: number): void {
    this.save.chips += n;
    this.save.runChips += n;
    this.levelChips += n;
    if (!this.save.flags.firstChipTip) {
      this.save.flags.firstChipTip = true;
      showToast(this.ui, '資料晶片可以升級推演手套。按 E 打開手套後按 Tab 查看。', 'tip');
    }
    let blink = false;
    if (!this.save.flags.upgradeReadyBlink && canAffordNext(this.save.gloveLevel, this.save.chips)) {
      this.save.flags.upgradeReadyBlink = true;
      blink = true;
    }
    writeSave(this.save);
    this.refreshChipHud(true);
    if (blink) this.hud.blinkChip();
    this.panel.setUpgradeState(this.save.gloveLevel, this.save.chips);
  }

  private refreshChipHud(pulse: boolean): void {
    this.hud.setChips(this.save.chips, pulse);
    const need = chipsNeeded(this.save.gloveLevel, this.save.chips);
    this.hud.setUpgradeInfo(need === null ? '已全部升級' : need === 0 ? '可以升級推演手套了' : `下次升級還需 ${need} 片`);
  }

  private upgradeGlove(target: number): void {
    const r = tryUpgrade({ level: this.save.gloveLevel, chips: this.save.chips }, target);
    if (!r.ok) {
      this.audio.blocked();
      return;
    }
    this.save.gloveLevel = r.state.level;
    this.save.chips = r.state.chips;
    writeSave(this.save);
    this.applyGloveTheme();
    this.refreshChipHud(false);
    this.panel.setUpgradeState(this.save.gloveLevel, this.save.chips);
    this.panel.flash();
    this.audio.upgrade();
    showToast(this.ui, '推演手套升級！', 'float');
    // 推演中升級：試算、提示句立刻出現
    if (this.state === 'deduction') this.panel.render(this.panelView());
  }

  /** 手套 UI 邊框顏色跟著等級（整個遊戲都套用） */
  private applyGloveTheme(): void {
    const def = levelDef(this.save.gloveLevel);
    document.body.style.setProperty('--glove', def.color);
    document.body.dataset.glove = String(def.level);
  }

  // ───────────────────────── 裝置 / 版面 ─────────────────────────

  private applyMode(mode: InputMode): void {
    document.body.dataset.mode = mode;
    this.post?.setEnabled(mode === 'touch' ? AGENT_LOOK.ao.touch : AGENT_LOOK.ao.desktop);
    if (this.state !== 'loading' && this.state !== 'title') this.setObjective(this.objective);
    if (mode === 'touch') this.kbm.exitLock();
    this.syncControls();
  }

  private syncControls(): void {
    const exploring = this.state === 'explore';
    this.touch.setVisible(exploring && this.input.mode === 'touch');
    this.hud.setGloveButton(exploring && this.input.mode === 'touch');
    if (!exploring) {
      this.hud.hideHints();
      this.near = null;
      this.hud.setPrompt(null);
      this.touch.setInteract(null);
    }
    this.refreshPause();
  }

  private refreshPause(): void {
    this.hud.setPaused(this.state === 'explore' && this.input.mode === 'desktop' && !this.kbm.locked);
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight);
    if (this.state === 'deduction') {
      this.panel.relayout();
      requestAnimationFrame(() => {
        this.rig.focus = this.deductionPose();
        this.rig.offset = this.panelOffset();
      });
    }
  }
}
