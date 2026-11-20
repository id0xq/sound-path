// Природа: ветер, листва, ручей (проплывает мимо при ходьбе), волны, дождь, сверчки, костёр — и птицы.
import { polar, toPolar, clamp } from './util.js';
import { curve, envCurve } from './fauna.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function filt(ctx, type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

export const NATURE_LAYERS = {
  wind: 'Ветер', leaves: 'Листва', stream: 'Ручей', waves: 'Волны', rain: 'Дождь', crickets: 'Сверчки', fire: 'Костёр',
};

export class Nature {
  constructor(E) {
    this.E = E; const ctx = E.ctx; const g = E.groups.nature;
    this.levels = {}; this.L = {};
    const bed = (name, sendAmt = 0.25) => {
      const out = ctx.createGain(); out.gain.value = 0;
      const d = ctx.createGain(); d.gain.value = 1; const s = ctx.createGain(); s.gain.value = sendAmt;
      out.connect(d); out.connect(s); d.connect(g.dry); s.connect(g.send);
      this.L[name] = { out }; this.levels[name] = 0; return out;
    };
    const stereoNoise = (type, build) => {
      const m = ctx.createChannelMerger(2);
      [0, 1].forEach((ch) => { const n = E.noiseSource(type); const end = build(n, ch); end.connect(m, 0, ch); E.startNoise(n, ctx.currentTime); });
      return m;
    };

    // Ветер: два независимых канала с медленно плывущими полосами
    const wind = bed('wind', 0.15);
    this.windGust = ctx.createGain(); this.windGust.gain.value = 0.8; this.windGust.connect(wind);
    stereoNoise('brown', (n, ch) => {
      const bp = filt(ctx, 'bandpass', ch ? 520 : 400, 0.55);
      (this.windBands ||= []).push(bp);
      n.connect(bp); const g2 = ctx.createGain(); g2.gain.value = 1.4; bp.connect(g2); return g2;
    }).connect(this.windGust);
    const whistle = E.noiseSource('pink'), wbp = filt(ctx, 'bandpass', 900, 8), wg = ctx.createGain(); wg.gain.value = 0.035;
    this.whistleBand = wbp;
    whistle.connect(wbp); wbp.connect(wg); wg.connect(this.windGust); E.startNoise(whistle, ctx.currentTime);

    // Листва
    const leaves = bed('leaves', 0.2);
    this.leafEnv = ctx.createGain(); this.leafEnv.gain.value = 0.3; this.leafEnv.connect(leaves);
    stereoNoise('pink', (n, ch) => { const bp = filt(ctx, 'bandpass', ch ? 1700 : 2100, 0.7), lp = filt(ctx, 'lowpass', 4800, 0.5), g2 = ctx.createGain(); g2.gain.value = 0.8; n.connect(bp); bp.connect(lp); lp.connect(g2); return g2; }).connect(this.leafEnv);

    // Ручей: точечный источник в пространстве + лёгкий широкий слой
    const streamWide = bed('stream', 0.2);
    this.streamEm = E.spawn({ group: 'nature', pos: polar(-35, -15, 9), send: 0.3, kind: 'water', label: 'ручей' });
    this.streamIn = ctx.createGain(); this.streamIn.gain.value = 0; this.streamIn.connect(this.streamEm.input);
    const sn = E.noiseSource('pink'), sbp = filt(ctx, 'bandpass', 900, 0.5), slp = filt(ctx, 'lowpass', 2400, 0.5), sg = ctx.createGain(); sg.gain.value = 1.1;
    sn.connect(sbp); sbp.connect(slp); slp.connect(sg); sg.connect(this.streamIn); E.startNoise(sn, ctx.currentTime);
    stereoNoise('pink', (n) => { const bp = filt(ctx, 'bandpass', 1600, 0.8), g2 = ctx.createGain(); g2.gain.value = 0.12; n.connect(bp); bp.connect(g2); return g2; }).connect(streamWide);
    this.streamPhase = Math.random();

    // Волны: два слоя, каждый накатывает своим ритмом
    const waves = bed('waves', 0.3);
    this.waveLayers = [0, 1].map((k) => {
      const n = E.noiseSource('pink'), lp = filt(ctx, 'lowpass', 400, 0.4), g2 = ctx.createGain(); g2.gain.value = 0.05;
      const p = ctx.createStereoPanner(); p.pan.value = k ? 0.5 : -0.5;
      const foam = E.noiseSource('pink'), fhp = filt(ctx, 'bandpass', 2400, 0.7), fg = ctx.createGain(); fg.gain.value = 0;
      n.connect(lp); lp.connect(g2); g2.connect(p); foam.connect(fhp); fhp.connect(fg); fg.connect(p); p.connect(waves);
      E.startNoise(n, ctx.currentTime); E.startNoise(foam, ctx.currentTime);
      return { lp, g: g2, fg, p, next: ctx.currentTime + k * 4.5 };
    });

    // Дождь: мягкий шелест + капли
    const rain = bed('rain', 0.25);
    stereoNoise('pink', (n) => { const hp = filt(ctx, 'highpass', 500), lp = filt(ctx, 'lowpass', 3800), g2 = ctx.createGain(); g2.gain.value = 0.55; n.connect(hp); hp.connect(lp); lp.connect(g2); return g2; }).connect(rain);
    this.dropsN = E.noiseSource('white'); const dbp = filt(ctx, 'bandpass', 3800, 2); this.dropsG = ctx.createGain(); this.dropsG.gain.value = 0;
    this.dropsP = ctx.createStereoPanner();
    this.dropsN.connect(dbp); dbp.connect(this.dropsG); this.dropsG.connect(this.dropsP); this.dropsP.connect(rain); E.startNoise(this.dropsN, ctx.currentTime);

    // Сверчки — в нескольких точках пространства
    bed('crickets');
    this.cricketEms = [polar(-120, -10, 7), polar(70, -12, 9), polar(160, -8, 12)].map((p) => E.spawn({ group: 'nature', pos: p, send: 0.3, kind: 'crickets', label: 'сверчок', hrtf: false }));
    this.cricketNext = [0, 0, 0];

    // Костёр — впереди и чуть ниже
    bed('fire', 0.15);
    this.fireEm = E.spawn({ group: 'nature', pos: polar(10, -25, 2.6), send: 0.2, kind: 'fire', label: 'костёр', hrtf: false });
    this.fireIn = ctx.createGain(); this.fireIn.gain.value = 0; this.fireIn.connect(this.fireEm.input);
    const fn = E.noiseSource('brown'), flp = filt(ctx, 'lowpass', 260), fg = ctx.createGain(); fg.gain.value = 0.5;
    fn.connect(flp); flp.connect(fg); fg.connect(this.fireIn); E.startNoise(fn, ctx.currentTime);
    this.crackN = E.noiseSource('white'); const chp = filt(ctx, 'highpass', 1800); this.crackG = ctx.createGain(); this.crackG.gain.value = 0;
    this.crackN.connect(chp); chp.connect(this.crackG); this.crackG.connect(this.fireIn); E.startNoise(this.crackN, ctx.currentTime);

    this.nextGust = 0; this.nextLeaf = 0; this.nextBubble = 0; this.nextDrop = 0; this.nextCrack = 0;
    this.motion = 'still';
  }

