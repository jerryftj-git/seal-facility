/** 介面用的小圖示（inline SVG，不需外部檔案） */
export const ICONS = {
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
