import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { SPECIES_ASSET } from '../assets/manifest';
import { PALETTE } from '../core/palette';
import type { Tweens } from '../core/Tweens';
import { Readout } from './Readout';

const CYAN = '#2ee6f0';

/** 艙內生物（全像投影與真實生物共用）的縮放，兩者大小一致才會「和投影一致」 */
export const CREATURE_DISPLAY_SCALE = 0.85;

/** 艙內生物的朝向：3/4 側面，剪影（腳數）好認，身長佔的寬度又不會太大 */
export const CREATURE_FACING = Math.PI / 2 - 0.8;
const GREEN = '#3dff8a';

/**
 * 封印艙：不透明培養槽 + 兩個讀數。解開後除霧、顯出真實生物。
 * slot 位置由模型裡的 slots_start / slots_end 決定，全像投影也用同一組位置。
 */
export class SealPod {
  readonly object: THREE.Object3D;
  readonly readoutN = new Readout('個體數 N');
  readonly readoutL = new Readout('腳印受力點 L');
  private readonly glass: THREE.Mesh | null;
  private readonly light = new THREE.PointLight(PALETTE.cyan, 6, 6, 2);
  private readonly creatures = new THREE.Group();
  private readonly start = new THREE.Vector3(1.85, 0.35, 0);
  private readonly end = new THREE.Vector3(-1.85, 0.35, 0);
  solved = false;

  constructor(
    private readonly assets: AssetLoader,
    readings: { N: number; L: number },
  ) {
    this.object = assets.get('seal_pod').scene;
    this.glass = (this.object.getObjectByName('glass') as THREE.Mesh) ?? null;
    if (this.glass) {
      // 每個艙各自一份材質，除霧時才不會影響別的實例；glb 匯出的玻璃也強制可透明
      const mat = (this.glass.material as THREE.Material).clone();
      mat.transparent = true;
      mat.depthWrite = false;
      this.glass.material = mat;
      this.glass.renderOrder = 2;
    }
    this.object.getObjectByName('slots_start')?.getWorldPosition(this.start);
    this.object.getObjectByName('slots_end')?.getWorldPosition(this.end);
    this.object.worldToLocal(this.start);
    this.object.worldToLocal(this.end);

    this.attach('readout_N', this.readoutN.mesh, -0.95);
    this.attach('readout_L', this.readoutL.mesh, 0.95);
    this.readoutN.set(readings.N, CYAN);
    this.readoutL.set(readings.L, CYAN);

    this.light.position.set(0, 2.1, 0.2);
    this.object.add(this.light, this.creatures);
  }

  private attach(anchorName: string, mesh: THREE.Mesh, fallbackX: number): void {
    const anchor = this.object.getObjectByName(anchorName);
    if (anchor) anchor.add(mesh);
    else {
      mesh.position.set(fallbackX, 3.05, 0.36);
      this.object.add(mesh);
    }
  }

  /** 第 i 個 slot（共 n 個）在艙內的本地座標；index 0 在 slots_start 那端 */
  slotLocal(i: number, n: number): THREE.Vector3 {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const margin = n < 8 ? (8 - n) * 0.06 : 0;
    const a = this.start.clone().lerp(this.end, margin / 2);
    const b = this.end.clone().lerp(this.start, margin / 2);
    // 前後交錯排列，數量多時才不會疊在一起
    return a.lerp(b, t).add(new THREE.Vector3(0, 0, i % 2 === 0 ? -0.28 : 0.28));
  }

  /**
   * 全像投影的位置：就投在艙內，和真實生物的位置一模一樣。
   * （以前投在艙前方，離鏡頭較近、透視放大，兩端看起來會跑出艙外。）
   */
  holoLocal(i: number, n: number): THREE.Vector3 {
    return this.slotLocal(i, n);
  }

  setSolvedLook(): void {
    this.solved = true;
    this.readoutN.set(this.readoutN.current, GREEN);
    this.readoutL.set(this.readoutL.current, GREEN);
    this.light.color.set(PALETTE.green);
  }

  /** 除霧 + 真實生物顯形，排列和投影一致 */
  async reveal(tweens: Tweens, slots: readonly string[]): Promise<void> {
    this.creatures.clear();
    slots.forEach((id, i) => {
      const c = this.assets.get(SPECIES_ASSET[id] ?? 'scout').scene;
      c.position.copy(this.slotLocal(i, slots.length));
      c.rotation.y = CREATURE_FACING + (Math.random() - 0.5) * 0.25;
      c.scale.setScalar(CREATURE_DISPLAY_SCALE);
      this.creatures.add(c);
    });
    const mat = this.glass?.material as THREE.MeshStandardMaterial | undefined;
    const startOpacity = mat?.opacity ?? 0.94;
    await tweens.to(1.6, (t) => {
      if (mat) {
        mat.opacity = THREE.MathUtils.lerp(startOpacity, 0.14, t);
        mat.emissiveIntensity = 1 - t * 0.8;
      }
      this.light.intensity = 6 + t * 10;
    });
  }

  /** 解開後顯形的生物輕微晃動（時間停止時不呼叫） */
  update(time: number): void {
    // 封印中：艙體霧氣緩慢呼吸
    const mat = this.glass?.material as THREE.MeshStandardMaterial | undefined;
    if (mat && !this.solved) mat.emissiveIntensity = 0.85 + Math.sin(time * 1.4) * 0.25;
    this.creatures.children.forEach((c, i) => {
      c.position.y = 0.35 + Math.sin(time * 1.3 + i) * 0.01;
    });
  }

  dispose(): void {
    this.readoutN.dispose();
    this.readoutL.dispose();
  }
}