  setLevels(levels, tau = 4) {
    const t = this.E.ctx.currentTime;
    for (const k of Object.keys(NATURE_LAYERS)) {
      const v = clamp(levels[k] ?? 0, 0, 1.5); this.levels[k] = v;
      if (k === 'stream') this.streamIn.gain.setTargetAtTime(v * 1.4, t, tau);
      if (k === 'fire') this.fireIn.gain.setTargetAtTime(v * 1.2, t, tau);
      this.L[k].out.gain.setTargetAtTime(v, t, tau);
    }
    // точечные источники природы светятся на куполе, пока звучат
    this.streamEm.glow = Math.min(0.6, this.levels.stream * 1.2);
    this.fireEm.glow = Math.min(0.6, this.levels.fire * 1.2);
    this.cricketEms.forEach((em) => (em.glow = Math.min(0.45, this.levels.crickets)));
  }

  tick(now, horizon, S) {
    const E = this.E, ctx = E.ctx, lv = this.levels;
    this.motion = S.motion || 'still';
    // ветер: полосы медленно плывут
    if (lv.wind > 0.01) {
      this.windBands[0].frequency.value = 400 + 170 * Math.sin(now * 0.446);
      this.windBands[1].frequency.value = 520 + 170 * Math.sin(now * 0.333 + 1);
      this.whistleBand.frequency.value = 900 + 400 * Math.sin(now * 0.195);
    }
    // порывы ветра
    if (lv.wind > 0.01 && now >= this.nextGust) {
      this.windGust.gain.setTargetAtTime(rnd(0.45, 1.25), now, rnd(0.8, 2.2));
      this.nextGust = now + rnd(2.5, 7);
    }
    // шелест листвы — следует за ветром
    if (lv.leaves > 0.01 && now >= this.nextLeaf) {
      const t = now + 0.05, up = rnd(0.25, 1);
      this.leafEnv.gain.setTargetAtTime(up, t, rnd(0.08, 0.3)); this.leafEnv.gain.setTargetAtTime(0.2, t + rnd(0.3, 1.2), 0.4);
      this.nextLeaf = now + rnd(0.6, 2.4);
    }
    // ручей: пузырьки + движение при ходьбе (ручей проплывает мимо и остаётся позади)
    if (lv.stream > 0.01) {
      while (this.nextBubble < horizon) {
        if (this.nextBubble < now) this.nextBubble = now;
        this.bubble(this.nextBubble, lv.stream);
        this.nextBubble += -Math.log(1 - Math.random()) / (8 + 22 * lv.stream);
      }
      this.updateStream(now, S);
    }
    // волны
    if (lv.waves > 0.01) this.waveLayers.forEach((w) => { if (now + 0.5 >= w.next) this.wave(w, Math.max(now, w.next)); });
    // капли дождя
    if (lv.rain > 0.01) {
      const times = []; if (this.nextDrop < now) this.nextDrop = now;
      while (this.nextDrop < horizon) { times.push(this.nextDrop); this.nextDrop += -Math.log(1 - Math.random()) / (6 + 30 * lv.rain); }
      times.forEach((tg) => { this.dropsG.gain.setValueAtTime(rnd(0.05, 0.5), tg); this.dropsG.gain.setTargetAtTime(0, tg + 0.0005, 0.004); });
      this.dropsP.pan.setTargetAtTime(rnd(-0.8, 0.8), now, 0.05);
    }
    // сверчки
    if (lv.crickets > 0.01) this.cricketEms.forEach((em, i) => {
      if (now + 0.3 >= this.cricketNext[i]) { const t = Math.max(now, this.cricketNext[i]); this.chirp(em, t, lv.crickets, 4300 + i * 380); this.cricketNext[i] = t + rnd(0.55, 1.3); }
    });
    // треск костра
    if (lv.fire > 0.01) {
      if (this.nextCrack < now) this.nextCrack = now;
      while (this.nextCrack < horizon) {
        const tg = this.nextCrack; this.crackG.gain.setValueAtTime(rnd(0.1, 0.8) * (Math.random() < 0.1 ? 2 : 1), tg); this.crackG.gain.setTargetAtTime(0, tg + 0.0005, rnd(0.002, 0.008));
        this.nextCrack += -Math.log(1 - Math.random()) / (Math.random() < 0.3 ? 25 : 4);
      }
    }
  }

