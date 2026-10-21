import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { glowMaterial, rimMaterial } from '../../core/materials';
import { box, cached, cyl, mergeParts, type Part } from './build';

/*
 * 場景佔位模型。所有尺寸以公尺計，原點在地面中心，正面朝 +Z。
 */

export const CORRIDOR = { width: 6, height: 4, length: 4 } as const;

let mats: Record<'wall' | 'floor' | 'trim' | 'glow' | 'glowDim' | 'warn', THREE.Material> | null = null;
function m() {
  mats ??= {
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.75, metalness: 0.1 }),
    floor: new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.6, metalness: 0.2 }),
    trim: new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.6, metalness: 0.6 }),
    glow: glowMaterial(PALETTE.cyanSoft),
    glowDim: glowMaterial(0x2a8fa3),
    warn: glowMaterial(PALETTE.warning),
  };
  return mats;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, name = ''): THREE.Mesh {
  const me = new THREE.Mesh(geo, mat);
  me.name = name;
  me.matrixAutoUpdate = false;
  return me;
}

/** 走廊直段：沿 -Z 延伸 4 m，寬 6 m、高 4 m */
export function buildCorridorStraight(): THREE.Object3D {
  const { width: W, height: H, length: L } = CORRIDOR;
  const hw = W / 2;
  const structure = cached('corr-struct', () =>
    mergeParts([
      { geo: box(0.3, H, L), pos: [-hw - 0.15, H / 2, -L / 2] },
      { geo: box(0.3, H, L), pos: [hw + 0.15, H / 2, -L / 2] },
      { geo: box(W + 0.6, 0.3, L), pos: [0, H + 0.15, -L / 2] },
      // 肋拱
      { geo: box(0.35, H, 0.4), pos: [-hw + 0.17, H / 2, -0.2] },
      { geo: box(0.35, H, 0.4), pos: [hw - 0.17, H / 2, -0.2] },
      { geo: box(W, 0.4, 0.4), pos: [0, H - 0.2, -0.2] },
      // 牆面管線
      { geo: cyl(0.07, 0.07, L, 6), pos: [-hw + 0.12, 3.2, -L / 2], rot: [Math.PI / 2, 0, 0] },
      { geo: cyl(0.05, 0.05, L, 6), pos: [-hw + 0.12, 3.0, -L / 2], rot: [Math.PI / 2, 0, 0] },
      { geo: cyl(0.07, 0.07, L, 6), pos: [hw - 0.12, 3.25, -L / 2], rot: [Math.PI / 2, 0, 0] },
      // 牆腳
      { geo: box(0.15, 0.3, L), pos: [-hw + 0.07, 0.15, -L / 2] },
      { geo: box(0.15, 0.3, L), pos: [hw - 0.07, 0.15, -L / 2] },
    ]),
  );
  const floor = cached('corr-floor', () =>
    mergeParts([
      { geo: box(W, 0.2, L), pos: [0, -0.1, -L / 2] },
      { geo: box(W - 1, 0.02, 0.06), pos: [0, 0.01, -0.2] },
    ]),
  );
  const glow = cached('corr-glow', () =>
    mergeParts([
      { geo: box(0.12, 0.04, L - 0.8), pos: [0, H - 0.04, -L / 2 - 0.2] },
      { geo: box(0.04, 0.02, L - 0.6), pos: [-2.3, 0.012, -L / 2 - 0.2] },
      { geo: box(0.04, 0.02, L - 0.6), pos: [2.3, 0.012, -L / 2 - 0.2] },
      // 牆面腰線
      { geo: box(0.02, 0.03, L - 0.6), pos: [-hw + 0.01, 1.25, -L / 2 - 0.2] },
      { geo: box(0.02, 0.03, L - 0.6), pos: [hw - 0.01, 1.25, -L / 2 - 0.2] },
    ]),
  );
  const root = new THREE.Group();
  root.name = 'corridor_straight';
  root.add(mesh(structure, m().wall), mesh(floor, m().floor), mesh(glow, m().glowDim));
  return root;
}

