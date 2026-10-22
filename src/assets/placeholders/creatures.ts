import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { rimMaterial } from '../../core/materials';
import { box, cached, cone, limb, mergeParts } from './build';

/*
 * 生物佔位：深色剪影 + 發光邊緣，眼睛是一條細細的橘紅縫。都面向 +Z，原點在腳底。
 */

let bodyMat: THREE.Material | null = null;
let eyeMat: THREE.Material | null = null;
function materials(): [THREE.Material, THREE.Material] {
  bodyMat ??= rimMaterial({
    color: PALETTE.creature,
    roughness: 0.6,
    metalness: 0.2,
    rimColor: PALETTE.cyan,
    rimPower: 2.2,
    rimIntensity: 1.4,
  });
  eyeMat ??= new THREE.MeshBasicMaterial({ color: PALETTE.eye });
  return [bodyMat, eyeMat];
}

/** 偵察體：雙足、駝背、反關節腿、細長手臂 */
function scoutBody(): THREE.BufferGeometry {
  return cached('scout', () => {
    const legs = [-1, 1].flatMap((s) => [
      limb([0.08 * s, 0.44, 0], [0.1 * s, 0.26, 0.1], 0.04, 0.03),
      limb([0.1 * s, 0.26, 0.1], [0.09 * s, 0.06, -0.06], 0.03, 0.02),
      limb([0.09 * s, 0.06, -0.06], [0.09 * s, 0.01, 0.08], 0.02, 0.012),
    ]);
    const arms = [-1, 1].flatMap((s) => [
      limb([0.13 * s, 0.7, 0.12], [0.16 * s, 0.5, 0.22], 0.025, 0.02),
      limb([0.16 * s, 0.5, 0.22], [0.13 * s, 0.3, 0.3], 0.02, 0.008),
    ]);
    const spikes = [0, 1, 2].map((i) => ({
      geo: cone(0.025, 0.12, 4),
      pos: [0, 0.68 + i * 0.06, -0.04 - i * 0.03] as [number, number, number],
      rot: [-0.9, 0, 0] as [number, number, number],
    }));
    return mergeParts([
      { geo: box(0.22, 0.12, 0.16), pos: [0, 0.46, 0] },
      { geo: box(0.24, 0.34, 0.15), pos: [0, 0.64, 0.06], rot: [0.55, 0, 0] },
      { geo: box(0.1, 0.09, 0.28), pos: [0, 0.8, 0.26], rot: [0.25, 0, 0] },
      { geo: cone(0.05, 0.14, 4), pos: [0, 0.77, 0.45], rot: [1.75, 0, 0] },
      ...legs,
      ...arms,
      ...spikes,
    ]);
  });
}

/** 獵獸：四足、低伏、長頭、背棘、尾巴 */
function hunterBody(): THREE.BufferGeometry {
  return cached('hunter', () => {
    const legs = [
      [0.13, 0.22],
      [-0.13, 0.22],
      [0.12, -0.2],
      [-0.12, -0.2],
    ].flatMap(([x, z]) => [
      limb([x, 0.38, z], [x * 1.25, 0.2, z + 0.08], 0.04, 0.03),
      limb([x * 1.25, 0.2, z + 0.08], [x * 1.2, 0.01, z - 0.02], 0.03, 0.015),
    ]);
    const spikes = [0, 1, 2, 3, 4].map((i) => ({
      geo: cone(0.03, 0.14 - i * 0.015, 4),
      pos: [0, 0.5, 0.18 - i * 0.1] as [number, number, number],
      rot: [-0.5, 0, 0] as [number, number, number],
    }));
    return mergeParts([
      { geo: box(0.3, 0.2, 0.36), pos: [0, 0.4, 0.12] },
      { geo: box(0.24, 0.16, 0.3), pos: [0, 0.38, -0.18] },
      { geo: box(0.14, 0.11, 0.32), pos: [0, 0.4, 0.42], rot: [0.18, 0, 0] },
      { geo: box(0.1, 0.04, 0.24), pos: [0, 0.32, 0.44], rot: [0.35, 0, 0] },
      limb([0, 0.38, -0.32], [0, 0.32, -0.55], 0.05, 0.008),
      ...legs,
      ...spikes,
    ]);
  });
}

function eyes(y: number, z: number, w: number): THREE.BufferGeometry {
  return cached(`eyes-${y}-${z}-${w}`, () => mergeParts([{ geo: box(w, 0.012, 0.02), pos: [0, y, z] }]));
}

function creature(name: string, body: THREE.BufferGeometry, eye: THREE.BufferGeometry): THREE.Object3D {
  const [bm, em] = materials();
  const root = new THREE.Group();
  root.name = name;
  const bodyMesh = new THREE.Mesh(body, bm);
  bodyMesh.name = 'body';
  const eyeMesh = new THREE.Mesh(eye, em);
  eyeMesh.name = 'eyes';
  root.add(bodyMesh, eyeMesh);
  return root;
}

export const buildScout = () => creature('scout', scoutBody(), eyes(0.81, 0.4, 0.07));
export const buildHunter = () => creature('hunter', hunterBody(), eyes(0.43, 0.58, 0.09));

/**
 * 佔位生物的觸地點（模型本地座標 x, z）。全像投影會在這些位置畫出發光的接觸點。
 * glb 模型則在腳底放名稱以 foot 開頭的空物件（例如 foot_L、foot_R）。
 */
export const PLACEHOLDER_FEET: Record<string, readonly [number, number][]> = {
  scout: [
    [0.09, 0.08],
    [-0.09, 0.08],
  ],
  hunter: [
    [0.156, 0.28],
    [-0.156, 0.28],
    [0.144, -0.22],
    [-0.144, -0.22],
  ],
};
