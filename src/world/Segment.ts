import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { CORRIDOR, recolorAccent } from '../assets/placeholders/environment';
import type { CollisionWorld, Obstacle } from '../core/Collision';
import type { Interactable } from '../core/Interactables';
import { PALETTE } from '../core/palette';
import type { LevelDef } from '../levels/levels';
import type { Puzzle } from '../puzzle';
import { Dust, hazardStripes, lightCone } from './Atmosphere';
import { Beacon } from './Beacon';
import { Chest } from './Chest';
import { Door } from './Door';
import { chipWallGlow, HiddenChip, supplyCrates } from './HiddenChip';
import { HoloProjection } from './HoloProjection';
import { ScanStation } from './ScanStation';
import { SealPod } from './SealPod';
import { buildNook, NOOK } from './UWall';

/*
 * 一段走廊（一關）的配置，區段本地座標（俯視，-Z 往前）。第一段放在原點，第 k 段往 -Z 平移 (k−1) × 44 m。
 *
 *   z = +8   ┌──────┐ 入口（第一段：出生端牆；之後：隔門）
 *            │  ●   │ 出生點 z = +3.5
 *            │      │ 走廊
 *   z = -16  │▓     │ ← 封印艙（貼左牆，中心 z = -20）；需要掃描的關卡，掃描台在艙的入口側
 *   z = -24  ╞══════╡ 門
 *            │      │ 門後走廊
 *            │  ▣   │ 寶箱 z = -33
 *   z = -36  └──────┘ 下一段的入口（最後一段：端牆）
 */
export const LAYOUT = {
  start: 8,
  end: -36,
  spawn: { x: 0, z: 3.5, facing: Math.PI },
  pod: { x: -2.3, z: -20 },
  doorZ: -24,
  chest: { x: 0, z: -33 },
  /** 推演模式鏡頭看的位置 */
  podFocus: new THREE.Vector3(-2.0, 1.55, -20),
  /** 補給箱（右牆中段）：第一關的隱藏晶片藏在它後方牆角 */
  crates: { x: 2.25, z: -10.3 },
  /** 掃描台：封印艙靠入口那一端的前方。從入口直線走到掃描台，離第二關的隱藏晶片約 1.8 m */
  scan: { x: -1.4, z: -15.8 },
  /** 開門演出的鏡位 */
  doorShot: { position: new THREE.Vector3(1.9, 2.0, -14.2), target: new THREE.Vector3(-0.2, 1.7, -24) },
} as const;

/** 一段走廊的長度（第 k 段的位移 = −(k−1) × ZONE_LENGTH） */
export const ZONE_LENGTH = LAYOUT.start - LAYOUT.end;

export interface SegmentOptions {
  readonly def: LevelDef;
  /** 這一段往 -Z 的位移（世界座標 = 本地座標 + oz） */
  readonly oz: number;
  readonly puzzle: Puzzle;
  readonly initialSlots: readonly string[];
  readonly hiddenChipPicked: boolean;
  /** 已掃描過（存檔）：直接顯示接觸點 */
  readonly scanned: boolean;
  /** 入口放端牆（第一段） */
  readonly startCap: boolean;
  /** 出口放端牆（最後一段） */
  readonly endCap: boolean;
}

/**
 * 一關的空間：走廊、封印艙＋全像投影、門、寶箱、隱藏晶片、（需要的話）掃描台、燈光設定。
 * 物件都放在 root（往 -Z 平移 oz），碰撞與互動點換算成世界座標加進共用的 CollisionWorld。
 */
export class Segment {
  readonly def: LevelDef;
  readonly root = new THREE.Group();
  readonly oz: number;
  readonly pod: SealPod;
  readonly holo: HoloProjection;
  readonly door: Door;
  readonly chest: Chest;
  readonly beacons: Beacon[] = [];
  readonly hiddenChip: HiddenChip;
  readonly scanStation: ScanStation | null;
  readonly interactables: Interactable[];
  /** 交給 LightPool 的燈光設定（本身不顯示） */
  readonly corridorLights: THREE.PointLight[] = [];
  readonly doorObstacle: Obstacle;
  private readonly dust: Dust;
  /** U 型死角裡，晶片照在牆上的光暈（第二關） */
  private readonly wallGlow: THREE.Mesh | null = null;

