/**
 * 電力限時探索的所有規則數值。要調整難度改這裡就好。
 * 純資料，不依賴 three.js。
 */
export const RUN_CONFIG = {
  /** 起始電力（秒）。按下簡報的「出發」開始倒數 */
  startPower: 120,
  /** 第 k 道門的生物數 N = min(base + k, max)：第 1 門 5 隻、第 2 門 6 隻… */
  creatures: { base: 4, max: 12 },
  /** 答案的獵獸數範圍：1 到 N − 1（偵察體也至少 1 隻） */
  hunterRange: { min: 1, maxFromN: -1 },
  /** 大門開啟後，門後寶箱裡的電池（秒） */
  chestBattery: 40,
  /** 每段走廊側室裡的隱藏小電池（秒） */
  hiddenBattery: 15,
  /** 答錯的保全閉鎖（秒）。倒數結束後換題 */
  alarmSeconds: 20,
  /** 低電力警告：電力條轉橘閃爍、走廊轉紅、心跳聲 */
  lowPower: 20,
  /** 危急：心跳加快 */
  criticalPower: 5,
  /** 每通過一道門的分數 */
  pointsPerDoor: 10,
  /** 每段走廊發光線條的配色，依序輪流：青 → 紫 → 橘 → 青… */
  corridorColors: [0x2a8fa3, 0x8a4fd8, 0xd9772a] as readonly number[],
  /** 同時存在的走廊段數（走進新的一段後，背後的隔門關上再卸載上一段） */
  maxSegments: 2,
  /** 撿到電池時電力條滑到新值的時間（秒） */
  batteryAnimSeconds: 0.5,
  /** 電力耗盡的關機演出長度（秒），之後進入任務結束畫面 */
  powerOutSeconds: 1.5,
  /** 從暫停回到遊戲前的倒數（秒） */
  resumeCountdown: 3,
} as const;

export type RunConfig = typeof RUN_CONFIG;
