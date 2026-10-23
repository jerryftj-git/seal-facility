/** 最佳紀錄：最高分數、最多門數（存檔裡只留這個） */
export interface BestRecord {
  score: number;
  doors: number;
}

export interface RunResult {
  score: number;
  doors: number;
}

/**
 * 一局結束：更新最佳紀錄。分數或門數任一項超過舊紀錄就算「新紀錄」。
 * （目前分數 = 門數 × 10，兩者一起變；分開存是為了之後分數規則改變時仍然成立）
 */
export function updateBest(best: BestRecord, run: RunResult): { best: BestRecord; isNew: boolean } {
  const next = { score: Math.max(best.score, run.score), doors: Math.max(best.doors, run.doors) };
  return { best: next, isNew: run.score > best.score || run.doors > best.doors };
}
