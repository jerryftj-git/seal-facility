import type { InputMode } from '../player/deviceDetect';
import { el, ICONS } from './icons';
import { RUN_CONFIG } from '../run/runConfig';
import './styles/briefing.css';

/**
 * 任務簡報：開場通訊之後顯示，告訴玩家這一局的規則（電力、寶箱電池、分數）和操作方式。
 * 只說「目標」，不說「怎麼算」（數學規律留給玩家自己發現）。
 * 只有按「出發」（或 Enter）才會關閉，避免小朋友亂按鍵就把說明跳過。
 */
export function showBriefing(parent: HTMLElement, mode: InputMode): Promise<void> {
  const controls =
    mode === 'touch'
      ? `<span>${ICONS.joystick}左手搖桿：移動</span><span>${ICONS.drag}右手拖曳：轉視角</span><span>${ICONS.button}互動鍵</span>`
      : `<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動</span><span>${ICONS.mouse}滑鼠：轉視角</span><span><kbd>E</kbd> 互動</span><span><kbd>Shift</kbd> 慢走</span>`;
  const root = el(
    'div',
    'screen briefing',
    `<div class="screen-box holo briefing-box">
      <div class="sub">MISSION BRIEFING</div>
      <h2>任務簡報</h2>
      <p class="brief-text">護衛機器人，你只剩 ${RUN_CONFIG.startPower} 秒電力。每解開一道封印門，寶箱裡有電池。走得越深，分數越高。電力耗盡前能走多遠？</p>
      <div class="brief-controls">${controls}</div>
      <button class="btn-primary" type="button">出發</button>
      <div class="brief-tip">任務說明隨時可以按右上角的 <b>？</b> 再看一次</div>
    </div>`,
  );
  parent.appendChild(root);
  const btn = root.querySelector('button')!;
  window.setTimeout(() => btn.focus(), 50);
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('keydown', onKey, true);
      root.classList.add('leaving');
      window.setTimeout(() => root.remove(), 500);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      // 其他鍵一律吃掉：不會不小心關掉說明，也不會讓角色在背後走動
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        done();
      }
    };
    window.addEventListener('keydown', onKey, true);
    btn.addEventListener('click', done);
  });
}
