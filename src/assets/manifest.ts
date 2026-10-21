/**
 * 可替換的 3D 資產清單。把 Blender 匯出的 `<id>.glb` 放到 `public/models/` 就會自動取代佔位模型。
 * 命名規則與節點約定見 README「替換 3D 模型」。
 */
export const ASSET_IDS = [
  'agent',
  'scout',
  'hunter',
  'seal_pod',
  'door',
  'chest',
  'corridor_straight',
  'corridor_end',
] as const;

export type AssetId = (typeof ASSET_IDS)[number];

/** 生物種類 id（puzzle/species.ts）對應的模型 */
export const SPECIES_ASSET: Record<string, AssetId> = {
  scout: 'scout',
  hunter: 'hunter',
};