  bubble(t, lv) {
    const ctx = this.E.ctx, f = rnd(500, 1800) * (Math.random() < 0.2 ? 0.6 : 1), d = rnd(0.02, 0.07);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(1.4, 2.2), t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rnd(0.02, 0.06), t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, d / 3);
    o.connect(g); g.connect(this.streamIn); o.start(t); o.stop(t + d + 0.08);
  }

  updateStream(now, S) {
    const em = this.streamEm;
    if (this.motion === 'walk') {
      // путь: впереди слева → сбоку → позади; затем новый участок ручья появляется впереди
      const period = 150; this.streamPhase = (this.streamPhase + 0.1 / period) % 1;
      const u = this.streamPhase;
      const az = -20 - u * 150, d = 5 + 9 * Math.abs(u - 0.45) * 2;
      em.setPos(polar(az, -15, d), 0.4);
      const fade = Math.min(1, u * 8, (1 - u) * 8);
      this.streamIn.gain.setTargetAtTime(this.levels.stream * 1.4 * fade, now, 0.3);
    } else if (this.motion === 'orbit') {
      const a = (now * 3) % 360; em.setPos(polar(a, -15, 8), 0.4);
    } else if (!this._streamHome || this._streamHome !== this.motion) {
      this._streamHome = this.motion; em.setPos(polar(-40, -15, 8), 3);
      this.streamIn.gain.setTargetAtTime(this.levels.stream * 1.4, now, 1);
    }
  }

  wave(w, t) {
    const period = rnd(7, 12), rise = period * rnd(0.35, 0.45);
    w.g.gain.setTargetAtTime(rnd(0.25, 0.6), t, rise / 3); w.g.gain.setTargetAtTime(0.05, t + rise, (period - rise) / 3.5);
    w.lp.frequency.setTargetAtTime(rnd(1400, 2600), t, rise / 3); w.lp.frequency.setTargetAtTime(350, t + rise, (period - rise) / 3);
    w.fg.gain.setTargetAtTime(0.14, t + rise * 0.8, 0.4); w.fg.gain.setTargetAtTime(0, t + rise * 1.1, 1.2);
    w.p.pan.setTargetAtTime(rnd(-0.7, 0.7), t, period / 2);
    w.next = t + period * rnd(0.55, 0.8);
  }

  chirp(em, t, lv, f) {
    const ctx = this.E.ctx, n = Math.floor(rnd(2, 4)), o = ctx.createOscillator(); o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    for (let i = 0; i < n; i++) { const tt = t + i * 0.045; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03 * lv, tt + 0.006); g.gain.linearRampToValueAtTime(0, tt + 0.03); }
    o.connect(g); g.connect(em.input); o.start(t); o.stop(t + n * 0.045 + 0.05);
  }
}

