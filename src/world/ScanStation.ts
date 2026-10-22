import * as THREE from 'three';
import { PALETTE } from '../core/palette';

/**
 * 掃描台：一根小立柱，頂上一圈慢慢旋轉的青色光環。掃描過後光環轉綠、轉慢。
 * 只用不受光的發光材質，不加點光源。
 */
export class ScanStation {
  readonly object = new THREE.Group();
  done = false;
  private readonly ring: THREE.Mesh;
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, toneMapped: false });
  private readonly screenMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55 });

  constructor() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x26323e, roughness: 0.55, metalness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 16), metal);
    base.position.y = 0.06;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.0, 12), metal);
    pillar.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.3), metal);
    head.position.y = 1.12;
    head.rotation.x = -0.35;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), this.screenMat);
    screen.rotation.x = -Math.PI / 2 - 0.35;
    screen.position.set(0, 1.165, 0.015);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 8, 40), this.ringMat);
    this.ring.position.y = 1.42;
    this.ring.rotation.x = Math.PI / 2 - 0.3;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.01, 6, 32), this.ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.13;
    this.object.add(base, pillar, head, screen, this.ring, ring2);
  }

  /** 掃描完成：光環轉綠 */
  setDone(): void {
    this.done = true;
    this.ringMat.color.set(PALETTE.green);
    this.screenMat.color.set(PALETTE.green);
  }

  update(time: number): void {
    const speed = this.done ? 0.5 : 1.6;
    this.ring.rotation.z = time * speed;
    this.ring.position.y = 1.42 + Math.sin(time * 2) * 0.03;
    if (!this.done) this.screenMat.opacity = 0.45 + Math.sin(time * 4) * 0.15;
  }
}
