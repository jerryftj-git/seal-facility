import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LightPool } from '../../src/world/LightPool';

/** 一盞「燈光設定」（不顯示） */
function source(z: number, intensity = 8): THREE.PointLight {
  const l = new THREE.PointLight(0xffffff, intensity, 12, 2);
  l.position.set(0, 3.4, z);
  l.visible = false;
  l.updateMatrixWorld(true);
  return l;
}

const at = (z: number) => new THREE.Vector3(0, 0, z);
const lit = (pool: LightPool) =>
  pool.object.children
    .map((c) => c as THREE.PointLight)
    .filter((l) => l.intensity > 0)
    .map((l) => l.position.z)
    .sort((a, b) => b - a);

describe('LightPool（固定數量的點光源，借給最近的燈光設定）', () => {
  // 兩段走廊各三盞：第一段 -4、-14、-30，第二段 -48、-58、-74
  const make = () => {
    const pool = new LightPool(3);
    pool.add(...[-4, -14, -30, -48, -58, -74].map((z) => source(z)));
    return pool;
  };

  it('場景裡的光源數量固定（不因燈光設定變多而增加）', () => {
    expect(make().object.children.length).toBe(3);
  });

  it('在第一段：剛好是第一段原本的三盞燈，亮度一樣', () => {
    const pool = make();
    pool.update(0, at(3.5), true);
    expect(lit(pool)).toEqual([-4, -14, -30]);
    expect(pool.object.children.every((c) => (c as THREE.PointLight).intensity === 8)).toBe(true);
  });

  it('走到第二段：換成第二段的燈；換的時候先淡出再淡入，不會突然跳', () => {
    const pool = make();
    pool.update(0, at(3.5), true);
    pool.update(0.1, at(-60));
    // 才過 0.1 秒：要換掉的燈還在淡出
    expect(pool.object.children.some((c) => (c as THREE.PointLight).intensity > 0 && (c as THREE.PointLight).intensity < 8)).toBe(true);
    for (let i = 0; i < 40; i++) pool.update(0.05, at(-60));
    expect(lit(pool)).toEqual([-48, -58, -74]);
  });

  it('沒有設定時燈是關的', () => {
    const pool = new LightPool(2);
    pool.update(0, at(0), true);
    expect(lit(pool)).toEqual([]);
  });
});
