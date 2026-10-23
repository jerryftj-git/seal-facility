import * as THREE from 'three';
import { mergeParts, type Part } from '../assets/placeholders/build';
import { accentMaterial, CORRIDOR, corridorMaterials } from '../assets/placeholders/environment';
import type { Rect } from '../core/Collision';

/**
 * 走廊側室：走廊牆上開一個門洞，進去是一間小房間，隱藏電池放在最裡面。
 * 繞路時間由 depth 決定（實測見 DECISIONS.md），不夠或太多就調這裡。
 */
export const SIDE_ROOM = {
  /** 房間深度（從走廊牆面往外）。13 m：跑步進去拿電池再出來，比直走多花約 5～6 秒（實測） */
  depth: 13,
  /** 房間寬度（沿走廊方向） */
  width: 2.8,
  /** 門洞寬度 */
  doorway: 2.0,
  /** 門洞高度 */
  doorHeight: 2.6,
  /** 房間天花板高度 */
  height: 3.0,
  /** 碰撞外框：走廊兩側最遠到這裡（要大於 牆面 + depth） */
  outer: CORRIDOR.width / 2 + 15,
} as const;

/** 候選側室：side −1 = 左牆、+1 = 右牆；moduleZ = 那一節走廊（長 4 m）的起點（區段本地座標） */
export interface SideRoomSpot {
  readonly side: -1 | 1;
  readonly moduleZ: number;
}

/** 側室中心的 z（那一節走廊的正中央） */
export const roomCenterZ = (s: SideRoomSpot) => s.moduleZ - CORRIDOR.length / 2;

/** 電池在側室最裡面（區段本地座標） */
export function roomBatteryPos(s: SideRoomSpot): THREE.Vector3 {
  return new THREE.Vector3(s.side * (CORRIDOR.width / 2 + SIDE_ROOM.depth - 0.7), 1.1, roomCenterZ(s));
}

/** 一塊方塊零件（合併前） */
const part = (w: number, h: number, d: number, x: number, y: number, z: number): Part => ({ geo: new THREE.BoxGeometry(w, h, d), pos: [x, y, z] });

/**
 * 有側室的那一節走廊（取代原本的直走廊模組）＋房間本身。
 * 回傳的物件放在區段本地座標（不用再平移）。
 */
export function buildSideRoom(spot: SideRoomSpot, accentColor: number): THREE.Group {
  const { width: W, height: H, length: L } = CORRIDOR;
  const hw = W / 2;
  const { depth: D, width: RW, doorway: DW, doorHeight: DH, height: RH } = SIDE_ROOM;
  const mats = corridorMaterials();
  const accent = accentMaterial(accentColor);
  const s = spot.side;
  const z0 = spot.moduleZ;
  const zc = roomCenterZ(spot);
  // 依材質分三組，最後各合併成一個 mesh（整間側室只有 3 個 draw call）
  const floor: Part[] = [];
  const wall: Part[] = [];
  const glow: Part[] = [];

  // ── 這一節走廊：地板、天花板、對面的牆、開門洞的牆 ──
  floor.push(part(W, 0.2, L, 0, -0.1, z0 - L / 2));
  wall.push(part(W + 0.6, 0.3, L, 0, H + 0.15, z0 - L / 2));
  wall.push(part(0.3, H, L, -s * (hw + 0.15), H / 2, z0 - L / 2));
  const jamb = (L - DW) / 2;
  wall.push(part(0.3, H, jamb, s * (hw + 0.15), H / 2, z0 - jamb / 2));
  wall.push(part(0.3, H, jamb, s * (hw + 0.15), H / 2, z0 - L + jamb / 2));
  wall.push(part(0.3, H - DH, DW, s * (hw + 0.15), (H + DH) / 2, zc));
  // 走廊的發光線條（和直走廊模組一樣的位置）
  glow.push(part(0.12, 0.04, L - 0.8, 0, H - 0.04, z0 - L / 2 - 0.2));
  glow.push(part(0.04, 0.02, L - 0.6, -2.3, 0.012, z0 - L / 2 - 0.2));
  glow.push(part(0.04, 0.02, L - 0.6, 2.3, 0.012, z0 - L / 2 - 0.2));
  glow.push(part(0.02, 0.03, L - 0.6, -s * (hw - 0.01), 1.25, z0 - L / 2 - 0.2));
  // 門洞的發光門框
  glow.push(part(0.06, DH, 0.06, s * (hw - 0.02), DH / 2, zc - DW / 2));
  glow.push(part(0.06, DH, 0.06, s * (hw - 0.02), DH / 2, zc + DW / 2));
  glow.push(part(0.06, 0.06, DW, s * (hw - 0.02), DH, zc));

  // ── 房間：地板、天花板、三面牆 ──
  const rx = s * (hw + D / 2);
  floor.push(part(D + 0.3, 0.2, RW, rx, -0.1, zc));
  wall.push(part(D + 0.3, 0.3, RW + 0.6, rx, RH + 0.15, zc));
  wall.push(part(0.3, RH, RW + 0.6, s * (hw + D + 0.15), RH / 2, zc));
  wall.push(part(D, RH, 0.3, rx, RH / 2, zc - RW / 2 - 0.15));
  wall.push(part(D, RH, 0.3, rx, RH / 2, zc + RW / 2 + 0.15));
  // 房間地上的導引線（指向最裡面）
  glow.push(part(D - 0.6, 0.02, 0.04, rx, 0.012, zc));
  const g = new THREE.Group();
  g.name = 'side_room';
  for (const [parts, mat] of [
    [floor, mats.floor],
    [wall, mats.wall],
    [glow, accent],
  ] as const) {
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.matrixAutoUpdate = false;
    g.add(mesh);
    parts.forEach((p) => p.geo.dispose());
  }
  return g;
}

/**
 * 側室這一節的碰撞（區段本地座標）：門洞兩側的牆、房間後方。
 * 走廊兩側其餘的實心範圍由 Segment 依「哪一段 z 有側室」補上。
 */
export function sideRoomBlocks(spot: SideRoomSpot): Rect[] {
  const hw = CORRIDOR.width / 2;
  const { depth: D, width: RW, doorway: DW, outer } = SIDE_ROOM;
  const zc = roomCenterZ(spot);
  const x = (a: number, b: number) => (spot.side > 0 ? { minX: a, maxX: b } : { minX: -b, maxX: -a });
  return [
    // 房間最裡面那面牆之後
    { ...x(hw + D, outer), minZ: zc - RW / 2, maxZ: zc + RW / 2 },
    // 門洞兩側的牆（走廊牆面上）
    { ...x(hw, hw + 0.3), minZ: zc - RW / 2, maxZ: zc - DW / 2 },
    { ...x(hw, hw + 0.3), minZ: zc + DW / 2, maxZ: zc + RW / 2 },
  ];
}
