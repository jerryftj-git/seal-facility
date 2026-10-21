import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ASSET_IDS, type AssetId } from './manifest';
import { PLACEHOLDERS } from './placeholders';

export interface LoadedAsset {
  readonly scene: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
  readonly source: 'glb' | 'placeholder';
}

interface Entry {
  source: 'glb' | 'placeholder';
  scene?: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/** glb 檔頭的 magic number "glTF"（little-endian） */
const GLB_MAGIC = 0x46546c67;

/**
 * 有 `<baseUrl><id>.glb` 就載入，沒有就用佔位模型。遊戲邏輯只透過 get(id) 取得物件，
 * 不需要知道來源。
 *
 * 注意：Vite 開發伺服器在檔案不存在時會回傳 index.html（狀態碼 200），
 * 所以要檢查檔頭是不是 glTF，不能只看 HTTP 狀態。
 */
export class AssetLoader {
  private readonly entries = new Map<AssetId, Entry>();
  private readonly gltf = new GLTFLoader();

  constructor(private readonly baseUrl = `${import.meta.env.BASE_URL}models/`) {}

  async preload(ids: readonly AssetId[] = ASSET_IDS): Promise<void> {
    await Promise.all(ids.map((id) => this.loadOne(id)));
    const fromGlb = ids.filter((id) => this.entries.get(id)?.source === 'glb');
    console.info(`[AssetLoader] glb: ${fromGlb.join(', ') || '（無）'}；其餘使用佔位模型`);
  }

  private async loadOne(id: AssetId): Promise<void> {
    if (this.entries.has(id)) return;
    const url = `${this.baseUrl}${id}.glb`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength >= 4 && new DataView(buf).getUint32(0, true) === GLB_MAGIC) {
          const gltf = await this.gltf.parseAsync(buf, this.baseUrl);
          this.entries.set(id, { source: 'glb', scene: gltf.scene, animations: gltf.animations });
          return;
        }
      }
    } catch (err) {
      console.warn(`[AssetLoader] ${url} 載入失敗，改用佔位模型`, err);
    }
    this.entries.set(id, { source: 'placeholder', animations: [] });
  }

  /** 取得一份新的實例（每次呼叫都是獨立的物件，可以各自移動、動畫） */
  get(id: AssetId): LoadedAsset {
    const e = this.entries.get(id);
    if (e?.source === 'glb' && e.scene) {
      return { scene: cloneSkinned(e.scene), animations: e.animations, source: 'glb' };
    }
    return { scene: PLACEHOLDERS[id](), animations: [], source: 'placeholder' };
  }

  sourceOf(id: AssetId): 'glb' | 'placeholder' {
    return this.entries.get(id)?.source ?? 'placeholder';
  }
}
