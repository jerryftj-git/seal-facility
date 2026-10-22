import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * 主角和場景融合用的所有可調參數（材質色調、邊緣光、接地陰影、環境反射、環境光遮蔽、鏡頭）。
 * 只影響主角的外觀與畫面後製，不影響玩法。
 */
export const AGENT_LOOK = {
  /** 'standard'：受場景光、霧、環境反射影響的 PBR 材質（預設）；'toon'：先前的柔和卡通著色 */
  style: 'standard' as 'standard' | 'toon',

  material: {
    /** 亮度倍率（1 = 原貼圖）：降 25%，不要比走廊亮 */
    brightness: 0.75,
    /** 飽和度（1 = 原貼圖） */
    saturation: 0.7,
    /** 冷色調：貼圖顏色乘上這個顏色（偏青藍，貼近走廊的光） */
    coolTint: 0xc4d6e4,
    /** 粗糙度下限：拉高後反光變霧面，接近場景的低細節風格 */
    roughnessMin: 0.62,
    /** 金屬度上限 */
    metalnessMax: 0.3,
    /** 法線貼圖強度（模型目前沒有法線貼圖；有的話會套用） */
    normalScale: 0.5,
    /** 環境反射強度（環境貼圖是從走廊本身拍的） */
    envMapIntensity: 0.55,
  },

  /** 青色邊緣光：從角色「相對鏡頭」的側後方打過來，只照亮附近幾公尺 */
  rimLight: {
    enabled: true,
    color: PALETTE.cyan as number,
    intensity: 5,
    /** 光的照射距離（公尺）；越短越不會染到地板和牆 */
    distance: 3.2,
    /** 在角色後方多遠（相對鏡頭方向） */
    back: 1.0,
    /** 往側邊偏多少 */
    side: 0.75,
    height: 1.75,
  },

  /** 腳下的接地陰影（貼片，不用即時陰影貼圖，手機也跑得動） */
  blobShadow: {
    enabled: true,
    radius: 0.62,
    /** 0.75：在很暗的地板上大約讓腳下暗 35～40% */
    opacity: 0.75,
  },

  /** 環境反射貼圖：每次建關卡時從走廊中央拍一張（PMREM），只給主角用 */
  envMap: {
    enabled: true,
    position: new THREE.Vector3(0, 1.5, -6),
  },

  /** 螢幕空間環境光遮蔽（SSAO）。會多渲染一次整個場景，觸控裝置預設關閉 */
  ao: {
    desktop: false,
    touch: false,
    kernelRadius: 0.6,
    minDistance: 0.002,
    maxDistance: 0.06,
    /** SSAO 用的解析度比例（0.5 = 一半，省效能） */
    resolution: 0.5,
  },

  camera: {
    /** 追尾距離（公尺） */
    distance: 4.0,
  },
};

/**
 * 主角的 PBR 材質：保留原本的貼圖（顏色、金屬度、粗糙度），
 * 在 shader 裡調色（冷色、降飽和、降亮度）並限制粗糙度／金屬度範圍。受場景燈光、霧、環境反射影響。
 */
export function agentStandardMaterial(src: THREE.Material, envMap: THREE.Texture | null): THREE.MeshStandardMaterial {
  const s = src as THREE.MeshStandardMaterial;
  const c = AGENT_LOOK.material;
  const mat = new THREE.MeshStandardMaterial({
    map: s.map ?? null,
    color: s.color?.clone() ?? new THREE.Color(0xffffff),
    roughnessMap: s.roughnessMap ?? null,
    metalnessMap: s.metalnessMap ?? null,
    roughness: s.roughness ?? 1,
    metalness: s.metalness ?? 0,
    normalMap: s.normalMap ?? null,
    envMap,
    envMapIntensity: c.envMapIntensity,
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    fog: true,
  });
  if (mat.normalMap) mat.normalScale.setScalar(c.normalScale);
  const uniforms = {
    uBrightness: { value: c.brightness },
    uSaturation: { value: c.saturation },
    uCoolTint: { value: new THREE.Color(c.coolTint) },
    uRoughMin: { value: c.roughnessMin },
    uMetalMax: { value: c.metalnessMax },
  };
  mat.userData.look = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBrightness;
        uniform float uSaturation;
        uniform vec3 uCoolTint;
        uniform float uRoughMin;
        uniform float uMetalMax;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, uSaturation) * uCoolTint * uBrightness;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = max(roughnessFactor, uRoughMin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = min(metalnessFactor, uMetalMax);');
  };
  mat.customProgramCacheKey = () => 'agentStandard';
  return mat;
}

let blobTex: THREE.CanvasTexture | null = null;

/** 腳下的圓形柔邊陰影貼片 */
export function makeBlobShadow(): THREE.Mesh {
  if (!blobTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(cv);
  }
  const c = AGENT_LOOK.blobShadow;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(c.radius * 2, c.radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: c.opacity, depthWrite: false, fog: true }),
  );
  m.name = 'blob_shadow';
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

/** 跟著主角的青色邊緣光（從鏡頭看過去的側後方） */
export class RimLight {
  readonly light: THREE.PointLight;
  private readonly tmp = new THREE.Vector3();

  constructor() {
    const c = AGENT_LOOK.rimLight;
    this.light = new THREE.PointLight(c.color, c.intensity, c.distance, 2);
  }

  /**
   * 注意：不要切換 light.visible——光源數量一變，所有材質都要重新編譯 shader（會卡一下）。
   * 要關掉就把強度設成 0。
   */
  update(player: THREE.Vector3, camera: THREE.Camera, on = true): void {
    const c = AGENT_LOOK.rimLight;
    this.light.intensity = c.enabled && on ? c.intensity : 0;
    if (!c.enabled || !on) return;
    this.light.distance = c.distance;
    // 鏡頭 → 角色的水平方向：光放在角色「後面」（離鏡頭更遠的那一側）再往旁邊偏
    const d = this.tmp.set(player.x - camera.position.x, 0, player.z - camera.position.z);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    const sideX = -d.z;
    const sideZ = d.x;
    this.light.position.set(
      player.x + d.x * c.back + sideX * c.side,
      c.height,
      player.z + d.z * c.back + sideZ * c.side,
    );
  }
}

/** 從走廊拍一張環境貼圖（只在建關卡時做一次），給主角的反射用 */
export function captureEnvMap(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  hide: THREE.Object3D[],
  at: THREE.Vector3 = AGENT_LOOK.envMap.position,
): THREE.WebGLRenderTarget | null {
  if (!AGENT_LOOK.envMap.enabled) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  // 加法混色的特效（天花板光錐、全像投影、灰塵）拍進環境貼圖會產生無效值（NaN），
  // 主角套上後整個變黑，所以拍攝時一律藏起來；它們本來就是「空氣中的光」，不該出現在反射裡
  hide = [...hide];
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    if ((o as THREE.Points).isPoints || mats.some((m) => m.blending === THREE.AdditiveBlending)) hide.push(o);
  });
  const vis = hide.map((o) => o.visible);
  hide.forEach((o) => (o.visible = false));
  const p = at;
  // fromScene 從原點拍，所以暫時把整個場景平移，讓拍攝點落在走廊裡
  scene.position.set(-p.x, -p.y, -p.z);
  scene.updateMatrixWorld(true);
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 60);
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  hide.forEach((o, i) => (o.visible = vis[i]));
  pmrem.dispose();
  return rt;
}
