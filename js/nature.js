// Природа: ветер, листва, ручей (проплывает мимо при ходьбе), волны, дождь, сверчки, костёр — и птицы.
import { polar, toPolar, clamp } from './util.js';

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
      const lfo = ctx.createOscillator(); lfo.frequency.value = ch ? 0.053 : 0.071; const d = ctx.createGain(); d.gain.value = 170;
      lfo.connect(d); d.connect(bp.frequency); lfo.start();
      n.connect(bp); const g2 = ctx.createGain(); g2.gain.value = 1.4; bp.connect(g2); return g2;
    }).connect(this.windGust);
    const whistle = E.noiseSource('pink'), wbp = filt(ctx, 'bandpass', 1500, 7), wg = ctx.createGain(); wg.gain.value = 0.08;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.031; const wd = ctx.createGain(); wd.gain.value = 500; wl.connect(wd); wd.connect(wbp.frequency); wl.start();
    whistle.connect(wbp); wbp.connect(wg); wg.connect(this.windGust); E.startNoise(whistle, ctx.currentTime);

    // Листва
    const leaves = bed('leaves', 0.2);
    this.leafEnv = ctx.createGain(); this.leafEnv.gain.value = 0.3; this.leafEnv.connect(leaves);
    stereoNoise('white', (n, ch) => { const hp = filt(ctx, 'highpass', ch ? 2800 : 3300, 0.5), lp = filt(ctx, 'lowpass', 9500, 0.5); n.connect(hp); hp.connect(lp); return lp; }).connect(this.leafEnv);

    // Ручей: точечный источник в пространстве + лёгкий широкий слой
    const streamWide = bed('stream', 0.2);
    this.streamEm = E.spawn({ group: 'nature', pos: polar(-35, -15, 9), send: 0.3, kind: 'water', label: 'ручей' });
    this.streamIn = ctx.createGain(); this.streamIn.gain.value = 0; this.streamIn.connect(this.streamEm.input);
    const sn = E.noiseSource('pink'), sbp = filt(ctx, 'bandpass', 1300, 0.45), slp = filt(ctx, 'lowpass', 3200, 0.5), sg = ctx.createGain(); sg.gain.value = 1.3;
    sn.connect(sbp); sbp.connect(slp); slp.connect(sg); sg.connect(this.streamIn); E.startNoise(sn, ctx.currentTime);
    stereoNoise('white', (n) => { const hp = filt(ctx, 'highpass', 2600), g2 = ctx.createGain(); g2.gain.value = 0.18; n.connect(hp); hp.connect(g2); return g2; }).connect(streamWide);
    this.streamPhase = Math.random();

    // Волны: два слоя, каждый накатывает своим ритмом
    const waves = bed('waves', 0.3);
    this.waveLayers = [0, 1].map((k) => {
      const n = E.noiseSource('pink'), lp = filt(ctx, 'lowpass', 400, 0.4), g2 = ctx.createGain(); g2.gain.value = 0.05;
      const p = ctx.createStereoPanner(); p.pan.value = k ? 0.5 : -0.5;
      const foam = E.noiseSource('white'), fhp = filt(ctx, 'highpass', 4500), fg = ctx.createGain(); fg.gain.value = 0;
      n.connect(lp); lp.connect(g2); g2.connect(p); foam.connect(fhp); fhp.connect(fg); fg.connect(p); p.connect(waves);
      E.startNoise(n, ctx.currentTime); E.startNoise(foam, ctx.currentTime);
      return { lp, g: g2, fg, p, next: ctx.currentTime + k * 4.5 };
    });

    // Дождь: мягкий шелест + капли
    const rain = bed('rain', 0.25);
    stereoNoise('pink', (n) => { const hp = filt(ctx, 'highpass', 900), lp = filt(ctx, 'lowpass', 7000), g2 = ctx.createGain(); g2.gain.value = 0.7; n.connect(hp); hp.connect(lp); lp.connect(g2); return g2; }).connect(rain);
    this.dropsN = E.noiseSource('white'); const dbp = filt(ctx, 'bandpass', 3800, 2); this.dropsG = ctx.createGain(); this.dropsG.gain.value = 0;
    this.dropsP = ctx.createStereoPanner();
    this.dropsN.connect(dbp); dbp.connect(this.dropsG); this.dropsG.connect(this.dropsP); this.dropsP.connect(rain); E.startNoise(this.dropsN, ctx.currentTime);

    // Сверчки — в нескольких точках пространства
    bed('crickets');
    this.cricketEms = [polar(-120, -10, 7), polar(70, -12, 9), polar(160, -8, 12)].map((p) => E.spawn({ group: 'nature', pos: p, send: 0.3, kind: 'crickets', label: 'сверчок' }));
    this.cricketNext = [0, 0, 0];

    // Костёр — впереди и чуть ниже
    bed('fire', 0.15);
    this.fireEm = E.spawn({ group: 'nature', pos: polar(10, -25, 2.6), send: 0.2, kind: 'fire', label: 'костёр' });
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
// Каждая птица — своё место в пространстве, свой голос, паузы и перелёты.
export const BIRDS = {
  robin: { name: 'Зарянка', pause: [3, 9] },
  thrush: { name: 'Певчий дрозд', pause: [2, 6] },
  tit: { name: 'Синица', pause: [5, 14] },
  chaffinch: { name: 'Зяблик', pause: [5, 11] },
  cuckoo: { name: 'Кукушка', pause: [10, 25] },
  dove: { name: 'Горлица', pause: [8, 18] },
  nightingale: { name: 'Соловей', pause: [2, 6] },
  distant: { name: 'Далёкий щебет', pause: [1, 5] },
};

