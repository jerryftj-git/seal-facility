import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { rimMaterial } from '../../core/materials';
import { box, cached, cyl, mergeParts } from './build';

/** 探員：膠囊體 + 面罩 + 背包 + 右手的推演手套。面向 +Z，原點在腳底，高約 1.75 m。 */
export function buildAgent(): THREE.Object3D {
  const body = cached('agent-body', () =>
    mergeParts([
      { geo: new THREE.CapsuleGeometry(0.3, 0.95, 4, 12), pos: [0, 0.8, 0] },
      { geo: box(0.4, 0.45, 0.18), pos: [0, 1.05, -0.28] },
      { geo: cyl(0.06, 0.06, 0.5), pos: [0.36, 0.9, 0.05], rot: [0.2, 0, 0] },
      { geo: cyl(0.06, 0.06, 0.5), pos: [-0.36, 0.9, 0.05], rot: [0.2, 0, 0] },
    ]),
  );
  const visor = cached('agent-visor', () => mergeParts([{ geo: box(0.36, 0.08, 0.1), pos: [0, 1.48, 0.25] }]));
  const glove = cached('agent-glove', () => mergeParts([{ geo: box(0.15, 0.13, 0.17), pos: [0.37, 0.62, 0.13] }]));

  const root = new THREE.Group();
  root.name = 'agent';
  root.add(
    new THREE.Mesh(
      body,
      rimMaterial({ color: 0x2b3946, roughness: 0.55, metalness: 0.4, rimColor: 0x3c6a80, rimIntensity: 0.7 }),
    ),
  );
  const v = new THREE.Mesh(visor, new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  const g = new THREE.Mesh(glove, new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  g.name = 'glove';
  root.add(v, g);
  return root;
}
