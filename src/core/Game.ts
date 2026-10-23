import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { HUNTER, SCOUT } from '../puzzle/species';
import { answerSlots, checkCode, createRng, redeployPuzzle, type Puzzle, type Rng } from '../puzzle';
import { RUN_CONFIG } from '../run/runConfig';
import { charge, drain, powerLevel } from '../run/power';
import { corridorColor, doorPuzzle, doorPuzzleConfig, pickSideRoom, scoreFor } from '../run/doors';
import { updateBest } from '../run/record';
import { loadSave, writeSave, type SaveData } from './saveData';
import type { Segment } from '../world/Segment';
import { LAYOUT } from '../world/Segment';
import { renderCreatureIcons } from '../world/CreatureIcons';
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
import { GameOverScreen } from '../ui/GameOverScreen';
import { Hud } from '../ui/Hud';
import { el } from '../ui/icons';
import { playIntro } from '../ui/IntroSequence';
import { PauseMenu } from '../ui/PauseMenu';
import { TitleScreen } from '../ui/TitleScreen';
import { TouchControls } from '../ui/TouchControls';
import { GameAudio } from './Audio';
import { AGENT_LOOK, captureEnvMap, RimLight } from './agentLook';
import { PostFX } from './PostFX';
import { nearestInteractable, type Interactable } from './Interactables';
import { Level } from './Level';
import { Loop } from './Loop';
import { PALETTE } from './palette';
import { Waypoint } from '../world/Waypoint';
import { createRenderer } from './Renderer';
import { ease, Tweens } from './Tweens';

export type GameState = 'loading' | 'title' | 'briefing' | 'explore' | 'deduction' | 'keypad' | 'cinematic' | 'over';

/**
 * 目前這道門的進度（決定畫面上方的目標句與 ◆ 標記）：
 * scan 掃描地面 → solve 推算並輸入封印解除碼 → chest 打開寶箱拿電池 → next 前往下一道艙門
 */
type Objective = 'scan' | 'solve' | 'chest' | 'next' | 'none';

/** 掃描台的地面掃描動畫長度（秒） */
const SCAN_TIME = 1.5;

/** 答對後全像投影逐隻變形的總時間（秒） */
const MORPH_TIME = 1.5;

/** 一道門的作答狀態（只在記憶體裡；進行中的一局不存檔） */
interface DoorRun {
  /** 目前的題目（答錯換題後會變） */
  puzzle: Puzzle;
  /** 警報倒數結束後要換上的新題目 */
  pending: Puzzle | null;
  /** 數線上 L 標記的滑入動畫已經播過 */
  lineRevealed: boolean;
}

