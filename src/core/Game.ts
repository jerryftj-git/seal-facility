import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { HUNTER, SCOUT } from '../puzzle/species';
import {
  apply,
  canConvert,
  convert,
  createDeduction,
  setTools,
  createRng,
  PHASE1_DEDUCTION,
  rateDeduction,
  type DeductionState,
  type DeductionTools,
  type Grade,
  type Puzzle,
  type Rng,
} from '../puzzle';
import { canAffordNext, chipsNeeded, gloveFeatures, levelDef, tryUpgrade } from '../progress/gloveUpgrades';
import { showToast } from '../ui/Toast';
import { levelSave, loadSave, recordLevelResult, resetRun, writeSave, type SaveData } from './saveData';
import { AREAS, levelById, levelLabel, puzzleForLevel } from '../levels/levels';
import type { Segment } from '../world/Segment';
import { AreaSummary } from '../ui/AreaSummary';
import { CameraRig } from '../player/CameraRig';
import { detectInitialMode, type InputMode } from '../player/deviceDetect';
import { Input } from '../player/Input';
import { KeyboardMouseSource } from '../player/KeyboardMouseSource';
import { PlayerController } from '../player/PlayerController';
import { ThirdPersonCamera, type CameraPose } from '../player/ThirdPersonCamera';
import { FpsMeter } from '../ui/FpsMeter';
import { GauntletPanel, type ConvertDir, type PanelView } from '../ui/GauntletPanel';
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

export type GameState = 'loading' | 'title' | 'briefing' | 'explore' | 'deduction' | 'glove' | 'cinematic' | 'result';

/**
 * 任務進度：決定畫面上方的目標文字與 ◆ 標記的位置。
 * 不需要掃描的關卡（第一關）：pod → solve → chest；需要掃描的關卡（第二關）：scan → solve → cross。
 */
type Objective = 'pod' | 'solve' | 'chest' | 'scan' | 'cross' | 'done';

/** 目前的區域（區域 1 = 第一關＋第二關） */
const AREA = AREAS[0];

/** 掃描台的地面掃描動畫長度（秒） */
const SCAN_TIME = 1.5;

