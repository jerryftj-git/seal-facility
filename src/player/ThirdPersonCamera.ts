import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import { AGENT_LOOK } from '../core/agentLook';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}


const DIST = AGENT_LOOK.camera.distance;
const HEIGHT = 1.55;
const MIN_PITCH = -0.55;
const MAX_PITCH = 0.9;

/** 追尾視角：繞著角色的軌道鏡頭，會被牆擋住時拉近 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.28;
  private currentDist = DIST;

  addLook(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy));
  }

  pose(playerPos: THREE.Vector3, world: CollisionWorld, ceiling: number, dt: number): CameraPose {
    const target = new THREE.Vector3(playerPos.x, playerPos.y + HEIGHT, playerPos.z);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // 從角色往後一小步一小步檢查，碰到牆就停
    let allowed = DIST;
    for (let d = 0.3; d <= DIST; d += 0.1) {
      const p = target.clone().addScaledVector(dir, d);
      if (!world.isFree(p.x, p.y, p.z, 0.2, ceiling)) {
        allowed = Math.max(0.3, d - 0.1);
        break;
      }
    }
    // 拉近要快、拉遠要慢，避免抖動
    const k = allowed < this.currentDist ? 1 : 1 - Math.exp(-4 * dt);
    this.currentDist += (allowed - this.currentDist) * k;
    // 直式畫面（iPad 直拿）視野放寬一點
    const fov = window.innerWidth < window.innerHeight ? 70 : 60;
    return { position: target.clone().addScaledVector(dir, this.currentDist), target, fov };
  }
}
