import type { InputMode } from '../player/deviceDetect';
import { el } from './icons';
import { introTap, type IntroState } from './introFlow';
import { INTRO_LINES, type IntroLine } from './introScript';
import './styles/intro.css';

const CHAR_MS = 55;

export interface IntroCallbacks {
  /** 每打一個字（用來播打字音） */
  onType?: () => void;
  /** 每段訊息開始時 */
  onMessage?: () => void;
}

/**
 * 開場通訊：黑底上一句一句出現，每句打字機效果。
 * - 點畫面任何地方：打字中 → 立刻顯示完整；已顯示完 → 下一句（Space、Enter 也一樣，其他按鍵不理會）
 * - 只有最下方的「跳過 ▸」會直接進遊戲；最後一句顯示完再點一下也會進遊戲
 * - 每句顯示完，底部出現淡淡的「點一下繼續」；右下角是句數進度「1 / 4」
 * 回傳的 Promise 在結束（點完或跳過）後 resolve。
 */
export function playIntro(
  parent: HTMLElement,
  _mode: InputMode,
  cb: IntroCallbacks = {},
  lines: readonly IntroLine[] = INTRO_LINES,
): Promise<void> {
  const root = el(
    'div',
    'intro',
    `<div class="intro-feed"></div>
     <div class="intro-continue">點一下繼續</div>
     <div class="intro-progress"></div>
     <button class="intro-skip" type="button">跳過 ▸</button>`,
  );
  const feed = root.querySelector<HTMLElement>('.intro-feed')!;
  const hint = root.querySelector<HTMLElement>('.intro-continue')!;
  const progress = root.querySelector<HTMLElement>('.intro-progress')!;
  parent.appendChild(root);

  let state: IntroState = { index: 0, typing: true };
  let timer = 0;
  let p: HTMLElement | null = null;
  let msg: HTMLElement | null = null;
  let chars: string[] = [];
  let shown = 0;
  let ready = false;

  return new Promise((resolve) => {
    const finish = () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
      root.classList.add('leaving');
      window.setTimeout(() => root.remove(), 600);
      resolve();
    };

    const lineDone = () => {
      window.clearInterval(timer);
      if (p) p.textContent = chars.join('');
      msg?.classList.add('done');
      state = { ...state, typing: false };
      hint.classList.add('show');
    };

    const showLine = (i: number) => {
      feed.querySelectorAll('.intro-msg').forEach((m) => m.classList.add('old'));
      const line = lines[i];
      msg = el(
        'div',
        'intro-msg holo',
        `<div class="intro-from"><i></i>${line.from}<span>加密頻道 · ${String(i + 1).padStart(2, '0')}/${String(lines.length).padStart(2, '0')}</span></div><p></p>`,
      );
      feed.appendChild(msg);
      p = msg.querySelector('p')!;
      chars = Array.from(line.text);
      shown = 0;
      progress.textContent = `${i + 1} / ${lines.length}`;
      hint.classList.remove('show');
      cb.onMessage?.();
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        shown++;
        p!.textContent = chars.slice(0, shown).join('');
        if (shown % 2 === 1 && chars[shown - 1]?.trim()) cb.onType?.();
        if (shown >= chars.length) lineDone();
      }, CHAR_MS);
    };

    const tap = () => {
      if (!ready) return;
      const r = introTap(state, lines.length);
      if (r.action === 'complete') lineDone();
      else if (r.action === 'next') {
        state = r.state;
        showLine(state.index);
      } else finish();
    };

    const onKey = (e: KeyboardEvent) => {
      // 開場時按鍵不能拿去走路；Space／Enter 等同點一下，其他鍵不理會
      e.stopPropagation();
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!e.repeat) tap();
      }
    };

    root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.intro-skip')) return;
      e.preventDefault();
      tap();
    });
    root.querySelector('.intro-skip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      finish();
    });
    window.addEventListener('keydown', onKey, true);
    // 稍等一下才出現第一句、才接受點擊（避免按「開始潛入」的同一下就把第一句跳完）
    window.setTimeout(() => {
      showLine(0);
      ready = true;
    }, 400);
  });
}
