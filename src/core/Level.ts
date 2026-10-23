import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { CORRIDOR } from '../assets/placeholders/environment';
import type { Puzzle } from '../puzzle';
import { Door } from '../world/Door';
import { LightPool } from '../world/LightPool';
import { Segment, ZONE_LENGTH } from '../world/Segment';
import { SIDE_ROOM } from '../world/SideRoom';
import { CollisionWorld, type Obstacle } from './Collision';
import type { GameAudio } from './Audio';
import type { Interactable } from './Interactables';
import type { Tweens } from './Tweens';

export { LAYOUT, ZONE_LENGTH } from '../world/Segment';

/** 超過這個距離的區段不畫（霧在 40 m 已經 99% 以上，看不出差別） */
const DRAW_DISTANCE = 40;

/** 兩段走廊交界的隔門：新的一段建好時是開的，玩家走進新的一段後關上，關好才卸載上一段 */
interface Bulkhead {
  readonly door: Door;
  readonly obstacle: Obstacle;
  /** 屬於後面那一段 */
  readonly segment: Segment;
}

/*
 * 無限走廊（俯視，-Z 往前）：第 k 段放在 z = −(k−1) × 44。最多同時存在 2 段。
 *
 *   第 k 段的大門開啟 → 在門後接上第 k+1 段（入口的隔門是開的）
 *   玩家走進第 k+1 段 → 隔門關上 → 卸載第 k 段
 */
export class Level {
  readonly root = new THREE.Group();
  readonly world: CollisionWorld;
  readonly ceiling = CORRIDOR.height;
  readonly segments: Segment[] = [];
  private readonly bulkheads: Bulkhead[] = [];
  /** 場景裡真正的點光源（數量固定）：走廊 3、封印艙 1、警示燈 1、寶箱 1 */
  private readonly hemi = new THREE.HemisphereLight(0x7898b2, 0x0c1218, 2.0);
  private readonly hemiColor = new THREE.Color(0x7898b2);
  private readonly red = new THREE.Color(0xff3020);
  private readonly pools = { corridor: new LightPool(3), pod: new LightPool(1), beacon: new LightPool(1), chest: new LightPool(1) };

  constructor(private readonly assets: AssetLoader) {
    this.world = new CollisionWorld({ minX: -SIDE_ROOM.outer, maxX: SIDE_ROOM.outer, minZ: 0, maxZ: 0 });
    this.root.add(this.hemi);
    for (const p of Object.values(this.pools)) this.root.add(p.object);
  }

  get interactables(): Interactable[] {
    return this.segments.flatMap((s) => s.interactables);
  }

  /** 接上第 index 道門的那一段（題目、側室由呼叫端決定） */
  addSegment(index: number, puzzle: Puzzle, accentColor: number, room: number | null): Segment {
    const seg = new Segment(this.assets, this.world, {
      index,
      oz: -(index - 1) * ZONE_LENGTH,
      puzzle,
      accentColor,
      room,
      startCap: this.segments.length === 0,
    });
    this.segments.push(seg);
    this.root.add(seg.root);
    this.pools.corridor.add(...seg.corridorLights);
    this.pools.pod.add(seg.pod.light);
    this.pools.beacon.add(...seg.beacons.map((b) => b.light));
    if (seg.chest) this.pools.chest.add(seg.chest.light);

    // 不是第一段：入口放一道開著的隔門（和大門同一個模型）
    if (this.segments.length > 1) {
      const door = new Door(this.assets.get('door'));
      const z = seg.startZ;
      door.object.position.z = z;
      door.setOpen();
      this.root.add(door.object);
      const hw = CORRIDOR.width / 2;
      const obstacle = this.world.add({ name: 'bulkhead', tag: seg.tag, minX: -2.2, maxX: 2.2, minZ: z - 0.3, maxZ: z + 0.3, enabled: false });
      this.world.add({ name: 'bulkheadL', tag: seg.tag, minX: -hw, maxX: -2.2, minZ: z - 0.4, maxZ: z + 0.4 });
      this.world.add({ name: 'bulkheadR', tag: seg.tag, minX: 2.2, maxX: hw, minZ: z - 0.4, maxZ: z + 0.4 });
      this.bulkheads.push({ door, obstacle, segment: seg });
    }
    this.updateBounds();
    return seg;
  }

