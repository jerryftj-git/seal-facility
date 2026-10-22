import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { CORRIDOR } from '../assets/placeholders/environment';
import type { Puzzle } from '../puzzle';
import { Dust, hazardStripes, lightCone } from '../world/Atmosphere';
import { Beacon } from '../world/Beacon';
import { Chest } from '../world/Chest';
import { Door } from '../world/Door';
import { HoloProjection } from '../world/HoloProjection';
import { SealPod } from '../world/SealPod';
import { CollisionWorld } from './Collision';
import type { Interactable } from './Interactables';
import { PALETTE } from './palette';

/*
 * 關卡配置（俯視，-Z 往前）：
 *
 *   z = +8   ┌──────┐ 出生端牆
 *            │  ●   │ 出生點 z = +3.5
 *            │      │ 走廊
 *   z = -16  │▓     │ ← 封印艙（貼左牆，中心 z = -20）
 *   z = -24  ╞══════╡ 門
 *            │      │ 門後走廊
 *            │  ▣   │ 寶箱 z = -33
 *   z = -36  └──────┘ 端牆
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
  /** 開門演出的鏡位 */
  doorShot: { position: new THREE.Vector3(1.9, 2.0, -14.2), target: new THREE.Vector3(-0.2, 1.7, -24) },
} as const;

export class Level {
  readonly root = new THREE.Group();
  readonly world: CollisionWorld;
  readonly ceiling = CORRIDOR.height;
  readonly pod: SealPod;
  readonly holo: HoloProjection;
  readonly door: Door;
  readonly chest: Chest;
  readonly beacons: Beacon[] = [];
  readonly interactables: Interactable[];
  private readonly dust: Dust;

  constructor(assets: AssetLoader, puzzle: Puzzle, initialSlots: readonly string[]) {
    const hw = CORRIDOR.width / 2;
    this.world = new CollisionWorld({ minX: -hw, maxX: hw, minZ: LAYOUT.end, maxZ: LAYOUT.start });

    // 走廊模組
    for (let z = LAYOUT.start; z > LAYOUT.end; z -= CORRIDOR.length) {
      const seg = assets.get('corridor_straight').scene;
      seg.position.z = z;
      this.root.add(seg);
    }
    const capStart = assets.get('corridor_end').scene;
    capStart.position.z = LAYOUT.start;
    capStart.rotation.y = Math.PI;
    const capEnd = assets.get('corridor_end').scene;
    capEnd.position.z = LAYOUT.end;
    this.root.add(capStart, capEnd);

    // 封印艙：正面朝 +X（走廊中央）
    this.pod = new SealPod(assets, puzzle.readings);
    this.pod.object.position.set(LAYOUT.pod.x, 0, LAYOUT.pod.z);
    this.pod.object.rotation.y = Math.PI / 2;
    this.root.add(this.pod.object);
    this.world.add({ name: 'pod', minX: -hw, maxX: LAYOUT.pod.x + 0.8, minZ: LAYOUT.pod.z - 2.75, maxZ: LAYOUT.pod.z + 2.75 });

    const n = initialSlots.length;
    const positions = initialSlots.map((_, i) => this.pod.holoLocal(i, n));
    this.holo = new HoloProjection(
      assets,
      puzzle.species.map((s) => s.id),
      positions,
      initialSlots,
    );
    this.pod.object.add(this.holo.object);

    // 門
    this.door = new Door(assets.get('door'));
    this.door.object.position.z = LAYOUT.doorZ;
    this.root.add(this.door.object);
    this.world.add({ name: 'door', minX: -2.2, maxX: 2.2, minZ: LAYOUT.doorZ - 0.3, maxZ: LAYOUT.doorZ + 0.3 });
    this.world.add({ name: 'doorFrameL', minX: -hw, maxX: -2.2, minZ: LAYOUT.doorZ - 0.4, maxZ: LAYOUT.doorZ + 0.4 });
    this.world.add({ name: 'doorFrameR', minX: 2.2, maxX: hw, minZ: LAYOUT.doorZ - 0.4, maxZ: LAYOUT.doorZ + 0.4 });
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
    this.world.add({
      name: 'chest',
      minX: LAYOUT.chest.x - 0.5,
      maxX: LAYOUT.chest.x + 0.5,
      minZ: LAYOUT.chest.z - 0.35,
      maxZ: LAYOUT.chest.z + 0.35,
      height: 0.6,
    });

    // 燈光：一盞半球光打底 + 少量點光源（手機效能預算）
    this.root.add(new THREE.HemisphereLight(0x7898b2, 0x0c1218, 2.0));
    const entry = new THREE.PointLight(0x9fd8ff, 14, 14, 2);
    entry.position.set(0, 3.4, -4);
    const mid = new THREE.PointLight(0x7fb8d8, 8, 12, 2);
    mid.position.set(1.5, 3.4, -14);
    const back = new THREE.PointLight(PALETTE.cyanSoft, 8, 12, 2);
    back.position.set(0, 3.4, -30);
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

    this.interactables = [
      {
        id: 'pod',
        label: '檢查封印艙',
        x: LAYOUT.pod.x + 1.7,
        z: LAYOUT.pod.z,
        radius: 2.3,
        enabled: () => !this.pod.solved,
      },
      {
        id: 'chest',
        label: '開啟寶箱',
        x: LAYOUT.chest.x,
        z: LAYOUT.chest.z + 0.8,
        radius: 1.6,
        enabled: () => this.door.isOpen && !this.chest.opened,
      },
    ];
  }

  /** time 只在世界時間流動時前進（推演模式時間停止） */
  update(dt: number, time: number): void {
    this.door.update(dt);
    this.chest.update(dt, time);
    this.pod.update(time);
    this.beacons.forEach((b) => b.update(time));
    this.dust.update(time);
  }

  dispose(): void {
    this.pod.dispose();
  }
}
