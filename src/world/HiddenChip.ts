import * as THREE from 'three';
import { PALETTE } from '../core/palette';

let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(160,250,255,0.8)');
  g.addColorStop(1, 'rgba(46,230,240,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/**
 * 隱藏資料晶片：青色發光六角片，緩慢旋轉、上下浮動。
 * 遠處看得到一顆微弱閃爍的光點（不受霧影響的加法混色貼片）。拾取時噴出一圈粒子。
 */
export class HiddenChip {
  readonly object = new THREE.Group();
  readonly position: THREE.Vector3;
  picked = false;
  private readonly chip: THREE.Group;
  private readonly glow: THREE.Sprite;
  private burst: THREE.Points | null = null;
  private burstT = 0;
  private burstVel: Float32Array | null = null;

  constructor(position: THREE.Vector3) {
    this.position = position.clone();
    this.object.position.copy(position);
    this.chip = new THREE.Group();
    const hex = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.025, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.cyan, toneMapped: false }),
    );
    hex.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.03, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8ffff, toneMapped: false }),
    );
    core.rotation.x = Math.PI / 2;
    this.chip.add(hex, core);
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: PALETTE.cyan,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.glow.scale.setScalar(0.7);
    this.object.add(this.chip, this.glow);
  }

  update(dt: number, time: number): void {
    if (!this.picked) {
      this.chip.rotation.y = time * 1.2;
      this.chip.position.y = Math.sin(time * 1.8) * 0.06;
      this.glow.position.y = this.chip.position.y;
      // 微弱閃爍：大部分時間淡淡的，偶爾亮一下
      const blink = Math.pow(Math.max(0, Math.sin(time * 2.3)), 6);
      (this.glow.material as THREE.SpriteMaterial).opacity = 0.35 + blink * 0.65;
      this.glow.scale.setScalar(0.55 + blink * 0.35);
    }
    if (this.burst && this.burstVel) {
      this.burstT += dt;
      const pos = this.burst.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i++) a[i] += this.burstVel[i] * dt;
      pos.needsUpdate = true;
      const k = Math.max(0, 1 - this.burstT / 0.7);
      (this.burst.material as THREE.PointsMaterial).opacity = k;
      if (k <= 0) {
        this.object.remove(this.burst);
        this.burst.geometry.dispose();
        this.burst = null;
      }
    }
  }

  /** 拾取：晶片消失、噴出粒子 */
  pick(): void {
    this.picked = true;
    this.chip.visible = false;
    this.glow.visible = false;
    const n = 36;
    const pos = new Float32Array(n * 3);
    this.burstVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.2;
      this.burstVel[i * 3] = Math.cos(th) * (1 + Math.random());
      this.burstVel[i * 3 + 1] = up;
      this.burstVel[i * 3 + 2] = Math.sin(th) * (1 + Math.random());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.burst = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: PALETTE.cyan,
        size: 0.06,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.burstT = 0;
    this.object.add(this.burst);
  }

  /** 已經撿過（存檔）：直接不顯示 */
  hide(): void {
    this.picked = true;
    this.object.visible = false;
  }
}

/** 補給箱：和走廊同風格的簡單方塊（深灰金屬＋青色細邊） */
export function supplyCrates(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x26323e, roughness: 0.7, metalness: 0.3 });
  const trim = new THREE.MeshBasicMaterial({ color: 0x2a8fa3 });
  const boxes: [number, number, number, number, number, number][] = [
    // x, y, z, 寬, 高, 深（群組的本地座標，原點在地面）
    [0, 0.45, 0, 1.2, 0.9, 0.9],
    [-0.55, 0.3, 0.75, 0.6, 0.6, 0.6],
    // 疊在內側（靠走廊中央），才不會擋到從入口看向晶片的視線
    [-0.3, 1.15, 0.05, 0.6, 0.5, 0.6],
  ];
  for (const [x, y, z, w, h, d] of boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), body);
    m.position.set(x, y, z);
    const line = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.03, d + 0.01), trim);
    line.position.set(x, y + h / 2 - 0.08, z);
    g.add(m, line);
  }
  return g;
}