  /** 玩家走進 seg 之後：關上入口的隔門，關好後卸載前面的段落 */
  async sealBehind(seg: Segment, tweens: Tweens, audio: GameAudio): Promise<void> {
    const b = this.bulkheads.find((x) => x.segment === seg);
    if (!b || !b.door.isOpen) return;
    b.obstacle.enabled = true;
    await b.door.close(tweens, audio);
    for (const old of this.segments.filter((s) => s.index < seg.index)) this.removeSegment(old);
  }

  private removeSegment(seg: Segment): void {
    const i = this.segments.indexOf(seg);
    if (i < 0) return;
    this.segments.splice(i, 1);
    this.root.remove(seg.root);
    this.world.removeTag(seg.tag);
    this.pools.corridor.remove(...seg.corridorLights);
    this.pools.pod.remove(seg.pod.light);
    this.pools.beacon.remove(...seg.beacons.map((b) => b.light));
    if (seg.chest) this.pools.chest.remove(seg.chest.light);
    // 這一段入口的隔門也一起拿掉（後面那一段入口的隔門留著，當作新的端牆）
    for (let k = this.bulkheads.length - 1; k >= 0; k--) {
      if (this.bulkheads[k].segment !== seg) continue;
      this.root.remove(this.bulkheads[k].door.object);
      this.bulkheads.splice(k, 1);
    }
    seg.dispose();
    this.updateBounds();
  }

  /** 可走範圍：前後是目前存在的段落，左右含側室 */
  private updateBounds(): void {
    const b = this.world.bounds;
    b.maxZ = Math.max(...this.segments.map((s) => s.startZ));
    b.minZ = Math.min(...this.segments.map((s) => s.endZ));
  }

  /** 第 index 道門的那一段（已卸載則回傳 undefined） */
  segment(index: number): Segment | undefined {
    return this.segments.find((s) => s.index === index);
  }

  /** 世界座標 z 落在哪一段 */
  segmentAt(z: number): Segment | undefined {
    return this.segments.find((s) => z <= s.startZ && z > s.endZ);
  }

  /**
   * 走廊轉紅（0 = 正常，1 = 全紅）：保全警報或低電力。只改顏色，光源數量不變。
   */
  setRed(amount: number, beaconsAlarm: boolean): void {
    this.pools.corridor.setTint(amount);
    this.pools.pod.setTint(amount);
    this.hemi.color.copy(this.hemiColor).lerp(this.red, amount * 0.6);
    for (const s of this.segments) s.beacons.forEach((b) => b.setAlarm(beaconsAlarm));
  }

  /** 燈光池依 focus（玩家位置）挑最近的燈。instant：直接到位（開局時） */
  updateLights(dt: number, focus: THREE.Vector3, instant = false): void {
    if (instant) this.root.updateMatrixWorld(true);
    for (const p of Object.values(this.pools)) p.update(dt, focus, instant);
  }

  /** 離鏡頭太遠的段落不畫（省 draw call） */
  updateVisibility(camera: THREE.Vector3): void {
    for (const seg of this.segments) {
      const top = seg.startZ;
      const bottom = seg.endZ;
      const dist = camera.z > top ? camera.z - top : camera.z < bottom ? bottom - camera.z : 0;
      seg.root.visible = dist < DRAW_DISTANCE;
    }
  }

  update(dt: number, time: number): void {
    for (const s of this.segments) s.update(dt, time);
    for (const b of this.bulkheads) b.door.update(dt);
  }

  dispose(): void {
    for (const s of [...this.segments]) this.removeSegment(s);
  }
}

