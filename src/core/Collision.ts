/**
 * 俯視平面上的簡易碰撞（不依賴 three.js，可單元測試）。
 * 關卡是軸對齊的走廊：一個可走的外框 + 若干矩形障礙（可開關，例如門）。
 */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Obstacle extends Rect {
  name: string;
  enabled: boolean;
  /** 障礙物高度，鏡頭在這個高度以上可以通過（預設無限高） */
  height?: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export class CollisionWorld {
  readonly obstacles: Obstacle[] = [];

  constructor(public bounds: Rect) {}

  add(o: Omit<Obstacle, 'enabled'> & { enabled?: boolean }): Obstacle {
    const ob = { enabled: true, ...o };
    this.obstacles.push(ob);
    return ob;
  }

  get(name: string): Obstacle | undefined {
    return this.obstacles.find((o) => o.name === name);
  }

  /** 把半徑 r 的圓推出所有障礙並限制在外框內，回傳修正後位置 */
  resolve(p: Vec2, r: number): Vec2 {
    let { x, z } = p;
    for (let iter = 0; iter < 3; iter++) {
      for (const o of this.obstacles) {
        if (!o.enabled) continue;
        const cx = Math.max(o.minX, Math.min(x, o.maxX));
        const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // 圓心在矩形內：往最近的邊推出
          const push = [
            { v: x - o.minX + r, ax: -1, az: 0 },
            { v: o.maxX - x + r, ax: 1, az: 0 },
            { v: z - o.minZ + r, ax: 0, az: -1 },
            { v: o.maxZ - z + r, ax: 0, az: 1 },
          ].reduce((a, b) => (b.v < a.v ? b : a));
          x += push.ax * push.v;
          z += push.az * push.v;
        }
      }
    }
    const b = this.bounds;
    x = Math.max(b.minX + r, Math.min(x, b.maxX - r));
    z = Math.max(b.minZ + r, Math.min(z, b.maxZ - r));
    return { x, z };
  }

  /** 3D 點是否在可用空間內（鏡頭防穿牆用）；ceiling 是天花板高度 */
  isFree(x: number, y: number, z: number, margin: number, ceiling: number): boolean {
    const b = this.bounds;
    if (x < b.minX + margin || x > b.maxX - margin || z < b.minZ + margin || z > b.maxZ - margin) return false;
    if (y < margin || y > ceiling - margin) return false;
    for (const o of this.obstacles) {
      if (!o.enabled) continue;
      if (o.height !== undefined && y > o.height + margin) continue;
      if (x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin) return false;
    }
    return true;
  }
}