// ======================= ПТИЦЫ =======================
// Каждая птица — своё место в пространстве, свой голос, свои паузы, перелёты и позывки.
// Голос строится из слогов с плавными изогнутыми свистами (как на сонограммах настоящих птиц),
// с мягкой огибающей и слабыми обертонами сиринкса. Птицы перекликаются: соседи одного вида
// не перебивают друг друга и часто отвечают похожей песней.
export const BIRDS = {
  robin: { name: 'Зарянка', pause: [2.5, 7] },
  thrush: { name: 'Певчий дрозд', pause: [1.5, 5] },
  blackbird: { name: 'Чёрный дрозд', pause: [3, 7] },
  tit: { name: 'Синица', pause: [4, 12] },
  chaffinch: { name: 'Зяблик', pause: [5, 10] },
  oriole: { name: 'Иволга', pause: [5, 12] },
  wren: { name: 'Крапивник', pause: [6, 14] },
  cuckoo: { name: 'Кукушка', pause: [10, 25] },
  dove: { name: 'Горлица', pause: [8, 18] },
  nightingale: { name: 'Соловей', pause: [1.5, 5] },
  distant: { name: 'Далёкий щебет', pause: [1, 5] },
};

let birdWave = null;
function birdOsc(ctx, h = 0.09) {
  const o = ctx.createOscillator();
  if (!birdWave) birdWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.09, 0.025]));
  if (h > 0.02) o.setPeriodicWave(birdWave);
  return o;
}

// s: { t, d, f: [точки высоты], a, att, rel, fm: [частота, глубина], vib, vr, h }
function syllables(E, dest, t, list) {
  const ctx = E.ctx; let end = t;
  for (const s of list) {
    const st = t + s.t, d = Math.max(0.012, s.d), en = st + d;
    const n = Math.max(8, Math.min(64, Math.round(d * 500)));
    const o = birdOsc(ctx, s.h ?? 0.09);
    o.frequency.setValueCurveAtTime(curve(s.f.length > 1 ? s.f : [s.f[0], s.f[0]], n, s.vib || 0, s.vr || 30, d), st, d);
    if (s.fm) { const m = ctx.createOscillator(); m.frequency.value = s.fm[0]; const md = ctx.createGain(); md.gain.value = s.fm[1]; m.connect(md); md.connect(o.frequency); m.start(st); m.stop(en + 0.02); }
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setValueCurveAtTime(envCurve(n, s.att ?? 0.18, s.rel ?? 0.35, s.a), st, d);
    o.connect(g); g.connect(dest); o.start(st); o.stop(en + 0.02);
    end = Math.max(end, en);
  }
  return end;
}

