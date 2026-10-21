import type { Input } from '../player/Input';
import { el, ICONS } from './icons';
import './styles/touch.css';

const STICK_RADIUS = 56;
const LOOK_SENSITIVITY = 0.0055;

/**
 * iPad：左半邊虛擬搖桿（從手指按下的位置展開）、右半邊拖曳轉視角、
 * 靠近可互動物件時出現互動按鈕。支援多指同時操作。
 */
export class TouchControls {
  private readonly root = el('div', 'touch-controls hidden');
  private readonly left = el('div', 'touch-zone left');
  private readonly right = el('div', 'touch-zone right');
  private readonly base = el('div', 'stick-base');
  private readonly knob = el('div', 'stick-knob');
  private readonly interact = el('button', 'touch-interact hidden', `${ICONS.button}<span></span>`);
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
  ) {
    this.base.appendChild(this.knob);
    this.root.append(this.left, this.right, this.base, this.interact);
    parent.appendChild(this.root);
    this.interact.type = 'button';

    this.left.addEventListener('pointerdown', this.onStickDown);
    this.right.addEventListener('pointerdown', this.onLookDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.interact.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.press('interact');
    });
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.reset();
  }

  setInteract(label: string | null): void {
    this.interact.classList.toggle('hidden', !label);
    if (label) this.interact.querySelector('span')!.textContent = label;
  }

  private reset(): void {
    this.stickId = null;
    this.lookId = null;
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = '';
    this.input.setTouchMove(0, 0, false);
  }

  private onStickDown = (e: PointerEvent) => {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.base.classList.add('active');
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.input.setTouchMove(0, 0, true);
  };

  private onLookDown = (e: PointerEvent) => {
    if (this.lookId !== null) return;
    e.preventDefault();
    this.lookId = e.pointerId;
    this.lookLast = { x: e.clientX, y: e.clientY };
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) {
      e.preventDefault();
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.12;
      const mag = Math.min(1, len / STICK_RADIUS);
      const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / Math.max(mag, 1e-6);
      this.input.setTouchMove((dx / STICK_RADIUS) * k, (-dy / STICK_RADIUS) * k, true);
    } else if (e.pointerId === this.lookId) {
      e.preventDefault();
      this.input.addLook((e.clientX - this.lookLast.x) * LOOK_SENSITIVITY, (e.clientY - this.lookLast.y) * LOOK_SENSITIVITY);
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.base.classList.remove('active');
      this.base.style.left = '';
      this.base.style.top = '';
      this.knob.style.transform = '';
      this.input.setTouchMove(0, 0, false);
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  };
}
