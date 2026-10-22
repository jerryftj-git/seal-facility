/*
 * 角色動畫的純邏輯（不依賴 three.js，可單元測試）。
 */

/** 遊戲裡的跑步速度（m/s），和 PlayerController 的最高速一致 */
export const RUN_SPEED = 4.2;
/** 慢走速度（m/s）：Shift 或搖桿輕推 */
export const WALK_SPEED = 1.6;

/**
 * 動畫剪輯「原本」的步伐速度（m/s）。播放速度會依實際移動速度等比調整，
 * 讓腳步和地面對得上。換成步伐差很多的動畫時改這裡。
 * 目前的主角：Mixamo Standard Walk（1.56 m/s）／Running（4.39 m/s）重定向到 AI 生成的護衛機器人，
 * 腿長是 Mixamo 角色的 0.8 倍，步幅等比縮小（tools/retarget-agent.py 會印出「步幅比例」）。
 */
export const WALK_CLIP_SPEED = 1.25;
export const RUN_CLIP_SPEED = 3.5;

/**
 * 依名稱找動畫剪輯，不分大小寫。也接受 Blender 匯出常見的「物件名|動作名」，
 * 例如 "Armature|run"。找不到回傳 -1。
 */
export function findClipIndex(names: readonly string[], wanted: string): number {
  const w = wanted.toLowerCase();
  const exact = names.findIndex((n) => n.toLowerCase() === w);
  if (exact >= 0) return exact;
  return names.findIndex((n) => n.toLowerCase().split('|').pop() === w);
}

/** 讓數值平滑地趨近目標（指數趨近，和幀率無關） */
export function blendToward(current: number, target: number, dt: number, rate = 8): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export interface ClipSet {
  idle: boolean;
  walk: boolean;
  run: boolean;
}

export interface LocomotionMix {
  idle: number;
  walk: number;
  run: number;
  walkTimeScale: number;
  runTimeScale: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 依（平滑過的）移動速度決定 idle / walk / run 的權重與播放速度。
 * - 0 → 待機；0～慢走速度 → 待機漸變走路；慢走～跑步速度 → 走路漸變跑步。
 * - 缺少的剪輯，權重轉給最接近的那個（缺走路就用跑步、缺跑步就用走路）。
 * - 沒有待機剪輯時，待機權重交給移動剪輯，並讓它在停下時凍結（不會變成 T-pose）。
 * - 權重總和永遠是 1。
 */
export function locomotionMix(speed: number, clips: ClipSet): LocomotionMix {
  const s = Math.max(0, speed);
  let idle: number;
  let walk: number;
  let run: number;
  if (s <= WALK_SPEED) {
    const t = s / WALK_SPEED;
    idle = 1 - t;
    walk = t;
    run = 0;
  } else {
    const t = clamp((s - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    idle = 0;
    walk = 1 - t;
    run = t;
  }
  if (!clips.walk && clips.run) {
    run += walk;
    walk = 0;
  } else if (!clips.run && clips.walk) {
    walk += run;
    run = 0;
  }
  let walkTimeScale = clamp(s / WALK_CLIP_SPEED, 0.6, clips.run ? 1.5 : 2.6);
  let runTimeScale = clamp(s / RUN_CLIP_SPEED, 0.6, 1.3);
  if (!clips.idle) {
    // 待機權重交給移動剪輯，停下時播放速度降到 0（凍結在當下的姿勢）
    if (clips.walk) {
      walk += idle;
      walkTimeScale = clamp(s / WALK_CLIP_SPEED, 0, 2.6);
    } else if (clips.run) {
      run += idle;
      runTimeScale = clamp(s / RUN_CLIP_SPEED, 0, 1.3);
    }
    idle = 0;
  }
  return { idle, walk, run, walkTimeScale, runTimeScale };
}