const R = rnd;
const shapes = (f0, k = 1) => pick([
  [f0, f0 * 1.35 * k],                 // подъём
  [f0 * 1.3, f0],                      // спуск
  [f0, f0 * 1.4, f0 * 1.05],           // шеврон
  [f0 * 1.25, f0 * 0.9, f0 * 1.15],    // ямка
  [f0, f0 * 1.05, f0 * 1.6],           // крючок вверх
]);

// Генераторы песен. b.k — индивидуальная высота голоса, b.tempo — темперамент птицы.
const SONGS = {
  robin(b) {
    const L = []; let tt = 0; const k = b.k;
    for (let i = 0; i < Math.floor(R(1, 3)); i++) { const f = R(5200, 7400) * k; L.push({ t: tt, d: R(0.12, 0.22), f: [f * 0.96, f, f * 0.98], a: 0.45, att: 0.3 }); tt += R(0.22, 0.32); }
    const n = Math.floor(R(8, 16));
    for (let i = 0; i < n; i++) {
      const r = Math.random(), f0 = R(2800, 7600) * k;
      if (r < 0.22) { const c = Math.floor(R(3, 6)); for (let j = 0; j < c; j++) { L.push({ t: tt, d: 0.024, f: [f0 * 1.15, f0 * 0.85], a: 0.5, att: 0.2, rel: 0.4 }); tt += 0.034; } }
      else { const d = R(0.04, 0.13); L.push({ t: tt, d, f: shapes(f0), a: R(0.4, 0.85), fm: Math.random() < 0.25 ? [R(60, 120), f0 * 0.04] : null }); tt += d + R(0.015, 0.06); }
    }
    return L;
  },
  thrush(b) {
    if (!b.motifs) b.motifs = Array.from({ length: 6 }, () => Array.from({ length: Math.floor(R(2, 5)) }, () => { const f0 = R(1900, 4800) * b.k; return { d: R(0.05, 0.15), f: shapes(f0), fm: Math.random() < 0.2 ? [R(40, 80), f0 * 0.05] : null, gap: R(0.02, 0.06) }; }));
    const m = pick(b.motifs), reps = Math.floor(R(2, 5)), L = []; let tt = 0;
    for (let r = 0; r < reps; r++) { for (const s of m) { L.push({ t: tt, d: s.d, f: s.f, a: 0.7, fm: s.fm, h: 0.12 }); tt += s.d + s.gap; } tt += R(0.1, 0.2); }
    return L;
  },
  // Чёрный дрозд: неторопливая флейта с плавными переходами и тихим щебетом в конце
  blackbird(b) {
    const L = []; let tt = 0; const k = b.k; let f = R(1500, 2300) * k;
    const n = Math.floor(R(4, 8));
    for (let i = 0; i < n; i++) {
      const d = R(0.1, 0.32), nf = clamp(f * pick([0.84, 0.9, 1.06, 1.12, 1.19, 1.26]), 1250 * k, 3100 * k);
      L.push({ t: tt, d, f: Math.random() < 0.5 ? [f, nf] : [f, f * 1.08, nf], a: R(0.55, 0.85), att: 0.22, rel: 0.4, h: 0.15, vib: Math.random() < 0.3 ? 0.01 : 0, vr: 18 });
      tt += d + R(0.02, 0.09); f = nf;
    }
    const tw = Math.floor(R(2, 7));
    for (let i = 0; i < tw; i++) { const f0 = R(4500, 7200) * k; L.push({ t: tt, d: R(0.025, 0.05), f: shapes(f0), a: 0.22 }); tt += R(0.035, 0.06); }
    return L;
  },
  tit(b) {
    const L = []; let tt = 0; const n = Math.floor(R(3, 7)), hi = R(5600, 6800) * b.k, lo = hi * R(0.66, 0.78);
    for (let i = 0; i < n; i++) { L.push({ t: tt, d: 0.075, f: [hi * 1.02, hi, hi * 0.95], a: 0.55 }); L.push({ t: tt + 0.1, d: 0.12, f: [lo * 1.06, lo * 0.99, lo], a: 0.72 }); tt += R(0.25, 0.3); }
    return L;
  },
  chaffinch(b) {
    const L = []; let tt = 0, f = R(4800, 5600) * b.k;
    for (let i = 0; i < 8; i++) { L.push({ t: tt, d: 0.05, f: [f * 1.05, f * 0.86], a: 0.5 + i * 0.02 }); tt += 0.095 - i * 0.004; f *= 0.97; }
    for (let i = 0; i < 6; i++) { L.push({ t: tt, d: 0.036, f: [f * 0.95, f * 0.72], a: 0.6 }); tt += 0.05; }
    L.push({ t: tt + 0.04, d: 0.24, f: [3000 * b.k, 5800 * b.k, 4200 * b.k, 2600 * b.k], a: 0.78, att: 0.1 });
    return L;
  },
  // Иволга: «фиу-лиу» — сочная флейта
  oriole(b) {
    const L = []; let tt = 0; const f = R(1100, 1500) * b.k;
    const pat = pick([[[1, 1.25, 0.16], [1.5, 1.2, 0.14], [1.1, 1.35, 0.3]], [[1.2, 1, 0.14], [1.3, 1.6, 0.18], [1.45, 1.1, 0.32]], [[1, 1.4, 0.2], [1.3, 1.05, 0.3]]]);
    pat.forEach(([a, z, d]) => { L.push({ t: tt, d, f: [f * a, f * (a + z) / 2 * 1.04, f * z], a: 0.8, att: 0.15, rel: 0.4, h: 0.22 }); tt += d + 0.03; });
    return L;
  },
  // Крапивник: громкая звонкая трель с переливами
  wren(b) {
    const L = []; let tt = 0; const parts = Math.floor(R(3, 6));
    for (let p = 0; p < parts; p++) {
      const f0 = R(4200, 7800) * b.k, c = Math.floor(R(6, 16)), gap = R(0.03, 0.06);
      for (let i = 0; i < c; i++) { L.push({ t: tt, d: gap * 0.75, f: [f0 * 1.12, f0 * 0.88], a: 0.55, att: 0.15, rel: 0.4 }); tt += gap; }
      tt += R(0.02, 0.08);
    }
    return L;
  },
  cuckoo(b) {
    const L = []; let tt = 0; const n = Math.floor(R(4, 9)), f1 = 690 * b.k, f2 = f1 * 0.81;
    for (let i = 0; i < n; i++) { L.push({ t: tt, d: 0.18, f: [f1 * 1.03, f1, f1 * 0.99], a: 0.85, att: 0.25, rel: 0.4, h: 0.15 }); L.push({ t: tt + 0.27, d: 0.32, f: [f2 * 1.01, f2, f2 * 0.97], a: 0.7, att: 0.25, rel: 0.45, h: 0.15 }); tt += R(0.9, 1.0); }
    return L;
  },
  dove(b) {
    const L = []; let tt = 0; const f = 470 * b.k;
    [[0.22, 1], [0.48, 1.06], [0.26, 0.97]].forEach(([d, r], i) => { L.push({ t: tt, d, f: [f * r * 0.95, f * r * 1.02, f * r * 0.93], a: 0.75, att: 0.3, rel: 0.4, vib: 0.02, vr: 11, h: 0.1 }); tt += d + (i === 0 ? 0.12 : 0.18); });
    return L;
  },
  nightingale(b) {
    const L = []; let tt = 0; const kind = Math.random();
    if (kind < 0.45) { const f = R(1400, 2100) * b.k; for (let i = 0; i < Math.floor(R(4, 7)); i++) { L.push({ t: tt, d: 0.3, f: [f, f * 1.02, f * 1.01], a: 0.2 + i * 0.12, att: 0.4, rel: 0.4, h: 0.12 }); tt += 0.4; } }
    const tr = R(2800, 4200) * b.k, n = Math.floor(R(14, 34));
    for (let i = 0; i < n; i++) { L.push({ t: tt, d: 0.022, f: i % 2 ? [tr * 1.05, tr * 0.7] : [tr * 0.8, tr * 1.1], a: 0.7, att: 0.15, rel: 0.4 }); tt += 0.031; }
    if (Math.random() < 0.6) for (let i = 0; i < 3; i++) { L.push({ t: tt + 0.08, d: 0.014, f: [7200, 2600], a: 0.55 }); tt += 0.09; }
    return L;
  },
  distant(b) {
    const L = []; let tt = 0; const n = Math.floor(R(1, 4));
    for (let i = 0; i < n; i++) { const f0 = R(3000, 7000); L.push({ t: tt, d: R(0.03, 0.09), f: shapes(f0), a: 0.5 }); tt += R(0.06, 0.2); }
    return L;
  },
};
// живые записи голосов (Freesound, CC0): у кого есть — поёт настоящий голос, у остальных — синтез
const REC = { robin: 'robin', thrush: 'thrush', blackbird: 'blackbird', chaffinch: 'chaffinch', cuckoo: 'cuckoo', dove: 'dove',
  oriole: 'oriole', wren: 'wren', nightingale: 'nightingale' };
