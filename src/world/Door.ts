import * as THREE from 'three';
import type { LoadedAsset } from '../assets/AssetLoader';
import { PALETTE } from '../core/palette';
import type { GameAudio } from '../core/Audio';
import { ease, type Tweens } from '../core/Tweens';

/** 開門各階段在整個進度（0..1）裡的區間 */
const STAGE = { bar: [0, 0.22], inner: [0.3, 0.62], all: [0.68, 1] } as const;
const span = (p: number, [a, b]: readonly [number, number]) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);

/**
 * 分段滑開的門。佔位模型與 glb 都支援：
 * - glb 有名為 open 的動畫 → 直接播放（關門時倒著播）
 * - 否則找 lock_bar、seg_0..seg_3 節點做程式動畫
 * - 都沒有 → 整扇門往上升
 * 開門程度用一個 0..1 的進度表示，開、關、瞬間開都共用同一組姿勢。
 */
export class Door {
  readonly object: THREE.Object3D;
  isOpen = false;
  private mixer: THREE.AnimationMixer | null = null;
  private openClip: THREE.AnimationClip | null = null;
  private action: THREE.AnimationAction | null = null;
  private readonly bar: THREE.Object3D | null;
  private readonly segs: (THREE.Object3D | null)[];
  private readonly base: { barY: number; segX: number[]; y: number };
  private progress = 0;

  constructor(asset: LoadedAsset) {
    this.object = asset.scene;
    this.openClip = THREE.AnimationClip.findByName([...asset.animations], 'open') ?? null;
    if (this.openClip) {
      this.mixer = new THREE.AnimationMixer(this.object);
      this.action = this.mixer.clipAction(this.openClip);
      this.action.setLoop(THREE.LoopOnce, 1);
      this.action.clampWhenFinished = true;
    }
    this.bar = this.object.getObjectByName('lock_bar') ?? null;
    this.segs = [0, 1, 2, 3].map((i) => this.object.getObjectByName(`seg_${i}`) ?? null);
    this.base = { barY: this.bar?.position.y ?? 0, segX: this.segs.map((s) => s?.position.x ?? 0), y: this.object.position.y };
  }

  private setStatus(color: number): void {
    const light = this.object.getObjectByName('status_light') as THREE.Mesh | undefined;
    const mat = light?.material as THREE.MeshBasicMaterial | undefined;
    mat?.color.set(color);
    this.bar?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && 'isMeshBasicMaterial' in m && m.isMeshBasicMaterial) m.color.set(color);
    });
  }

  /** 依進度擺出門的姿勢（0 = 關、1 = 全開） */
  private pose(p: number): void {
    this.progress = p;
    if (this.action && this.openClip) {
      this.action.play();
      this.action.paused = true;
      this.action.time = p * this.openClip.duration;
      this.mixer!.update(0);
      return;
    }
    if (!this.bar && this.segs.every((s) => !s)) {
      this.object.position.y = this.base.y + p * 3.6;
      return;
    }
    const b = ease.in(span(p, STAGE.bar));
    if (this.bar) {
      this.bar.position.y = this.base.barY + b * 1.9;
      this.bar.scale.y = 1 - b * 0.6;
    }
    // 第一段：內側兩扇滑到外側門扇後面；第二段：四扇一起收進門框
    const i = span(p, STAGE.inner);
    const a = span(p, STAGE.all);
    const x = this.base.segX;
    const [s0, s1, s2, s3] = this.segs;
    if (s0) s0.position.x = x[0] - 1.15 * a;
    if (s1) s1.position.x = x[1] - 1.1 * i - 1.15 * a;
    if (s2) s2.position.x = x[2] + 1.1 * i + 1.15 * a;
    if (s3) s3.position.x = x[3] + 1.15 * a;
  }

  /** 開門動畫；duration 是總長（秒） */
  async open(tweens: Tweens, audio: GameAudio, duration = 2.6): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.setStatus(PALETTE.green);
    audio.clunk();
    window.setTimeout(() => audio.servo(), duration * STAGE.inner[0] * 1000);
    const from = this.progress;
    await tweens.to(duration * (1 - from), (t) => this.pose(from + (1 - from) * t));
  }

  /** 關門（開門動畫倒著播） */
  async close(tweens: Tweens, audio: GameAudio, duration = 1.6): Promise<void> {
    if (!this.isOpen) return;
    this.isOpen = false;
    audio.servo();
    const from = this.progress;
    await tweens.to(duration * from, (t) => this.pose(from * (1 - t)));
    audio.clunk();
    this.setStatus(PALETTE.warning);
  }

  /** 直接設成全開（例如新的一段走廊入口的隔門，一建好就是開的） */
  setOpen(): void {
    this.isOpen = true;
    this.setStatus(PALETTE.green);
    this.pose(1);
  }

  update(dt: number): void {
    if (this.mixer && !this.action) this.mixer.update(dt);
  }
}
