import type { InputMode } from '../player/deviceDetect';
import { el } from './icons';
import { INTRO_LINES, type IntroLine } from './introScript';
import './styles/intro.css';

const CHAR_MS = 55;
const HOLD_MS = 1500;
const END_HOLD_MS = 1300;

export interface IntroCallbacks {
  /** 每打一個字（用來播打字音） */
  onType?: () => void;
  /** 每段訊息開始時 */
  onMessage?: () => void;
}

/**
 * 開場通訊：黑底上依序淡入幾段訊息，每段打字機效果。任何按鍵或點擊都能跳過。
 * 回傳的 Promise 在播完或跳過後 resolve。
 */
export function playIntro(
  parent: HTMLElement,
  mode: InputMode,
  cb: IntroCallbacks = {},
  lines: readonly IntroLine[] = INTRO_LINES,
): Promise<void> {
  const root = el(
    'div',
    'intro',
    `<div class="intro-feed"></div>
     <div class="intro-skip">${mode === 'touch' ? '點一下畫面跳過' : '按任意鍵跳過'}</div>`,
  );
  const feed = root.querySelector<HTMLElement>('.intro-feed')!;
  parent.appendChild(root);

  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  let finished = false;

  return new Promise((resolve) => {
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('keydown', skip, true);
      root.removeEventListener('pointerdown', skip);
      root.classList.add('leaving');
      window.setTimeout(() => root.remove(), 600);
      resolve();
    };
    const skip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    // 稍等一下才接受跳過，避免按「開始潛入」的同一下就把開場跳掉
    later(300, () => {
      window.addEventListener('keydown', skip, true);
      root.addEventListener('pointerdown', skip);
    });

    let t = 500;
    lines.forEach((line, i) => {
      later(t, () => {
        feed.querySelectorAll('.intro-msg').forEach((m) => m.classList.add('old'));
        const msg = el(
          'div',
          'intro-msg holo',
          `<div class="intro-from"><i></i>${line.from}<span>加密頻道 · ${String(i + 1).padStart(2, '0')}/${String(lines.length).padStart(2, '0')}</span></div><p></p>`,
        );
        feed.appendChild(msg);
        cb.onMessage?.();
        const p = msg.querySelector('p')!;
        const chars = Array.from(line.text);
        chars.forEach((_, k) =>
          later(250 + k * CHAR_MS, () => {
            p.textContent = chars.slice(0, k + 1).join('');
            if (k % 2 === 0 && chars[k].trim()) cb.onType?.();
            if (k === chars.length - 1) msg.classList.add('done');
          }),
        );
      });
      t += 500 + 250 + Array.from(line.text).length * CHAR_MS + HOLD_MS;
    });
    later(t - HOLD_MS + END_HOLD_MS, finish);
  });
}
