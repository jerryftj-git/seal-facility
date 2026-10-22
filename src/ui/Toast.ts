import { el } from './icons';
import './styles/toast.css';

/**
 * 短暫顯示的訊息：
 * - tip：一次性提示（畫面中下方，停留較久）
 * - float：浮動文字（例如「推演手套升級！」，往上飄、淡出）
 */
export function showToast(parent: HTMLElement, text: string, kind: 'tip' | 'float' = 'tip'): void {
  const t = el('div', `toast toast-${kind} holo`, text);
  parent.appendChild(t);
  const ms = kind === 'tip' ? 6000 : 1800;
  window.setTimeout(() => t.classList.add('leaving'), ms);
  window.setTimeout(() => t.remove(), ms + 600);
}
