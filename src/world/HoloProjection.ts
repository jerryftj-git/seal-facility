import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { SPECIES_ASSET, type AssetId } from '../assets/manifest';
import { PLACEHOLDER_FEET } from '../assets/placeholders/creatures';
import { applyMaterial, glowMaterial, hologramMaterial } from '../core/materials';
import { PALETTE } from '../core/palette';

const MORPH_TIME = 0.3;
const HOLO_SCALE = 0.72;
/** 斜向面對鏡頭（3/4 側面），剪影好認、又不會和隔壁重疊 */
const FACING = Math.PI / 2 - 0.65;

/** 觸地點發光標記：每隻生物腳下的受力點，是題目的物理事實（QUESTIONS Q1 決定開啟） */
let footGeo: THREE.CircleGeometry | null = null;

/** 找出模型的觸地點：glb 用 foot* 節點，佔位模型用預設座標 */
function footPoints(model: THREE.Object3D, speciesId: string): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (/^foot/i.test(o.name)) pts.push(model.worldToLocal(o.getWorldPosition(new THREE.Vector3())).setY(0));
  });
  if (pts.length) return pts;
  return (PLACEHOLDER_FEET[speciesId] ?? []).map(([x, z]) => new THREE.Vector3(x, 0, z));
}

interface Slot {
  root: THREE.Group;
  forms: Map<string, THREE.Object3D>;
  materials: THREE.ShaderMaterial[];
  current: string;
  previous: string | null;
  /** 0..1，1 = 變形完成 */
  morph: number;
}

/**
 * 推演模式時在艙前投影出的一排全像生物。
 * 每個 slot 預先放好所有種類的模型，變形時切換顯示並播放「壓扁 → 閃光 → 長出」的動畫。
 */
export class HoloProjection {
  readonly object = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly base: THREE.Mesh;
  private color = new THREE.Color(PALETTE.cyan);
  private opacity = 0;

  constructor(assets: AssetLoader, speciesIds: readonly string[], positions: readonly THREE.Vector3[], initial: readonly string[]) {
    positions.forEach((pos, i) => {
      const root = new THREE.Group();
      root.position.copy(pos);
      root.rotation.y = FACING;
      const forms = new Map<string, THREE.Object3D>();
      const materials: THREE.ShaderMaterial[] = [];
      for (const id of speciesIds) {
        const model = assets.get((SPECIES_ASSET[id] ?? 'scout') as AssetId).scene;
        const mat = hologramMaterial(PALETTE.cyan);
        const feet = footPoints(model, id);
        applyMaterial(model, mat);
        // 每個觸地點一個發光小圓
        footGeo ??= new THREE.CircleGeometry(0.05, 12);
        for (const p of feet) {
          const dot = new THREE.Mesh(footGeo, mat);
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(p.x, 0.012, p.z);
          dot.scale.setScalar(1.6);
          model.add(dot);
        }
        model.scale.setScalar(HOLO_SCALE);
        model.visible = id === initial[i];
        model.renderOrder = 3;
        model.traverse((o) => (o.renderOrder = 3));
        root.add(model);
        forms.set(id, model);
        materials.push(mat);
      }
      this.object.add(root);
      this.slots.push({ root, forms, materials, current: initial[i], previous: null, morph: 1 });
    });

    // 投影底座：一條淡淡的發光平面
    const first = positions[0];
    const last = positions[positions.length - 1];
    const len = first.distanceTo(last) + 0.9;
    const mid = first.clone().add(last).multiplyScalar(0.5);
    this.base = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.7), glowMaterial(PALETTE.cyan, 0.12));
    (this.base.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
    (this.base.material as THREE.MeshBasicMaterial).depthWrite = false;
    (this.base.material as THREE.MeshBasicMaterial).fog = false;
    // positions 是封印艙的本地座標，slot 沿 X 軸排列
    this.base.rotation.x = -Math.PI / 2;
    this.base.position.set(mid.x, mid.y - 0.01, mid.z);
    this.base.renderOrder = 3;
    this.object.add(this.base);
    this.setOpacity(0);
  }

  /** 讓第 slot 隻變成 species */
  morph(slot: number, species: string): void {
    const s = this.slots[slot];
    if (!s || s.current === species) return;
    s.previous = s.current;
    s.current = species;
    s.morph = 0;
  }

  setColor(color: THREE.ColorRepresentation): void {
    this.color.set(color);
    for (const s of this.slots) for (const m of s.materials) m.uniforms.uColor.value.copy(this.color);
    (this.base.material as THREE.MeshBasicMaterial).color.copy(this.color);
  }

  setOpacity(o: number): void {
    this.opacity = o;
    this.object.visible = o > 0.001;
    (this.base.material as THREE.MeshBasicMaterial).opacity = 0.12 * o;
  }

  update(dt: number, time: number): void {
    if (!this.object.visible) return;
    for (const s of this.slots) {
      s.morph = Math.min(1, s.morph + dt / MORPH_TIME);
      const t = s.morph;
      const showingOld = t < 0.5 && s.previous !== null;
      const visibleId = showingOld ? s.previous! : s.current;
      for (const [id, model] of s.forms) model.visible = id === visibleId;
      // 前半段舊形態被壓扁，後半段新形態長出來
      const k = showingOld ? 1 - t * 2 : s.previous !== null ? (t - 0.5) * 2 : 1;
      const squash = 0.08 + 0.92 * k;
      const model = s.forms.get(visibleId)!;
      model.scale.set(HOLO_SCALE * (1 + (1 - k) * 0.35), HOLO_SCALE * squash, HOLO_SCALE * (1 + (1 - k) * 0.35));
      const flash = t < 1 ? Math.sin(t * Math.PI) : 0;
      for (const m of s.materials) {
        m.uniforms.uTime.value = time;
        m.uniforms.uFlash.value = flash;
        m.uniforms.uOpacity.value = this.opacity;
      }
      if (t >= 1) s.previous = null;
    }
  }
}
