import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { HUNTER, SCOUT } from '../puzzle/species';
import {
  canConvert,
  convert,
  createDeduction,
  createRng,
  generatePuzzle,
  PHASE1_CONFIG,
  PHASE1_DEDUCTION,
  rateDeduction,
  type DeductionState,
  type Puzzle,
  type Rng,
} from '../puzzle';
import { CameraRig } from '../player/CameraRig';
import { detectInitialMode, type InputMode } from '../player/deviceDetect';
import { Input } from '../player/Input';
import { KeyboardMouseSource } from '../player/KeyboardMouseSource';
import { PlayerController } from '../player/PlayerController';
import { ThirdPersonCamera, type CameraPose } from '../player/ThirdPersonCamera';
import { FpsMeter } from '../ui/FpsMeter';
import { GauntletPanel, type ConvertDir, type PanelView } from '../ui/GauntletPanel';
import { Hud } from '../ui/Hud';
import { ResultScreen } from '../ui/ResultScreen';
import { TitleScreen } from '../ui/TitleScreen';
import { TouchControls } from '../ui/TouchControls';
import { GameAudio } from './Audio';
import { nearestInteractable, type Interactable } from './Interactables';
import { LAYOUT, Level } from './Level';
import { Loop } from './Loop';
import { PALETTE } from './palette';
import { createRenderer } from './Renderer';
import { ease, Tweens } from './Tweens';

