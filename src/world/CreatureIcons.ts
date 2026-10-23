import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import { SPECIES_ASSET, type AssetId } from '../assets/manifest';
import { rimMaterial } from '../core/materials';
import { PALETTE } from '../core/palette';
import { CREATURE_FACING } from './SealPod';

/** 每種生物的小圖：寬、高（CSS 像素，實際以 2 倍解析度渲染）與擺放角度 */
const ICON_SPECS: Record<string, { w: number; h: number; yaw: number }> = {
  // 偵察體：直立，3/4 側面（和艙裡一樣的角度）
  scout: { w: 64, h: 96, yaw: CREATURE_FACING },
  // 獵獸：身長，正側面看得到四條腿
  hunter: { w: 144, h: 84, yaw: Math.PI / 2 },
};

/**
 * 用遊戲裡的生物模型離屏渲染一次，得到透明背景的小圖（data URL），推演面板的圖例用。
 * 佔位模型的本體是接近黑色的剪影，小圖裡改用亮一點的同款材質（一樣有青色發光邊緣），才看得出形狀。
 * 用一個獨立的小渲染器，畫完就釋放，不影響遊戲畫面。
 */
export function renderCreatureIcons(assets: AssetLoader): Record<string, string> {
  const out: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(2);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const iconMat = rimMaterial({
      color: 0x6f8c99,
      roughness: 0.55,
      metalness: 0.25,
      rimColor: PALETTE.cyan,
      rimPower: 2.2,
      rimIntensity: 0.9,
    });

    for (const [id, spec] of Object.entries(ICON_SPECS)) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xcfe6f2, 0x1a2630, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(1.5, 2.5, 3);
      const rim = new THREE.DirectionalLight(PALETTE.cyanSoft, 2.0);
      rim.position.set(-2, 1.5, -2.5);
      scene.add(key, rim);

      const model = assets.get((SPECIES_ASSET[id] ?? id) as AssetId).scene;
      const placeholder = assets.sourceOf((SPECIES_ASSET[id] ?? id) as AssetId) === 'placeholder';
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        // 佔位模型的身體換成亮一點的材質（眼睛那條發光縫保留）
        if (placeholder && m.isMesh && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.material = iconMat;
      });
      model.rotation.y = spec.yaw;
      scene.add(model);

      // 依模型外框擺鏡頭：整隻剛好塞進圖裡、留一點邊
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const fov = 26;
      const aspect = spec.w / spec.h;
      const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      // 轉好方向後外框是對齊座標軸的：畫面上的寬 = size.x、高 = size.y、深度 = size.z
      const fitH = (size.y * 1.06) / 2 / t;
      const fitW = (size.x * 1.06) / 2 / (t * aspect);
      const dist = Math.max(fitH, fitW) + size.z / 2;
      const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 50);
      camera.position.set(center.x, center.y + size.y * 0.05, center.z + dist);
      camera.lookAt(center);

      renderer.setSize(spec.w, spec.h, false);
      renderer.render(scene, camera);
      out[id] = renderer.domElement.toDataURL('image/png');
    }
    iconMat.dispose();
  } catch (err) {
    console.warn('[CreatureIcons] 生物小圖渲染失敗', err);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return out;
}
