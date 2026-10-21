import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 一個零件：幾何體 + 位置／旋轉／縮放 */
export interface Part {
  geo: THREE.BufferGeometry;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();

/** 把多個零件合併成單一幾何體（一個 draw call） */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      tmpQuat.setFromEuler(tmpEuler.set(...rot)),
      new THREE.Vector3(...scale),
    );
    g.applyMatrix4(m);
    return g;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error('mergeParts 失敗');
  merged.computeBoundingSphere();
  return merged;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rTop: number, rBot: number, h: number, seg = 8) => new THREE.CylinderGeometry(rTop, rBot, h, seg);
export const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);

/** 一根從 a 指向 b 的圓柱（四肢用） */
export function limb(a: [number, number, number], b: [number, number, number], r: number, rEnd = r): Part {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return { geo: cyl(rEnd, r, len, 6), pos: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z] };
}

/** 依名稱快取，同一份幾何體只建一次 */
const cache = new Map<string, THREE.BufferGeometry>();
export function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}
