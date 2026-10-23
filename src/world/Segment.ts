import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { CORRIDOR, recolorAccent } from '../assets/placeholders/environment';
import type { CollisionWorld, Obstacle, Rect } from '../core/Collision';
import type { Interactable } from '../core/Interactables';
import { PALETTE } from '../core/palette';
import { SCOUT, type Puzzle } from '../puzzle';
import { Dust, hazardStripes, lightCone } from './Atmosphere';
import { Battery, batteryWallGlow } from './Battery';
import { Beacon } from './Beacon';
import { Chest } from './Chest';
import { Door } from './Door';
import { HoloProjection } from './HoloProjection';
import { Keypad } from './Keypad';
import { ScanStation } from './ScanStation';
import { SealPod } from './SealPod';
import { buildSideRoom, roomBatteryPos, roomCenterZ, SIDE_ROOM, sideRoomBlocks, type SideRoomSpot } from './SideRoom';

/*
 * 一段走廊（一道門）的模板，區段本地座標（俯視，-Z 往前）。第 k 段往 -Z 平移 (k−1) × 44 m。
 *
 *   z = +8   ┌──────┐ 入口（第 1 段：端牆；之後：隔門，走進來後關上）
 *            │      │ 出生點 z = +3.5（只有第 1 段）
 *   z = -2   ◫      │ 候選側室 A（左）
 *   z = -10  │      ◫ 候選側室 B（右）
 *   z = -16  │▓ ⊙   │ ← 掃描台 ⊙、封印艙 ▓（貼左牆，中心 z = -20）
 *   z = -24  ╞════⌗═╡ 大門（右側門框上是密碼盤 ⌗）
 *   z = -26  │  ▣   │ 寶箱（門後 2 m）
 *   z = -30  │      ◫ 候選側室 C（右）
 *   z = -36  └──────┘ 下一段的入口
 * 三間候選側室每段隨機開一間，隱藏小電池放在最裡面。
 */
export const LAYOUT = {
  start: 8,
  end: -36,
  spawn: { x: 0, z: 3.5, facing: Math.PI },
  pod: { x: -2.3, z: -20 },
  doorZ: -24,
  /** 寶箱：大門後 2 m */
  chest: { x: 0, z: -26 },
  /** 推演模式鏡頭看的位置 */
  podFocus: new THREE.Vector3(-2.0, 1.55, -20),
  /** 密碼盤的互動點：大門右側門框前（門框正面在 z −23.6） */
  keypad: { x: 2.0, z: -22.9 },
  /** 掃描台：封印艙靠入口那一端的前方 */
  scan: { x: -1.4, z: -15.8 },
  /** 答對演出的鏡位：同一個畫面看得到封印艙（變形）和大門（開門），鏡頭只移動一次 */
  solvedShot: { position: new THREE.Vector3(2.4, 2.3, -11.2), target: new THREE.Vector3(-0.9, 1.4, -21.6) },
  /** 候選側室（每段開其中一間） */
  sideRooms: [
    { side: -1, moduleZ: 0 },
    { side: 1, moduleZ: -8 },
    { side: 1, moduleZ: -28 },
  ] as readonly SideRoomSpot[],
} as const;

/** 一段走廊的長度（第 k 段的位移 = −(k−1) × ZONE_LENGTH） */
export const ZONE_LENGTH = LAYOUT.start - LAYOUT.end;

export interface SegmentOptions {
  /** 第幾道門（1 起算） */
  readonly index: number;
  /** 這一段往 -Z 的位移（世界座標 = 本地座標 + oz） */
  readonly oz: number;
  readonly puzzle: Puzzle;
  /** 走廊線條顏色 */
  readonly accentColor: number;
  /**
   * 這一道門有沒有電池、開哪一間側室（LAYOUT.sideRooms 的編號）。
   * null = 這一道門沒有補給：門後不放寶箱、也沒有側室與隱藏小電池。
   */
  readonly room: number | null;
  /** 入口放端牆（第 1 段）；之後的段落入口是 Level 管的隔門 */
  readonly startCap: boolean;
}

/**
 * 一道門的空間：走廊、掃描台、封印艙＋全像投影、大門與密碼盤、門後寶箱、側室與隱藏小電池、燈光設定。
 * 物件都放在 root（往 -Z 平移 oz），碰撞與互動點換算成世界座標加進共用的 CollisionWorld（tag = 這一段）。
 */
export class Segment {
  readonly index: number;
  readonly root = new THREE.Group();
  readonly oz: number;
  readonly tag: string;
  readonly pod: SealPod;
  readonly holo: HoloProjection;
  readonly door: Door;
  /** 門後寶箱（沒有補給的門是 null） */
  readonly chest: Chest | null;
  readonly beacons: Beacon[] = [];
  /** 側室裡的隱藏小電池（沒有補給的門是 null） */
  readonly battery: Battery | null;
  readonly scanStation = new ScanStation();
  /** 大門右側門框上的密碼盤 */
  readonly keypad = new Keypad();
  readonly interactables: Interactable[];
  /** 交給 LightPool 的燈光設定（本身不顯示） */
  readonly corridorLights: THREE.PointLight[] = [];
  readonly doorObstacle: Obstacle;
  readonly roomSpot: SideRoomSpot | null;
  private readonly dust: Dust;
  /** 側室裡電池照在牆上、從門洞漏到走廊地上的光暈 */
  private readonly glows: THREE.Mesh[] = [];

