import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { AGENT_LOOK } from './agentLook';

/**
 * 可選的 SSAO（螢幕空間環境光遮蔽），設定在 AGENT_LOOK.ao。
 * 開啟時整個畫面（含主角）都經過同一條後製：RenderPass → SSAO → OutputPass（tone mapping、色彩空間）。
 * 會多渲染一次場景的法線，觸控裝置預設關閉。
 */
export class PostFX {
  private composer: EffectComposer | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  get enabled(): boolean {
    return this.composer !== null;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    if (!on) {
      this.composer?.dispose();
      this.composer = null;
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const c = AGENT_LOOK.ao;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const ssao = new SSAOPass(this.scene, this.camera, w, h, 16);
    ssao.kernelRadius = c.kernelRadius;
    ssao.minDistance = c.minDistance;
    ssao.maxDistance = c.maxDistance;
    // 半透明的光錐、全像投影、玻璃不參與遮蔽計算（不然會在它們周圍出現黑邊）
    const self = ssao as unknown as { scene: THREE.Scene; _visibilityCache: THREE.Object3D[] };
    (ssao as unknown as { _overrideVisibility: () => void })._overrideVisibility = function () {
      self.scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        const hide =
          (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (mat && !Array.isArray(mat) && mat.transparent);
        if (hide && o.visible) {
          o.visible = false;
          self._visibilityCache.push(o);
        }
      });
    };
    // SSAO 用較低解析度算（AGENT_LOOK.ao.resolution）
    const baseSetSize = ssao.setSize.bind(ssao);
    ssao.setSize = (sw: number, sh: number) => baseSetSize(Math.max(1, sw * c.resolution), Math.max(1, sh * c.resolution));
    composer.addPass(ssao);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(w, h);
    this.composer = composer;
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h);
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
