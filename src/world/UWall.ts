import * as THREE from 'three';
import { accentMaterial, wallMaterial } from '../assets/placeholders/environment';

export const NOOK = {
  /** 開口寬（兩道短牆之間） */
  opening: 1.9,
  /** 短牆從牆面往走廊中央伸出的長度 */
  depth: 1.25,
  /** 比走廊（4 m）矮：晶片照在後方牆上的光暈從短牆上方透出來，走在主走廊就看得到 */
  height: 2.0,
  thickness: 0.15,
} as const;

/**
 * 貼著走廊左牆的 U 型死角：兩道垂直於牆面的短牆，開口朝走廊中央。
 * 原點在「牆面上、死角正中央」的地面；回傳物件與兩道短牆的碰撞範圍（本地座標，x 往走廊中央為正）。
 */
export function buildNook(accentColor: number): { object: THREE.Group; walls: { minX: number; maxX: number; minZ: number; maxZ: number }[] } {
  const g = new THREE.Group();
  const { opening, depth, height, thickness } = NOOK;
  const walls: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const side of [-1, 1]) {
    const z = side * (opening / 2 + thickness / 2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(depth, height, thickness), wallMaterial());
    wall.position.set(depth / 2, height / 2, z);
    // 牆頂與牆端的發光線（和走廊線條同色）
    const top = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.03, thickness + 0.02), accentMaterial(accentColor));
    top.position.set(depth / 2, height - 0.04, z);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, height - 0.2, thickness + 0.02), accentMaterial(accentColor));
    edge.position.set(depth + 0.005, height / 2, z);
    g.add(wall, top, edge);
    walls.push({ minX: 0, maxX: depth, minZ: z - thickness / 2, maxZ: z + thickness / 2 });
  }
  return { object: g, walls };
}