// короткие позывки между песнями
const CALLS = {
  robin: (b) => [{ t: 0, d: 0.05, f: [8200 * b.k, 7600 * b.k], a: 0.3 }],
  tit: (b) => [{ t: 0, d: 0.05, f: [7000, 6400], a: 0.3 }, { t: 0.09, d: 0.05, f: [7000, 6300], a: 0.25 }],
  blackbird: (b) => [{ t: 0, d: 0.03, f: [2600, 1800], a: 0.4, h: 0.3 }, { t: 0.12, d: 0.03, f: [2600, 1800], a: 0.35, h: 0.3 }],
  chaffinch: (b) => [{ t: 0, d: 0.06, f: [6200, 5600], a: 0.3 }],
};

export class Birds {
  constructor(E) { this.E = E; this.list = []; this.nextSpawn = 0; }

  tick(now, horizon, S) {
    const want = Math.round(clamp(S.birds || 0, 0, 1.2) * 6);
    const species = S.species && S.species.length ? S.species : ['robin', 'thrush', 'distant'];
    const alive = this.list.filter((b) => !b.leaving && !b.live);
    if (alive.length < want && now >= this.nextSpawn) { this.spawn(now, pick(species), S); this.nextSpawn = now + rnd(1.5, 6); }
    if (alive.length > want) { const b = alive[0]; b.leaving = true; this.E.after(now + 3, () => this.remove(b)); }
    for (const b of this.list) {
      if (b.leaving || (!b.live && species.indexOf(b.sp) < 0 && Math.random() < 0.002)) { if (!b.leaving) { b.leaving = true; this.E.after(now + 2, () => this.remove(b)); } continue; }
      // при ходьбе птицы постепенно остаются позади
      if (S.motion === 'walk') {
        const pp = toPolar(b.pos); const dir = pp.az >= 0 ? 1 : -1;
        const az = pp.az + dir * 0.35;
        if (Math.abs(az) > 165) { b.leaving = true; this.E.after(now + 1, () => this.remove(b)); continue; }
        b.pos = polar(az, pp.el, pp.d); b.em.setPos(b.pos, 0.5);
      }
      if (now + 0.6 >= b.next) {
        const t = Math.max(now + 0.05, b.next);
        const r = Math.random();
        if (r < 0.05 && b.sp !== 'cuckoo') { this.fly(b, t, S); b.next = t + 2.2; continue; }
        if (r < 0.13) { this.hop(b, t); }
        const recName = REC[b.sp];
        const rec = recName && this.field ? this.field.call(b.voice, t, recName, { vel: 0.85, rate: 1 + (b.k - 1) * 0.3 }) : null;
        if (rec === null && r > 0.82 && CALLS[b.sp]) { const e = syllables(this.E, b.voice, t, CALLS[b.sp](b)); b.em.flash(t, e - t); b.next = e + rnd(0.6, 2); continue; }
        const end = rec ?? syllables(this.E, b.voice, t, SONGS[b.sp](b));
        b.em.flash(t, end - t);
        const [a, z] = BIRDS[b.sp].pause; b.next = end + rnd(a, z) * (1.3 - Math.min(1, S.birds || 0) * 0.5) * b.tempo;
        // перекличка: соседи того же вида не перебивают и часто отвечают
        for (const o of this.list) {
          if (o === b || o.leaving) continue;
          if (o.next < end + 0.3) o.next = end + rnd(0.3, 1.2);
          if (o.sp === b.sp && Math.random() < 0.45) { o.next = end + rnd(0.35, 1.4); if (b.motifs && Math.random() < 0.5) o.motifs = b.motifs; }
        }
      }
    }
  }

