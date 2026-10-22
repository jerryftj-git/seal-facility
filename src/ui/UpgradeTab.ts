import { GLOVE_UPGRADES, upgradeStatus, type UpgradeStatus } from '../progress/gloveUpgrades';
import { el, ICONS } from './icons';

const STATUS_TEXT: Record<UpgradeStatus, (need: number, prev: number) => string> = {
  available: () => '可升級：按 Enter 或點擊',
  insufficient: (need) => `晶片不足：還需 ${need} 片`,
  locked: (_n, prev) => `需要先解鎖 Lv${prev}`,
  unlocked: () => '✓ 已解鎖',
};

/**
 * 推演手套「升級」分頁：Lv2、Lv3 兩張卡片（等級、名稱、效果、花費、狀態）。
 * 卡片資料全部來自 GLOVE_UPGRADES（src/progress/gloveUpgrades.ts）。
 */
export function renderUpgradeTab(container: HTMLElement, level: number, chips: number, onUpgrade: (level: number) => void): void {
  container.innerHTML = '';
  const head = el(
    'div',
    'u-head',
    `<span class="u-chips">${ICONS.chip}持有晶片 <b>×${chips}</b></span><span class="u-level">目前 Lv${level}</span>`,
  );
  container.appendChild(head);
  for (const def of GLOVE_UPGRADES.levels.filter((l) => l.level > 1)) {
    const st = upgradeStatus(def.level, level, chips);
    const need = Math.max(0, def.cost - chips);
    const card = el(
      'button',
      `u-card ${st}`,
      `<div class="u-top"><span class="u-lv" style="--lv:${def.color}">Lv${def.level}</span><b>${def.name}</b><span class="u-cost">${ICONS.chip}${def.cost} 片</span></div>
       <p>${def.effect}</p>
       <div class="u-status">${STATUS_TEXT[st](need, def.level - 1)}</div>`,
    ) as HTMLButtonElement;
    card.type = 'button';
    card.disabled = st !== 'available';
    card.addEventListener('click', () => onUpgrade(def.level));
    container.appendChild(card);
  }
}
