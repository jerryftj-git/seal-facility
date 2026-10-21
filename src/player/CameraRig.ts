import * as THREE from 'three';
import type { CameraPose } from './ThirdPersonCamera';

/**
 * 在「追尾視角」和「特寫鏡位」之間平滑切換。
 * viewOffset 讓畫面中心往左（或往上）偏移，留空間給手套面板。
 */
export class CameraRig {
  focus: CameraPose | null = null;
  /** 0 = 追尾、1 = 特寫 */
  weight = 0;
  /** 畫面偏移（像素），x 為向左、y 為向上 */
  offset = { x: 0, y: 0 };

  private readonly m = new THREE.Matrix4();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  apply(follow: CameraPose): void {
    const cam = this.camera;
    const w = this.focus ? this.weight : 0;
    this.m.lookAt(follow.position, follow.target, cam.up);
    this.qa.setFromRotationMatrix(this.m);
    if (this.focus && w > 0) {
      this.m.lookAt(this.focus.position, this.focus.target, cam.up);
      this.qb.setFromRotationMatrix(this.m);
      cam.position.lerpVectors(follow.position, this.focus.position, w);
      cam.quaternion.slerpQuaternions(this.qa, this.qb, w);
      cam.fov = THREE.MathUtils.lerp(follow.fov, this.focus.fov, w);
    } else {
      cam.position.copy(follow.position);
      cam.quaternion.copy(this.qa);
      cam.fov = follow.fov;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    cam.aspect = W / H;
    if (Math.abs(this.offset.x) > 0.5 || Math.abs(this.offset.y) > 0.5) {
      cam.setViewOffset(W, H, this.offset.x, this.offset.y, W, H);
    } else {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }
}
