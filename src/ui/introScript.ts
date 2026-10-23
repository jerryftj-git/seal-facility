/**
 * 開場通訊的文字（草稿，等使用者修訂）。
 * 每段不超過 30 個字（含標點），小學生要讀得完；段數 3～4 段。tests/ui/intro.test.ts 會檢查。
 */
export interface IntroLine {
  /** 發訊者 */
  readonly from: string;
  readonly text: string;
}

export const INTRO_LINES: readonly IntroLine[] = [
  { from: '指揮中心', text: '護衛機器人，收到請回覆。新任務已經下達。' },
  { from: '指揮中心', text: '目標：潛入廢棄的「封印設施」，走得越深越好。' },
  { from: '指揮中心', text: '門被「封印艙」鎖住。艙內變種生物的組成就是密碼。' },
  { from: '指揮中心', text: '用推演手套辨識牠們。祝好運，護衛機器人。' },
];

export const INTRO_MAX_CHARS = 30;
