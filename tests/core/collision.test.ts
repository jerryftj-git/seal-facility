import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../src/core/Collision';
import { nearestInteractable, type Interactable } from '../../src/core/Interactables';

const world = () => {
  const w = new CollisionWorld({ minX: -3, maxX: 3, minZ: -10, maxZ: 10 });
  w.add({ name: 'door', minX: -2, maxX: 2, minZ: -0.3, maxZ: 0.3 });
  return w;
};

describe('CollisionWorld', () => {
  it('限制在外框內（扣掉半徑）', () => {
    expect(world().resolve({ x: 10, z: 20 }, 0.5)).toEqual({ x: 2.5, z: 9.5 });
  });

  it('從側面推出障礙物', () => {
    const p = world().resolve({ x: 0, z: 0.5 }, 0.35);
    expect(p.z).toBeCloseTo(0.65);
  });

  it('圓心在障礙物內時推到最近的邊', () => {
    const p = world().resolve({ x: 0, z: -0.1 }, 0.35);
    expect(p.z).toBeCloseTo(-0.65);
  });

  it('關閉的障礙物不擋路', () => {
    const w = world();
    w.get('door')!.enabled = false;
    expect(w.resolve({ x: 0, z: 0 }, 0.35)).toEqual({ x: 0, z: 0 });
  });

  it('isFree：牆外、天花板上、障礙物內都不行；高度以上可以通過矮障礙', () => {
    const w = world();
    w.add({ name: 'chest', minX: 1, maxX: 2, minZ: 5, maxZ: 6, height: 0.6 });
    expect(w.isFree(0, 1, 5, 0.2, 4)).toBe(true);
    expect(w.isFree(2.9, 1, 5, 0.2, 4)).toBe(false);
    expect(w.isFree(0, 3.9, 5, 0.2, 4)).toBe(false);
    expect(w.isFree(0, 1, 0, 0.2, 4)).toBe(false);
    expect(w.isFree(1.5, 0.3, 5.5, 0.1, 4)).toBe(false);
    expect(w.isFree(1.5, 1.5, 5.5, 0.1, 4)).toBe(true);
  });
});

describe('nearestInteractable', () => {
  const make = (id: 'pod' | 'chest', x: number, on = true): Interactable => ({
    id,
    level: 1,
    label: id,
    x,
    z: 0,
    radius: 2,
    enabled: () => on,
  });

  it('範圍內最近的', () => {
    expect(nearestInteractable([make('pod', 0), make('chest', 1.5)], 1.2, 0)?.id).toBe('chest');
  });

  it('超出範圍或停用時為 null', () => {
    expect(nearestInteractable([make('pod', 0)], 5, 0)).toBeNull();
    expect(nearestInteractable([make('pod', 0, false)], 0, 0)).toBeNull();
  });
});