  constructor(assets: AssetLoader, world: CollisionWorld, o: SegmentOptions) {
    this.index = o.index;
    this.oz = o.oz;
    this.tag = `seg${o.index}`;
    this.root.position.z = o.oz;
    const oz = o.oz;
    const hw = CORRIDOR.width / 2;
    const tag = this.tag;
    const add = (r: Rect & { name: string; height?: number }) => world.add({ ...r, minZ: r.minZ + oz, maxZ: r.maxZ + oz, tag });

    // 走廊模組（發光線條換成這一段的顏色）；開側室的那一節換成有門洞的版本
    const spot = o.room === null ? null : LAYOUT.sideRooms[o.room % LAYOUT.sideRooms.length];
    this.roomSpot = spot;
    for (let z = LAYOUT.start; z > LAYOUT.end; z -= CORRIDOR.length) {
      if (z === spot?.moduleZ) continue;
      const seg = assets.get('corridor_straight').scene;
      seg.position.z = z;
      recolorAccent(seg, o.accentColor);
      this.root.add(seg);
    }
    if (spot) this.root.add(buildSideRoom(spot, o.accentColor));
    if (o.startCap) {
      const capStart = assets.get('corridor_end').scene;
      capStart.position.z = LAYOUT.start;
      capStart.rotation.y = Math.PI;
      this.root.add(capStart);
    }

    // 走廊兩側的實心範圍（側室所在的那一段留空）
    const RW = SIDE_ROOM.width / 2;
    for (const side of [-1, 1] as const) {
      const x = side > 0 ? { minX: hw, maxX: SIDE_ROOM.outer } : { minX: -SIDE_ROOM.outer, maxX: -hw };
      if (spot && side === spot.side) {
        const zc = roomCenterZ(spot);
        add({ name: `wall${side}a`, ...x, minZ: zc + RW, maxZ: LAYOUT.start });
        add({ name: `wall${side}b`, ...x, minZ: LAYOUT.end, maxZ: zc - RW });
        sideRoomBlocks(spot).forEach((r, i) => add({ name: `room${i}`, ...r }));
      } else {
        add({ name: `wall${side}`, ...x, minZ: LAYOUT.end, maxZ: LAYOUT.start });
      }
    }

    // 封印艙：正面朝 +X（走廊中央）；地上的接觸點掃描後才顯示
    this.pod = new SealPod(assets, o.puzzle.readings, true);
    this.pod.object.position.set(LAYOUT.pod.x, 0, LAYOUT.pod.z);
    this.pod.object.rotation.y = Math.PI / 2;
    this.root.add(this.pod.object);
    add({ name: 'pod', minX: -hw, maxX: LAYOUT.pod.x + 0.8, minZ: LAYOUT.pod.z - 2.75, maxZ: LAYOUT.pod.z + 2.75 });

    // 全像投影：一開始全部是偵察體（假設法的第一步）
    const n = o.puzzle.readings.N;
    const slots = Array<string>(n).fill(SCOUT.id);
    this.holo = new HoloProjection(
      assets,
      o.puzzle.species.map((s) => s.id),
      slots.map((_, i) => this.pod.holoLocal(i, n)),
      slots,
    );
    this.pod.object.add(this.holo.object);

    // 大門與密碼盤
    this.door = new Door(assets.get('door'));
    this.door.object.position.z = LAYOUT.doorZ;
    this.root.add(this.door.object);
    const dz = LAYOUT.doorZ;
    this.doorObstacle = add({ name: 'door', minX: -2.2, maxX: 2.2, minZ: dz - 0.3, maxZ: dz + 0.3 });
    add({ name: 'doorFrameL', minX: -hw, maxX: -2.2, minZ: dz - 0.4, maxZ: dz + 0.4 });
    add({ name: 'doorFrameR', minX: 2.2, maxX: hw, minZ: dz - 0.4, maxZ: dz + 0.4 });
    this.keypad.object.position.set(hw - 0.4, 1.35, dz + 0.43);
    this.root.add(this.keypad.object);
    // 兩盞警示燈共用一個點光源（省效能）
    [-2.6, 2.6].forEach((x, i) => {
      const b = new Beacon(i === 0);
      b.object.position.set(x, 3.55, dz + 0.55);
      this.beacons.push(b);
      this.root.add(b.object);
    });

    // 門後寶箱（大電池）：只有有補給的門才放
    this.chest = spot ? new Chest(assets.get('chest')) : null;
    if (this.chest) {
      this.chest.object.position.set(LAYOUT.chest.x, 0, LAYOUT.chest.z);
      this.root.add(this.chest.object);
      add({
        name: 'chest',
        minX: LAYOUT.chest.x - 0.5,
        maxX: LAYOUT.chest.x + 0.5,
        minZ: LAYOUT.chest.z - 0.35,
        maxZ: LAYOUT.chest.z + 0.35,
        height: 0.6,
      });
    }

    // 掃描台
    this.scanStation.object.position.set(LAYOUT.scan.x, 0, LAYOUT.scan.z);
    this.root.add(this.scanStation.object);
    add({ name: 'scan', minX: LAYOUT.scan.x - 0.35, maxX: LAYOUT.scan.x + 0.35, minZ: LAYOUT.scan.z - 0.35, maxZ: LAYOUT.scan.z + 0.35, height: 1.5 });

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

    // 氛圍：天花板燈下的光錐、門前的警示斜紋、收容區警示燈條、漂浮灰塵
    for (let z = LAYOUT.start - 2.2; z > LAYOUT.end; z -= 8) {
      const cone = lightCone(0x9fd8ff, 3.9, 1.6, 0.006);
      cone.position.set(0, 3.95, z);
      this.root.add(cone);
    }
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

    // 側室最裡面的隱藏小電池；光暈照在房間後牆，也從門洞漏到走廊地上（從主走廊就看得到一閃一閃）
    this.battery = null;
    const door = o.index;
    const extra: Interactable[] = [];
    if (spot) {
      const bp = roomBatteryPos(spot);
      const zc = roomCenterZ(spot);
      const battery = new Battery(bp);
      this.battery = battery;
      this.root.add(battery.object);
      const s = spot.side;
      const wallGlow = batteryWallGlow(2.6);
      wallGlow.rotation.y = -s * (Math.PI / 2);
      wallGlow.position.set(s * (hw + SIDE_ROOM.depth - 0.02), 1.4, zc);
      const floorGlow = batteryWallGlow(2.4);
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.set(s * (hw - 0.9), 0.02, zc);
      this.glows.push(wallGlow, floorGlow);
      this.root.add(wallGlow, floorGlow);
      extra.push({ id: 'battery', door, label: '拾取電池', x: bp.x, z: bp.z + oz, radius: 1.5, enabled: () => !battery.picked });
    }
    const chest = this.chest;
    if (chest) {
      extra.push({
        id: 'chest',
        door,
        label: '開啟寶箱',
        x: LAYOUT.chest.x,
        z: LAYOUT.chest.z + 0.8 + oz,
        radius: 1.6,
        enabled: () => this.door.isOpen && !chest.opened,
      });
    }

    this.interactables = [
      ...extra,
      { id: 'scan', door, label: '掃描接觸點', x: LAYOUT.scan.x, z: LAYOUT.scan.z + oz, radius: 1.5, enabled: () => !this.scanStation.done },
      {
        id: 'pod',
        door,
        label: '檢查封印艙',
        x: LAYOUT.pod.x + 1.7,
        z: LAYOUT.pod.z + oz,
        radius: 2.3,
        enabled: () => !this.pod.solved,
      },
      {
        id: 'keypad',
        door,
        label: '輸入封印解除碼',
        x: LAYOUT.keypad.x,
        z: LAYOUT.keypad.z + oz,
        radius: 1.5,
        enabled: () => !this.pod.solved,
      },
    ];
  }