/** 里程碑 1：雙足 = 偵察體、四足 = 獵獸 */
const BIPED = SCOUT.id;
const QUAD = HUNTER.id;

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
  /** 各關的推演狀態（key = 關卡編號） */
  private readonly deductions = new Map<number, DeductionState>();
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
      onConvert: (dir) => this.onConvert(dir),
      onUpgrade: (lv) => this.upgradeGlove(lv),
      onExit: () => this.closePanel(),
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

  /** 目前這一關的推演狀態 */
  get deduction(): DeductionState {
    return this.deductions.get(this.cur)!;
  }

  set deduction(d: DeductionState) {
    this.deductions.set(this.cur, d);
  }

  get puzzle(): Puzzle {
    return this.deduction.puzzle;
  }

  /** 目前這一關的走廊段 */
  get seg(): Segment {
    return this.level.segment(this.cur);
  }

  async init(): Promise<void> {
    await this.assets.preload();
    // 有存檔就從存檔的關卡繼續（第二關：從第二段走廊入口開始）
    this.newRun(this.save.currentLevel);
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
      solve: [2, `用推演手套讓<b>接觸點達到地上的數量</b>，才能開啟大門`, seg.marker('pod')],
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
   * startLevel = 1 代表新的一輪（晶片、手套等級、隱藏晶片、評級保留，本輪進度清掉）。
   */
  private newRun(startLevel = 1): void {
    if (this.level) {
      this.scene.remove(this.level.root);
      this.level.dispose();
    }
    if (this.player) this.scene.remove(this.player.object);
    this.tweens.clear();
    if (!AREA.levels.includes(startLevel)) startLevel = AREA.levels[0];
    if (startLevel === AREA.levels[0]) resetRun(this.save);
    this.save.currentLevel = startLevel;
    writeSave(this.save);

    // 各關的題目與推演狀態（題目來自 src/levels/levels.ts）
    this.deductions.clear();
    const setups: LevelSetup[] = AREA.levels.map((id) => {
      const def = levelById(id);
      let puzzle = puzzleForLevel(def, this.rng);
      // 隨機出題的關卡：再次潛入時避免連續兩次同一題
      const prev = this.lastAnswers.get(id);
      for (let i = 0; def.randomPuzzle && i < 5 && JSON.stringify(puzzle.answer) === prev; i++) puzzle = puzzleForLevel(def, this.rng);
      this.lastAnswers.set(id, JSON.stringify(puzzle.answer));
      const deduction = createDeduction(puzzle, {
        ...PHASE1_DEDUCTION,
        fixedCounts: this.gloveTools().fixedCounts,
        rng: this.rng,
      });
      this.deductions.set(id, deduction);
      return {
        def,
        puzzle,
        initialSlots: deduction.slots,
        hiddenChipPicked: this.save.roomChips[def.roomId] === true,
        scanned: levelSave(this.save, id).scanned,
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
    // 題目是開局時建的，手套可能已經升級：換成目前的工具
    this.deduction = setTools(this.deduction, this.gloveTools());
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
    const d = this.deduction;
    const maxLegs = Math.max(...this.puzzle.species.map((s) => s.legs));
    return {
      biped: d.hypothesis[BIPED],
      quad: d.hypothesis[QUAD],
      predicted: d.predicted,
      actual: d.actual,
      diff: d.diff,
      barMax: maxLegs * this.puzzle.readings.N,
      solved: d.solved,
      canToBiped: canConvert(d, QUAD, BIPED),
      canToQuad: canConvert(d, BIPED, QUAD),
      pair: (() => {
        const n = gloveFeatures(this.save.gloveLevel).pairConvert;
        return n ? { size: n, canToBiped: canConvert(d, QUAD, BIPED, n), canToQuad: canConvert(d, BIPED, QUAD, n) } : null;
      })(),
      formula: gloveFeatures(this.save.gloveLevel).formulaHint,
      scanned: this.seg.scanned,
    };
  }

  /** 目前手套等級對應的推演工具（Lv2 起可以一次轉 2 隻） */
  private gloveTools(): DeductionTools {
    const n = gloveFeatures(this.save.gloveLevel).pairConvert;
    return { batch: false, fixedCounts: n ? [n] : [] };
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

  /** 面板蓋住的那一側，鏡頭往反方向偏移，讓艙體留在可見區域中央 */
  private panelOffset(): { x: number; y: number } {
    const r = this.panel.rect;
    if (this.panel.side === 'right') return { x: (window.innerWidth - r.left) / 2, y: 0 };
    return { x: 0, y: (window.innerHeight - r.top) / 2 };
  }

  /** 推演特寫：從走廊中央看向艙體，FOV 依可見區域調整，確保整排生物和讀數都在畫面內 */
  private deductionPose(): CameraPose {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const r = this.panel.rect;
    const availW = this.panel.side === 'right' ? Math.max(200, r.left) : W;
    const availH = this.panel.side === 'bottom' ? Math.max(200, r.top) : H;
    return this.podPose(availW, availH);
  }

  /** 看封印艙正面的鏡位（推演、掃描共用）；availW／availH 是沒被面板蓋住的區域 */
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

  /** 面板的「離開」／E／Esc */
  private closePanel(): void {
    if (this.state === 'deduction') this.exitDeduction();
    else if (this.state === 'glove') {
      this.audio.uiClose();
      this.panel.close();
      this.enterExplore();
    }
  }

  private onConvert(dir: ConvertDir): boolean {
    if (this.state !== 'deduction') return false;
    const toQuad = dir === 'toQuad' || dir === 'pairToQuad';
    const [from, to] = toQuad ? [BIPED, QUAD] : [QUAD, BIPED];
    const count = dir === 'pairToBiped' || dir === 'pairToQuad' ? (gloveFeatures(this.save.gloveLevel).pairConvert ?? 0) : 1;
    if (count === 0) return false;
    const r = count === 1 ? convert(this.deduction, from, to) : apply(this.deduction, { type: 'batch', from, to, count });
    if (r.event === 'blocked') {
      this.audio.blocked();
      return false;
    }
    if (r.event === 'locked') return false;
    this.deduction = r.state;
    r.slots.forEach((slot) => this.seg.holo.morph(slot, to));
    // 音高只綁預測值（不可以傳差值或與答案的距離）
    this.audio.morph(r.state.predicted, toQuad);
    this.panel.render(this.panelView());
    this.panel.pulse();
    if (r.event === 'solved') {
      void this.solvedSequence();
      return false;
    }
    return true;
  }

  // ───────────────────────── 解開後的演出 ─────────────────────────

  private async solvedSequence(): Promise<void> {
    this.state = 'cinematic';
    this.syncControls();
    const { tweens, audio } = this;
    const level = this.seg;
    audio.solved();
    level.holo.setColor(PALETTE.green);
    level.pod.setSolvedLook();
    await tweens.wait(1.0);

    // 艙體除霧、真實生物顯形（和投影一致）
    this.panel.close();
    this.animateOffset({ x: 0, y: 0 }, 0.7);
    audio.defog();
    void tweens.to(1.2, (t) => level.holo.setOpacity(1 - t), ease.inOut, 'holo');
    await level.pod.reveal(tweens, this.deduction.slots);
    await tweens.wait(0.7);

    // 鏡頭轉向門
    const from = this.rig.focus ?? this.deductionPose();
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
    // 全螢幕看艙體；上下多留一點空間給目標列與讀數
    this.rig.focus = this.podPose(window.innerWidth * 0.9, window.innerHeight * 0.75);
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
    const { grade, steps } = rateDeduction(this.deduction);
    recordLevelResult(this.save, this.cur, grade, steps);
    writeSave(this.save);
    await this.tweens.wait(2.0);
    const last = AREA.levels[AREA.levels.length - 1] === this.cur;
    if (last) this.showAreaSummary();
    else this.showResult(grade, steps);
  }

  private enterResultState(): void {
    this.state = 'result';
    this.kbm.exitLock();
    this.syncControls();
    this.hud.setVisible(false);
  }

  /** 一關的結算（第一關）：步數、評級（本次／最佳）、這一關拿到的晶片 */
  private showResult(grade: Grade, steps: number): void {
    this.enterResultState();
    const best = levelSave(this.save, this.cur).bestGrade ?? grade;
    this.result.show({ steps, grade, best, chips: this.levelChips });
  }

  /** 區域完成：總步數、這一輪拿到的晶片、各關評級（本次／最佳） */
  private showAreaSummary(): void {
    this.enterResultState();
    const levels = AREA.levels.map((id) => {
      const ls = levelSave(this.save, id);
      return { label: levelLabel(id), last: ls.lastGrade, best: ls.bestGrade };
    });
    const totalSteps = AREA.levels.reduce((sum, id) => sum + (levelSave(this.save, id).lastSteps ?? 0), 0);
    this.areaSummary.show({ name: AREA.name, totalSteps, chips: this.save.runChips, levels });
    // 這一輪結束：下次「開始潛入」從第一關開始
    this.save.currentLevel = AREA.levels[0];
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
    if (this.state === 'deduction') this.panel.tick(performance.now());

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
    // 推演中升級：Q／W 立刻可以用，步數與目前的猜法保留
    this.deduction = setTools(this.deduction, this.gloveTools());
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