function syllables(E, dest, t, list) {
  const ctx = E.ctx; let end = t;
  for (const s of list) {
    const st = t + s.t, en = st + s.d;
    const o = ctx.createOscillator(); o.type = s.type || 'sine';
    const f = s.f;
    o.frequency.setValueAtTime(f[0], st);
    if (f.length === 2) o.frequency.exponentialRampToValueAtTime(f[1], en);
    else if (f.length === 3) { o.frequency.exponentialRampToValueAtTime(f[1], st + s.d * 0.5); o.frequency.exponentialRampToValueAtTime(f[2], en); }
    if (s.fm) { const m = ctx.createOscillator(); m.frequency.value = s.fm[0]; const md = ctx.createGain(); md.gain.value = s.fm[1]; m.connect(md); md.connect(o.frequency); m.start(st); m.stop(en + 0.02); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0, st);
    const att = Math.min(s.att ?? 0.006, s.d * 0.4);
    g.gain.linearRampToValueAtTime(s.a, st + att); g.gain.setValueAtTime(s.a, Math.max(st + att, en - Math.min(0.012, s.d * 0.3))); g.gain.linearRampToValueAtTime(0, en);
    o.connect(g); g.connect(dest); o.start(st); o.stop(en + 0.02);
    if (s.h) {
      const o2 = ctx.createOscillator(); o2.frequency.setValueAtTime(f[0] * 2, st);
      if (f.length >= 2) o2.frequency.exponentialRampToValueAtTime(f[f.length - 1] * 2, en);
      const g3 = ctx.createGain(); g3.gain.setValueAtTime(0, st); g3.gain.linearRampToValueAtTime(s.a * s.h, st + att); g3.gain.linearRampToValueAtTime(0, en);
      o2.connect(g3); g3.connect(dest); o2.start(st); o2.stop(en + 0.02);
    }
    end = Math.max(end, en);
  }
  return end;
}

