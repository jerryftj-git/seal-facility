import * as THREE from 'three';

/**
 * 在既有的標準材質上加 fresnel「發光邊緣」（不需要 bloom 等後處理）。
 * glb 匯入的角色材質也能用，讓暗色角色在暗場景裡輪廓清楚。
 */
export function addRim(
  mat: THREE.MeshStandardMaterial,
  rimColor: THREE.ColorRepresentation,
  rimPower = 2.5,
  rimIntensity = 1.2,
): THREE.MeshStandardMaterial {
  const uniforms = {
    uRimColor: { value: new THREE.Color(rimColor) },
    uRimPower: { value: rimPower },
    uRimIntensity: { value: rimIntensity },
  };
  mat.userData.rim = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimIntensity;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), uRimPower);
        totalEmissiveRadiance += uRimColor * rimF * uRimIntensity;`,
      );
  };
  mat.customProgramCacheKey = () => 'rim';
  mat.needsUpdate = true;
  return mat;
}

/** 帶「發光邊緣」的標準材質 */
export function rimMaterial(
  params: THREE.MeshStandardMaterialParameters & { rimColor: THREE.ColorRepresentation; rimPower?: number; rimIntensity?: number },
): THREE.MeshStandardMaterial {
  const { rimColor, rimPower = 2.5, rimIntensity = 1.2, ...rest } = params;
  return addRim(new THREE.MeshStandardMaterial(rest), rimColor, rimPower, rimIntensity);
}

const HOLO_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const HOLO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uFlash;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.0);
  float scan = 0.6 + 0.4 * sin(vWorldPos.y * 110.0 - uTime * 5.0);
  float flick = 0.93 + 0.07 * sin(uTime * 41.0) * sin(uTime * 17.0);
  float a = (0.16 + fres * 0.95) * scan * flick * uOpacity;
  gl_FragColor = vec4(uColor * (1.0 + uFlash * 1.5), a * (1.0 + uFlash));
}`;

/** 全像投影材質：加法混色、fresnel、掃描線、輕微閃爍 */
export function hologramMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uFlash: { value: 0 },
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** 把物件底下所有 mesh 換成同一個材質（全像投影用） */
export function applyMaterial(root: THREE.Object3D, material: THREE.Material): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
  });
}

/** 發光材質（不受光照） */
export function glowMaterial(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: true });
}

let toonRamp: THREE.DataTexture | null = null;

/** 卡通明暗的色階：三段柔和的階梯（暗部不全黑） */
function toonGradient(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const steps = [110, 175, 235, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  toonRamp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

export interface SoftToonOptions {
  /** 最暗會被抬到這個顏色（黑色戰鬥服 → 柔和的藍灰） */
  shadowTint?: THREE.ColorRepresentation;
  /** 最亮會被壓到這個顏色（純白盔甲 → 暖奶油白） */
  lightTint?: THREE.ColorRepresentation;
  /** 飽和度（1 = 不變） */
  saturation?: number;
  /** 貼圖自發光量，暗場景裡仍看得清楚 */
  selfLight?: number;
  rimColor?: THREE.ColorRepresentation;
  rimIntensity?: number;
}

/**
 * 柔和的卡通著色（參考「曠野之息」那種低對比、粉彩的色調）：
 * - 三段色階明暗（MeshToonMaterial）
 * - 貼圖顏色壓縮到 [shadowTint, lightTint] 之間：黑不死黑、白不刺眼，和暗背景的對比變小
 * - 稍微降低飽和度，加一圈暖色邊緣光
 */
export function softToonMaterial(src: THREE.Material, opt: SoftToonOptions = {}): THREE.MeshToonMaterial {
  const s = src as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshToonMaterial({
    map: s.map ?? null,
    color: s.color?.clone() ?? new THREE.Color(0xffffff),
    gradientMap: toonGradient(),
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
  });
  if (s.map) {
    mat.emissiveMap = s.map;
    mat.emissive.setScalar(opt.selfLight ?? 0.22);
  }
  const uniforms = {
    uShadowTint: { value: new THREE.Color(opt.shadowTint ?? 0x4b4a52) },
    uLightTint: { value: new THREE.Color(opt.lightTint ?? 0xf2e8d5) },
    uSaturation: { value: opt.saturation ?? 0.85 },
    uRimColor: { value: new THREE.Color(opt.rimColor ?? 0xffe2b8) },
    uRimIntensity: { value: opt.rimIntensity ?? 0.35 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uShadowTint;
        uniform vec3 uLightTint;
        uniform float uSaturation;
        uniform vec3 uRimColor;
        uniform float uRimIntensity;
        vec3 softGrade(vec3 c) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSaturation);
          return mix(uShadowTint, uLightTint, c);
        }`,
      )
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = softGrade(diffuseColor.rgb);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance = softGrade(totalEmissiveRadiance / max(emissive.r, 1e-4)) * emissive.r;
        float rimF = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 2.4);
        totalEmissiveRadiance += uRimColor * rimF * uRimIntensity;`,
      );
  };
  mat.customProgramCacheKey = () => 'softToon';
  return mat;
}
