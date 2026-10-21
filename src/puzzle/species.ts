/** 一種生物的定義。之後新增生物只要往清單加一筆，不必改其他邏輯。 */
export interface SpeciesDef {
  readonly id: string;
  /** 遊戲內顯示名稱 */
  readonly name: string;
  /** 觸地的腳數（受力點） */
  readonly legs: number;
}

/** 各生物的數量，key 是 SpeciesDef.id */
export type Counts = Readonly<Record<string, number>>;

export const SCOUT: SpeciesDef = { id: 'scout', name: '偵察體', legs: 2 };
export const HUNTER: SpeciesDef = { id: 'hunter', name: '獵獸', legs: 4 };

/** 里程碑 1 只有這兩種 */
export const PHASE1_SPECIES: readonly SpeciesDef[] = [SCOUT, HUNTER];

export function findSpecies(species: readonly SpeciesDef[], id: string): SpeciesDef {
  const s = species.find((x) => x.id === id);
  if (!s) throw new Error(`未知的生物種類：${id}`);
  return s;
}
