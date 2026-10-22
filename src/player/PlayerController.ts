import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import type { LoadedAsset } from '../assets/AssetLoader';
import { blendToward, findClipIndex, locomotionWeights } from './locomotion';

const SPEED = 4.2;
const ACCEL = 18;
const TURN_SPEED = 12;
export const PLAYER_RADIUS = 0.35;

/**
 * 探員 glb 的約定是面向 −Z（README「探員模型規格」），
 * 遊戲內部以 +Z 為前方，所以載入 glb 時把模型轉 180°。
 */
const AGENT_GLB_YAW = Math.PI;

/** 第三人稱移動：輸入方向以鏡頭為準，角色轉向移動方向 */
export class PlayerController {
  readonly object = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  facing = Math.PI; // 面向 -Z
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private runBlend = 0;
  private bobT = 0;

  constructor(asset: LoadedAsset) {
    this.model = asset.scene;
    if (asset.source === 'glb') this.model.rotation.y = AGENT_GLB_YAW;
    this.object.add(this.model);
    this.setupAnimations(asset.animations);
  }

  /** 有 idle / run 剪輯就用 AnimationMixer 混合播放；沒有動畫就維持佔位的晃動效果 */
  private setupAnimations(clips: readonly THREE.AnimationClip[]): void {
    if (clips.length === 0) return;
    const names = clips.map((c) => c.name);
    const idle = findClipIndex(names, 'idle');
    // run 找不到時接受 walk（舊命名）
    const runIdx = findClipIndex(names, 'run');
    const run = runIdx >= 0 ? runIdx : findClipIndex(names, 'walk');
    this.mixer = new THREE.AnimationMixer(this.model);
    if (idle >= 0) this.idleAction = this.mixer.clipAction(clips[idle]);
    if (run >= 0) this.runAction = this.mixer.clipAction(clips[run]);
    if (!this.idleAction && !this.runAction) {
      console.warn(`[PlayerController] 探員動畫沒有 idle / run，改為循環播放第一個剪輯「${clips[0].name}」`);
      this.idleAction = this.mixer.clipAction(clips[0]);
    }
    for (const a of [this.idleAction, this.runAction]) {
      if (!a) continue;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
    }
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get animated(): boolean {
    return this.mixer !== null;
  }

  place(x: number, z: number, facing: number): void {
    this.object.position.set(x, 0, z);
    this.facing = facing;
    this.velocity.set(0, 0, 0);
    this.object.rotation.y = facing;
  }

  update(dt: number, move: { x: number; y: number }, cameraYaw: number, world: CollisionWorld): void {
    // 鏡頭前方（水平）與右方
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = -fz;
    const rz = fx;
    const tx = (fx * move.y + rx * move.x) * SPEED;
    const tz = (fz * move.y + rz * move.x) * SPEED;
    const k = 1 - Math.exp(-ACCEL * dt);
    this.velocity.x += (tx - this.velocity.x) * k;
    this.velocity.z += (tz - this.velocity.z) * k;

    const p = this.object.position;
    const next = world.resolve({ x: p.x + this.velocity.x * dt, z: p.z + this.velocity.z * dt }, PLAYER_RADIUS);
    if (dt > 0) {
      this.velocity.x = (next.x - p.x) / dt;
      this.velocity.z = (next.z - p.z) / dt;
    }
    p.x = next.x;
    p.z = next.z;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.3) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-TURN_SPEED * dt));
    }
    this.object.rotation.y = this.facing;
    this.animate(dt, speed / SPEED);
  }

  /** 停在原地（推演或演出時）只做待機動畫；dt = 0 代表時間停止 */
  idle(dt: number): void {
    this.velocity.set(0, 0, 0);
    this.animate(dt, 0);
  }

  private animate(dt: number, speed01: number): void {
    if (this.mixer) {
      // 只有一種剪輯時就一直播它；兩種都有時依速度混合
      const target = speed01 > 0.08 ? 1 : 0;
      this.runBlend = blendToward(this.runBlend, target, dt);
      const w = locomotionWeights(this.runBlend, speed01);
      if (this.idleAction && this.runAction) {
        this.idleAction.setEffectiveWeight(w.idle);
        this.runAction.setEffectiveWeight(w.run);
        this.runAction.setEffectiveTimeScale(w.runTimeScale);
      }
      this.mixer.update(dt);
      return;
    }
    // 沒有動畫的模型：走路時上下晃動、微微前傾
    this.bobT += dt * (4 + speed01 * 8);
    this.model.position.y = Math.abs(Math.sin(this.bobT)) * 0.06 * speed01 + Math.sin(this.bobT * 0.3) * 0.01;
    this.model.rotation.x = speed01 * 0.12;
  }

  /** 除錯用：目前的混合狀態 */
  debugBlend(): { run: number; idleWeight: number | null; runWeight: number | null } {
    return {
      run: this.runBlend,
      idleWeight: this.idleAction?.getEffectiveWeight() ?? null,
      runWeight: this.runAction?.getEffectiveWeight() ?? null,
    };
  }
}