/** 走廊端牆：牆面在 z = 0，朝 +Z */
export function buildCorridorEnd(): THREE.Object3D {
  const { width: W, height: H } = CORRIDOR;
  const wall = cached('end-wall', () => {
    const slats: Part[] = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((x) => ({ geo: box(0.25, 2.2, 0.15), pos: [x, 1.9, 0.05] }));
    return mergeParts([{ geo: box(W, H, 0.3), pos: [0, H / 2, -0.15] }, { geo: box(4.2, 2.6, 0.12), pos: [0, 1.9, 0.02] }, ...slats]);
  });
  const stripe = cached('end-stripe', () =>
    mergeParts([
      { geo: box(4.4, 0.06, 0.04), pos: [0, 0.45, 0.14] },
      { geo: box(4.4, 0.06, 0.04), pos: [0, 3.3, 0.14] },
    ]),
  );
  const root = new THREE.Group();
  root.name = 'corridor_end';
  root.add(mesh(wall, m().trim), mesh(stripe, m().warn));
  return root;
}

/** 封印艙：長型培養槽，長軸沿 X（約 4.4 m），正面朝 +Z */
export function buildSealPod(): THREE.Object3D {
  const frame = cached('pod-frame', () =>
    mergeParts([
      { geo: box(4.4, 0.35, 1.5), pos: [0, 0.175, 0] },
      { geo: box(4.4, 0.35, 1.5), pos: [0, 2.525, 0] },
      { geo: box(0.25, 2.0, 1.5), pos: [-2.075, 1.35, 0] },
      { geo: box(0.25, 2.0, 1.5), pos: [2.075, 1.35, 0] },
      { geo: box(4.4, 2.0, 0.12), pos: [0, 1.35, -0.69] },
      { geo: cyl(0.09, 0.09, 1.6, 8), pos: [-1.5, 3.5, -0.2] },
      { geo: cyl(0.09, 0.09, 1.6, 8), pos: [1.5, 3.5, -0.2] },
      { geo: cyl(0.06, 0.06, 1.6, 8), pos: [0, 3.5, -0.4] },
      // 讀數面板的托架
      { geo: box(3.8, 0.9, 0.08), pos: [0, 3.05, 0.3] },
    ]),
  );
  const glow = cached('pod-glow', () =>
    mergeParts([
      { geo: box(3.9, 0.04, 0.04), pos: [0, 0.36, 0.74] },
      { geo: box(3.9, 0.04, 0.04), pos: [0, 2.34, 0.74] },
    ]),
  );
  const root = new THREE.Group();
  root.name = 'seal_pod';
  root.add(mesh(frame, rimMaterial({ color: 0x223140, roughness: 0.5, metalness: 0.6, rimColor: 0x1f5a6a, rimIntensity: 0.6 })));
  root.add(mesh(glow, m().glow, 'pod_glow'));

  const glass = new THREE.Mesh(
    box(3.9, 2.0, 1.3),
    new THREE.MeshStandardMaterial({
      color: 0x1a3c46,
      emissive: 0x0f3b44,
      emissiveIntensity: 1,
      roughness: 0.55,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  glass.name = 'glass';
  glass.position.set(0, 1.35, 0);
  glass.renderOrder = 2;
  root.add(glass);

  const anchors: [string, number, number, number][] = [
    ['readout_N', -0.95, 3.05, 0.36],
    ['readout_L', 0.95, 3.05, 0.36],
    ['slots_start', 1.72, 0.35, 0],
    ['slots_end', -1.72, 0.35, 0],
  ];
  for (const [name, x, y, z] of anchors) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    root.add(o);
  }
  return root;
}

/** 門：開口 4.4 × 3.4 m，四片門扇 seg_0..seg_3（左外、左內、右內、右外）+ 鎖桿 lock_bar */
export function buildDoor(): THREE.Object3D {
  const { width: W, height: H } = CORRIDOR;
  const frame = cached('door-frame', () =>
    mergeParts([
      { geo: box(0.8, H, 0.8), pos: [-W / 2 + 0.4, H / 2, 0] },
      { geo: box(0.8, H, 0.8), pos: [W / 2 - 0.4, H / 2, 0] },
      { geo: box(W, H - 3.4, 0.8), pos: [0, (H + 3.4) / 2, 0] },
      { geo: box(0.1, 3.4, 0.9), pos: [-2.2, 1.7, 0] },
      { geo: box(0.1, 3.4, 0.9), pos: [2.2, 1.7, 0] },
    ]),
  );
  const panel = cached('door-panel', () =>
    mergeParts([
      { geo: box(1.1, 3.4, 0.15), pos: [0, 1.7, 0] },
      { geo: box(0.9, 0.5, 0.06), pos: [0, 2.6, 0.08] },
      { geo: box(0.9, 0.5, 0.06), pos: [0, 0.8, 0.08] },
    ]),
  );
  const panelGlow = cached('door-panel-glow', () => mergeParts([{ geo: box(0.04, 2.6, 0.02), pos: [0.5, 1.7, 0.09] }]));
  const bar = cached('door-bar', () =>
    mergeParts([
      { geo: box(4.5, 0.28, 0.16), pos: [0, 0, 0] },
      { geo: box(0.5, 0.5, 0.2), pos: [0, 0, 0.02] },
    ]),
  );
  const barGlow = cached('door-bar-glow', () => mergeParts([{ geo: box(4.3, 0.04, 0.02), pos: [0, 0, 0.09] }]));
  const light = cached('door-light', () => mergeParts([{ geo: box(1.2, 0.12, 0.1), pos: [0, 3.7, 0.42] }]));

  const panelMat = rimMaterial({ color: 0x2a3644, roughness: 0.45, metalness: 0.7, rimColor: 0x203848, rimIntensity: 0.5 });
  const root = new THREE.Group();
  root.name = 'door';
  root.add(mesh(frame, m().trim));
  const xs = [-1.65, -0.55, 0.55, 1.65];
  xs.forEach((x, i) => {
    const seg = new THREE.Group();
    seg.name = `seg_${i}`;
    seg.position.set(x, 0, i === 1 || i === 2 ? -0.12 : 0.05);
    const glowSide = i < 2 ? 1 : -1;
    const g = new THREE.Mesh(panelGlow, m().glowDim);
    g.scale.x = glowSide;
    seg.add(new THREE.Mesh(panel, panelMat), g);
    root.add(seg);
  });
  const lock = new THREE.Group();
  lock.name = 'lock_bar';
  lock.position.set(0, 1.7, 0.2);
  lock.add(new THREE.Mesh(bar, m().trim), new THREE.Mesh(barGlow, glowMaterial(PALETTE.warning)));
  root.add(lock);
  const status = new THREE.Mesh(light, glowMaterial(PALETTE.warning));
  status.name = 'status_light';
  root.add(status);
  return root;
}

/** 寶箱：lid 的樞紐在後上緣，chip_anchor 是晶片出現的位置 */
export function buildChest(): THREE.Object3D {
  const base = cached('chest-base', () =>
    mergeParts([
      { geo: box(0.9, 0.45, 0.6), pos: [0, 0.225, 0] },
      { geo: box(0.96, 0.06, 0.66), pos: [0, 0.03, 0] },
    ]),
  );
  const lidGeo = cached('chest-lid', () => mergeParts([{ geo: box(0.92, 0.14, 0.62), pos: [0, 0.07, 0.31] }]));
  const strip = cached('chest-strip', () =>
    mergeParts([
      { geo: box(0.7, 0.03, 0.02), pos: [0, 0.3, 0.305] },
      { geo: box(0.02, 0.2, 0.02), pos: [0, 0.2, 0.305] },
    ]),
  );
  const mat = rimMaterial({ color: 0x26323e, roughness: 0.5, metalness: 0.6, rimColor: PALETTE.cyan, rimIntensity: 0.5 });
  const root = new THREE.Group();
  root.name = 'chest';
  root.add(new THREE.Mesh(base, mat), new THREE.Mesh(strip, m().glow));
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, 0.45, -0.31);
  lid.add(new THREE.Mesh(lidGeo, mat));
  root.add(lid);
  const anchor = new THREE.Object3D();
  anchor.name = 'chip_anchor';
  anchor.position.set(0, 0.5, 0);
  root.add(anchor);
  return root;
}
