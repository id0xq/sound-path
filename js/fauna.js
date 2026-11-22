// Животные: песни китов, дельфины, лягушки, совы, волки вдали, гагара на озере, цикады, шмель,
// дятел, чайки и кот, который мурлычет рядом. Голоса синтезируются по повадкам настоящих животных:
// у горбатого кита песня складывается из тем, которые повторяются; лягушки перекликаются хором;
// волки воют вразнобой и сходятся в аккорд; шмель облетает голову — лучшая проверка объёма в наушниках.
import { polar, toPolar, clamp } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sgn = () => (Math.random() < 0.5 ? -1 : 1);

// живые записи: киты — Ocean Song (NOAA SanctSound, MBARI MARS), остальные — Freesound, CC0
const REC = { whales: 'whale', dolphins: 'dolphins', owls: 'owl', wolves: 'wolf', loon: 'loon', gulls: 'gulls', woodpecker: 'woodpecker', bees: 'bee' };

export const ANIMALS = {
  whales: { name: 'Киты', far: true },
  dolphins: { name: 'Дельфины' },
  frogs: { name: 'Лягушки' },
  owls: { name: 'Совы' },
  wolves: { name: 'Волки вдали', far: true },
  loon: { name: 'Гагара на озере', far: true },
  cicadas: { name: 'Цикады' },
  bees: { name: 'Шмель' },
  woodpecker: { name: 'Дятел' },
  gulls: { name: 'Чайки' },
  cat: { name: 'Кот мурлычет' },
};

// плавная кривая частоты: shape — форма движения голоса
export function curve(points, n = 32, vib = 0, vibRate = 5, dur = 1) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), x = u * (points.length - 1), k = Math.min(points.length - 2, Math.floor(x)), f = x - k;
    const s = f * f * (3 - 2 * f);
    let v = points[k] * Math.pow(points[k + 1] / points[k], s);
    if (vib) v *= 1 + vib * Math.sin(2 * Math.PI * vibRate * u * dur);
    a[i] = v;
  }
  return a;
}
export function envCurve(n, att = 0.15, rel = 0.3, peak = 1) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    a[i] = peak * (u < att ? 0.5 - 0.5 * Math.cos(Math.PI * u / att) : u > 1 - rel ? 0.5 + 0.5 * Math.cos(Math.PI * (u - 1 + rel) / rel) : 1);
  }
  a[n - 1] = 0; return a;
}

export class Fauna {
  constructor(app) {
    this.app = app; this.E = app.E; this.lv = {}; this.next = {}; this.ems = [];
    this.loops = {};
  }
  setLevels(L = {}, fade = 3) {
    for (const k of Object.keys(ANIMALS)) {
      const v = L[k] || 0, was = this.lv[k] || 0; this.lv[k] = v;
      if (v > 0.01 && !(was > 0.01)) this.next[k] = this.E.now + rnd(1, 5);
      if (k === 'cicadas' || k === 'cat' || k === 'frogs') {
        // хор лягушек, цикады и кот — живые записи-фоны; синтез — только если записи нет
        const F = this.app.field;
        if (F && F.known('bed', k)) { F.setBed(k, v, fade); if (k !== 'frogs') this.loop(k, 0, fade); }
        else if (k !== 'frogs') this.loop(k, v, fade);
      }
    }
  }
  clear() { this.setLevels({}, 0.5); }

  em(pos, kind = 'bird', label = '', send = 0.4, life = 10, hrtf, atmos) {
    return this.E.spawn({ group: 'birds', pos, send, kind, label, life: this.E.now + life, hrtf, atmos });
  }
  voiceGain(dest, v) { const g = this.E.ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }

