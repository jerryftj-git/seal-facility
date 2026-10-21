/**
 * Web Audio 合成音效，不需要外部檔案。iOS 規定要在使用者手勢裡 unlock()。
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { stop(): void } | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  private tone(
    freq: number,
    dur: number,
    { type = 'sine' as OscillatorType, gain = 0.2, slideTo = 0, delay = 0, attack = 0.005 } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, { gain = 0.15, freq = 800, q = 1, sweepTo = 0, delay = 0 } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
    g.gain.setValueAtTime(gain, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  /** 轉換一隻生物；音高跟著預測值走 */
  morph(predicted: number, up: boolean): void {
    const f = 220 + predicted * 14;
    this.tone(f, 0.12, { type: 'square', gain: 0.05, slideTo: up ? f * 1.25 : f * 0.8 });
    this.tone(f * 2, 0.08, { type: 'sine', gain: 0.05 });
  }

  /** 邊界被擋下 */
  blocked(): void {
    this.tone(90, 0.22, { type: 'sawtooth', gain: 0.12, slideTo: 70 });
  }

  solved(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', gain: 0.12, delay: i * 0.09 }));
  }

  uiOpen(): void {
    this.tone(660, 0.15, { gain: 0.06, slideTo: 990 });
  }

  uiClose(): void {
    this.tone(880, 0.12, { gain: 0.05, slideTo: 520 });
  }

  defog(): void {
    this.noise(1.4, { gain: 0.12, freq: 3000, sweepTo: 400, q: 0.7 });
  }

  clunk(): void {
    this.tone(70, 0.25, { type: 'square', gain: 0.18, slideTo: 45 });
    this.noise(0.12, { gain: 0.2, freq: 400, q: 2 });
  }

  servo(delay = 0): void {
    this.noise(0.8, { gain: 0.1, freq: 300, sweepTo: 1400, q: 4, delay });
    this.tone(110, 0.8, { type: 'sawtooth', gain: 0.03, slideTo: 160, delay });
  }

  chest(): void {
    this.noise(0.5, { gain: 0.08, freq: 600, sweepTo: 2000, q: 3 });
    [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.4, { gain: 0.06, delay: 0.3 + i * 0.07 }));
  }

  chip(): void {
    this.tone(1400, 0.25, { type: 'triangle', gain: 0.08, slideTo: 2200 });
  }

  /** 背景低頻嗡嗡聲 */
  startHum(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.hum) return;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const oscs = [55, 55.7, 110.3].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      return o;
    });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    oscs.forEach((o) => o.connect(lp));
    lp.connect(g).connect(this.master);
    oscs.forEach((o) => o.start());
    this.hum = { stop: () => oscs.forEach((o) => o.stop()) };
  }
}
