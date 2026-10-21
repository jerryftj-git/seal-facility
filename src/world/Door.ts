import * as THREE from 'three';
import type { LoadedAsset } from '../assets/AssetLoader';
import { PALETTE } from '../core/palette';
import type { GameAudio } from '../core/Audio';
import { ease, type Tweens } from '../core/Tweens';

/**
 * 分段滑開的門。佔位模型與 glb 都支援：
 * - glb 有名為 open 的動畫 → 直接播放
 * - 否則找 lock_bar、seg_0..seg_3 節點做程式動畫
 * - 都沒有 → 整扇門往上升
 */
export class Door {
  readonly object: THREE.Object3D;
  isOpen = false;
  private mixer: THREE.AnimationMixer | null = null;
  private openClip: THREE.AnimationClip | null = null;

  constructor(asset: LoadedAsset) {
    this.object = asset.scene;
    this.openClip = THREE.AnimationClip.findByName([...asset.animations], 'open') ?? null;
    if (this.openClip) this.mixer = new THREE.AnimationMixer(this.object);
  }

  private setStatus(color: number): void {
    const light = this.object.getObjectByName('status_light') as THREE.Mesh | undefined;
    const mat = light?.material as THREE.MeshBasicMaterial | undefined;
    mat?.color.set(color);
    const bar = this.object.getObjectByName('lock_bar');
    bar?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && 'isMeshBasicMaterial' in m && m.isMeshBasicMaterial) m.color.set(color);
    });
  }

  async open(tweens: Tweens, audio: GameAudio): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.setStatus(PALETTE.green);
    audio.clunk();

    if (this.mixer && this.openClip) {
      const action = this.mixer.clipAction(this.openClip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      audio.servo();
      await tweens.to(this.openClip.duration, () => {});
      return;
    }

    const bar = this.object.getObjectByName('lock_bar');
    const segs = [0, 1, 2, 3].map((i) => this.object.getObjectByName(`seg_${i}`));
    if (!bar && segs.every((s) => !s)) {
      audio.servo();
      const y0 = this.object.position.y;
      await tweens.to(1.6, (t) => (this.object.position.y = y0 + t * 3.6));
      return;
    }

    if (bar) {
      const y0 = bar.position.y;
      await tweens.to(0.5, (t) => {
        bar.position.y = y0 + t * 1.9;
        bar.scale.y = 1 - t * 0.6;
      }, ease.in);
    }
    await tweens.wait(0.15);
    // 第一段：內側兩扇滑到外側門扇後面
    const [s0, s1, s2, s3] = segs;
    const x = segs.map((s) => s?.position.x ?? 0);
    audio.servo();
    await tweens.to(0.8, (t) => {
      if (s1) s1.position.x = x[1] - 1.1 * t;
      if (s2) s2.position.x = x[2] + 1.1 * t;
    });
    await tweens.wait(0.12);
    // 第二段：四扇一起收進門框
    audio.servo();
    await tweens.to(1.0, (t) => {
      if (s0) s0.position.x = x[0] - 1.15 * t;
      if (s1) s1.position.x = x[1] - 1.1 - 1.15 * t;
      if (s2) s2.position.x = x[2] + 1.1 + 1.15 * t;
      if (s3) s3.position.x = x[3] + 1.15 * t;
    });
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}
