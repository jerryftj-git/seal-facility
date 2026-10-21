import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import type { LoadedAsset } from '../assets/AssetLoader';

const SPEED = 4.2;
const ACCEL = 18;
const TURN_SPEED = 12;
export const PLAYER_RADIUS = 0.35;

/** 第三人稱移動：輸入方向以鏡頭為準，角色轉向移動方向 */
export class PlayerController {
  readonly object = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  facing = Math.PI; // 面向 -Z
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<'idle' | 'walk', THREE.AnimationAction>> = {};
  private bobT = 0;

  constructor(asset: LoadedAsset) {
    this.model = asset.scene;
    this.object.add(this.model);
    if (asset.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const name of ['idle', 'walk'] as const) {
        const clip = THREE.AnimationClip.findByName([...asset.animations], name);
        if (clip) this.actions[name] = this.mixer.clipAction(clip);
      }
      this.actions.idle?.play();
      this.actions.walk?.play();
    }
  }

  get position(): THREE.Vector3 {
    return this.object.position;
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

  /** 停在原地（推演或演出時）只做待機動畫 */
  idle(dt: number): void {
    this.velocity.set(0, 0, 0);
    this.animate(dt, 0);
  }

  private animate(dt: number, run: number): void {
    if (this.mixer) {
      this.actions.walk?.setEffectiveWeight(run);
      this.actions.idle?.setEffectiveWeight(1 - run);
      this.mixer.update(dt);
      return;
    }
    // 佔位模型：走路時上下晃動、微微前傾
    this.bobT += dt * (4 + run * 8);
    this.model.position.y = Math.abs(Math.sin(this.bobT)) * 0.06 * run + Math.sin(this.bobT * 0.3) * 0.01;
    this.model.rotation.x = run * 0.12;
  }
}
