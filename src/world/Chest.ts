import * as THREE from 'three';
import type { LoadedAsset } from '../assets/AssetLoader';
import type { GameAudio } from '../core/Audio';
import { PALETTE } from '../core/palette';
import { ease, type Tweens } from '../core/Tweens';

/** 寶箱：打開後浮出一枚資料晶片 */
export class Chest {
  readonly object: THREE.Object3D;
  readonly chip: THREE.Mesh;
  opened = false;
  private mixer: THREE.AnimationMixer | null = null;
  private openClip: THREE.AnimationClip | null = null;
  /** 不直接顯示，由 LightPool 借真的點光源照它的設定亮（見 SealPod.light） */
  readonly light = new THREE.PointLight(PALETTE.cyan, 3, 4, 2);

  constructor(asset: LoadedAsset) {
    this.object = asset.scene;
    this.openClip = THREE.AnimationClip.findByName([...asset.animations], 'open') ?? null;
    if (this.openClip) this.mixer = new THREE.AnimationMixer(this.object);

    this.chip = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.02, 0.16),
      new THREE.MeshBasicMaterial({ color: PALETTE.cyan, toneMapped: false }),
    );
    this.chip.visible = false;
    const anchor = this.object.getObjectByName('chip_anchor');
    this.chip.position.copy(anchor?.position ?? new THREE.Vector3(0, 0.5, 0));
    this.object.add(this.chip);
    this.light.position.set(0, 1.2, 0.6);
    this.light.visible = false;
    this.object.add(this.light);
  }

  /** 開箱演出；回傳晶片最後的世界座標（給 HUD 的飛行動畫） */
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
      await tweens.to(0.7, (t) => (lid.rotation.x = -1.9 * t), ease.out);
    }
    this.chip.visible = true;
    const y0 = this.chip.position.y;
    await tweens.to(0.7, (t) => {
      this.chip.position.y = y0 + t * 0.7;
      this.chip.rotation.y = t * Math.PI * 2;
      this.light.intensity = 3 + t * 6;
    }, ease.out);
    return this.chip.getWorldPosition(new THREE.Vector3());
  }

  update(dt: number, time: number): void {
    this.mixer?.update(dt);
    if (this.chip.visible) this.chip.rotation.y = time * 2;
  }
}