export type GameState = 'loading' | 'title' | 'explore' | 'deduction' | 'cinematic' | 'result';

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
  private readonly loop = new Loop((dt, now) => this.tick(dt, now));
  private readonly rng: Rng;
  private readonly fps: FpsMeter | null;

  level!: Level;
  player!: PlayerController;
  puzzle!: Puzzle;
  deduction!: DeductionState;
  private chips = 0;
  private worldTime = 0;
  private realTime = 0;
  private near: Interactable | null = null;
  private followPose: CameraPose | null = null;

  constructor(container: HTMLElement) {
    this.input = new Input(detectInitialMode());
    this.renderer = createRenderer(container, this.input.mode === 'touch');
    this.ui = document.getElementById('ui')!;
    this.kbm = new KeyboardMouseSource(this.input, this.renderer.domElement);
    this.hud = new Hud(this.ui, () => this.kbm.requestLock());
    this.touch = new TouchControls(this.ui, this.input);
    this.panel = new GauntletPanel(this.ui, {
      onConvert: (dir) => this.onConvert(dir),
      onExit: () => this.exitDeduction(),
    });
    this.result = new ResultScreen(this.ui, () => this.retry());

    const params = new URLSearchParams(location.search);
    this.fps = params.get('fps') === '1' ? new FpsMeter(this.ui) : null;
    const seed = params.get('seed');
    this.rng = seed !== null && Number.isFinite(Number(seed)) ? createRng(Number(seed)) : Math.random;

    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.06);

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
  }

  async init(): Promise<void> {
    await this.assets.preload();
    this.newRun();
    this.state = 'title';
    this.loop.start();
    new TitleScreen(this.ui, () => this.start());
  }

  // ───────────────────────── 流程 ─────────────────────────

  private start(): void {
    this.audio.unlock();
    this.audio.startHum();
    this.enterExplore();
    this.hud.setVisible(true);
    this.hud.showHints(this.input.mode);
  }

  private newRun(): void {
    if (this.level) {
      this.scene.remove(this.level.root);
      this.level.dispose();
    }
    if (this.player) this.scene.remove(this.player.object);
    this.tweens.clear();

    // 再次潛入時避免連續兩次同一題
    const prev = this.puzzle ? JSON.stringify(this.puzzle.answer) : '';
    let puzzle = generatePuzzle(PHASE1_CONFIG, this.rng);
    for (let i = 0; i < 5 && JSON.stringify(puzzle.answer) === prev; i++) puzzle = generatePuzzle(PHASE1_CONFIG, this.rng);
    this.puzzle = puzzle;
    this.deduction = createDeduction(this.puzzle, { ...PHASE1_DEDUCTION, rng: this.rng });
    this.level = new Level(this.assets, this.puzzle, this.deduction.slots);
    this.scene.add(this.level.root);

    this.player = new PlayerController(this.assets.get('agent'));
    this.player.place(LAYOUT.spawn.x, LAYOUT.spawn.z, LAYOUT.spawn.facing);
    this.scene.add(this.player.object);
    this.tpc.yaw = 0;
    this.tpc.pitch = 0.28;
    this.rig.focus = null;
    this.rig.weight = 0;
    this.rig.offset = { x: 0, y: 0 };
    this.chips = 0;
    this.hud.setChips(0);
    this.worldTime = 0;
  }

  private retry(): void {
    this.newRun();
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
    };
  }

  private enterDeduction(): void {
    this.state = 'deduction';
    this.input.reset();
    this.kbm.setEnabled(false);
    this.kbm.exitLock();
    this.syncControls();
    this.audio.uiOpen();
    this.panel.open(this.panelView());
    this.rig.focus = this.deductionPose();
    const fromW = this.rig.weight;
    void this.tweens.to(0.7, (t) => (this.rig.weight = fromW + (1 - fromW) * t), ease.inOut, 'cam');
    this.animateOffset(this.panelOffset(), 0.7);
    void this.tweens.to(0.5, (t) => this.level.holo.setOpacity(t), ease.out, 'holo');
  }

  private exitDeduction(): void {
    if (this.state !== 'deduction') return;
    this.audio.uiClose();
    this.panel.close();
    this.leaveFocus(0.6);
    void this.tweens.to(0.35, (t) => this.level.holo.setOpacity(1 - t), ease.out, 'holo');
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
    const target = LAYOUT.podFocus.clone().setY(1.75);
    const position = new THREE.Vector3(2.4, 1.85, LAYOUT.pod.z);
    const d = position.x - -1.6;
    const tanW = 2.55 / (d * (availW / H));
    const tanH = 1.95 / (d * (availH / H));
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(tanW, tanH))), 40, 95);
    return { position, target, fov };
  }

  private onConvert(dir: ConvertDir): boolean {
    if (this.state !== 'deduction') return false;
    const [from, to] = dir === 'toQuad' ? [BIPED, QUAD] : [QUAD, BIPED];
    const r = convert(this.deduction, from, to);
    if (r.event === 'blocked') {
      this.audio.blocked();
      return false;
    }
    if (r.event === 'locked') return false;
    this.deduction = r.state;
    r.slots.forEach((slot) => this.level.holo.morph(slot, to));
    // 音高只綁預測值（不可以傳差值或與答案的距離）
    this.audio.morph(r.state.predicted, dir === 'toQuad');
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
    const { level, tweens, audio } = this;
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
    const shot = LAYOUT.doorShot;
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
    level.world.get('door')!.enabled = false;
    await tweens.wait(0.4);

    await this.leaveFocus(1.0);
    this.enterExplore();
  }

  private async openChest(): Promise<void> {
    this.state = 'cinematic';
    this.syncControls();
    const worldPos = await this.level.chest.open(this.tweens, this.audio);
    const p = worldPos.project(this.camera);
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    this.level.chest.chip.visible = false;
    this.audio.chip();
    await this.hud.flyChip(x, y);
    this.chips += 1;
    this.hud.setChips(this.chips, true);
    await this.tweens.wait(2.0);
    this.showResult();
  }

  private showResult(): void {
    this.state = 'result';
    this.kbm.exitLock();
    this.syncControls();
    this.hud.setVisible(false);
    const { grade, steps } = rateDeduction(this.deduction);
    this.result.show(steps, grade);
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
      this.updateInteraction();
    } else {
      this.player.idle(timeFlows ? dt : 0);
    }
    if (this.state === 'deduction') this.panel.tick(performance.now());

    this.level.update(timeFlows ? dt : 0, this.worldTime);
    this.level.holo.update(dt, this.realTime);

    // 特寫時把探員藏起來，避免擋住艙體
    this.player.object.visible = this.rig.weight < 0.5 || !this.rig.focus;
    this.followPose = this.tpc.pose(this.player.position, this.level.world, this.level.ceiling, dt);
    this.rig.apply(this.followPose);
    this.renderer.render(this.scene, this.camera);
    this.fps?.tick(this.renderer.info.render);
  }

  private updateInteraction(): void {
    const p = this.player.position;
    const near = nearestInteractable(this.level.interactables, p.x, p.z);
    if (near !== this.near) {
      this.near = near;
      this.hud.setPrompt(near?.label ?? null);
      this.touch.setInteract(near?.label ?? null);
    }
    if (this.input.consume('interact') && near) {
      this.near = null;
      this.hud.setPrompt(null);
      this.touch.setInteract(null);
      if (near.id === 'pod') this.enterDeduction();
      else if (near.id === 'chest') void this.openChest();
    }
  }

  // ───────────────────────── 裝置 / 版面 ─────────────────────────

  private applyMode(mode: InputMode): void {
    document.body.dataset.mode = mode;
    if (mode === 'touch') this.kbm.exitLock();
    this.syncControls();
  }

  private syncControls(): void {
    const exploring = this.state === 'explore';
    this.touch.setVisible(exploring && this.input.mode === 'touch');
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
    if (this.state === 'deduction') {
      this.panel.relayout();
      requestAnimationFrame(() => {
        this.rig.focus = this.deductionPose();
        this.rig.offset = this.panelOffset();
      });
    }
  }
}
