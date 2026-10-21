import * as THREE from 'three';
import { glowMaterial } from '../core/materials';
import { PALETTE } from '../core/palette';

/** 門旁的橘紅警示燈：旋轉的燈罩 + 閃爍的點光源；解鎖後轉綠、停止閃爍 */
export class Beacon {
  readonly object = new THREE.Group();
  private readonly light = new THREE.PointLight(PALETTE.warning, 10, 9, 2);
  private readonly lamp: THREE.Mesh;
  private readonly shade: THREE.Mesh;
  private clear = false;

  constructor() {
    this.lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 10), glowMaterial(PALETTE.warning));
    this.shade = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.26, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
    );
    this.shade.position.x = 0.14;
    const pivot = new THREE.Group();
    pivot.name = 'pivot';
    pivot.add(this.shade);
    this.object.add(this.lamp, pivot, this.light);
  }

  setClear(): void {
    this.clear = true;
    (this.lamp.material as THREE.MeshBasicMaterial).color.set(PALETTE.green);
    this.light.color.set(PALETTE.green);
    this.light.intensity = 4;
  }

  update(time: number): void {
    if (this.clear) return;
    this.object.getObjectByName('pivot')!.rotation.y = time * 5;
    this.light.intensity = 6 + Math.max(0, Math.sin(time * 5)) * 14;
  }
}
