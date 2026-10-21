import * as THREE from 'three';

/**
 * 帶「發光邊緣」的標準材質：在 emissive 加上 fresnel 項，不需要 bloom 等後處理。
 */
export function rimMaterial(
  params: THREE.MeshStandardMaterialParameters & { rimColor: THREE.ColorRepresentation; rimPower?: number; rimIntensity?: number },
): THREE.MeshStandardMaterial {
  const { rimColor, rimPower = 2.5, rimIntensity = 1.2, ...rest } = params;
  const mat = new THREE.MeshStandardMaterial(rest);
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
  return mat;
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
