import * as THREE from 'three';

const BATTERY_COLOR = 0x5dffb0;

let glowTex: THREE.CanvasTexture | null = null;
/** 柔邊光暈貼圖（白色中心、外圍透明），加法混色用 */
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(200,255,230,0.8)');
  g.addColorStop(1, 'rgba(93,255,176,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** 電池本體：深色圓柱＋發光電量條＋正極頭。size = 1 是隱藏小電池，寶箱的大電池用 1.6 */
export function batteryMesh(size = 1): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.45, metalness: 0.7 });
  const glow = new THREE.MeshBasicMaterial({ color: BATTERY_COLOR, toneMapped: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 14), shell);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.14, 14), glow);
  band.position.y = -0.02;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), glow);
  cap.position.y = 0.14;
  g.add(body, band, cap);
  g.scale.setScalar(size);
  return g;
}

/**
 * 側室裡的隱藏小電池：慢慢旋轉、上下浮動，旁邊一顆不受霧影響的光點會一閃一閃。
 * 拾取時噴出一圈粒子。
 */
export class Battery {
  readonly object = new THREE.Group();
  picked = false;
  /** 目前閃爍的亮度（0..1），給牆上和地上的光暈同步用 */
  blink = 0;
  private readonly cell: THREE.Group;
  private readonly glow: THREE.Sprite;
  private burst: THREE.Points | null = null;
  private burstT = 0;
  private burstVel: Float32Array | null = null;

  constructor(position: THREE.Vector3) {
    this.object.position.copy(position);
    this.cell = batteryMesh(1);
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: BATTERY_COLOR,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.glow.scale.setScalar(0.7);
    this.object.add(this.cell, this.glow);
  }

  update(dt: number, time: number): void {
    if (!this.picked) {
      this.cell.rotation.y = time * 1.2;
      this.cell.position.y = Math.sin(time * 1.8) * 0.06;
      this.glow.position.y = this.cell.position.y;
      // 微弱閃爍：大部分時間淡淡的，偶爾亮一下
      this.blink = Math.pow(Math.max(0, Math.sin(time * 2.3)), 6);
      (this.glow.material as THREE.SpriteMaterial).opacity = 0.35 + this.blink * 0.65;
      this.glow.scale.setScalar(0.55 + this.blink * 0.35);
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

  /** 拾取：電池消失、噴出粒子 */
  pick(): void {
    this.picked = true;
    this.cell.visible = false;
    this.glow.visible = false;
    const n = 36;
    const pos = new Float32Array(n * 3);
    this.burstVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      this.burstVel[i * 3] = Math.cos(th) * (1 + Math.random());
      this.burstVel[i * 3 + 1] = 0.6 + Math.random() * 1.2;
      this.burstVel[i * 3 + 2] = Math.sin(th) * (1 + Math.random());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.burst = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: BATTERY_COLOR,
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
}

/** 光照在牆上／地上的淡淡光暈（加法混色、不受霧影響），亮度跟著電池閃爍 */
export function batteryWallGlow(size: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: BATTERY_COLOR,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    }),
  );
  m.name = 'battery_glow';
  return m;
}
