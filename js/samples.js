// Ханг из Handpan Sphere: настоящие записи нот C2–E6, удары «слэп» и «костяшка».
// Играем запись ближайшей ноты; «смычковая» нота — плавное нарастание без атаки;
// «пробуждение» — нота задом наперёд вливается в живой удар.
import { tuning } from './util.js';

const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

export class HandpanSamples {
  constructor(E) { this.E = E; this.buf = {}; this.revBuf = {}; this.strikes = {}; this.ready = false; }

  async load(onProgress) {
    const base = new URL('../samples/handpan/', import.meta.url);
    const get = async (name) => {
      const r = await fetch(new URL(name + '.mp3', base));
      if (!r.ok) throw new Error(name);
      return this.E.ctx.decodeAudioData(await r.arrayBuffer());
    };
    let done = 0; const total = 55;
    const tick = () => { done++; onProgress && onProgress(done / total); };
    const jobs = [];
    for (let m = 36; m <= 88; m++) jobs.push(get(NAMES[m % 12] + (Math.floor(m / 12) - 1)).then((b) => { this.buf[m] = b; tick(); }));
    jobs.push(get('slap').then((b) => { this.strikes.slap = b; tick(); }), get('knuckle').then((b) => { this.strikes.knuckle = b; tick(); }));
    await Promise.allSettled(jobs);
    this.ready = Object.keys(this.buf).length > 30;
    return this.ready;
  }

  nearest(m) {
    const r = Math.round(m);
    if (this.buf[r]) return { b: this.buf[r], semis: m - r, key: r };
    let best = null;
    for (const k of Object.keys(this.buf)) if (best === null || Math.abs(k - m) < Math.abs(best - m)) best = +k;
    return { b: this.buf[best], semis: m - best, key: best };
  }
  reversed(key) {
    if (this.revBuf[key]) return this.revBuf[key];
    const src = this.buf[key], ctx = this.E.ctx;
    const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) { const a = src.getChannelData(c), b = out.getChannelData(c); for (let i = 0; i < a.length; i++) b[i] = a[a.length - 1 - i]; }
    return (this.revBuf[key] = out);
  }

  // midi может быть дробным; vel 0..1
  play(dest, t, midi, { vel = 0.7, bowed = false, bright = 0.5, reverse = false } = {}) {
    const ctx = this.E.ctx;
    const { b, semis, key } = this.nearest(midi);
    if (!b) return t;
    const rate = Math.pow(2, semis / 12) * (tuning.a4 / 440);
    const src = ctx.createBufferSource();
    src.buffer = reverse ? this.reversed(key) : b;
    src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
    // мягкий удар — темнее и круглее, сильный — ярче
    lp.frequency.value = bowed ? 2600 + bright * 2500 : 1600 + 14000 * Math.pow(vel, 1.6) * (0.6 + bright * 0.6);
    const g = ctx.createGain();
    const amp = 0.95 * Math.pow(vel, 1.3);
    const dur = b.duration / rate;
    if (bowed) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * 0.8, t + 1.4);
      g.gain.setTargetAtTime(0, t + 1.6, Math.max(0.6, (dur - 1.6) / 3));
      src.start(t, 0.25);
    } else {
      g.gain.value = amp;
      src.start(t, reverse ? 0 : 0.003);
    }
    src.connect(lp); lp.connect(g); g.connect(dest);
    const end = t + dur + 0.1;
    this.E.after(end, () => g.disconnect());
    return end;
  }

  // Пробуждение: обратная нота нарастает и переходит в живой удар в момент t
  swell(dest, t, midi, vel = 0.6) {
    const { b, key } = this.nearest(midi);
    if (!b) return t;
    const rev = Math.min(b.duration, 2.6);
    const ctx = this.E.ctx, src = ctx.createBufferSource(); src.buffer = this.reversed(key);
    const rate = Math.pow(2, (midi - key) / 12) * (tuning.a4 / 440); src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = 0.55 * vel;
    const startAt = t - rev / rate;
    src.connect(g); g.connect(dest); src.start(Math.max(ctx.currentTime, startAt), b.duration - rev);
    src.stop(t + 0.01);
    return this.play(dest, t, midi, { vel, bright: 0.4 });
  }

  strike(dest, t, name = 'knuckle', vel = 0.6) {
    const b = this.strikes[name]; if (!b) return t;
    const ctx = this.E.ctx, src = ctx.createBufferSource(); src.buffer = b;
    const g = ctx.createGain(); g.gain.value = 0.8 * Math.pow(vel, 1.2);
    src.connect(g); g.connect(dest); src.start(t, 0.003);
    return t + b.duration;
  }
}