// Генераторы фраз для каждого вида. k — индивидуальная высота голоса птицы.
const SONGS = {
  robin(b) {
    const L = []; let tt = 0; const n = Math.floor(rnd(7, 14));
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.25) { for (let j = 0; j < 4; j++) { L.push({ t: tt, d: 0.022, f: [6200 * b.k, 5400 * b.k], a: 0.5 }); tt += 0.035; } }
      else { const f0 = rnd(2600, 7200) * b.k, d = rnd(0.05, 0.16); L.push({ t: tt, d, f: [f0, f0 * rnd(0.7, 1.35)], a: rnd(0.4, 0.9), fm: Math.random() < 0.3 ? [rnd(40, 90), f0 * 0.05] : null }); tt += d + rnd(0.02, 0.08); }
    }
    return L;
  },
  thrush(b) {
    if (!b.motifs) b.motifs = Array.from({ length: 4 }, () => Array.from({ length: Math.floor(rnd(2, 4)) }, () => { const f0 = rnd(1800, 4600) * b.k; return { d: rnd(0.06, 0.16), f: [f0, f0 * rnd(0.75, 1.3)], fm: Math.random() < 0.25 ? [rnd(30, 60), f0 * 0.04] : null, gap: rnd(0.02, 0.07) }; }));
    const m = pick(b.motifs), reps = Math.floor(rnd(2, 4)), L = []; let tt = 0;
    for (let r = 0; r < reps; r++) { for (const s of m) { L.push({ t: tt, d: s.d, f: s.f, a: 0.7, fm: s.fm, h: 0.08 }); tt += s.d + s.gap; } tt += rnd(0.12, 0.22); }
    return L;
  },
  tit(b) {
    const L = []; let tt = 0; const n = Math.floor(rnd(3, 6)), hi = rnd(5800, 6800) * b.k, lo = hi * rnd(0.68, 0.78);
    for (let i = 0; i < n; i++) { L.push({ t: tt, d: 0.07, f: [hi, hi * 0.96], a: 0.6 }); L.push({ t: tt + 0.1, d: 0.11, f: [lo * 1.04, lo], a: 0.75 }); tt += 0.27; }
    return L;
  },
  chaffinch(b) {
    const L = []; let tt = 0, f = 5200 * b.k;
    for (let i = 0; i < 9; i++) { L.push({ t: tt, d: 0.045, f: [f, f * 0.85], a: 0.55 }); tt += 0.09 - i * 0.004; f *= 0.97; }
    for (let i = 0; i < 6; i++) { L.push({ t: tt, d: 0.035, f: [f * 0.9, f * 0.72], a: 0.6 }); tt += 0.05; }
    L.push({ t: tt + 0.04, d: 0.22, f: [3200 * b.k, 5600 * b.k, 2800 * b.k], a: 0.75 });
    return L;
  },
  cuckoo(b) {
    const L = []; let tt = 0; const n = Math.floor(rnd(4, 8)), f1 = 690 * b.k, f2 = f1 * 0.81;
    for (let i = 0; i < n; i++) { L.push({ t: tt, d: 0.17, f: [f1 * 1.02, f1], a: 0.85, att: 0.03, h: 0.1 }); L.push({ t: tt + 0.27, d: 0.3, f: [f2 * 1.01, f2 * 0.98], a: 0.7, att: 0.04, h: 0.1 }); tt += 0.95; }
    return L;
  },
  dove(b) {
    const L = []; let tt = 0; const f = 470 * b.k;
    [[0.22, 1], [0.48, 1.06], [0.25, 0.97]].forEach(([d, r], i) => { L.push({ t: tt, d, f: [f * r * 0.96, f * r * 1.02, f * r * 0.94], a: 0.75, att: 0.05, fm: [rnd(8, 14), f * 0.02], h: 0.05 }); tt += d + (i === 0 ? 0.12 : 0.18); });
    return L;
  },
  nightingale(b) {
    const L = []; let tt = 0; const kind = Math.random();
    if (kind < 0.4) { const f = rnd(1400, 2100) * b.k; for (let i = 0; i < 5; i++) { L.push({ t: tt, d: 0.32, f: [f, f * 1.02], a: 0.25 + i * 0.15, att: 0.12 }); tt += 0.42; } }
    const tr = rnd(2800, 4200) * b.k; const n = Math.floor(rnd(14, 30));
    for (let i = 0; i < n; i++) { L.push({ t: tt, d: 0.022, f: [tr * (i % 2 ? 1 : 0.8), tr * (i % 2 ? 0.7 : 1.1)], a: 0.7 }); tt += 0.032; }
    if (Math.random() < 0.6) for (let i = 0; i < 3; i++) { L.push({ t: tt + 0.08, d: 0.012, f: [7000, 2500], a: 0.6 }); tt += 0.09; }
    return L;
  },
  distant(b) {
    const L = []; let tt = 0; const n = Math.floor(rnd(1, 4));
    for (let i = 0; i < n; i++) { const f0 = rnd(3000, 7000); L.push({ t: tt, d: rnd(0.03, 0.08), f: [f0, f0 * rnd(0.7, 1.3)], a: 0.5 }); tt += rnd(0.06, 0.2); }
    return L;
  },
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
        if (Math.random() < 0.06 && b.sp !== 'cuckoo') { this.fly(b, t, S); b.next = t + 2.2; continue; }
        const end = syllables(this.E, b.voice, t, SONGS[b.sp](b));
        b.em.flash(t, end - t);
        const [a, z] = BIRDS[b.sp].pause; b.next = end + rnd(a, z) * (1.3 - Math.min(1, S.birds || 0) * 0.5);
      }
    }
  }

  spawn(now, sp, S) {
    const E = this.E, far = sp === 'cuckoo' || sp === 'distant';
    const az = S.motion === 'walk' ? rnd(-70, 70) : rnd(-170, 170);
    const pos = polar(az, far ? rnd(5, 20) : rnd(12, 55), far ? rnd(20, 40) : rnd(5, 16));
    const em = E.spawn({ group: 'birds', pos, send: far ? 0.55 : 0.3, kind: 'bird', label: BIRDS[sp].name });
    const voice = E.ctx.createGain(); voice.gain.value = (far ? 0.26 : 0.14) * (sp === 'dove' ? 1.5 : 1);
    const hp = E.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = sp === 'dove' || sp === 'cuckoo' ? 200 : 1200;
    voice.connect(hp); hp.connect(em.input);
    const b = { sp, em, voice, pos, k: rnd(0.9, 1.1), next: now + rnd(0.3, 3) };
    this.list.push(b);
    return b;
  }

  // перелёт: шорох крыльев и смена места
  fly(b, t, S) {
    const E = this.E, ctx = E.ctx;
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
