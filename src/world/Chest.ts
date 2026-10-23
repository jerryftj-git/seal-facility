import * as THREE from 'three';
import type { LoadedAsset } from '../assets/AssetLoader';
import type { GameAudio } from '../core/Audio';
import { PALETTE } from '../core/palette';
import { ease, type Tweens } from '../core/Tweens';
import { batteryMesh } from './Battery';

/** 寶箱：打開後浮出一顆大電池 */
export class Chest {
  readonly object: THREE.Object3D;
  /** 寶箱裡的大電池 */
  readonly battery: THREE.Group;
  opened = false;
  private mixer: THREE.AnimationMixer | null = null;
  private openClip: THREE.AnimationClip | null = null;
  /** 不直接顯示，由 LightPool 借真的點光源照它的設定亮（見 SealPod.light） */
  readonly light = new THREE.PointLight(PALETTE.cyan, 3, 4, 2);

  constructor(asset: LoadedAsset) {
    this.object = asset.scene;
    this.openClip = THREE.AnimationClip.findByName([...asset.animations], 'open') ?? null;
    if (this.openClip) this.mixer = new THREE.AnimationMixer(this.object);

    this.battery = batteryMesh(1.6);
    this.battery.visible = false;
    const anchor = this.object.getObjectByName('battery_anchor');
    this.battery.position.copy(anchor?.position ?? new THREE.Vector3(0, 0.5, 0));
    this.object.add(this.battery);
    this.light.position.set(0, 1.2, 0.6);
    this.light.visible = false;
    this.object.add(this.light);
  }

  /** 開箱演出（約 1.5 秒）；回傳電池最後的世界座標 */
  async open(tweens: Tweens, audio: GameAudio): Promise<THREE.Vector3> {
    this.opened = true;
    audio.chest();
    const lid = this.object.getObjectByName('lid');
    if (this.mixer && this.openClip) {
      const action = this.mixer.clipAction(this.openClip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      await tweens.to(this.openClip.duration, () => {});
    } else if (lid) {
      await tweens.to(0.5, (t) => (lid.rotation.x = -1.9 * t), ease.out);
    }
    this.battery.visible = true;
    const y0 = this.battery.position.y;
    await tweens.to(0.6, (t) => {
      this.battery.position.y = y0 + t * 0.6;
      this.battery.rotation.y = t * Math.PI * 2;
      this.light.intensity = 3 + t * 6;
    }, ease.out);
    return this.battery.getWorldPosition(new THREE.Vector3());
  }

  update(dt: number, time: number): void {
    this.mixer?.update(dt);
    if (this.battery.visible) this.battery.rotation.y = time * 2;
  }
}