export class Game {
  state: GameState = 'loading';
  readonly scene = new THREE.Scene();
  /** 遠裁切 45 m：霧在 45 m 已經 99.9%，更遠的東西本來就看不到，不畫可以省 draw call（走廊會一直往前接） */
  readonly camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 45);
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
  private readonly pauseMenu: PauseMenu;
  private readonly gameOver: GameOverScreen;
  private readonly loop = new Loop((dt, now) => this.tick(dt, now));
  private readonly rng: Rng;
  private readonly fps: FpsMeter | null;

  /** 無限走廊（最多同時兩段） */
  level!: Level;
  player!: PlayerController;
  /** 目前是第幾道門 */
  door = 1;
  /** 已通過（解開）的門數 */
  doorsPassed = 0;
  /** 剩餘電力（秒） */
  power: number = RUN_CONFIG.startPower;
  /** 這一局撿到的隱藏小電池 */
  batteries = 0;
  /** 計時中（按「出發」之後、任務結束之前） */
  running = false;
  /** 暫停：menu = 暫停選單、help = 「？」簡報；resumeLeft > 0 時是回到遊戲前的倒數 */
  paused: false | 'menu' | 'help' = false;
  private resumeLeft = 0;
  private readonly runs = new Map<number, DoorRun>();
  /** 保全警報剩下的秒數（0 = 沒有警報） */
  private alarmLeft = 0;
  private heartbeatT = 0;
  private save: SaveData = loadSave();
  private worldTime = 0;
  private realTime = 0;
  private near: Interactable | null = null;
  private followPose: CameraPose | null = null;
  private objective: Objective = 'scan';
  private wasLocked = false;
  private selfUnlock = false;
  private readonly waypoint = new Waypoint();
  private readonly rim = new RimLight();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly post: PostFX;
  private powerOutEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.input = new Input(detectInitialMode());
    this.renderer = createRenderer(container, this.input.mode === 'touch');
    this.ui = document.getElementById('ui')!;
    this.kbm = new KeyboardMouseSource(this.input, this.renderer.domElement);
    this.hud = new Hud(
      this.ui,
      () => this.kbm.requestLock(),
      () => void this.openHelp(),
      () => this.openPause('menu'),
    );
    this.touch = new TouchControls(this.ui, this.input);
    this.panel = new GauntletPanel(this.ui, { onExit: () => this.exitDeduction() });
    this.keypad = new KeypadPanel(this.ui, {
      onSubmit: (code) => this.submitCode(code),
      onClose: () => this.closeKeypad(),
      onKey: () => this.audio.keyTick(),
    });
    this.pauseMenu = new PauseMenu(
      this.ui,
      () => this.resume(),
      () => this.backToMenu(),
    );
    this.gameOver = new GameOverScreen(
      this.ui,
      () => this.retry(),
      () => this.backToMenu(),
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
      if (this.state === 'explore' && !this.paused && this.input.mode === 'desktop') this.kbm.requestLock();
    });
    document.addEventListener('pointerlockchange', () => this.onPointerLock());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.openPause('menu');
    });
    // 暫停時所有按鍵都不能操作遊戲；Esc 打開／關閉暫停選單
    window.addEventListener('keydown', (e) => this.onKeyCapture(e), true);
    window.addEventListener('resize', () => this.onResize());
    this.hud.setVisible(false);
  }

  /** 目前這道門的那一段走廊 */
  get seg(): Segment {
    return this.level.segment(this.door)!;
  }

  get run(): DoorRun {
    return this.runs.get(this.door)!;
  }

  get puzzle(): Puzzle {
    return this.run.puzzle;
  }

  get score(): number {
    return scoreFor(this.doorsPassed);
  }

  async init(): Promise<void> {
    await this.assets.preload();
    this.panel.setIcons(renderCreatureIcons(this.assets));
    this.newRun();
    this.loop.start();
    this.showTitle();
  }

  private showTitle(): void {
    this.state = 'title';
    const best = this.save.best.doors > 0 || this.save.best.score > 0 ? this.save.best : null;
    new TitleScreen(this.ui, this.save.flags.introSeen, (intro) => void this.start(intro), best);
  }

  // ───────────────────────── 一局的流程 ─────────────────────────

  private async start(intro: boolean): Promise<void> {
    this.audio.unlock();
    this.state = 'briefing';
    if (intro) {
      await playIntro(this.ui, this.input.mode, {
        onType: () => this.audio.typeTick(),
        onMessage: () => this.audio.incoming(),
      });
      this.save.flags.introSeen = true;
      writeSave(this.save);
    }
    await showBriefing(this.ui, this.input.mode);
    this.audio.startHum();
    this.beginRun();
  }

  /** 按下「出發」（或再次潛入）：開始倒數 */
  private beginRun(): void {
    this.running = true;
    this.enterExplore();
    this.hud.setVisible(true);
    this.setObjective(this.objective);
    this.hud.showHints(this.input.mode);
  }

  /** 建立新的一局：第 1 段走廊、電力 120 秒、分數 0（還沒開始倒數） */
  private newRun(): void {
    if (this.level) {
      this.scene.remove(this.level.root);
      this.level.dispose();
    }
    if (this.player) this.scene.remove(this.player.object);
    this.tweens.clear();
    this.stopAlarm();
    this.powerOutEl?.remove();
    this.powerOutEl = null;
    this.runs.clear();
    this.running = false;
    this.paused = false;
    this.resumeLeft = 0;
    this.pauseMenu.hide();
    this.pauseMenu.setCountdown(0);
    this.panel.close();
    this.keypad.close();

    this.door = 1;
    this.doorsPassed = 0;
    this.batteries = 0;
    this.power = RUN_CONFIG.startPower;
    this.level = new Level(this.assets);
    this.scene.add(this.level.root);
    this.addSegment(1);

    const seg = this.seg;
    this.player = new PlayerController(this.assets.get('agent'));
    this.player.place(seg.spawn.x, seg.spawn.z, seg.spawn.facing);
    this.scene.add(this.player.object);
    this.level.updateLights(0, this.player.position, true);
    this.level.updateVisibility(this.player.position);
    // 從走廊拍環境貼圖給主角反射用（拍的時候藏起主角、標記、邊緣光）
    this.envTarget?.dispose();
    this.envTarget = captureEnvMap(this.renderer, this.scene, [this.player.object, this.waypoint.object]);
    this.player.setEnvMap(this.envTarget?.texture ?? null);
    this.tpc.yaw = 0;
    this.tpc.pitch = 0.28;
    this.rig.focus = null;
    this.rig.weight = 0;
    this.rig.offset = { x: 0, y: 0 };
    this.worldTime = 0;
    this.hud.power.reset(this.power);
    this.hud.setScore(this.door, this.score);
    this.setObjective('scan');
  }

  /** 接上第 k 道門的那一段：題目（N = 4 + k）、配色、側室都由規則產生 */
  private addSegment(k: number): Segment {
    const puzzle = doorPuzzle(k, this.rng);
    this.runs.set(k, { puzzle, pending: null, lineRevealed: false });
    return this.level.addSegment(k, puzzle, corridorColor(k), pickSideRoom(LAYOUT.sideRooms.length, this.rng));
  }

  private retry(): void {
    this.newRun();
    this.beginRun();
    this.hud.showHints(this.input.mode, 4);
  }

  private backToMenu(): void {
    this.gameOver.hide();
    this.newRun();
    this.releaseLock();
    this.hud.setVisible(false);
    this.state = 'title';
    this.syncControls();
    this.showTitle();
  }

  private enterExplore(): void {
    this.state = 'explore';
    this.input.reset();
    this.kbm.setEnabled(true);
    if (this.input.mode === 'desktop') this.kbm.requestLock();
    this.syncControls();
  }

  private setObjective(o: Objective): void {
    this.objective = o;
    const press = this.input.mode === 'touch' ? '按<b>互動鍵</b>' : '按 <kbd>E</kbd>';
    const seg = this.level.segment(this.door);
    const next = this.level.segment(this.door + 1);
    const text: Record<Objective, [string, THREE.Vector3 | null]> = {
      scan: [`走到<b>掃描台</b>，${press}掃描地面`, seg?.marker('scan') ?? null],
      solve: [`推算偵察體和獵獸各有幾隻，到大門輸入<b>封印解除碼</b>`, seg?.marker('keypad') ?? null],
      chest: [`打開<b>寶箱</b>拿電池`, seg?.marker('chest') ?? null],
      next: [`前往<b>下一道艙門</b>`, next?.marker('scan') ?? null],
      none: ['', null],
    };
    const [html, target] = text[o];
    this.hud.setObjective(html);
    this.waypoint.set(target);
  }

  // ───────────────────────── 暫停 ─────────────────────────

  /** 打開暫停選單（或「？」簡報的遮罩）：計時與一切動作停止 */
  private openPause(kind: 'menu' | 'help'): void {
    if (!this.running || this.state === 'over' || this.state === 'briefing') return;
    if (this.paused === kind && this.resumeLeft === 0) return;
    this.paused = kind;
    this.resumeLeft = 0;
    this.pauseMenu.setCountdown(0);
    this.releaseLock();
    this.input.reset();
    this.hud.hideHints();
    if (kind === 'menu') this.pauseMenu.show();
    else this.pauseMenu.cover();
    this.syncControls();
  }

  /** 「繼續」：先倒數 3 秒，再恢復計時與操作 */
  private resume(): void {
    if (!this.paused) return;
    this.pauseMenu.hide();
    this.resumeLeft = RUN_CONFIG.resumeCountdown;
    this.pauseMenu.setCountdown(Math.ceil(this.resumeLeft));
    if (this.state === 'explore' && this.input.mode === 'desktop') this.kbm.requestLock();
  }

  /** 右上「？」：遮住畫面、暫停，重看任務簡報；關掉後一樣倒數 3 秒 */
  private async openHelp(): Promise<void> {
    if (!this.running || this.paused || this.state === 'over') return;
    this.openPause('help');
    await showBriefing(this.ui, this.input.mode);
    this.resume();
  }

  private onKeyCapture(e: KeyboardEvent): void {
    if (e.code === 'Escape' && this.running && this.state !== 'over') {
      e.preventDefault();
      if (this.paused === 'menu' && this.resumeLeft === 0) this.resume();
      else if (!this.paused) this.openPause('menu');
      return;
    }
    // 暫停中（含倒數）：按鍵不能操作遊戲；簡報自己的 Enter 照常（同一層的監聽不受影響）
    if (this.paused) e.stopPropagation();
  }

  /** 遊戲自己解除滑鼠鎖定（打開面板、暫停等）：記下來，收到解除事件時不要當成玩家按了 Esc */
  private releaseLock(): void {
    if (this.kbm.locked) this.selfUnlock = true;
    this.kbm.exitLock();
  }

  private onPointerLock(): void {
    const locked = this.kbm.locked;
    // 玩家在探索中按 Esc（或切走視窗）解除了滑鼠鎖定 → 暫停（遊戲自己解除的不算）
    const byGame = this.selfUnlock;
    if (!locked) this.selfUnlock = false;
    if (this.wasLocked && !locked && !byGame && this.state === 'explore' && this.input.mode === 'desktop') this.openPause('menu');
    this.wasLocked = locked;
    this.refreshLockPrompt();
  }

  // ───────────────────────── 推演模式 ─────────────────────────

  private panelView(): PanelView {
    const run = this.run;
    const reveal = this.seg.scanned && !run.lineRevealed;
    if (this.seg.scanned) run.lineRevealed = true;
    return {
      n: run.puzzle.readings.N,
      actual: run.puzzle.readings.L,
      bipedLegs: SCOUT.legs,
      quadLegs: HUNTER.legs,
      scanned: this.seg.scanned,
      reveal,
    };
  }

  private enterDeduction(): void {
    this.state = 'deduction';
    this.input.reset();
    this.kbm.setEnabled(false);
    this.releaseLock();
    this.syncControls();
    this.audio.uiOpen();
    this.panel.open(this.panelView());
    this.rig.focus = this.deductionPose();
    const fromW = this.rig.weight;
    void this.tweens.to(0.7, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');
    this.animateOffset(this.panelOffset(), 0.7);
    void this.tweens.to(0.5, (t) => this.seg.holo.setOpacity(t), ease.out, 'holo');
  }

  private exitDeduction(): void {
    if (this.state !== 'deduction' || this.paused) return;
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
   * 看封印艙時畫面上能用的區域：扣掉上方的電力條與目標列，以及推演面板（右側或下方）。
   * 讀數面板和生物都要落在這個區域裡，不會被 HUD 蓋到。
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

  /** 不開面板看艙體（掃描）：只避開上方的 HUD */
  private podShot(): CameraPose {
    const a = this.viewArea(false);
    return this.podPose((a.right - a.left) * 0.92, (a.bottom - a.top) * 0.92);
  }

  /** 看封印艙正面的鏡位；availW／availH 是沒被擋住的區域 */
  private podPose(availW: number, availH: number): CameraPose {
    const H = window.innerHeight;
    const focus = this.seg.podFocus;
    const target = focus.clone().setY(1.6);
    const position = new THREE.Vector3(2.4, 2.6, focus.z);
    const d = position.x - -1.6;
    const tanW = 3.05 / (d * (availW / H));
    const tanH = 1.95 / (d * (availH / H));
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(tanW, tanH))), 40, 95);
    return { position, target, fov };
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
    this.releaseLock();
    this.syncControls();
    this.audio.uiOpen();
    this.keypad.open(this.keypadMode(), Math.ceil(this.alarmLeft));
  }

  private closeKeypad(): void {
    if (this.state !== 'keypad' || this.paused) return;
    this.audio.uiClose();
    this.keypad.close();
    this.enterExplore();
  }

  /** 送出封印解除碼：只有一次機會，答錯觸發警報、換題 */
  private submitCode(code: string): void {
    if (this.state !== 'keypad' || this.paused || this.keypadMode() !== 'input') return;
    if (checkCode(code, this.run.puzzle.answer)) void this.solvedSequence();
    else this.triggerAlarm();
  }

  /** 答錯：面板變紅、走廊燈轉紅、警報 20 秒；倒數結束後換題 */
  private triggerAlarm(): void {
    const run = this.run;
    run.pending = redeployPuzzle(run.puzzle, this.rng, doorPuzzleConfig(run.puzzle.readings.N));
    this.alarmLeft = RUN_CONFIG.alarmSeconds;
    this.seg.keypad.setState('alarm');
    this.keypad.setMode('alarm', RUN_CONFIG.alarmSeconds);
    this.audio.wrong();
    this.audio.alarm(RUN_CONFIG.alarmSeconds);
  }

  /** 警報倒數（每幀）：結束時重新佈署生物 */
  private updateAlarm(dt: number): void {
    if (this.alarmLeft <= 0) return;
    const before = Math.ceil(this.alarmLeft);
    this.alarmLeft = Math.max(0, this.alarmLeft - dt);
    if (Math.ceil(this.alarmLeft) !== before) this.keypad.setCountdown(Math.ceil(this.alarmLeft));
    if (this.alarmLeft === 0) void this.redeploy();
  }

  private stopAlarm(): void {
    this.alarmLeft = 0;
    this.audio.stopAlarm();
  }

  /** 倒數結束：封印艙重新佈署生物（N 不變、換一個 L），密碼盤重新開放；已掃描過就直接顯示新的 L */
  private async redeploy(): Promise<void> {
    this.stopAlarm();
    const run = this.run;
    const seg = this.seg;
    if (!run.pending) return;
    run.puzzle = run.pending;
    run.pending = null;
    seg.keypad.setState('idle');
    this.audio.redeploy();
    if (this.state === 'deduction') this.panel.render(this.panelView());
    if (this.state === 'keypad') this.keypad.setMode('input');
    await seg.pod.redeploy(this.tweens, run.puzzle.readings, seg.scanned);
  }

  // ───────────────────────── 演出（計時照跑） ─────────────────────────

  /**
   * 答對（約 4 秒）：面板變綠 → 鏡頭移到看得到封印艙和大門的位置（只移動一次）
   * → 投影有 {獵獸數} 隻逐隻變形（1.5 秒）→ 大門開啟（同時除霧顯形、接上下一段走廊）→ 回到玩家。
   */
  private async solvedSequence(): Promise<void> {
    const { tweens, audio } = this;
    const seg = this.seg;
    const answer = this.run.puzzle.answer;
    this.state = 'cinematic';
    this.keypad.setMode('success');
    seg.keypad.setState('ok');
    audio.solved();
    this.syncControls();
    await tweens.wait(0.4);
    this.keypad.close();

    const shot = seg.solvedShot;
    this.rig.focus = { position: shot.position, target: shot.target, fov: 62 };
    const fromW = this.rig.weight;
    void tweens.to(0.4, (t) => seg.holo.setOpacity(t), ease.out, 'holo');
    await tweens.to(0.4, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');

    // 獵獸那一端的投影逐隻變形（音高跟著推演的接觸點往上）
    const N = this.puzzle.readings.N;
    const hunters = answer[HUNTER.id] ?? 0;
    for (let i = 0; i < hunters; i++) {
      seg.holo.morph(i, HUNTER.id);
      audio.morph(SCOUT.legs * N + (HUNTER.legs - SCOUT.legs) * (i + 1), true);
      await tweens.wait(MORPH_TIME / hunters);
    }
    seg.holo.setColor(PALETTE.green);
    seg.pod.setSolvedLook();

    // 大門開啟：同時除霧顯形、接上下一段走廊（門後就是新的一段）
    this.doorsPassed++;
    this.hud.setScore(this.door, this.score);
    this.addSegment(this.door + 1);
    seg.beacons.forEach((b) => b.setClear());
    audio.defog();
    void tweens.to(1.0, (t) => seg.holo.setOpacity(1 - t), ease.inOut, 'holo');
    void seg.pod.reveal(tweens, answerSlots(answer));
    await seg.door.open(tweens, audio, 1.4);
    seg.doorObstacle.enabled = false;

    await this.leaveFocus(0.5);
    this.setObjective('chest');
    this.enterExplore();
  }

  /** 掃描台（1.5 秒）：鏡頭轉向封印艙，一道光線掃過艙底、接觸點從 0 數上去 */
  private async scanSequence(): Promise<void> {
    const seg = this.seg;
    if (seg.scanStation.done) return;
    this.state = 'cinematic';
    this.syncControls();
    this.rig.focus = this.podShot();
    this.animateOffset(this.areaOffset(false), 0.35);
    const fromW = this.rig.weight;
    void this.tweens.to(0.35, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');
    this.audio.scan(SCAN_TIME);
    await seg.pod.scan(this.tweens, SCAN_TIME);
    seg.scanStation.setDone();
    this.setObjective('solve');
    await this.leaveFocus(0.35);
    this.enterExplore();
  }

  /** 門後寶箱（約 1.5 秒）：大電池 +40 秒 */
  private async openChest(): Promise<void> {
    this.state = 'cinematic';
    this.syncControls();
    const chest = this.seg.chest;
    await chest.open(this.tweens, this.audio);
    chest.battery.visible = false;
    this.addPower(RUN_CONFIG.chestBattery);
    await this.tweens.wait(0.2);
    this.setObjective('next');
    this.enterExplore();
  }

  private pickBattery(seg: Segment): void {
    if (seg.battery.picked) return;
    seg.battery.pick();
    this.batteries++;
    this.addPower(RUN_CONFIG.hiddenBattery);
  }

  private addPower(amount: number): void {
    const from = this.power;
    this.power = charge(this.power, amount);
    this.hud.power.charge(amount, from);
    this.audio.battery();
  }

  /** 電力歸零：立刻結束（正在輸入密碼也一樣）→ 畫面變暗、關機、「電力耗盡」→ 1.5 秒後任務結束畫面 */
  private powerOut(): void {
    this.running = false;
    this.tweens.clear();
    this.stopAlarm();
    this.panel.close();
    this.keypad.close();
    this.releaseLock();
    this.state = 'over';
    this.syncControls();
    this.setObjective('none');
    this.audio.powerOut();
    this.powerOutEl = el('div', 'power-out', '<b>電力耗盡</b>');
    this.ui.appendChild(this.powerOutEl);
    void this.tweens.to(RUN_CONFIG.powerOutSeconds * 0.8, (t) => this.player.shutdown(t), ease.out);
    void this.tweens.wait(RUN_CONFIG.powerOutSeconds).then(() => this.showGameOver());
  }

  private showGameOver(): void {
    this.powerOutEl?.remove();
    this.powerOutEl = null;
    this.hud.setVisible(false);
    const { best, isNew } = updateBest(this.save.best, { score: this.score, doors: this.doorsPassed });
    this.save.best = best;
    writeSave(this.save);
    this.gameOver.show({ doors: this.doorsPassed, score: this.score, batteries: this.batteries, best, isNew });
    if (isNew) this.audio.newRecord();
  }

  // ───────────────────────── 每幀 ─────────────────────────

  private tick(dt: number, now: number): void {
    this.realTime = now;
    if (this.paused) {
      // 暫停：一切停止（只畫畫面）；「繼續」後倒數 3 秒才恢復
      if (this.resumeLeft > 0) {
        this.resumeLeft = Math.max(0, this.resumeLeft - dt);
        this.pauseMenu.setCountdown(Math.ceil(this.resumeLeft));
        if (this.resumeLeft === 0) this.unpause();
      }
      this.render();
      return;
    }

    this.worldTime += dt;
    this.tweens.update(dt);
    if (this.running) {
      this.power = drain(this.power, dt);
      if (this.power <= 0) this.powerOut();
    }
    this.updateAlarm(dt);
    this.updateLowPower(dt);

    const look = this.input.consumeLook();
    if (this.state === 'explore') {
      this.tpc.addLook(look.dx, look.dy);
      this.player.update(dt, this.input.move, this.tpc.yaw, this.level.world);
      this.checkNextSegment();
      this.updateInteraction();
    } else if (this.state !== 'over') {
      this.player.idle(dt);
    }

    this.level.update(dt, this.worldTime);
    for (const seg of this.level.segments) seg.holo.update(dt, this.realTime);
    this.level.updateLights(dt, this.player.position);
    this.waypoint.update(this.realTime, this.player.position, this.camera, this.state === 'explore');
    this.hud.power.update(this.power, dt);
    this.render(dt);
  }

  private render(dt = 0): void {
    // 特寫時把主角藏起來，避免擋住艙體
    this.player.object.visible = this.rig.weight < 0.5 || !this.rig.focus;
    this.followPose = this.tpc.pose(this.player.position, this.level.world, this.level.ceiling, dt);
    this.rig.apply(this.followPose);
    this.level.updateVisibility(this.camera.position);
    this.rim.update(this.player.position, this.camera, this.player.object.visible);
    this.post.render();
    this.fps?.tick(this.renderer.info.render);
  }

  private unpause(): void {
    this.paused = false;
    this.pauseMenu.setCountdown(0);
    if (this.state === 'explore') this.enterExplore();
    else this.syncControls();
  }

  /** 低電力（≤ 20 秒）：走廊轉紅、心跳聲（≤ 5 秒加快）；保全警報也讓走廊轉紅，取比較強的 */
  private updateLowPower(dt: number): void {
    const level = this.running ? powerLevel(this.power) : 'ok';
    const low = level === 'low' || level === 'critical';
    const pulse = 0.75 + 0.25 * Math.sin(this.realTime * 8);
    const alarm =
      this.alarmLeft > 0 ? Math.min(1, (RUN_CONFIG.alarmSeconds - this.alarmLeft) / 0.4, this.alarmLeft / 0.6) * pulse : 0;
    const lowRed = low ? 0.55 + 0.15 * Math.sin(this.realTime * (level === 'critical' ? 9 : 4)) : 0;
    this.level.setRed(Math.max(alarm, lowRed), this.alarmLeft > 0);
    if (!low) {
      this.heartbeatT = 0;
      return;
    }
    this.heartbeatT -= dt;
    if (this.heartbeatT <= 0) {
      this.audio.heartbeat();
      this.heartbeatT = level === 'critical' ? 0.5 : 1.0;
    }
  }

  /** 走過區段交界：換成下一道門的目標，背後的隔門關上（關好後卸載上一段） */
  private checkNextSegment(): void {
    const seg = this.level.segmentAt(this.player.position.z);
    if (!seg || seg.index <= this.door) return;
    // 走進來 2 m 以上才關門，不會夾到人
    if (this.player.position.z > seg.startZ - 2) return;
    this.door = seg.index;
    this.hud.setScore(this.door, this.score);
    this.setObjective('scan');
    void this.level.sealBehind(seg, this.tweens, this.audio);
  }

  private updateInteraction(): void {
    const p = this.player.position;
    const near = nearestInteractable(this.level.interactables, p.x, p.z);
    if (near !== this.near) {
      this.near = near;
      this.hud.setPrompt(near?.label ?? null);
      this.touch.setInteract(near?.label ?? null);
    }
    // 沒有互動目標時按 E 不做任何事
    if (!this.input.consume('interact') || !near) return;
    this.near = null;
    this.hud.setPrompt(null);
    this.touch.setInteract(null);
    const seg = this.level.segment(near.door);
    if (!seg) return;
    if (near.id === 'battery') this.pickBattery(seg);
    else if (near.door !== this.door) return;
    else if (near.id === 'pod') this.enterDeduction();
    else if (near.id === 'chest') void this.openChest();
    else if (near.id === 'scan') void this.scanSequence();
    else if (near.id === 'keypad') this.openKeypad();
  }

  // ───────────────────────── 裝置 / 版面 ─────────────────────────

  private applyMode(mode: InputMode): void {
    document.body.dataset.mode = mode;
    this.post?.setEnabled(mode === 'touch' ? AGENT_LOOK.ao.touch : AGENT_LOOK.ao.desktop);
    if (this.level) this.setObjective(this.objective);
    if (mode === 'touch') this.releaseLock();
    this.syncControls();
  }

  private syncControls(): void {
    const exploring = this.state === 'explore' && !this.paused;
    this.touch.setVisible(exploring && this.input.mode === 'touch');
    if (!exploring) {
      this.hud.hideHints();
      this.near = null;
      this.hud.setPrompt(null);
      this.touch.setInteract(null);
    }
    this.refreshLockPrompt();
  }

  private refreshLockPrompt(): void {
    this.hud.setLockPrompt(this.state === 'explore' && !this.paused && this.input.mode === 'desktop' && !this.kbm.locked);
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
