import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { SPECIES_ASSET } from '../assets/manifest';
import { PALETTE } from '../core/palette';
import type { Tweens } from '../core/Tweens';
import { Readout } from './Readout';

const CYAN = '#2ee6f0';

/** 艙內生物（全像投影與真實生物共用）的縮放，兩者大小一致才會「和投影一致」 */
export const CREATURE_DISPLAY_SCALE = 0.85;

/**
 * 8 隻以上時的排法：排成一列（不前後交錯）、拉開到艙的兩端、整體縮小一點，
 * 從推演鏡頭看 8 隻獵獸也不會重疊（用輪廓逐像素量過）。7 隻以下維持原本的排法。
 */
const CROWDED = { from: 8, halfSpan: 2.1, scale: 0.82 } as const;

/** n 隻時每隻生物的顯示縮放（全像投影與真實生物共用） */
export function creatureScale(n: number): number {
  return n >= CROWDED.from ? CREATURE_DISPLAY_SCALE * CROWDED.scale : CREATURE_DISPLAY_SCALE;
}

/** 艙內生物的朝向：3/4 側面，剪影（腳數）好認，身長佔的寬度又不會太大 */
export const CREATURE_FACING = Math.PI / 2 - 0.8;
const GREEN = '#3dff8a';

/**
 * 封印艙：不透明培養槽 + 兩個讀數。解開後除霧、顯出真實生物。
 * slot 位置由模型裡的 slots_start / slots_end 決定，全像投影也用同一組位置。
 */
export class SealPod {
  readonly object: THREE.Object3D;
  readonly readoutN = new Readout('看到的生物');
  readonly readoutL = new Readout('地上的接觸點');
  private readonly glass: THREE.Mesh | null;
  /**
   * 艙內燈光。本身不顯示（visible = false），由 LightPool 依玩家位置借一盞真的點光源照它的設定亮，
   * 場景裡的光源數量才固定（光源數量一變，所有材質都要重新編譯 shader）。
   */
  readonly light = new THREE.PointLight(PALETTE.cyan, 6, 6, 2);
  private readonly creatures = new THREE.Group();
  private readonly start = new THREE.Vector3(1.85, 0.35, 0);
  private readonly end = new THREE.Vector3(-1.85, 0.35, 0);
  solved = false;

  /**
   * @param hideL 還沒掃描：地上的接觸點顯示「？？」
   */
  constructor(
    private readonly assets: AssetLoader,
    private readings: { N: number; L: number },
    hideL = false,
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
    this.readoutL.set(hideL ? null : readings.L, CYAN);

    this.light.position.set(0, 2.1, 0.2);
    this.light.visible = false;
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
    if (n >= CROWDED.from) {
      // 一列排開，兩端拉到 ±halfSpan
      const mid = this.start.clone().lerp(this.end, 0.5);
      const half = this.start.clone().sub(mid).setLength(CROWDED.halfSpan);
      return mid.clone().add(half).lerp(mid.clone().sub(half), t);
    }
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
      c.scale.setScalar(creatureScale(slots.length));
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

  /**
   * 掃描地面：一道青色光線從艙的一端掃到另一端，同時「地上的接觸點」從 0 數到 L。
   */
  async scan(tweens: Tweens, duration: number): Promise<void> {
    const half = Math.abs(this.start.x) + 0.6;
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const sheetMat = mat.clone();
    sheetMat.opacity = 0.18;
    const sweep = new THREE.Group();
    // 地面上的亮線（沿艙的深度方向）＋一片淡淡的垂直光幕
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.3), mat);
    line.rotation.x = -Math.PI / 2;
    line.position.y = this.start.y + 0.01;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.3), sheetMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = this.start.y + 0.005;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.9), sheetMat);
    sheet.rotation.y = Math.PI / 2;
    sheet.position.y = this.start.y + 0.95;
    sweep.add(line, glow, sheet);
    sweep.traverse((o) => (o.renderOrder = 4));
    this.object.add(sweep);
    await tweens.to(duration, (t) => {
      sweep.position.x = half - t * half * 2;
      this.readoutL.set(Math.round(this.readings.L * t), CYAN);
      mat.opacity = t < 0.9 ? 1 : (1 - t) * 10;
      sheetMat.opacity = 0.18 * (t < 0.9 ? 1 : (1 - t) * 10);
    });
    this.readoutL.set(this.readings.L, CYAN);
    this.object.remove(sweep);
    sweep.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    mat.dispose();
    sheetMat.dispose();
  }

  /**
   * 重新佈署生物（答錯換題）：N 不變、換成新的 L。艙體閃一下、讀數跳成新數字。
   * showL：已經掃描過（或不需要掃描）才顯示數字，不然維持「？？」。
   */
  async redeploy(tweens: Tweens, readings: { N: number; L: number }, showL: boolean): Promise<void> {
    this.readings = readings;
    const mat = this.glass?.material as THREE.MeshStandardMaterial | undefined;
    await tweens.to(0.9, (t) => {
      const flash = Math.sin(t * Math.PI);
      if (mat) mat.emissiveIntensity = 1 + flash * 2.5;
      this.light.intensity = 6 + flash * 10;
      // 數字亂跳一陣，最後停在新的 L
      if (showL) this.readoutL.set(t < 0.85 ? 2 * Math.floor(Math.random() * (readings.N + 1)) + 2 * readings.N : readings.L, CYAN);
    });
    this.light.intensity = 6;
    this.readoutL.set(showL ? readings.L : null, CYAN);
  }

  /** 已經掃描過（存檔）：直接顯示接觸點 */
  showL(): void {
    this.readoutL.set(this.readings.L, CYAN);
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
