import * as THREE from 'three';
import { PALETTE } from './palette';

/** 渲染器設定：手機等級預算，不開陰影與後處理；觸控裝置降低像素比 */
export function createRenderer(container: HTMLElement, touch: boolean): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(PALETTE.background);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);
  return renderer;
}
