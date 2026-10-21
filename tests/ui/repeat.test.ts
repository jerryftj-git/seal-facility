import { describe, expect, it } from 'vitest';
import { RepeatTimer } from '../../src/ui/repeat';

const opts = { delay: 300, interval: 100 };

describe('RepeatTimer（按住連按）', () => {
  it('按下立刻觸發一次，delay 後每 interval 一次', () => {
    let n = 0;
    const r = new RepeatTimer(() => (n++, true), opts);
    r.press(0);
    expect(n).toBe(1);
    r.tick(299);
    expect(n).toBe(1);
    r.tick(300);
    expect(n).toBe(2);
    r.tick(399);
    expect(n).toBe(2);
    r.tick(400);
    expect(n).toBe(3);
  });

  it('放開就停', () => {
    let n = 0;
    const r = new RepeatTimer(() => (n++, true), opts);
    r.press(0);
    r.release();
    r.tick(1000);
    expect(n).toBe(1);
    expect(r.active).toBe(false);
  });

  it('fire 回傳 false（到邊界／已解開）就停止連發', () => {
    let n = 0;
    const r = new RepeatTimer(() => ++n < 3, opts);
    r.press(0);
    r.tick(300);
    r.tick(400);
    r.tick(500);
    r.tick(600);
    expect(n).toBe(3);
    expect(r.active).toBe(false);
  });

  it('第一下就被擋下時不進入連發', () => {
    let n = 0;
    const r = new RepeatTimer(() => (n++, false), opts);
    r.press(0);
    r.tick(1000);
    expect(n).toBe(1);
  });

  it('卡頓時一幀最多補發 3 次', () => {
    let n = 0;
    const r = new RepeatTimer(() => (n++, true), opts);
    r.press(0);
    r.tick(5000);
    expect(n).toBe(4);
    r.tick(5050);
    expect(n).toBe(4);
    r.tick(5100);
    expect(n).toBe(5);
  });
});