  tick(now, horizon, S) {
    for (const [k, v] of Object.entries(this.lv)) {
      if (!(v > 0.01) || k === 'cicadas' || k === 'cat') continue;
      if (k === 'frogs' && this.app.field && this.app.field.known('bed', 'frogs')) continue;
      if (now + 0.5 < (this.next[k] || 0)) continue;
      const t = Math.max(now + 0.1, this.next[k] || now);
      const gap = (REC[k] && this.app.field && this.app.field.known('call', REC[k]) && this.rec(k, t, v)) || this[k](t, v);
      this.next[k] = t + gap * (1.6 - Math.min(1, v));
    }
  }

  // ---------- Живые голоса ----------
  // Настоящая запись звучит из своего места: кит — глубоко внизу и медленно проплывает, волки — далеко за холмами,
  // шмель облетает голову. Возвращает паузу до следующего голоса (или 0, если запись ещё грузится — тогда звучит синтез).
  rec(k, t, v) {
    const F = this.app.field, E = this.E, ctx = E.ctx, name = REC[k];
    let pos, path = null, group = 'birds', send = 0.5, atmos, gain = 0.4, kind = 'bird', seq = false, rate = 1, gapAfter = [6, 20];
    switch (k) {
      case 'whales': {
        if (!this.recWhale || Math.random() < 0.06) this.recWhale = { az: rnd(-180, 180) };
        const W = this.recWhale; W.az += rnd(-30, 30);
        pos = polar(W.az, rnd(-28, -6), rnd(13, 22)); path = (end) => [{ t, pos }, { t: end, pos: polar(W.az + sgn() * rnd(25, 60), rnd(-25, -5), rnd(13, 22)) }];
        group = 'deep'; send = 0.95; atmos = 0.85; gain = 0.27; kind = 'water'; seq = true; gapAfter = [1.5, 6]; break;
      }
      case 'dolphins': {
        const az = rnd(-180, 180), d = rnd(5, 10), dir = sgn();
        pos = polar(az, rnd(-20, 5), d); path = (end) => Array.from({ length: 7 }, (_, i) => ({ t: t + (end - t) * i / 6, pos: polar(az + dir * i * 30, rnd(-20, 5), d) }));
        send = 0.75; gain = 0.1; kind = 'water'; gapAfter = [4, 14]; break;
      }
      case 'owls': pos = polar(rnd(-170, 170), rnd(15, 40), rnd(10, 22)); send = 0.55; gain = 0.35; gapAfter = [10, 26]; break;
      case 'wolves': pos = polar(rnd(-150, 150), rnd(0, 10), rnd(25, 45)); send = 0.9; atmos = 0.5; gain = 0.45; gapAfter = [25, 60]; break;
      case 'loon': pos = polar(rnd(-120, 120), rnd(-5, 5), rnd(25, 45)); send = 0.85; atmos = 0.55; gain = 0.4; gapAfter = [14, 40]; break;
      case 'gulls': { const az = rnd(-160, 160); pos = polar(az, rnd(25, 50), rnd(15, 30)); path = (end) => [{ t, pos }, { t: end + 2, pos: polar(az + sgn() * rnd(40, 90), rnd(25, 50), rnd(15, 30)) }]; send = 0.6; gain = 0.25; gapAfter = [5, 16]; break; }
      case 'woodpecker': pos = polar(rnd(-160, 160), rnd(20, 45), rnd(12, 25)); send = 0.5; gain = 0.3; kind = 'rhythm'; gapAfter = [12, 30]; break;
      case 'bees': {
        const az0 = rnd(-180, 180), dir = sgn();
        pos = polar(az0, 10, 1.4);
        path = (end) => { const d = end - t, pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push({ t: t + u * d, pos: polar(az0 + dir * 360 * u + Math.sin(u * 9) * 20, 5 + 25 * Math.sin(u * 5), 0.9 + 1.4 * Math.abs(Math.sin(u * 3)) + u * 2.5) }); } return pts; };
        send = 0.12; gain = 0.16; rate = rnd(0.95, 1.05); gapAfter = [20, 50]; break;
      }
      default: return 0;
    }
    const em = E.spawn({ group, pos, send, atmos, kind, label: ANIMALS[k].name, hrtf: true });
    const g = ctx.createGain(); g.gain.value = gain * Math.min(1.3, v + 0.3); g.connect(em.input);
    const end = F.call(g, t, name, { vel: 0.9, seq, rate });
    if (end === null) { em.dispose(); return 0; }
    if (path) em.path(path(end));
    em.end = end; em.glow = 0.6; em.flash(t, end - t);
    E.after(end + 1.5, () => { g.disconnect(); em.dispose(); });
    return (end - t) + rnd(gapAfter[0], gapAfter[1]);
  }

  // ---------- Киты: темы из повторяющихся фраз, глубоко внизу и далеко ----------
  whales(t, v) {
    const E = this.E, ctx = E.ctx;
    if (!this.whale || Math.random() < 0.08) this.whale = { az: rnd(-180, 180), base: rnd(0.85, 1.2), theme: null, reps: 0 };
    const W = this.whale;
    if (!W.theme || W.reps <= 0) {
      W.theme = Array.from({ length: Math.floor(rnd(3, 6)) }, () => pick(['moan', 'moan', 'whoop', 'cry', 'groan', 'up']));
      W.shape = W.theme.map(() => ({ f: rnd(0.8, 1.25), d: rnd(0.8, 1.2) }));
      W.reps = Math.floor(rnd(2, 4));
    }
    W.reps--;
    W.az += rnd(-25, 25);
    const pos = polar(W.az, rnd(-30, -8), rnd(10, 20));
    const em = this.em(pos, 'water', 'кит', 0.85, 30, true, 0.75);
    em.path([{ t, pos }, { t: t + 22, pos: polar(W.az + sgn() * rnd(20, 50), rnd(-25, -5), rnd(10, 20)) }]);
    const out = this.voiceGain(em.input, 0.8 * v);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.5; lp.connect(out);
    let tt = t;
    W.theme.forEach((u, i) => {
      const sh = W.shape[i], k = W.base * sh.f;
      tt = this.whaleUnit(lp, tt, u, k, sh.d) + rnd(0.3, 1.1);
    });
    em.end = tt; em.glow = 0.5;
    E.after(tt + 2, () => out.disconnect());
    return tt - t + rnd(3, 9);
  }
  whaleUnit(dest, t, type, k, dk) {
    const ctx = this.E.ctx;
    const P = {
      moan: { f: [140, 180, 120], d: 2.6, h: [1, 0.5, 0.25], att: 0.3, vib: 0.01 },
      whoop: { f: [120, 520], d: 1.2, h: [1, 0.35, 0.1], att: 0.2, vib: 0 },
      up: { f: [260, 380, 300], d: 1.8, h: [1, 0.3, 0.2], att: 0.25, vib: 0.015 },
      cry: { f: [900, 1250, 760], d: 1.6, h: [1, 0.2], att: 0.2, vib: 0.02 },
      groan: { f: [70, 55], d: 2.2, h: [1, 0.7, 0.5, 0.3], att: 0.15, vib: 0, am: 28 },
    }[type];
    const d = P.d * dk, end = t + d;
    const fc = curve(P.f.map((f) => f * k), 48, P.vib, 3.5, d);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(dest);
    g.gain.setValueCurveAtTime(envCurve(48, P.att, 0.35, 0.42), t, d);
    P.h.forEach((amp, i) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.setValueCurveAtTime(fc.map((f) => f * (i + 1) * (1 + (Math.random() - 0.5) * 0.004)), t, d);
      const og = ctx.createGain(); og.gain.value = amp * 0.6; o.connect(og); og.connect(g); o.start(t); o.stop(end + 0.05);
    });
    if (P.am) { const m = ctx.createOscillator(); m.frequency.value = P.am; const mg = ctx.createGain(); mg.gain.value = 0.35; m.connect(mg); mg.connect(g.gain); m.start(t); m.stop(end); }
    return end;
  }

  // ---------- Дельфины: свисты и щелчки, стая кружит рядом ----------
  dolphins(t, v) {
    const E = this.E, ctx = E.ctx, az = rnd(-180, 180), dist = rnd(5, 12);
    const pos = polar(az, rnd(-20, 5), dist);
    const em = this.em(pos, 'water', 'дельфины', 0.6, 8, true);
    const dir = sgn(); const pts = [];
    for (let k = 0; k <= 8; k++) pts.push({ t: t + k * 0.7, pos: polar(az + dir * k * 22, rnd(-20, 5), dist * (1 - k * 0.04)) });
    em.path(pts);
    const out = this.voiceGain(em.input, 0.18 * v);
    let tt = t;
    const n = Math.floor(rnd(2, 5));
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.6) {
        const d = rnd(0.25, 0.9), f0 = rnd(3800, 6500), sh = pick([[f0, f0 * 1.6], [f0 * 1.5, f0], [f0, f0 * 1.4, f0 * 1.1], [f0, f0 * 1.25, f0 * 0.95, f0 * 1.35]]);
        const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0;
        o.frequency.setValueCurveAtTime(curve(sh, 32, 0.01, 9, d), tt, d);
        g.gain.setValueCurveAtTime(envCurve(32, 0.1, 0.25, 0.5), tt, d);
        o.connect(g); g.connect(out); o.start(tt); o.stop(tt + d + 0.02);
        tt += d + rnd(0.05, 0.3);
      } else {
        // щелчки: эхолокация, частота щелчков ускоряется
        const src = E.noiseSource('white', false), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
        const g = ctx.createGain(); g.gain.value = 0; src.connect(hp); hp.connect(g); g.connect(out);
        let ct = tt, rate = rnd(12, 30); const len = rnd(0.5, 1.4);
        // частота щелчков растёт, но не бесконечно: иначе шаги сходятся и цикл никогда не кончится
        for (let n = 0; ct < tt + len && n < 160; n++) { g.gain.setValueAtTime(0.5, ct); g.gain.setTargetAtTime(0, ct + 0.0005, 0.0008); ct += 1 / rate; rate = Math.min(220, rate * rnd(1.03, 1.1)); }
        E.startNoise(src, tt); src.stop(ct + 0.05);
        tt = ct + rnd(0.1, 0.4);
      }
    }
    E.after(tt + 1, () => out.disconnect());
    return tt - t + rnd(2, 7);
  }

  // ---------- Лягушки: хор у воды, перекличка с разных сторон ----------
  frogs(t, v) {
    const E = this.E, ctx = E.ctx;
    const type = pick(['croak', 'croak', 'tree', 'trill']);
    const pos = polar(rnd(-160, 160), rnd(-25, -5), rnd(4, 14));
    const em = this.em(pos, 'water', 'лягушка', 0.3, 6, false);
    const out = this.voiceGain(em.input, 0.22 * v);
    let tt = t;
    const P = type === 'croak' ? { car: rnd(320, 560), rate: rnd(16, 26), len: rnd(0.25, 0.6), reps: Math.floor(rnd(2, 6)), gap: rnd(0.25, 0.6), bw: 2.5 }
      : type === 'tree' ? { car: rnd(1800, 2600), rate: rnd(40, 70), len: rnd(0.06, 0.12), reps: Math.floor(rnd(4, 10)), gap: rnd(0.12, 0.25), bw: 4 }
        : { car: rnd(1100, 1500), rate: rnd(18, 24), len: rnd(1.5, 3.5), reps: 1, gap: 0.5, bw: 3 };
    for (let r = 0; r < P.reps; r++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = P.car * rnd(0.98, 1.02);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = P.car * 1.4; bp.Q.value = P.bw;
      const g = ctx.createGain(); g.gain.value = 0;
      for (let pt = tt; pt < tt + P.len; pt += 1 / P.rate) { g.gain.setValueAtTime(0.5, pt); g.gain.setTargetAtTime(0, pt + 0.004, 0.25 / P.rate); }
      o.connect(bp); bp.connect(g); g.connect(out); o.start(tt); o.stop(tt + P.len + 0.05);
      em.flash(tt, P.len);
      tt += P.len + P.gap;
    }
    E.after(tt + 1, () => out.disconnect());
    return tt - t + rnd(0.5, 4);
  }

  // ---------- Совы: «уу… у-у-ууу» и отклик «ки-вик» ----------
  owls(t, v) {
    const E = this.E, ctx = E.ctx, pos = polar(rnd(-170, 170), rnd(15, 40), rnd(12, 25));
    const em = this.em(pos, 'bird', 'сова', 0.55, 10, true);
    const out = this.voiceGain(em.input, 0.45 * v);
    const hoot = (st, d, f0, f1, vib = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0;
      o.frequency.setValueCurveAtTime(curve([f0, f1], 24, vib, 7, d), st, d);
      g.gain.setValueCurveAtTime(envCurve(24, 0.25, 0.4, 0.5), st, d);
      const o2 = ctx.createOscillator(); o2.frequency.setValueCurveAtTime(curve([f0 * 2, f1 * 2], 24, vib, 7, d), st, d);
      const g2 = ctx.createGain(); g2.gain.value = 0.08; o2.connect(g2); g2.connect(g);
      o.connect(g); g.connect(out); o.start(st); o.stop(st + d + 0.02); o2.start(st); o2.stop(st + d + 0.02);
      return st + d;
    };
    let tt = t;
    if (Math.random() < 0.75) {
      const f = rnd(380, 470);
      tt = hoot(tt, 0.55, f * 1.02, f * 0.93) + rnd(2.2, 3.5);
      tt = hoot(tt, 0.12, f, f * 0.98) + 0.12;
      tt = hoot(tt, 0.1, f * 0.97, f * 0.95) + 0.1;
      tt = hoot(tt, 1.1, f * 1.04, f * 0.92, 0.035);
    } else {
      tt = hoot(tt, 0.22, 1300, 1700) + 0.05; tt = hoot(tt, 0.25, 1650, 1250);
    }
    em.flash(t, tt - t);
    E.after(tt + 1, () => out.disconnect());
    return tt - t + rnd(8, 22);
  }

  // ---------- Волки: далёкий вой, голоса сходятся в аккорд ----------
  wolves(t, v) {
    const E = this.E, ctx = E.ctx, az = rnd(-150, 150), n = Math.random() < 0.5 ? 1 : Math.floor(rnd(2, 4));
    let end = t;
    for (let w = 0; w < n; w++) {
      const st = t + w * rnd(0.8, 2.5), pos = polar(az + rnd(-25, 25), rnd(0, 10), rnd(30, 50));
      const em = this.em(pos, 'bird', 'волки', 0.9, 14, true, 0.5);
      const out = this.voiceGain(em.input, 0.55 * v);
      const f0 = rnd(300, 380) * (1 + w * 0.12), top = f0 * rnd(1.35, 1.7), d = rnd(3, 6);
      const fc = curve([f0, top, top * rnd(0.97, 1.05), top * 1.02, f0 * 0.75], 64, 0.012, 5.5, d);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueCurveAtTime(fc, st, d);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 1.2;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1600;
      const s = ctx.createOscillator(); s.frequency.setValueCurveAtTime(fc, st, d); const sg = ctx.createGain(); sg.gain.value = 0.9;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envCurve(48, 0.12, 0.3, 0.5), st, d);
      o.connect(f1); f1.connect(f2); f2.connect(g); s.connect(sg); sg.connect(g); g.connect(out);
      o.start(st); s.start(st); o.stop(st + d + 0.05); s.stop(st + d + 0.05);
      em.flash(st, d);
      end = Math.max(end, st + d);
      E.after(st + d + 1, () => out.disconnect());
    }
    return end - t + rnd(25, 60);
  }

  // ---------- Гагара: протяжный зов над озером ----------
  loon(t, v) {
    const E = this.E, ctx = E.ctx, pos = polar(rnd(-120, 120), rnd(-5, 5), rnd(25, 45));
    const em = this.em(pos, 'bird', 'гагара', 0.85, 14, true, 0.55);
    const out = this.voiceGain(em.input, 0.5 * v);
    const notes = pick([[[720, 740, 1.4], [1050, 1030, 1.8], [900, 880, 1.6]], [[700, 1100, 0.6], [1080, 1050, 2.2]], [[880, 900, 2.4]]]);
    let tt = t;
    notes.forEach(([a, b, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0;
      o.frequency.setValueCurveAtTime(curve([a, b], 32, 0.008, 6, d), tt, d);
      g.gain.setValueCurveAtTime(envCurve(32, 0.2, 0.35, 0.5), tt, d);
      const o2 = ctx.createOscillator(); o2.frequency.setValueCurveAtTime(curve([a * 2, b * 2], 32, 0.008, 6, d), tt, d);
      const g2 = ctx.createGain(); g2.gain.value = 0.12; o2.connect(g2); g2.connect(g);
      o.connect(g); g.connect(out); o.start(tt); o.stop(tt + d); o2.start(tt); o2.stop(tt + d);
      tt += d + 0.15;
    });
    em.flash(t, tt - t);
    E.after(tt + 1, () => out.disconnect());
    return tt - t + rnd(15, 40);
  }

  // ---------- Шмель: облетает голову ----------
  bees(t, v) {
    const E = this.E, ctx = E.ctx, d = rnd(5, 9), az0 = rnd(-180, 180), dir = sgn();
    const em = this.em(polar(az0, 10, 1.4), 'bird', 'шмель', 0.12, d + 1, true);
    const pts = [];
    for (let k = 0; k <= 18; k++) { const u = k / 18; pts.push({ t: t + u * d, pos: polar(az0 + dir * 400 * u + Math.sin(u * 9) * 20, 5 + 25 * Math.sin(u * 5), 0.8 + 1.2 * Math.abs(Math.sin(u * 3)) + u * 3) }); }
    em.path(pts);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const f = rnd(150, 185);
    const fc = new Float32Array(64); for (let i = 0; i < 64; i++) fc[i] = f * (1 + 0.04 * Math.sin(i * 0.7) + 0.02 * Math.sin(i * 2.3));
    o.frequency.setValueCurveAtTime(fc, t, d);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envCurve(32, 0.12, 0.3, 0.09 * v), t, d);
    o.connect(lp); lp.connect(g); g.connect(em.input); o.start(t); o.stop(t + d + 0.05);
    em.glow = 0.7;
    E.after(t + d + 1, () => g.disconnect());
    return d + rnd(20, 50);
  }

  // ---------- Дятел: дробь по стволу ----------
  woodpecker(t, v) {
    const E = this.E, ctx = E.ctx, pos = polar(rnd(-160, 160), rnd(20, 45), rnd(15, 30));
    const em = this.em(pos, 'rhythm', 'дятел', 0.5, 4, true);
    const out = this.voiceGain(em.input, 0.5 * v);
    const n = Math.floor(rnd(14, 24)), f = rnd(900, 1400);
    let tt = t, gap = 1 / rnd(16, 22);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.frequency.value = f * rnd(0.97, 1.03);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.4 * (1 - i / n * 0.6), tt); g.gain.setTargetAtTime(0, tt + 0.002, 0.008);
      o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.05);
      tt += gap; gap *= 1.012;
    }
    em.flash(t, tt - t);
    E.after(tt + 1, () => out.disconnect());
    return tt - t + rnd(12, 30);
  }

  // ---------- Чайки над морем ----------
  gulls(t, v) {
    const E = this.E, ctx = E.ctx, az = rnd(-160, 160), pos = polar(az, rnd(25, 50), rnd(15, 35));
    const em = this.em(pos, 'bird', 'чайка', 0.6, 8, true);
    em.path([{ t, pos }, { t: t + 6, pos: polar(az + sgn() * rnd(40, 90), rnd(25, 50), rnd(15, 35)) }]);
    const out = this.voiceGain(em.input, 0.28 * v);
    let tt = t; const n = Math.random() < 0.5 ? 1 : Math.floor(rnd(3, 7)), f = rnd(1300, 1700);
    for (let i = 0; i < n; i++) {
      const d = n === 1 ? rnd(0.5, 0.8) : rnd(0.14, 0.22);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueCurveAtTime(curve(n === 1 ? [f * 0.8, f * 1.25, f * 0.7] : [f, f * 1.15, f * 0.85], 24), tt, d);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.6;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envCurve(24, 0.1, 0.4, 0.5), tt, d);
      o.connect(bp); bp.connect(g); g.connect(out); o.start(tt); o.stop(tt + d + 0.02);
      tt += d + (n === 1 ? 0 : rnd(0.04, 0.1));
    }
    E.after(tt + 1, () => out.disconnect());
    return tt - t + rnd(6, 18);
  }

  // ---------- Постоянные голоса: цикады и кот ----------
  loop(k, v, fade) {
    const E = this.E, ctx = E.ctx;
    if (v > 0.01 && !this.loops[k]) {
      const em = E.spawn({ group: 'birds', pos: k === 'cat' ? polar(-50, -30, 1.1) : polar(70, 20, 9), send: k === 'cat' ? 0.05 : 0.35, kind: k === 'cat' ? 'heart' : 'crickets', label: ANIMALS[k].name, hrtf: k === 'cat' });
      const g = ctx.createGain(); g.gain.value = 0; g.connect(em.input);
      if (k === 'cicadas') {
        [0, 1].forEach((side) => {
          const n = E.noiseSource('white'), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = side ? 5200 : 4300; bp.Q.value = 5;
          const am = ctx.createGain(); am.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.frequency.value = side ? 160 : 190; const lg = ctx.createGain(); lg.gain.value = 0.5;
          const swell = ctx.createGain(); swell.gain.value = 0.6; const sl = ctx.createOscillator(); sl.frequency.value = side ? 0.07 : 0.05; const sg = ctx.createGain(); sg.gain.value = 0.4;
          lfo.connect(lg); lg.connect(am.gain); sl.connect(sg); sg.connect(swell.gain);
          n.connect(bp); bp.connect(am); am.connect(swell); swell.connect(g);
          E.startNoise(n, E.now); lfo.start(); sl.start();
        });
      } else {
        // мурлыканье: низкие пульсы около 25 в секунду, вдох и выдох
        const n = E.noiseSource('brown'), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
        const am = ctx.createGain(); am.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 26; const lg = ctx.createGain(); lg.gain.value = 0.5;
        const br = ctx.createGain(); br.gain.value = 0.6; const bl = ctx.createOscillator(); bl.frequency.value = 0.42; const bg = ctx.createGain(); bg.gain.value = 0.4;
        lfo.connect(lg); lg.connect(am.gain); bl.connect(bg); bg.connect(br.gain);
        n.connect(lp); lp.connect(am); am.connect(br); br.connect(g); E.startNoise(n, E.now); lfo.start(); bl.start();
      }
      this.loops[k] = { em, g };
    }
    const L = this.loops[k];
    if (L) L.g.gain.setTargetAtTime(v * (k === 'cat' ? 0.7 : 0.12), E.now, Math.max(0.1, fade / 3));
  }
}
