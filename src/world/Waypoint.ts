import * as THREE from 'three';
import { PALETTE } from '../core/palette';

/**
 * 目標標記：浮在下一個目的地上方的發光菱形（不受霧、牆遮擋，遠處也看得到），上下飄動。
 * 玩家走近後淡出，免得擋住畫面。
 */
export class Waypoint {
  readonly object = new THREE.Group();
  private readonly gem: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private target: THREE.Vector3 | null = null;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), mat);
    this.gem.scale.y = 1.6;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.26, 24), mat.clone());
    this.object.add(this.gem, this.ring);
    this.object.renderOrder = 10;
    this.object.traverse((o) => (o.renderOrder = 10));
    this.object.visible = false;
  }

  set(target: THREE.Vector3 | null): void {
    this.target = target ? target.clone() : null;
    this.object.visible = !!target;
  }

  update(time: number, player: THREE.Vector3, camera: THREE.Camera, show: boolean): void {
    if (!this.target) return;
    this.object.visible = show;
    if (!show) return;
    this.object.position.copy(this.target).setY(this.target.y + Math.sin(time * 2.4) * 0.12);
    this.gem.rotation.y = time * 1.8;
    this.ring.quaternion.copy(camera.quaternion);
    const d = Math.hypot(player.x - this.target.x, player.z - this.target.z);
    // 遠處放大，讓畫面上的大小差不多（走廊另一端也看得到）
    this.object.scale.setScalar(THREE.MathUtils.clamp(d / 6, 1, 3.5));
    const a = THREE.MathUtils.clamp((d - 2.0) / 3.0, 0.15, 0.9);
    (this.gem.material as THREE.MeshBasicMaterial).opacity = a;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = a * 0.7;
  }
}
