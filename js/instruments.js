// Инструменты: физически-вдохновлённый синтез без сэмплов.
// Каждая функция планирует звук на время t в узел dest и возвращает время окончания.
import { clamp, tuning } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);

function sine(ctx, f, t, end, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end); return o;
}
function egain(ctx, t, peak, att, tau, delay = 0) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + delay + att); g.gain.setTargetAtTime(0, t + delay + att, tau); return g;
}
function filt(ctx, type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function out(E, dest, level, end) {
  const g = E.ctx.createGain(); g.gain.value = level; g.connect(dest);
  E.after(end, () => g.disconnect()); return g;
}
// Зёрна: короткие всплески на одном источнике шума через автоматизацию усиления
function grains(g, times, ampFn, tau = 0.004) {
  g.gain.value = 0;
  if (times.length) g.gain.setValueAtTime(0, times[0] - 0.001);
  for (let i = 0; i < times.length; i++) {
    const tg = times[i];
    g.gain.setValueAtTime(ampFn(i, tg), tg);
    g.gain.setTargetAtTime(0, tg + 0.0004, tau);
  }
}

// ---------------- Ханг ----------------
// Тон ханга: основной тон, октава и квинта через октаву, лёгкое биение «живого» металла.
export function handpan(E, dest, t, { freq, vel = 0.7, bright = 0.5, bowed = false }) {
  // настоящие записи ханга из Handpan Sphere, если загружены
  if (E.hp && E.hp.ready) return E.hp.play(dest, t, 69 + 12 * Math.log2(freq / tuning.a4), { vel, bright, bowed });
  const ctx = E.ctx;
  const low = clamp((420 - freq) / 300, 0, 1);
  const T = bowed ? 6 + 3 * low : 2.6 + 3.4 * low;
  const end = t + (bowed ? 2.2 : 0) + T * 1.05 + 0.1;
  const o = out(E, dest, 0.24 * vel, end + 0.3);
  const lp = filt(ctx, 'lowpass', Math.min(15000, freq * (3 + 9 * vel * bright)), 0.3); lp.connect(o);
  const parts = [
    { r: 1, a: 1, T, att: 0.004 },
    { r: 1, a: 0.26, T: T * 0.9, att: 0.006, dHz: rnd(0.5, 1.2) },
    { r: 2, a: 0.4 + 0.3 * bright, T: T * 0.5, att: 0.02 },
    { r: 3, a: 0.12 + 0.22 * bright * vel, T: T * 0.28, att: 0.01 },
    { r: rnd(4.05, 4.3), a: 0.05 * bright, T: 0.35, att: 0.002 },
  ];
  for (const p of parts) {
    if (bowed && p.r > 3) continue;
    const osc = sine(ctx, freq * p.r + (p.dHz || 0), t, end);
    if (!bowed && p.r === 1 && !p.dHz) { osc.detune.setValueAtTime(9, t); osc.detune.setTargetAtTime(0, t, 0.04); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    if (bowed) { g.gain.linearRampToValueAtTime(p.a * 0.7, t + rnd(1.3, 1.9)); g.gain.setTargetAtTime(0, t + 2.2, (p.T / 6.9) * 1.2); }
    else { g.gain.linearRampToValueAtTime(p.a, t + p.att); g.gain.setTargetAtTime(0, t + p.att, p.T / 6.9); }
    osc.connect(g); g.connect(lp);
  }
  if (!bowed) {
    const n = E.noiseSource('pink'), bp = filt(ctx, 'bandpass', freq * 2.2, 1.4), g = egain(ctx, t, 0.35 * vel, 0.001, 0.012);
    n.connect(bp); bp.connect(g); g.connect(lp); E.startNoise(n, t); n.stop(t + 0.12);
  }
  return end;
}

// ---------------- Колокольчики коши ----------------
export function koshi(E, dest, t, { freq, vel = 0.6 }) {
  const ctx = E.ctx, end = t + 6.5;
  const o = out(E, dest, 0.1 * vel, end);
  [[1, 1, 6], [2.756, 0.45, 2.4], [5.404, 0.22, 1], [8.933, 0.1, 0.45]].forEach(([r, a, T]) => {
    const f = freq * r; if (f > 18000) return;
    const osc = sine(ctx, f, t, end), g = egain(ctx, t, a, 0.002, T / 6.9);
    osc.connect(g); g.connect(o);
  });
  const n = E.noiseSource('white'), hp = filt(ctx, 'highpass', 6000), g = egain(ctx, t, 0.25, 0.0005, 0.002);
  n.connect(hp); hp.connect(g); g.connect(o); E.startNoise(n, t); n.stop(t + 0.03);
  return end;
}
export function koshiStrum(E, dest, t, { freqs, count = 5, spread = 1.2, vel = 0.55 }) {
  let end = t, tt = t;
  for (let i = 0; i < count; i++) {
    end = Math.max(end, koshi(E, dest, tt, { freq: freqs[Math.floor(Math.random() * freqs.length)], vel: vel * rnd(0.5, 1) }));
    tt += rnd(0.04, spread / count * 1.6);
  }
  return end;
}

// ---------------- Тингши ----------------
export function tingsha(E, dest, t, { freq = 2350, vel = 0.6 }) {
  const ctx = E.ctx, end = t + 9.5;
  const o = out(E, dest, 0.07 * vel, end);
  [0, 0.017].forEach((dt, k) => {
    [[1, 1, 9], [1.0029, 0.9, 9], [2.21, 0.32, 4], [2.218, 0.28, 4], [3.62, 0.14, 2], [5.1, 0.06, 1]].forEach(([r, a, T]) => {
      const osc = sine(ctx, freq * r * (k ? 1.004 : 1), t + dt, end), g = egain(ctx, t + dt, a * (k ? 0.8 : 1), 0.001, T / 6.9);
      osc.connect(g); g.connect(o);
    });
  });
  return end;
}

// ---------------- Поющая чаша ----------------
// mode: 'strike' — удар; 'sing' — ведение по краю (плавное нарастание и долгое пение)
export function bowl(E, dest, t, { freq = 180, vel = 0.7, mode = 'strike', hold = 6 }) {
  const ctx = E.ctx;
  const sing = mode === 'sing';
  const end = t + (sing ? hold + 3 : 0) + 24;
  const o = out(E, dest, 0.2 * vel, end);
  const lp = filt(ctx, 'lowpass', 6500, 0.4); lp.connect(o);
  [[1, 1, 24], [2.71, 0.5, 12], [5.15, 0.26, 5.5], [8.21, 0.09, 2.5]].forEach(([r, a, T], i) => {
    const beat = rnd(0.45, 1.6) * (i + 1) * 0.6;
    [0, beat].forEach((b, k) => {
      const osc = sine(ctx, freq * r + b, t, end);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      const amp = a * (k ? 0.75 : 1);
      if (sing) {
        g.gain.linearRampToValueAtTime(amp * (i === 0 ? 0.9 : 0.35), t + 3 + i * 0.5);
        g.gain.setTargetAtTime(0, t + 3 + hold, T / 6.9);
      } else { g.gain.linearRampToValueAtTime(amp, t + 0.008); g.gain.setTargetAtTime(0, t + 0.008, T / 6.9); }
      osc.connect(g); g.connect(lp);
    });
  });
  if (!sing) {
    const n = E.noiseSource('pink'), f = filt(ctx, 'lowpass', 900), g = egain(ctx, t, 0.4 * vel, 0.002, 0.025);
    n.connect(f); f.connect(g); g.connect(lp); E.startNoise(n, t); n.stop(t + 0.2);
  }
  return end;
}

// ---------------- Гонг (мягкий, с «расцветом» верхних обертонов) ----------------
export function gong(E, dest, t, { freq = 62, vel = 0.7 }) {
  const ctx = E.ctx, end = t + 24;
  const o = out(E, dest, 0.06 * vel, end);
  const lp = filt(ctx, 'lowpass', 900, 0.5); lp.connect(o);
  lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(4200, t + 1.8); lp.frequency.setTargetAtTime(1500, t + 2, 4);
  [1, 1.47, 1.98, 2.43, 2.91, 3.34, 3.87, 4.42, 5.02, 5.61, 6.23, 6.9, 7.6, 8.3, 9.4, 10.9, 12.3, 14.1].forEach((r) => {
    const f = freq * r * (1 + (Math.random() - 0.5) * 0.012);
    const osc = sine(ctx, f, t, end);
    const g = egain(ctx, t, 1 / Math.pow(r, 0.65), 0.03 + (r / 14) * 1.6, (16 / Math.sqrt(r) + 2) / 6.9);
    osc.connect(g); g.connect(lp);
  });
  const th = sine(ctx, 52, t, t + 2), tg = egain(ctx, t, 1.6, 0.004, 0.18); th.connect(tg); tg.connect(o);
  const n = E.noiseSource('pink'), bp = filt(ctx, 'bandpass', 3000, 0.7), ng = egain(ctx, t, 0.5, 1.2, 1.4);
  n.connect(bp); bp.connect(ng); ng.connect(o); E.startNoise(n, t); n.stop(end);
  return end;
}

// ---------------- Окарина ----------------
// notes: [{f, d, v}] — частота, длительность, громкость. Фраза поётся легато одним дыханием.
export function ocarina(E, dest, t, notes, { vel = 0.6, breath = 0.5 } = {}) {
  const ctx = E.ctx;
  const total = notes.reduce((a, n) => a + n.d, 0), end = t + total + 0.7;
  const o = out(E, dest, 0.15 * vel, end);
  const lp = filt(ctx, 'lowpass', 4200, 0.5); lp.connect(o);
  const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.connect(lp);
  const oscs = [[1, 1], [2, 0.07], [3, 0.035]].map(([r, a]) => {
    const osc = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = a;
    osc.connect(g); g.connect(env); osc.start(t); osc.stop(end); osc._r = r; return osc;
  });
  const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(4.8, 5.6);
  const vib = ctx.createGain(); vib.gain.setValueAtTime(0, t); vib.gain.linearRampToValueAtTime(rnd(9, 15), t + 0.6);
  lfo.connect(vib); oscs.forEach((x) => vib.connect(x.detune)); lfo.start(t); lfo.stop(end);
  const n = E.noiseSource('pink'), bp = filt(ctx, 'bandpass', notes[0].f, 3), ng = ctx.createGain(); ng.gain.value = 0.06 * breath;
  n.connect(bp); bp.connect(ng); ng.connect(env); E.startNoise(n, t); n.stop(end);
  const air = E.noiseSource('white'), hp = filt(ctx, 'highpass', 5000), ag = ctx.createGain(); ag.gain.value = 0.012 * breath;
  air.connect(hp); hp.connect(ag); ag.connect(env); E.startNoise(air, t); air.stop(end);

  let tt = t;
  notes.forEach((nt, i) => {
    const a = nt.v ?? 1, f = nt.f;
    oscs.forEach((x) => {
      if (i === 0) { x.frequency.setValueAtTime(f * x._r * 0.985, tt); x.frequency.setTargetAtTime(f * x._r, tt, 0.035); }
      else x.frequency.setTargetAtTime(f * x._r, tt, 0.018);
    });
    bp.frequency.setTargetAtTime(f, tt, 0.02);
    if (i === 0) env.gain.linearRampToValueAtTime(a, tt + 0.09);
    else { env.gain.setTargetAtTime(a * 0.55, tt - 0.035, 0.01); env.gain.setTargetAtTime(a, tt + 0.012, 0.025); }
    tt += nt.d;
  });
  env.gain.setTargetAtTime(0, tt - 0.06, 0.07);
  return end;
}

// ---------------- Калимба ----------------
export function kalimba(E, dest, t, { freq, vel = 0.6 }) {
  const ctx = E.ctx, low = clamp((600 - freq) / 400, 0, 1), end = t + 2.6 + low;
  const o = out(E, dest, 0.18 * vel, end);
  [[1, 1, 1.6 + low * 1.2], [2, 0.05, 0.6], [5.93, 0.16, 0.18]].forEach(([r, a, T]) => {
    const osc = sine(ctx, freq * r, t, end), g = egain(ctx, t, a, 0.0015, T / 6.9);
    osc.connect(g); g.connect(o);
  });
  const n = E.noiseSource('white'), bp = filt(ctx, 'bandpass', 2500, 1), g = egain(ctx, t, 0.2, 0.0005, 0.003);
  n.connect(bp); bp.connect(g); g.connect(o); E.startNoise(n, t); n.stop(t + 0.03);
  return end;
}

// ---------------- Погремушка (семена в тыкве) ----------------
export function rattle(E, dest, t, { dur = 0.8, vel = 0.6, shakes = 2, tone = 4200 }) {
  const ctx = E.ctx, end = t + dur + 0.3;
  const o = out(E, dest, 0.5 * vel, end);
  const n = E.noiseSource('white'), bp = filt(ctx, 'bandpass', tone, 0.9), hp = filt(ctx, 'highpass', 1600), g = ctx.createGain();
  n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(o); E.startNoise(n, t); n.stop(end);
  const times = [];
  for (let k = 0; k < shakes; k++) {
    const c = t + 0.05 + (k + 0.5) * (dur / shakes);
    const count = Math.floor(rnd(18, 32));
    for (let i = 0; i < count; i++) times.push(c + Math.pow(Math.random(), 1.6) * 0.12 * (Math.random() < 0.5 ? -1 : 1));
  }
  times.sort((a, b) => a - b);
  grains(g, times, () => rnd(0.2, 1), 0.0035);
  return end;
}
export function shaker(E, dest, t, { vel = 0.5 }) {
  const ctx = E.ctx, end = t + 0.18;
  const o = out(E, dest, 0.3 * vel, end + 0.1);
  const n = E.noiseSource('white'), bp = filt(ctx, 'bandpass', 6200, 0.8), g = ctx.createGain();
  n.connect(bp); bp.connect(g); g.connect(o); E.startNoise(n, t); n.stop(end);
  const times = []; for (let i = 0; i < 14; i++) times.push(t + Math.pow(i / 14, 1.4) * 0.07 + Math.random() * 0.004);
  times.sort((a, b) => a - b);
  grains(g, times, (i) => (1 - i / 16) * rnd(0.4, 1), 0.004);
  return end;
}

// ---------------- Дождевая палка ----------------
export function rainstick(E, dest, t, { dur = 4.5, vel = 0.6 }) {
  const ctx = E.ctx, end = t + dur + 0.4;
  const o = out(E, dest, 0.42 * vel, end);
  const n = E.noiseSource('white'), b1 = filt(ctx, 'bandpass', 3200, 0.6), b2 = filt(ctx, 'bandpass', 6800, 1.6), g = ctx.createGain();
  n.connect(b1); n.connect(b2); b1.connect(g); b2.connect(g); g.connect(o); E.startNoise(n, t); n.stop(end);
  const times = []; let tt = t;
  while (tt < t + dur) {
    const u = (tt - t) / dur, rate = 260 * Math.pow(1 - u, 1.2) * Math.min(1, u * 9) + 8;
    tt += -Math.log(1 - Math.random()) / rate; times.push(tt);
  }
  grains(g, times, (i, tg) => rnd(0.15, 1) * (1 - (tg - t) / dur * 0.6), 0.003);
  for (let i = 0; i < 24; i++) {
    const tp = t + Math.pow(Math.random(), 0.8) * dur, f = rnd(3000, 7500);
    const osc = sine(ctx, f, tp, tp + 0.05), pg = egain(ctx, tp, rnd(0.02, 0.07), 0.0005, 0.008);
    osc.connect(pg); pg.connect(o);
  }
  return end;
}

// ---------------- Океанский барабан ----------------
export function oceanDrum(E, dest, t, { dur = 7, vel = 0.6 }) {
  const ctx = E.ctx, end = t + dur + 0.5;
  const o = out(E, dest, 0.35 * vel, end);
  const n = E.noiseSource('pink'), lp = filt(ctx, 'lowpass', 600, 0.5), g = ctx.createGain();
  n.connect(lp); lp.connect(g); g.connect(o); E.startNoise(n, t); n.stop(end);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
  lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2600, t + dur * 0.45); lp.frequency.linearRampToValueAtTime(400, t + dur);
  const b = E.noiseSource('white'), bp = filt(ctx, 'bandpass', 5200, 1), bg = ctx.createGain();
  b.connect(bp); bp.connect(bg); bg.connect(o); E.startNoise(b, t); b.stop(end);
  const times = []; let tt = t + 0.1;
  while (tt < t + dur) { const u = (tt - t) / dur, dens = 140 * Math.sin(Math.PI * u) + 5; tt += -Math.log(1 - Math.random()) / dens; times.push(tt); }
  grains(bg, times, (i, tg) => 0.35 * Math.sin(Math.PI * clamp((tg - t) / dur, 0, 1)) * rnd(0.3, 1), 0.003);
  return end;
}

// ---------------- Ритмические ----------------
export function frameDrum(E, dest, t, { hit = 'dum', vel = 0.7 }) {
  const ctx = E.ctx;
  if (hit === 'dum') {
    const end = t + 1.6, o = out(E, dest, 0.32 * vel, end);
    const osc = sine(ctx, 98, t, end); osc.frequency.setTargetAtTime(63, t, 0.05);
    const g = egain(ctx, t, 1, 0.003, 0.2); osc.connect(g); g.connect(o);
    const m2 = sine(ctx, 63 * 1.59, t, t + 0.5), g2 = egain(ctx, t, 0.22, 0.002, 0.06); m2.connect(g2); g2.connect(o);
    const n = E.noiseSource('pink'), lp = filt(ctx, 'lowpass', 500), gn = egain(ctx, t, 0.3, 0.001, 0.03);
    n.connect(lp); lp.connect(gn); gn.connect(o); E.startNoise(n, t); n.stop(t + 0.2);
    return end;
  }
  if (E.hp && E.hp.strikes.knuckle) return E.hp.strike(dest, t, hit === 'slap' ? 'slap' : 'knuckle', vel * 0.8);
  const end = t + 0.3, o = out(E, dest, 0.32 * vel, end);
  const n = E.noiseSource('white'), bp = filt(ctx, 'bandpass', 2300, 1.2), gn = egain(ctx, t, 1, 0.001, 0.022);
  n.connect(bp); bp.connect(gn); gn.connect(o); E.startNoise(n, t); n.stop(end);
  const osc = sine(ctx, 410, t, end), g = egain(ctx, t, 0.3, 0.001, 0.035); osc.connect(g); g.connect(o);
  return end;
}
export function heart(E, dest, t, { hit = 'lub', vel = 0.7 }) {
  const ctx = E.ctx, end = t + 0.8, lub = hit === 'lub';
  const o = out(E, dest, (lub ? 0.62 : 0.42) * vel, end);
  const lp = filt(ctx, 'lowpass', 190, 0.6); lp.connect(o);
  const osc = sine(ctx, lub ? 64 : 74, t, end); osc.frequency.setTargetAtTime(lub ? 44 : 52, t, 0.04);
  const g = egain(ctx, t, 1, 0.006, lub ? 0.09 : 0.065); osc.connect(g); g.connect(lp);
  const n = E.noiseSource('brown'), gn = egain(ctx, t, 0.5, 0.004, 0.04); n.connect(gn); gn.connect(lp); E.startNoise(n, t); n.stop(t + 0.25);
  return end;
}
export function udu(E, dest, t, { vel = 0.6, freq = 150 }) {
  const ctx = E.ctx, end = t + 1;
  const o = out(E, dest, 0.42 * vel, end);
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.55, t); osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.09); osc.frequency.linearRampToValueAtTime(freq * 0.96, t + 0.4);
  osc.start(t); osc.stop(end);
  const g = egain(ctx, t, 1, 0.004, 0.16); osc.connect(g); g.connect(o);
  const n = E.noiseSource('pink'), bp = filt(ctx, 'bandpass', freq * 3, 2), gn = egain(ctx, t, 0.25, 0.001, 0.02);
  n.connect(bp); bp.connect(gn); gn.connect(o); E.startNoise(n, t); n.stop(t + 0.1);
  return end;
}

// ---------------- «Луч»: светящееся облако высоких обертонов ----------------
export function shimmer(E, dest, t, { freqs, dur = 9, vel = 0.5 }) {
  const ctx = E.ctx, end = t + dur + 7;
  const o = out(E, dest, 0.045 * vel, end);
  freqs.forEach((f, i) => {
    const osc = sine(ctx, f * (1 + (Math.random() - 0.5) * 0.002), t, end);
    const trem = ctx.createOscillator(); trem.frequency.value = rnd(0.15, 0.5);
    const depth = ctx.createGain(); depth.gain.value = 0.25; trem.connect(depth);
    const tremG = ctx.createGain(); tremG.gain.value = 0.75; depth.connect(tremG.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1 / (1 + i * 0.25), t + 2 + i * 0.45);
    g.gain.setTargetAtTime(0, t + dur * 0.6 + i * 0.3, 1.6);
    trem.start(t); trem.stop(end);
    osc.connect(tremG); tremG.connect(g); g.connect(o);
  });
  return end;
}
