import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { CORRIDOR } from '../assets/placeholders/environment';
import type { LevelDef } from '../levels/levels';
import type { Puzzle } from '../puzzle';
import { Door } from '../world/Door';
import { LightPool } from '../world/LightPool';
import { LAYOUT, Segment, ZONE_LENGTH } from '../world/Segment';
import { CollisionWorld, type Obstacle } from './Collision';
import type { GameAudio } from './Audio';
import type { Interactable } from './Interactables';
import type { Tweens } from './Tweens';

export { LAYOUT, ZONE_LENGTH } from '../world/Segment';

/** 超過這個距離的區段不畫（霧在 40 m 已經 99% 以上，看不出差別） */
const DRAW_DISTANCE = 40;

export interface LevelSetup {
  readonly def: LevelDef;
  readonly puzzle: Puzzle;
  readonly initialSlots: readonly string[];
  readonly hiddenChipPicked: boolean;
  readonly scanned: boolean;
}

/** 兩段走廊之間的隔門：上一關結算按「繼續前進」才打開 */
interface Gate {
  readonly door: Door;
  readonly obstacle: Obstacle;
  /** 隔門的世界座標 z */
  readonly z: number;
}

/*
 * 一個區域（俯視，-Z 往前）：各關的走廊依序往 -Z 接起來，中間用隔門分開。
 *
 *   z = +8    第一段入口端牆
 *   z = -36   隔門（第一關結算「繼續前進」後打開）→ 第二段（紫色線條）
 *   z = -80   第二段出口端牆
 */
export class Level {
  readonly root = new THREE.Group();
  readonly world: CollisionWorld;
  readonly ceiling = CORRIDOR.height;
  readonly segments: Segment[] = [];
  readonly gates: Gate[] = [];
  readonly interactables: Interactable[] = [];
  /** 場景裡真正的點光源（數量固定）：走廊 3、封印艙 1、警示燈 1、寶箱 1——和只有第一段時一樣 */
  private readonly pools = { corridor: new LightPool(3), pod: new LightPool(1), beacon: new LightPool(1), chest: new LightPool(1) };

  constructor(assets: AssetLoader, setups: readonly LevelSetup[]) {
    const hw = CORRIDOR.width / 2;
    const last = setups.length - 1;
    this.world = new CollisionWorld({ minX: -hw, maxX: hw, minZ: LAYOUT.end - last * ZONE_LENGTH, maxZ: LAYOUT.start });

    setups.forEach((s, i) => {
      const seg = new Segment(assets, this.world, {
        ...s,
        oz: -i * ZONE_LENGTH,
        startCap: i === 0,
        endCap: i === last,
      });
      this.segments.push(seg);
      this.root.add(seg.root);
      this.interactables.push(...seg.interactables);
      this.pools.corridor.add(...seg.corridorLights);
      this.pools.pod.add(seg.pod.light);
      this.pools.beacon.add(...seg.beacons.map((b) => b.light));
      this.pools.chest.add(seg.chest.light);

      // 和上一段之間的隔門（在這一段的入口）
      if (i > 0) {
        const door = new Door(assets.get('door'));
        const z = LAYOUT.start + seg.oz;
        door.object.position.z = z;
        this.root.add(door.object);
        const obstacle = this.world.add({ name: `gate${s.def.id}`, minX: -2.2, maxX: 2.2, minZ: z - 0.3, maxZ: z + 0.3 });
        this.world.add({ name: `gateFrameL${s.def.id}`, minX: -hw, maxX: -2.2, minZ: z - 0.4, maxZ: z + 0.4 });
        this.world.add({ name: `gateFrameR${s.def.id}`, minX: 2.2, maxX: hw, minZ: z - 0.4, maxZ: z + 0.4 });
        this.gates.push({ door, obstacle, z });
      }
    });

    // 一盞半球光打底（全區域共用）＋點光源池
    this.root.add(new THREE.HemisphereLight(0x7898b2, 0x0c1218, 2.0));
    for (const p of Object.values(this.pools)) this.root.add(p.object);
  }

  /** 關卡編號 → 區段 */
  segment(levelId: number): Segment {
    const seg = this.segments.find((s) => s.def.id === levelId);
    if (!seg) throw new Error(`這個區域沒有第 ${levelId} 關`);
    return seg;
  }

  /** 世界座標 z 落在哪一段（給自動存檔判斷「走進第二段」） */
  segmentAt(z: number): Segment {
    const i = THREE.MathUtils.clamp(Math.floor((LAYOUT.start - z) / ZONE_LENGTH), 0, this.segments.length - 1);
    return this.segments[i];
  }

  /** 打開通往 levelId 那一段的隔門 */
  async openGate(levelId: number, tweens: Tweens, audio: GameAudio): Promise<void> {
    const i = this.segments.findIndex((s) => s.def.id === levelId);
    const gate = this.gates[i - 1];
    if (!gate || gate.door.isOpen) return;
    await gate.door.open(tweens, audio);
    gate.obstacle.enabled = false;
  }

  /**
   * 燈光池依 focus（玩家位置）挑最近的燈。instant：直接到位（建好關卡、換位置時）。
   */
  updateLights(dt: number, focus: THREE.Vector3, instant = false): void {
    if (instant) this.root.updateMatrixWorld(true);
    for (const p of Object.values(this.pools)) p.update(dt, focus, instant);
  }

  /**
   * 看不到的區段整段不畫（省 draw call）：隔著一道關著的隔門、或離鏡頭太遠。
   * 第一關隔門打開前，第二段完全不畫，畫面負擔和只有第一段時一樣。
   */
  updateVisibility(camera: THREE.Vector3): void {
    const here = this.segments.indexOf(this.segmentAt(camera.z));
    this.segments.forEach((seg, i) => {
      const top = LAYOUT.start + seg.oz;
      const bottom = LAYOUT.end + seg.oz;
      const dist = camera.z > top ? camera.z - top : camera.z < bottom ? bottom - camera.z : 0;
      let open = true;
      // gates[k] 在第 k 段和第 k+1 段之間
      for (let k = Math.min(i, here); k < Math.max(i, here); k++) open &&= this.gates[k].door.isOpen;
      seg.root.visible = dist < DRAW_DISTANCE && open;
    });
  }

  /** time 只在世界時間流動時前進（推演模式時間停止） */
  update(dt: number, time: number): void {
    for (const s of this.segments) s.update(dt, time);
    for (const g of this.gates) g.door.update(dt);
  }

  dispose(): void {
    for (const s of this.segments) s.dispose();
  }
}