  spawn(now, sp, S) {
    const E = this.E, far = sp === 'cuckoo' || sp === 'distant';
    const az = S.motion === 'walk' ? rnd(-70, 70) : rnd(-170, 170);
    const pos = polar(az, far ? rnd(5, 20) : rnd(12, 55), far ? rnd(20, 40) : rnd(5, 16));
    const em = E.spawn({ group: 'birds', pos, send: far ? 0.55 : 0.3, kind: 'bird', label: BIRDS[sp].name });
    const voice = E.ctx.createGain(); voice.gain.value = (far ? 0.26 : 0.14) * (sp === 'dove' ? 1.5 : sp === 'blackbird' || sp === 'oriole' ? 1.2 : 1);
    const hp = E.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = sp === 'dove' || sp === 'cuckoo' ? 200 : sp === 'blackbird' || sp === 'oriole' ? 700 : 1200;
    voice.connect(hp); hp.connect(em.input);
    const b = { sp, em, voice, pos, k: rnd(0.9, 1.1), tempo: rnd(0.85, 1.15), next: now + rnd(0.3, 3) };
    if (REC[sp] && this.field) this.field.load('call', REC[sp]);   // живой голос подгружается заранее
    this.list.push(b);
    return b;
  }

  // перепрыгнуть на соседнюю ветку
  hop(b, t) {
    const p = toPolar(b.pos), np = polar(p.az + rnd(-14, 14), clamp(p.el + rnd(-6, 6), 5, 70), p.d * rnd(0.92, 1.08));
    this.wings(b.em.input, t, 0.18, 0.5);
    b.em.path([{ t, pos: b.pos }, { t: t + 0.35, pos: np }]); b.pos = np;
  }
  // перелёт: шорох крыльев и смена места
  fly(b, t, S) {
    const p = toPolar(b.pos), np = polar(p.az + rnd(-120, 120), rnd(15, 55), rnd(5, 14));
    this.wings(b.em.input, t, 0.7);
    b.em.path([{ t, pos: b.pos }, { t: t + 1.4, pos: np }]);
    b.pos = np;
  }
  wings(dest, t, dur, vel = 1) {
    const E = this.E, ctx = E.ctx;
    const n = E.noiseSource('pink'), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const rate = rnd(14, 20);
    for (let tt = t; tt < t + dur; tt += 1 / rate) { const u = (tt - t) / dur; g.gain.setValueAtTime(0.25 * vel * (1 - u), tt); g.gain.setTargetAtTime(0, tt + 0.005, 0.015); }
    n.connect(bp); bp.connect(g); g.connect(dest); E.startNoise(n, t); n.stop(t + dur + 0.1);
  }

