import * as THREE from 'three';
import { glowMaterial } from '../core/materials';
import { PALETTE } from '../core/palette';

/** 門旁的橘紅警示燈：旋轉的燈罩 + 閃爍的點光源；解鎖後轉綠、停止閃爍 */
export class Beacon {
  readonly object = new THREE.Group();
  /** 不直接顯示，由 LightPool 借真的點光源照它的設定亮（見 SealPod.light） */
  readonly light: THREE.PointLight | null;
  private readonly lamp: THREE.Mesh;
  private readonly shade: THREE.Mesh;
  private clear = false;
  private alarm = false;

  constructor(withLight: boolean) {
    this.light = withLight ? new THREE.PointLight(PALETTE.warning, 5, 8, 2) : null;
    if (this.light) {
      this.light.position.x = 2.6;
      this.light.visible = false;
    }
    this.lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 10), glowMaterial(PALETTE.warning));
    this.shade = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.26, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
    );
    this.shade.position.x = 0.14;
    const pivot = new THREE.Group();
    pivot.name = 'pivot';
    pivot.add(this.shade);
    this.object.add(this.lamp, pivot);
    if (this.light) this.object.add(this.light);
  }

  /** 保全警報：轉得更快、閃得更亮 */
  setAlarm(on: boolean): void {
    this.alarm = on;
  }

  setClear(): void {
    this.clear = true;
    (this.lamp.material as THREE.MeshBasicMaterial).color.set(PALETTE.green);
    this.light?.color.set(PALETTE.green);
    if (this.light) this.light.intensity = 3;
  }

  update(time: number): void {
    if (this.clear) return;
    const speed = this.alarm ? 14 : 5;
    this.object.getObjectByName('pivot')!.rotation.y = time * speed;
    if (this.light) this.light.intensity = (this.alarm ? 4 : 2.5) + Math.max(0, Math.sin(time * speed)) * (this.alarm ? 12 : 6);
  }
}
