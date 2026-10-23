import * as THREE from 'three';
import { PALETTE } from '../core/palette';

/** 漂浮的灰塵粒子：一個 draw call，靠加法混色做出霧中的光點 */
export class Dust {
  readonly object: THREE.Points;
  private readonly base: Float32Array;

  constructor(count: number, box: { minX: number; maxX: number; minZ: number; maxZ: number; height: number }) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = THREE.MathUtils.lerp(box.minX, box.maxX, Math.random());
      pos[i * 3 + 1] = Math.random() * box.height;
      pos[i * 3 + 2] = THREE.MathUtils.lerp(box.minZ, box.maxZ, Math.random());
    }
    this.base = pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.object = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x9fdcef,
        size: 0.022,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.object.frustumCulled = false;
  }

  update(time: number): void {
    const attr = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      const s = i * 0.37;
      a[i] = this.base[i] + Math.sin(time * 0.15 + s) * 0.25;
      a[i + 1] = this.base[i + 1] + Math.sin(time * 0.1 + s * 1.7) * 0.2;
      a[i + 2] = this.base[i + 2] + Math.cos(time * 0.12 + s * 0.6) * 0.25;
    }
    attr.needsUpdate = true;
  }
}

/** 天花板燈下的假光錐（加法混色的半透明圓錐，取代昂貴的體積光） */
export function lightCone(color: THREE.ColorRepresentation, height: number, radius: number, strength = 0.006): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, height, 20, 4, true);
  geo.translate(0, -height / 2, 0);
  // 由上往下漸暗（加法混色下黑色 = 不發光），邊緣才不會硬。
  // 注意：頂點色是線性空間，輸出時轉 sRGB 會把小數值放大很多，所以 strength 要很小（約 0.005）
  const c = new THREE.Color(color).multiplyScalar(strength);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.pow(1 + pos.getY(i) / height, 1.6);
    colors[i * 3] = c.r * k;
    colors[i * 3 + 1] = c.g * k;
    colors[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    // 加法混色時霧色會被「加」上去變成灰色光錐，所以關掉
    fog: false,
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  return m;
}

/** 地上的警示斜紋（canvas 貼圖） */
export function hazardStripes(width: number, depth: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c1014';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#' + new THREE.Color(PALETTE.warning).getHexString();
  for (let x = -64; x < 320; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 16, 64);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 32, 0);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(width / 2, 1);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.1, emissive: 0x401000, emissiveMap: tex, emissiveIntensity: 0.25 }),
  );
  m.name = 'hazard_stripes';
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  return m;
}
