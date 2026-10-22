import {
  computeReadings,
  generatePuzzle,
  HUNTER,
  PHASE1_CONFIG,
  PHASE1_SPECIES,
  SCOUT,
  type Counts,
  type Puzzle,
  type Rng,
} from '../puzzle';

/**
 * 關卡設定（純資料，不依賴 three.js）。新增一關只要往 LEVELS 加一筆。
 *
 * 座標都用「區段本地座標」：和第一關原本的世界座標相同（入口端牆 z = +8、封印艙 z = −20、門 z = −24）。
 * 第 k 段走廊實際放在世界座標 z + (k − 1) × ZONE_LENGTH（見 src/core/Level.ts）。
 */
export interface LevelDef {
  /** 關卡編號（1 起算） */
  readonly id: number;
  /** 存檔用的房間 id（隱藏晶片是否撿過） */
  readonly roomId: string;
  /** 生物總數 N */
  readonly creatures: number;
  /** 地上的接觸點 L */
  readonly contactPoints: number;
  /**
   * 隨機出題：true 時改用 PHASE1_CONFIG 的隨機產題（creatures／contactPoints 不使用），
   * false 時固定照這裡的數字出題。
   */
  readonly randomPuzzle: boolean;
  /** 隱藏晶片：位置（區段本地座標，y 是高度）與藏法 */
  readonly hiddenChip: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** crates：補給箱後方（第一關）；nook：左牆 U 型死角（第二關） */
    readonly hideout: 'crates' | 'nook';
  };
  /** 走廊發光線條的顏色 */
  readonly corridorColor: number;
  /** 需要先到掃描台掃描，才知道地上的接觸點 */
  readonly requiresScan: boolean;
}

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    roomId: 'zone01',
    creatures: 5,
    contactPoints: 18,
    randomPuzzle: false,
    // 補給箱（右牆中段）後方牆角；從入口直線走到封印艙離晶片約 2.6 m
    hiddenChip: { x: 2.55, y: 1.1, z: -11.4, hideout: 'crates' },
    corridorColor: 0x2a8fa3,
    requiresScan: false,
  },
  {
    id: 2,
    roomId: 'zone02',
    creatures: 8,
    contactPoints: 22,
    randomPuzzle: false,
    // 左牆 U 型死角的最裡面；從入口直線走到掃描台／封印艙離晶片約 1.9～2.3 m
    hiddenChip: { x: -2.6, y: 1.1, z: -7, hideout: 'nook' },
    corridorColor: 0x8a4fd8,
    requiresScan: true,
  },
  {
    // 只有資料，還沒有空間
    id: 3,
    roomId: 'zone03',
    creatures: 10,
    contactPoints: 28,
    randomPuzzle: false,
    hiddenChip: { x: 2.55, y: 1.1, z: -11.4, hideout: 'crates' },
    corridorColor: 0x2a8fa3,
    requiresScan: true,
  },
];

/** 區域：一串連在一起的關卡 */
export interface AreaDef {
  readonly id: number;
  readonly name: string;
  /** 依序的關卡編號 */
  readonly levels: readonly number[];
}

export const AREAS: readonly AreaDef[] = [{ id: 1, name: '區域 1', levels: [1, 2] }];

export function levelById(id: number): LevelDef {
  const def = LEVELS.find((l) => l.id === id);
  if (!def) throw new Error(`沒有第 ${id} 關`);
  return def;
}

/** 「第一關」「第二關」… */
export function levelLabel(id: number): string {
  return `第${'一二三四五六七八九十'[id - 1] ?? id}關`;
}

/**
 * 從生物總數和接觸點推回組成（兩隻腳的偵察體、四隻腳的獵獸）。
 * 偵察體 = (4N − L) ÷ 2、獵獸 = (L − 2N) ÷ 2；不是非負整數就代表資料打錯。
 */
export function levelAnswer(def: Pick<LevelDef, 'creatures' | 'contactPoints'>): Counts {
  const { creatures: N, contactPoints: L } = def;
  const hunter = (L - SCOUT.legs * N) / (HUNTER.legs - SCOUT.legs);
  const scout = N - hunter;
  if (!Number.isInteger(hunter) || hunter < 0 || scout < 0) {
    throw new Error(`關卡資料不合理：${N} 隻、${L} 個接觸點`);
  }
  return { [SCOUT.id]: scout, [HUNTER.id]: hunter };
}

/**
 * 依「生物數＋地上的接觸點」建題目（答錯換題後存的是新的 L）。
 * L 不合理（存檔被改壞、或生物數不對）就回傳 null，呼叫端改用關卡資料原本的題目。
 */
export function puzzleWithL(def: LevelDef, contactPoints: number): Puzzle | null {
  try {
    const answer = levelAnswer({ creatures: def.creatures, contactPoints });
    return { species: PHASE1_SPECIES, modifiers: [], answer, readings: computeReadings(PHASE1_SPECIES, answer) };
  } catch {
    return null;
  }
}

/** 依關卡資料出題（固定題目或隨機產題） */
export function puzzleForLevel(def: LevelDef, rng: Rng): Puzzle {
  if (def.randomPuzzle) return generatePuzzle(PHASE1_CONFIG, rng);
  const answer = levelAnswer(def);
  return { species: PHASE1_SPECIES, modifiers: [], answer, readings: computeReadings(PHASE1_SPECIES, answer) };
}