  /** 已經掃描過地面了嗎 */
  get scanned(): boolean {
    return this.scanStation.done;
  }

  /** 這一段的起點、終點（世界座標 z） */
  get startZ(): number {
    return LAYOUT.start + this.oz;
  }

  get endZ(): number {
    return LAYOUT.end + this.oz;
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

  get solvedShot(): { position: THREE.Vector3; target: THREE.Vector3 } {
    const s = LAYOUT.solvedShot;
    return { position: this.world(s.position.x, s.position.y, s.position.z), target: this.world(s.target.x, s.target.y, s.target.z) };
  }

  /** 目標標記的位置 */
  marker(what: 'scan' | 'keypad' | 'chest'): THREE.Vector3 {
    if (what === 'keypad') return this.world(CORRIDOR.width / 2 - 0.4, 2.2, LAYOUT.doorZ + 0.5);
    if (what === 'chest') return this.world(LAYOUT.chest.x, 1.5, LAYOUT.chest.z);
    return this.world(LAYOUT.scan.x, 2.1, LAYOUT.scan.z);
  }

  update(dt: number, time: number): void {
    this.door.update(dt);
    this.chest?.update(dt, time);
    this.pod.update(time);
    this.beacons.forEach((b) => b.update(time));
    this.dust.update(time);
    if (this.battery) {
      this.battery.update(dt, time);
      for (const g of this.glows) {
        g.visible = !this.battery.picked;
        (g.material as THREE.MeshBasicMaterial).opacity = 0.18 + this.battery.blink * 0.7;
      }
    }
    this.scanStation.update(time);
    this.keypad.update(time);
  }

  /** 卸載：釋放這一段自己建立的幾何與材質（共用的走廊幾何、材質不動） */
  dispose(): void {
    this.pod.dispose();
    this.holo.dispose();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
      // 警示斜紋每片都有自己的貼圖和材質
      if (mesh.name === 'hazard_stripes') {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }
}
