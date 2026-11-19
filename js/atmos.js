// Атмосфера: пэды с плавной сменой аккордов, танпура, бинауральный тон, дыхательная волна.
import { mtof, clamp } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);

const TIMBRES = {
  warm: { name: 'Тёплый', osc: ['triangle', 'sine'], detune: 6, cutoff: 1300, q: 0.3, level: 0.22 },
  choir: { name: 'Хор', osc: ['sawtooth', 'triangle'], detune: 8, formants: [[620, 1, 7], [1040, 0.5, 9], [2300, 0.1, 10]], level: 0.2 },
  glass: { name: 'Стекло', osc: ['sine', 'sine'], detune: 4, cutoff: 6000, q: 0.2, level: 0.19, octave: true },
};

// Пэд из нескольких голосов; каждый голос — пара расстроенных генераторов, разнесённых по стерео.
export class Pad {
  constructor(E, groupName = 'atmos', timbre = 'warm') {
    this.E = E; const ctx = E.ctx; this.timbre = timbre; const T = TIMBRES[timbre];
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.breath = ctx.createGain(); this.breath.gain.value = 1;
    this.out.connect(this.breath);
    const g = E.groups[groupName];
    this.dry = ctx.createGain(); this.dry.gain.value = 0.5; this.send = ctx.createGain(); this.send.gain.value = 0.45;
    this.breath.connect(this.dry); this.breath.connect(this.send); this.dry.connect(g.dry); this.send.connect(g.send);
    // пэд целиком «живёт» в атмосферном хвосте — мягкое облако вместо шума
    this.atm = ctx.createGain(); this.atm.gain.value = 0.9; this.breath.connect(this.atm); this.atm.connect(g.atmos);
    this.voices = [];
    this.T = T;
    // медленное «дыхание» фильтра
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = rnd(0.03, 0.06);
    this.lfoDepth = ctx.createGain(); this.lfoDepth.gain.value = T.formants ? 0 : (T.cutoff || 800) * 0.25;
    this.lfo.connect(this.lfoDepth); this.lfo.start();
  }
  _voice(midi, idx) {
    const ctx = this.E.ctx, T = this.T, f = mtof(midi);
    const v = { midi, oscs: [], gain: ctx.createGain(), pan: ctx.createStereoPanner() };
    v.gain.gain.value = 0;
    v.pan.pan.value = ((idx % 2) ? 1 : -1) * (0.25 + 0.15 * (idx % 3));
    let node;
    if (T.formants) {
      node = ctx.createGain(); node.gain.value = 1;
      T.formants.forEach(([ff, a, q]) => {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * rnd(0.97, 1.03); bp.Q.value = q;
        const ga = ctx.createGain(); ga.gain.value = a * 3; node.connect(bp); bp.connect(ga); ga.connect(v.gain);
      });
    } else {
      node = ctx.createBiquadFilter(); node.type = 'lowpass'; node.frequency.value = T.cutoff; node.Q.value = T.q;
      this.lfoDepth.connect(node.frequency); node.connect(v.gain);
    }
    T.osc.forEach((type, k) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * (T.octave && k ? 2 : 1);
      o.detune.value = (k ? 1 : -1) * T.detune + rnd(-2, 2);
      // мягкое вибрато для хора
      if (T.formants) { const l = ctx.createOscillator(); l.frequency.value = rnd(4.2, 5.4); const d = ctx.createGain(); d.gain.value = 6; l.connect(d); d.connect(o.detune); l.start(); v.oscs.push(l); }
      const og = ctx.createGain(); og.gain.value = T.octave && k ? 0.25 : 0.5; o.connect(og); og.connect(node); o.start(); v.oscs.push(o); o._mul = T.octave && k ? 2 : 1;
    });
    v.gain.connect(v.pan); v.pan.connect(this.out);
    return v;
  }
  // Плавная смена аккорда: голоса скользят к новым нотам (гармоническое «перетекание»)
  setChord(midis, glide = 6) {
    const ctx = this.E.ctx, t = ctx.currentTime;
    midis = [...midis].sort((a, b) => a - b);
    while (this.voices.length < midis.length) {
      const v = this._voice(midis[this.voices.length], this.voices.length); this.voices.push(v);
    }
    this.voices.forEach((v, i) => {
      if (i < midis.length) {
        v.midi = midis[i];
        const f = mtof(midis[i]);
        v.oscs.forEach((o) => { if (o._mul) o.frequency.setTargetAtTime(f * o._mul, t, glide / 3); });
        const lvl = this.T.level * (i === 0 ? 1.1 : 1) / Math.sqrt(midis.length / 3);
        v.gain.gain.setTargetAtTime(lvl, t, glide / 3);
      } else v.gain.gain.setTargetAtTime(0, t, glide / 3);
    });
  }
  setLevel(v, tau = 3) { this.out.gain.setTargetAtTime(v, this.E.ctx.currentTime, tau); }
  dispose(fade = 4) {
    const t = this.E.ctx.currentTime; this.out.gain.setTargetAtTime(0, t, fade / 4);
    this.E.after(t + fade + 0.5, () => { this.voices.forEach((v) => v.oscs.forEach((o) => { try { o.stop(); } catch (e) {} })); try { this.lfo.stop(); } catch (e) {} this.breath.disconnect(); });
  }
}
export const PAD_TIMBRES = Object.fromEntries(Object.entries(TIMBRES).map(([k, v]) => [k, v.name]));

