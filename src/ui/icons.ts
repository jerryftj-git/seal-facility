/** 介面用的小圖示（inline SVG，不需外部檔案） */
export const ICONS = {
  chip: `<svg viewBox="0 0 26 20"><rect x="3" y="3" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="8" y="7" width="10" height="6" fill="currentColor" opacity=".7"/><path d="M6 1v2M10 1v2M14 1v2M18 1v2M6 17v2M10 17v2M14 17v2M18 17v2" stroke="currentColor" stroke-width="1.4"/></svg>`,
  scout: `<svg viewBox="0 0 32 32"><path d="M15 6l5 2-1 3-3 1 1 5-2 1-1 4 2 6h-2l-2-5-1 5H9l1-6 1-5-2-4 2-4 4-3z" fill="currentColor"/></svg>`,
  hunter: `<svg viewBox="0 0 32 32"><path d="M3 15l5-3 6 1 3-2 3 2 4-1 6 3-2 2-4-1-1 3 1 6h-2l-2-5h-5l-2 5H9l1-6-3-2-2 4H3l1-5z" fill="currentColor"/></svg>`,
  joystick: `<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11"/><circle cx="14" cy="14" r="4.5" fill="currentColor" stroke="none" opacity=".6"/></svg>`,
  drag: `<svg viewBox="0 0 28 28"><path d="M6 14h16M18 10l4 4-4 4M10 10l-4 4 4 4"/><circle cx="14" cy="14" r="2.5" fill="currentColor" stroke="none"/></svg>`,
  button: `<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11"/><path d="M10 14l3 3 5-6"/></svg>`,
  mouse: `<svg viewBox="0 0 28 28"><rect x="8" y="4" width="12" height="20" rx="6"/><path d="M14 4v6"/></svg>`,
} as const;

/** 建立 DOM 元素的小工具 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}