  // Стайка пролетает над головой спереди назад
  flyby(t) {
    const E = this.E;
    const side = rnd(-40, 40), n = Math.floor(rnd(3, 6));
    for (let i = 0; i < n; i++) {
      const t0 = t + i * rnd(0.08, 0.25), dur = rnd(2.4, 3.4);
      const em = E.spawn({ group: 'birds', pos: polar(side, 25, 14), send: 0.35, kind: 'bird', label: 'стайка', life: t0 + dur + 1 });
      em.path([{ t: t0, pos: polar(side + rnd(-15, 15), rnd(20, 35), 16) }, { t: t0 + dur * 0.5, pos: polar(side * 0.3, rnd(60, 75), 4) }, { t: t0 + dur, pos: polar(180 - side * 0.5, rnd(25, 35), 16) }]);
      this.wings(em.input, t0, dur * 0.8, 0.8);
      const v = E.ctx.createGain(); v.gain.value = 0.08; v.connect(em.input);
      syllables(E, v, t0 + rnd(0, 0.5), SONGS.distant({ k: 1 }).concat(SONGS.distant({ k: 1 }).map((s) => ({ ...s, t: s.t + 0.6 }))));
    }
  }

  remove(b) {
    const i = this.list.indexOf(b); if (i >= 0) this.list.splice(i, 1);
    const t = this.E.ctx.currentTime;
    b.voice.gain.setTargetAtTime(0, t, 0.15);
    this.E.after(t + 0.8, () => b.em.dispose());
  }
  clear() { [...this.list].forEach((b) => this.remove(b)); }
}
