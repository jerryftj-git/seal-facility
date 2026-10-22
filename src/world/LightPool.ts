import * as THREE from 'three';

const FADE_TIME = 0.5;

interface PoolSlot {
  readonly light: THREE.PointLight;
  source: THREE.PointLight | null;
  /** 0..1 */
  fade: number;
}

/**
 * 固定數量的點光源，輪流借給離玩家最近的「光源設定」。
 *
 * 走廊變長（第二段）後，如果每盞燈都是真的光源，所有材質每個像素都要多算好幾盞光，手機會掉幀；
 * 而且光源數量一變，所有材質都要重新編譯 shader（會卡一下）。所以：
 * - 各物件自己的 PointLight 一律 visible = false（只當「設定」：位置、顏色、亮度、範圍）
 * - 場景裡只有 size 盞真的光源，每幀照最近 size 個設定亮；換人時先淡出、搬過去、再淡入
 * 第一段走廊的燈剛好都是最近的那幾盞，所以第一關的打光和以前完全一樣。
 */
export class LightPool {
  readonly object = new THREE.Group();
  private readonly sources: THREE.PointLight[] = [];
  private readonly slots: PoolSlot[] = [];
  private readonly tmp = new THREE.Vector3();
  /** 警報時把燈染成這個顏色（tintAmount 0..1） */
  private readonly tint = new THREE.Color(0xff2a1a);
  private tintAmount = 0;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.object.add(light);
      this.slots.push({ light, source: null, fade: 0 });
    }
  }

  /** 警報：0 = 原本的顏色，1 = 全紅 */
  setTint(amount: number): void {
    this.tintAmount = amount;
  }

  add(...sources: (THREE.PointLight | null)[]): void {
    for (const s of sources) if (s) this.sources.push(s);
  }

  clear(): void {
    this.sources.length = 0;
    for (const s of this.slots) {
      s.source = null;
      s.fade = 0;
      s.light.intensity = 0;
    }
  }

  /** instant：直接到位、不淡入（換關卡、重新開始時） */
  update(dt: number, focus: THREE.Vector3, instant = false): void {
    const wanted = this.sources
      .map((s) => ({ s, d: s.getWorldPosition(this.tmp).distanceToSquared(focus) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.slots.length)
      .map((x) => x.s);
    const free = wanted.filter((s) => !this.slots.some((p) => p.source === s));
    for (const p of this.slots) {
      const keep = p.source !== null && wanted.includes(p.source);
      if (!keep) {
        // 沒人用或要換人：先淡出，淡到 0 再接新的
        p.fade = instant ? 0 : Math.max(0, p.fade - dt / FADE_TIME);
        if (p.fade === 0) p.source = free.shift() ?? null;
      } else {
        p.fade = instant ? 1 : Math.min(1, p.fade + dt / FADE_TIME);
      }
      if (p.source && instant) p.fade = 1;
      this.mirror(p);
    }
  }

  private mirror(p: PoolSlot): void {
    const s = p.source;
    if (!s) {
      p.light.intensity = 0;
      return;
    }
    s.getWorldPosition(p.light.position);
    p.light.color.copy(s.color);
    if (this.tintAmount > 0) p.light.color.lerp(this.tint, this.tintAmount);
    p.light.distance = s.distance;
    p.light.decay = s.decay;
    p.light.intensity = s.intensity * p.fade;
  }
}
