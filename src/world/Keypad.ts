import * as THREE from 'three';
import { mergeParts, type Part } from '../assets/placeholders/build';
import { PALETTE } from '../core/palette';

export type KeypadState = 'idle' | 'alarm' | 'ok';

const COLORS: Record<KeypadState, number> = { idle: PALETTE.cyan, alarm: 0xff2a1a, ok: PALETTE.green };

/**
 * 門框上的密碼盤：深色底座＋發光螢幕＋3×4 顆按鍵。顏色表示狀態（待命青、警報紅、解除綠）。
 * 只用不受光的發光材質，不加點光源。原點在密碼盤中心，正面朝 +Z。
 */
export class Keypad {
  readonly object = new THREE.Group();
  private readonly glow = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, toneMapped: false });
  private readonly keyMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55 });
  private state: KeypadState = 'idle';

  constructor() {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.62, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: 0.5, metalness: 0.6 }),
    );
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.1), this.glow);
    screen.position.set(0, 0.2, 0.031);
    // 12 顆按鍵合併成一個 mesh（一個 draw call）
    const keys: Part[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) keys.push({ geo: new THREE.PlaneGeometry(0.07, 0.06), pos: [(col - 1) * 0.1, 0.05 - row * 0.085, 0.031] });
    }
    this.object.add(new THREE.Mesh(mergeParts(keys), this.keyMat));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.07), this.glow);
    frame.position.set(0, 0.32, 0);
    this.object.add(body, screen, frame);
  }

  setState(s: KeypadState): void {
    this.state = s;
    this.glow.color.set(COLORS[s]);
    this.keyMat.color.set(COLORS[s]);
  }

  update(time: number): void {
    // 待命時慢慢呼吸、警報時快閃
    const k = this.state === 'alarm' ? 0.5 + 0.5 * Math.sign(Math.sin(time * 10)) : 0.75 + 0.25 * Math.sin(time * 2);
    this.keyMat.opacity = 0.25 + 0.5 * k;
  }
}
