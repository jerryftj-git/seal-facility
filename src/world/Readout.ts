import * as THREE from 'three';

const W = 512;
const H = 224;

/** 艙壁上的發光讀數面板（canvas 貼圖） */
export class Readout {
  readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private value = 0;
  private color = '#2ee6f0';

  constructor(
    private readonly label: string,
    width = 1.6,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * H) / W),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, fog: false }),
    );
    this.draw();
  }

  get current(): number {
    return this.value;
  }

  set(value: number, color?: string): void {
    this.value = value;
    if (color) this.color = color;
    this.draw();
  }

  private draw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(6, 14, 20, 0.92)';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = this.color;
    c.globalAlpha = 0.6;
    c.lineWidth = 4;
    c.strokeRect(6, 6, W - 12, H - 12);
    c.globalAlpha = 0.12;
    c.fillStyle = this.color;
    for (let y = 10; y < H; y += 6) c.fillRect(8, y, W - 16, 2);
    c.globalAlpha = 1;
    c.fillStyle = this.color;
    c.font = '600 40px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    c.textBaseline = 'top';
    c.fillText(this.label, 28, 22);
    c.font = '700 120px "SF Mono", "Consolas", "Roboto Mono", monospace';
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.shadowColor = this.color;
    c.shadowBlur = 18;
    c.fillText(String(this.value), W - 34, H - 30);
    c.shadowBlur = 0;
    c.textAlign = 'left';
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}