  constructor(assets: AssetLoader, world: CollisionWorld, o: SegmentOptions) {
    this.def = o.def;
    this.oz = o.oz;
    this.root.position.z = o.oz;
    const oz = o.oz;
    const hw = CORRIDOR.width / 2;

    // 走廊模組（發光線條換成這一關的顏色）
    for (let z = LAYOUT.start; z > LAYOUT.end; z -= CORRIDOR.length) {
      const seg = assets.get('corridor_straight').scene;
      seg.position.z = z;
      recolorAccent(seg, o.def.corridorColor);
      this.root.add(seg);
    }
    if (o.startCap) {
      const capStart = assets.get('corridor_end').scene;
      capStart.position.z = LAYOUT.start;
      capStart.rotation.y = Math.PI;
      this.root.add(capStart);
    }
    if (o.endCap) {
      const capEnd = assets.get('corridor_end').scene;
      capEnd.position.z = LAYOUT.end;
      this.root.add(capEnd);
    }

    // 封印艙：正面朝 +X（走廊中央）
    this.pod = new SealPod(assets, o.puzzle.readings, o.def.requiresScan && !o.scanned);
    this.pod.object.position.set(LAYOUT.pod.x, 0, LAYOUT.pod.z);
    this.pod.object.rotation.y = Math.PI / 2;
    this.root.add(this.pod.object);
    world.add({ name: `pod${o.def.id}`, minX: -hw, maxX: LAYOUT.pod.x + 0.8, minZ: LAYOUT.pod.z - 2.75 + oz, maxZ: LAYOUT.pod.z + 2.75 + oz });

    const n = o.initialSlots.length;
    const positions = o.initialSlots.map((_, i) => this.pod.holoLocal(i, n));
    this.holo = new HoloProjection(
      assets,
      o.puzzle.species.map((s) => s.id),
      positions,
      o.initialSlots,
    );
    this.pod.object.add(this.holo.object);

    // 門
    this.door = new Door(assets.get('door'));
    this.door.object.position.z = LAYOUT.doorZ;
    this.root.add(this.door.object);
    const dz = LAYOUT.doorZ + oz;
    this.doorObstacle = world.add({ name: `door${o.def.id}`, minX: -2.2, maxX: 2.2, minZ: dz - 0.3, maxZ: dz + 0.3 });
    world.add({ name: `doorFrameL${o.def.id}`, minX: -hw, maxX: -2.2, minZ: dz - 0.4, maxZ: dz + 0.4 });
    world.add({ name: `doorFrameR${o.def.id}`, minX: 2.2, maxX: hw, minZ: dz - 0.4, maxZ: dz + 0.4 });
    // 兩盞警示燈共用一個點光源（省效能）
    [-2.6, 2.6].forEach((x, i) => {
      const b = new Beacon(i === 0);
      b.object.position.set(x, 3.55, LAYOUT.doorZ + 0.55);
      this.beacons.push(b);
      this.root.add(b.object);
    });

    // 寶箱
    this.chest = new Chest(assets.get('chest'));
    this.chest.object.position.set(LAYOUT.chest.x, 0, LAYOUT.chest.z);
    this.root.add(this.chest.object);
    world.add({
      name: `chest${o.def.id}`,
      minX: LAYOUT.chest.x - 0.5,
      maxX: LAYOUT.chest.x + 0.5,
      minZ: LAYOUT.chest.z - 0.35 + oz,
      maxZ: LAYOUT.chest.z + 0.35 + oz,
      height: 0.6,
    });

    // 燈光設定（真的光源由 LightPool 依玩家位置借用）
    const entry = new THREE.PointLight(0x9fd8ff, 14, 14, 2);
    entry.position.set(0, 3.4, -4);
    const mid = new THREE.PointLight(0x7fb8d8, 8, 12, 2);
    mid.position.set(1.5, 3.4, -14);
    const back = new THREE.PointLight(PALETTE.cyanSoft, 8, 12, 2);
    back.position.set(0, 3.4, -30);
    for (const l of [entry, mid, back]) {
      l.visible = false;
      this.corridorLights.push(l);
    }
    this.root.add(entry, mid, back);

    // 氛圍：天花板燈下的光錐、門前與寶箱前的警示斜紋、漂浮灰塵
    for (let z = LAYOUT.start - 2.2; z > LAYOUT.end; z -= 8) {
      const cone = lightCone(0x9fd8ff, 3.9, 1.6, 0.006);
      cone.position.set(0, 3.95, z);
      this.root.add(cone);
    }
    // 收容區的橘紅警示燈條（只有發光材質，不加點光源）
    const warnMat = new THREE.MeshBasicMaterial({ color: PALETTE.warning });
    for (const z of [LAYOUT.pod.z - 3.2, LAYOUT.pod.z + 3.2]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.12), warnMat);
      lamp.position.set(-hw + 0.04, 2.9, z);
      const lamp2 = lamp.clone();
      lamp2.position.x = hw - 0.04;
      this.root.add(lamp, lamp2);
    }
    const podCone = lightCone(PALETTE.cyan, 3.8, 2.2, 0.006);
    podCone.position.set(-1.2, 3.95, LAYOUT.pod.z);
    this.root.add(podCone);
    for (const z of [LAYOUT.doorZ + 0.9, LAYOUT.doorZ - 0.9]) {
      const s = hazardStripes(4.4, 0.6);
      s.position.z = z;
      this.root.add(s);
    }
    this.dust = new Dust(180, { minX: -hw + 0.3, maxX: hw - 0.3, minZ: LAYOUT.end, maxZ: LAYOUT.start, height: 3.6 });
    this.root.add(this.dust.object);

    // 隱藏晶片與它的藏身處
    const hc = o.def.hiddenChip;
    if (hc.hideout === 'crates') {
      const crates = supplyCrates();
      crates.position.set(LAYOUT.crates.x, 0, LAYOUT.crates.z);
      this.root.add(crates);
      const cx = LAYOUT.crates.x;
      const cz = LAYOUT.crates.z + oz;
      world.add({ name: `crates${o.def.id}`, minX: cx - 0.6, maxX: hw, minZ: cz - 0.45, maxZ: cz + 0.45, height: 1.4 });
      world.add({ name: `crateSmall${o.def.id}`, minX: cx - 0.85, maxX: cx - 0.25, minZ: cz + 0.45, maxZ: cz + 1.05, height: 0.6 });
    } else {
      // 左牆 U 型死角，晶片在最裡面
      const nook = buildNook(o.def.corridorColor);
      nook.object.position.set(-hw, 0, hc.z);
      this.root.add(nook.object);
      nook.walls.forEach((w, i) =>
        world.add({ name: `nook${o.def.id}_${i}`, minX: -hw + w.minX, maxX: -hw + w.maxX, minZ: hc.z + w.minZ + oz, maxZ: hc.z + w.maxZ + oz, height: NOOK.height }),
      );
      // 光暈貼在死角後方的走廊牆面，上半部高過短牆：從主走廊遠遠就看得到一閃一閃
      this.wallGlow = chipWallGlow(3.2);
      this.wallGlow.rotation.y = Math.PI / 2;
      this.wallGlow.position.set(-hw + 0.02, hc.y + 0.6, hc.z);
      this.root.add(this.wallGlow);
    }
    this.hiddenChip = new HiddenChip(new THREE.Vector3(hc.x, hc.y, hc.z));
    if (o.hiddenChipPicked) this.hiddenChip.hide();
    this.root.add(this.hiddenChip.object);

    // 掃描台
    this.scanStation = o.def.requiresScan ? new ScanStation() : null;
    if (this.scanStation) {
      this.scanStation.object.position.set(LAYOUT.scan.x, 0, LAYOUT.scan.z);
      // 頂端的螢幕朝向入口（玩家走過來的方向）
      this.root.add(this.scanStation.object);
      if (o.scanned) this.scanStation.setDone();
      const sx = LAYOUT.scan.x;
      const sz = LAYOUT.scan.z + oz;
      world.add({ name: `scan${o.def.id}`, minX: sx - 0.35, maxX: sx + 0.35, minZ: sz - 0.35, maxZ: sz + 0.35, height: 1.5 });
    }

    const level = o.def.id;
    this.interactables = [
      {
        id: 'chip',
        level,
        label: '拾取資料晶片',
        x: hc.x,
        z: hc.z + oz,
        radius: 1.5,
        enabled: () => !this.hiddenChip.picked,
      },
      {
        id: 'pod',
        level,
        label: '檢查封印艙',
        x: LAYOUT.pod.x + 1.7,
        z: LAYOUT.pod.z + oz,
        radius: 2.3,
        enabled: () => !this.pod.solved,
      },
      {
        id: 'chest',
        level,
        label: '開啟寶箱',
        x: LAYOUT.chest.x,
        z: LAYOUT.chest.z + 0.8 + oz,
        radius: 1.6,
        enabled: () => this.door.isOpen && !this.chest.opened,
      },
    ];
    if (this.scanStation) {
      const st = this.scanStation;
      this.interactables.push({
        id: 'scan',
        level,
        label: '掃描接觸點',
        x: LAYOUT.scan.x,
        z: LAYOUT.scan.z + oz,
        radius: 1.5,
        enabled: () => !st.done,
      });
    }
  }

  /** 已經掃描過了嗎（不需要掃描的關卡永遠是 true） */
  get scanned(): boolean {
    return this.scanStation === null || this.scanStation.done;
  }

  /** 區段本地座標 → 世界座標 */
  world(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z + this.oz);
  }

  get spawn(): { x: number; z: number; facing: number } {
    return { x: LAYOUT.spawn.x, z: LAYOUT.spawn.z + this.oz, facing: LAYOUT.spawn.facing };
  }

  get podFocus(): THREE.Vector3 {
    return this.world(LAYOUT.podFocus.x, LAYOUT.podFocus.y, LAYOUT.podFocus.z);
  }

  get doorShot(): { position: THREE.Vector3; target: THREE.Vector3 } {
    const s = LAYOUT.doorShot;
    return { position: this.world(s.position.x, s.position.y, s.position.z), target: this.world(s.target.x, s.target.y, s.target.z) };
  }

  /** 目標標記的位置 */
  marker(what: 'pod' | 'chest' | 'scan'): THREE.Vector3 {
    if (what === 'pod') return this.world(LAYOUT.pod.x + 1.6, 2.7, LAYOUT.pod.z);
    if (what === 'chest') return this.world(LAYOUT.chest.x, 1.5, LAYOUT.chest.z);
    return this.world(LAYOUT.scan.x, 2.1, LAYOUT.scan.z);
  }

  /** time 只在世界時間流動時前進（推演模式時間停止） */
  update(dt: number, time: number): void {
    this.door.update(dt);
    this.chest.update(dt, time);
    this.pod.update(time);
    this.beacons.forEach((b) => b.update(time));
    this.dust.update(time);
    this.hiddenChip.update(dt, time);
    if (this.wallGlow) {
      this.wallGlow.visible = !this.hiddenChip.picked;
      (this.wallGlow.material as THREE.MeshBasicMaterial).opacity = 0.2 + this.hiddenChip.blink * 0.7;
    }
    this.scanStation?.update(time);
  }

  dispose(): void {
    this.pod.dispose();
  }
}