// Танпура: непрерывный поток струн «Па–Са–Са–Са» с жужжащим резонансом (джавари)
export class Tanpura {
  constructor(E, groupName = 'atmos') {
    this.E = E; const ctx = E.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const g = E.groups[groupName];
    this.pan = ctx.createStereoPanner(); this.pan.pan.value = 0;
    this.out.connect(this.pan);
    const d = ctx.createGain(); d.gain.value = 0.6; const s = ctx.createGain(); s.gain.value = 0.7;
    this.pan.connect(d); this.pan.connect(s); d.connect(g.dry); s.connect(g.send);
    const at = ctx.createGain(); at.gain.value = 0.5; this.pan.connect(at); at.connect(g.atmos);
    this.root = 52; this.next = 0; this.step = 0; this.level = 0; this.cycle = rnd(4.6, 5.4);
  }
  setRoot(m) { this.root = m; }
  setLevel(v, tau = 3) { this.level = v; this.out.gain.setTargetAtTime(v, this.E.ctx.currentTime, tau); }
  pluck(t, midi, panv) {
    const ctx = this.E.ctx, f = mtof(midi), end = t + 5.5;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.start(t); o.stop(end);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.002; o2.start(t); o2.stop(end);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(f * 14, t); bp.frequency.exponentialRampToValueAtTime(f * 3, t + 2.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 4; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.03); g.gain.setTargetAtTime(0, t + 0.03, 1.3);
    const gb = ctx.createGain(); gb.gain.value = 0.6;
    const p = ctx.createStereoPanner(); p.pan.value = panv;
    o.connect(lp); o2.connect(lp); o.connect(bp); bp.connect(gb); gb.connect(g); lp.connect(g); g.connect(p); p.connect(this.out);
    this.E.after(end, () => p.disconnect());
  }
  tick(now, horizon) {
    if (this.level < 0.005) { this.next = Math.max(this.next, now); return; }
    if (this.next < now) this.next = now + 0.05;
    const pattern = [[7 - 12, -0.35], [12, 0.2], [12, 0.3], [0, -0.1]];
    while (this.next < horizon) {
      const [iv, p] = pattern[this.step % 4];
      this.pluck(this.next, this.root + iv, p);
      this.next += this.cycle / 4 * (this.step % 4 === 3 ? 1.6 : 1);
      this.step++;
    }
  }
}

// Бинауральный тон: две близкие частоты в разных ушах; тихо, под атмосферой.
export class Binaural {
  constructor(E) {
    this.E = E; const ctx = E.ctx;
    this.l = ctx.createOscillator(); this.r = ctx.createOscillator();
    const m = ctx.createChannelMerger(2);
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.l.connect(m, 0, 0); this.r.connect(m, 0, 1); m.connect(this.gain); this.gain.connect(E.binauralBus);
    this.l.frequency.value = 110; this.r.frequency.value = 118; this.l.start(); this.r.start();
    this.carrier = 110; this.beat = 8; this.user = 0.5; this.enabled = true; this.scene = 0;
  }
  set({ carrier, beat, scene, tau = 8 } = {}) {
    const t = this.E.ctx.currentTime;
    if (carrier) this.carrier = carrier;
    if (beat !== undefined && beat !== null) this.beat = beat;
    if (scene !== undefined) this.scene = scene;
    this.l.frequency.setTargetAtTime(this.carrier, t, tau / 3);
    this.r.frequency.setTargetAtTime(this.carrier + this.beat, t, tau / 3);
    this.apply(tau);
  }
  apply(tau = 1) { this.gain.gain.setTargetAtTime(this.enabled ? 0.018 * this.user * this.scene : 0, this.E.ctx.currentTime, tau / 3); }
}

// Дыхательная волна: атмосфера поднимается на вдохе и опускается на выдохе.
// Ритм дыхания заранее известен, поэтому интерфейс показывает «вдох / выдох» точно в такт звуку.
export class Breath {
  constructor(E, targets) { this.E = E; this.targets = targets; this.rate = 0; this.next = 0; this.cycles = []; this.depth = 0.45; }
  setRate(bpm) { this.rate = bpm || 0; }
  tick(now, horizon) {
    if (!this.rate) {
      if (this.cycles.length && this.cycles[this.cycles.length - 1].end < now) {
        this.cycles = []; this.targets().forEach((p) => p.setTargetAtTime(1, now, 1.5));
      }
      this.next = 0; return;
    }
    if (!this.next || this.next < now) this.next = Math.max(now + 0.1, this.cycles.length ? this.cycles[this.cycles.length - 1].end : 0);
    while (this.next < horizon + 1) {
      const period = 60 / this.rate, inh = period * 0.45, t = this.next;
      const lo = 1 - this.depth, hi = 1, first = !this.cycles.length;
      this.targets().forEach((p) => {
        if (first) { p.cancelScheduledValues(t); p.setValueAtTime(1, t); }
        p.linearRampToValueAtTime(hi, t + inh);
        p.linearRampToValueAtTime(lo, t + period);
      });
      this.cycles.push({ start: t, inhale: inh, end: t + period });
      if (this.cycles.length > 6) this.cycles.shift();
      this.next = t + period;
    }
  }
  // фаза для интерфейса: {phase:'in'|'out', k: 0..1}
  state(now) {
    const c = this.cycles.find((c) => now >= c.start && now < c.end);
    if (!c) return null;
    const u = now - c.start;
    return u < c.inhale ? { phase: 'in', k: u / c.inhale } : { phase: 'out', k: 1 - (u - c.inhale) / (c.end - c.start - c.inhale) };
  }
}

export const clampLevel = (v) => clamp(v, 0, 1.5);
