import type * as THREE from 'three';
import type { AssetId } from '../manifest';
import { buildAgent } from './agent';
import { buildHunter, buildScout } from './creatures';
import { buildChest, buildCorridorEnd, buildCorridorStraight, buildDoor, buildSealPod } from './environment';

export const PLACEHOLDERS: Record<AssetId, () => THREE.Object3D> = {
  agent: buildAgent,
  scout: buildScout,
  hunter: buildHunter,
  seal_pod: buildSealPod,
  door: buildDoor,
  chest: buildChest,
  corridor_straight: buildCorridorStraight,
  corridor_end: buildCorridorEnd,
};
