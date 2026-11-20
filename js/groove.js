// Грув: жанровые сцены звукового приключения — lo-fi, соул-джаз, фанк, хип-хоп (бум-бэп) и эмбиент-пульс.
// Барабаны из китов PO-33, бас, клавиши и пэды из сэмплов, флейта и вокальные чопы, винил.
// Музыка идёт квадратами: восемь тактов A, восемь тактов B, сбивка в конце восьмёрки, иногда брейк без барабанов,
// где ханг импровизирует один. Гармония — минорные септаккорды, доминанты и большие ноны, как в соуле и джазе.
import { polar, mtof, clamp } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const CHORD_TONES = { m7: [0, 3, 7, 10, 14], dom: [0, 4, 7, 10, 14], maj: [0, 4, 7, 11, 14], sus: [0, 5, 7, 10, 14] };

export const STYLES = {
  lofi: {
    name: 'Lo-fi beats', tempo: 78, swing: 0.6, unit: 16, kit: 'natural', tone: 4200, keys: 'rhodes', pad: 'mantra', bass: 'sub', chops: 0.25, vinyl: 0.5, wobble: 1,
    tuning: 'pygmy', comp: 'lofi', bassLine: 'kick',
    progs: [[[0, 'm7', 2], [5, 'm7', 2]], [[8, 'maj', 2], [7, 'm7', 1], [0, 'm7', 1]], [[3, 'maj', 2], [5, 'm7', 1], [7, 'm7', 1]], [[0, 'm7', 1], [10, 'sus', 1], [8, 'maj', 2]]],
    drums: {
      A: { kick: 'X......x..x.....', snare: '....X.......X...', hat: 'x.o.x.o.x.o.x.o?' },
      B: { kick: 'X......x.x....x.', snare: '....X.......X..o', hat: 'x.oox.o.x.o.xoo.', perc: '..........?.....' },
      F: { kick: 'X......x..x.....', snare: '....X.......X.oo', hat: 'x.o.x.o.x.o.....', ohat: '..............x.' },
    },
  },
  souljazz: {
    name: 'Соул-джаз', tempo: 94, swing: 0.66, unit: 8, kit: 'natural', tone: 7000, keys: 'rhodes', pad: 'classic', bass: 'upright', chops: 0, vinyl: 0.15, wobble: 0.3,
    tuning: 'amara', comp: 'jazz', bassLine: 'walk',
    progs: [[[0, 'm7', 2], [5, 'dom', 2]], [[5, 'm7', 1], [10, 'dom', 1], [3, 'maj', 2]], [[0, 'm7', 2], [2, 'm7', 2]]],
    drums: {
      A: { hat: 'x...x.x.x...x.x.', kick: 'o.......o.......', snare: '......o.....o..?', clap: '....x.......x...' },
      B: { hat: 'x...x.x.x...x.x.', kick: 'o.....o.o.......', snare: '..o...o...o.o..o', clap: '....x.......x...' },
      F: { hat: 'x...x.x.x.......', kick: 'o.......o.....x.', snare: '..o.o.o.ooo.oxox', clap: '....x...........' },
    },
  },
  funk: {
    name: 'Фанк', tempo: 102, swing: 0.54, unit: 16, kit: 'natural', tone: 9000, keys: 'clav', pad: 'classic', bass: 'finger', chops: 0.15, vinyl: 0, wobble: 0,
    tuning: 'pygmy', comp: 'funk', bassLine: 'funk',
    progs: [[[0, 'm7', 4]], [[0, 'm7', 2], [5, 'dom', 2]], [[5, 'dom', 2], [0, 'm7', 2]]],
    drums: {
      A: { kick: 'X.....x...X..x..', snare: '....X..o.o..X..o', hat: 'xoxoxoxoxoxoxoxo' },
      B: { kick: 'X..x..x...X.....', snare: '....X..o.o..X.o.', hat: 'xoxoxoxoxoxoxoxo', ohat: '..............x.' },
      F: { kick: 'X.....x...X.....', snare: '....X..o.oooXoXX', hat: 'xoxoxoxoxoxo....' },
    },
  },
  hiphop: {
    name: 'Хип-хоп, бум-бэп', tempo: 88, swing: 0.57, unit: 16, kit: 'edm', snareKit: 'natural', tone: 6500, keys: 'brokenpad', pad: 'mantra', bass: 'sub808', chops: 0.5, vinyl: 0.35, wobble: 0.6,
    tuning: 'kurd', comp: 'chop', bassLine: 'kick',
    progs: [[[0, 'm7', 2], [8, 'maj', 2]], [[0, 'm7', 1], [0, 'm7', 1], [10, 'sus', 1], [8, 'maj', 1]], [[0, 'sus', 4]]],
    drums: {
      A: { kick: 'X......x..X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
      B: { kick: 'X.x....x..X..x..', snare: '....X.......X..o', hat: 'x.x.x.xxx.x.x.x.' },
      F: { kick: 'X......x..X.....', snare: '....X.......X.X.', hat: 'x.x.x.x.x.x.x...', ohat: '..............x.' },
    },
  },
  ambient: {
    name: 'Эмбиент-пульс', tempo: 66, swing: 0.5, unit: 16, kit: 'wet', tone: 9000, keys: 'samplepad', pad: 'mantra', bass: 'sub', chops: 0, vinyl: 0, wobble: 0.2,
    tuning: 'amara', comp: 'pad', bassLine: 'root',
    progs: [[[0, 'sus', 2], [8, 'maj', 2]], [[0, 'm7', 2], [5, 'sus', 2]], [[0, 'sus', 4]]],
    drums: {
      A: { kick: 'x.......o.......', drip: '..?...o...?..o..', shaker: 'o.o.o.o.o.o.o.o.' },
      B: { kick: 'x.....o.x.......', drip: '..o..?..o...?.o.', shaker: 'o.oo.o.oo.o.oo.o', splash: '............?...' },
      F: { kick: 'x.......x.......', drip: 'o.o.o.o.o.o.ooo.', shaker: 'o.o.o.o.o.o.o.o.' },
    },
  },
};
export const STYLE_NAMES = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.name]));

const VEL = { X: 1, x: 0.74, o: 0.36, '?': 0.42 };
const ROLE_EM = { kick: 'kick', snare: 'snare', clap: 'snare', hat: 'hat', ohat: 'hat', shaker: 'hat', perc: 'perc', drip: 'perc', splash: 'perc', crash: 'perc', tom: 'perc' };
// синтез: бас и клавинет (там, где нужен короткий щипок, а не сэмпл)
let clavWave = null;

export class Groove {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.cfg = null; this.st = null; this.pending = null;
    this.step = 0; this.bar = 0; this.nextTime = 0;
    this.tempo = { from: 80, to: 80, t0: 0, t1: 0 };
    this.vinylGain = null;
  }
  get lib() { return this.app.lib; }
  get active() { return !!this.st; }
  get spb() { return 4; }

  ems() {
    if (this._ems) return this._ems;
    const E = this.E;
    const em = (pos, kind, hrtf, send, atmos) => E.spawn({ group: 'groove', pos, send, kind, label: 'грув', hrtf, atmos });
    return (this._ems = {
      kick: em(polar(0, -12, 2.2), 'rhythm', false, 0.06, 0.02),
      snare: em(polar(6, -4, 2.4), 'rhythm', false, 0.2, 0.06),
      hat: em(polar(34, 8, 2.2), 'rattle', true, 0.14, 0.05),
      perc: em(polar(-40, 4, 2.6), 'rattle', true, 0.25, 0.12),
      bass: em(polar(0, -10, 2), 'rhythm', false, 0.04, 0.01),
      keys: em(polar(-28, 6, 2.6), 'pad', true, 0.3, 0.28),
      pad: em(polar(20, 28, 4), 'wash', true, 0.6, 0.7),
    });
  }

  // cfg: { style, energy, tempo, kit, drums, bass, keys, lead, chops }
  set(cfg, fade = 4) {
    if (!cfg || !cfg.style || !STYLES[cfg.style]) {
      if (this.st) { this.cfg = null; this.pending = 'stop'; }
      this.setVinyl(0, fade);
      return;
    }
    const st = STYLES[cfg.style];
    const bpm = cfg.tempo || st.tempo;
    this.lib.load('kit:' + (cfg.kit || st.kit)); if (st.snareKit) this.lib.load('kit:' + st.snareKit);
    this.cfg = { energy: 0.6, drums: 1, bass: 1, keys: 1, lead: 0.5, chops: st.chops, ...cfg };
    if (!this.st) {
      this.st = st; this.styleKey = cfg.style; this.step = 0; this.bar = 0; this.nextTime = 0; this.intro = 2; this.pending = null; this.progStart = undefined;
      this.tempo = { from: bpm, to: bpm, t0: 0, t1: 0 };
      this.newProg(true);
    } else {
      if (cfg.style !== this.styleKey) this.pending = cfg.style; else this.pending = null;
      this.setTempo(bpm, fade);
    }
    this.setVinyl((this.cfg.vinyl ?? st.vinyl) * 0.9, fade);
  }
  stop() { this.st = null; this.cfg = null; this.pending = null; this.setVinyl(0, 1); }

  setTempo(bpm, ramp = 0) { const now = this.E.now; const cur = this.bpmAt(now); this.tempo = { from: cur, to: bpm, t0: now, t1: now + Math.max(0.01, ramp) }; }
  bpmAt(t) { const T = this.tempo; if (t >= T.t1) return T.to; if (t <= T.t0) return T.from; return T.from + (T.to - T.from) * (t - T.t0) / (T.t1 - T.t0); }
  stepDur(t) { return 60 / this.bpmAt(t) / 4; }
  beatDur() { return 60 / this.bpmAt(this.E.now); }
  nextBeat(t) {
    if (!this.st || !this.nextTime) return t;
    let tt = this.nextTime, s = this.step;
    while (tt < t || s % 4 !== 0) { tt += this.stepDur(tt); s++; if (tt - t > 8) break; }
    return tt;
  }
  nextBar(t) {
    if (!this.st || !this.nextTime) return t;
    let tt = this.nextTime, s = this.step;
    while (tt < t || s % 16 !== 0) { tt += this.stepDur(tt); s++; if (tt - t > 16) break; }
    return tt;
  }
  swingOff(step, sd) {
    const sw = this.st.swing; if (sw <= 0.5) return 0;
    if (this.st.unit === 16) return step % 2 === 1 ? (sw - 0.5) * 2 * sd : 0;
    const pos = step % 4, sp = (sw - 0.5) * 4 * sd;
    return pos === 2 ? sp : pos === 1 || pos === 3 ? sp * 0.5 : 0;
  }

  key() { return this.app.conductor.curDing; }
  newProg(first = false) {
    const st = this.st, r = this.app.conductor.rng;
    const prog = first ? st.progs[0] : r.chance(0.55) ? (this.prog || st.progs[0]) : r.pick(st.progs);
    this.prog = prog; this.barChords = [];
    prog.forEach(([deg, q, bars]) => { for (let i = 0; i < bars; i++) this.barChords.push({ deg, q, first: i === 0, bars }); });
    this.progBar = 0;
  }
  chordFor(bar) { const c = this.barChords[(bar - this.progStart) % this.barChords.length] || this.barChords[0]; return c; }

  section(bar) {
    const e = this.cfg ? this.cfg.energy : 0.5;
    if (this.intro > 0) return 'intro';
    if (e > 0.35 && bar % 32 >= 28) return 'break';
    if (bar % 8 === 7) return 'F';
    return bar % 16 < 8 ? 'A' : 'B';
  }

  tick(now, horizon) {
    if (!this.st) return;
    if (this.nextTime < now) this.nextTime = now + 0.08;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      if (this.step % 16 === 0) {
        if (this.pending === 'stop') { this.st = null; this.pending = null; return; }
        if (this.pending) { this.st = STYLES[this.pending]; this.styleKey = this.pending; this.pending = null; this.newProg(true); this.progStart = this.bar; this.intro = 0; }
        this.onBar(this.nextTime);
      }
      this.playStep(this.nextTime, this.step % 16);
      this.nextTime += this.stepDur(this.nextTime);
      this.step++;
      if (this.step % 16 === 0) { this.bar++; if (this.intro > 0) this.intro--; }
    }
  }

  // ---------- Такт: гармония, бас, клавиши, мелодия ----------
  onBar(t) {
    const st = this.st, cfg = this.cfg || {}, bar = this.bar;
    if (this.progStart === undefined) this.progStart = bar;
    if ((bar - this.progStart) % 8 === 0 && bar > this.progStart && (bar - this.progStart) % this.barChords.length === 0) { this.newProg(); this.progStart = bar; }
    const ch = this.chordFor(bar), key = this.key();
    const root = key + ch.deg;
    this.cur = { root, q: ch.q, tones: CHORD_TONES[ch.q] || CHORD_TONES.m7, bar, t, sec: this.section(bar) };
    const sd = this.stepDur(t), barDur = sd * 16, e = cfg.energy ?? 0.6;
    const sec = this.cur.sec;
    const pat = st.drums[sec === 'F' ? 'F' : sec === 'B' ? 'B' : 'A'];
    if (cfg.bass > 0.01) this.bassBar(t, sd, pat, ch, root, sec, e);
    if (cfg.keys > 0.01 && ch.first) this.compChord(t, sd, ch, root, e);
    if (cfg.keys > 0.01 && !ch.first && st.comp !== 'lofi' && st.comp !== 'pad') this.compChord(t, sd, ch, root, e, true);
    if (cfg.keys > 0.01 && st.comp === 'funk') this.clavBar(t, sd, ch, root, e);
    if (cfg.lead > 0.01 && bar % 4 === 2 && Math.random() < cfg.lead * 0.55 && sec !== 'intro') this.flutePhrase(t, sd, ch, root);
    if ((cfg.chops ?? st.chops) > 0.01 && sec !== 'intro') this.chops(t, sd, ch, root, e);
    // ханг импровизирует квадратами поверх грува
    this.app.improv && this.app.improv.onBar(t, { beat: sd * 4, spb: 4, chord: this.cur, source: 'groove', sec, swing: (s) => this.swingOff(s, sd) });
    this.lastBar = { t, dur: barDur };
  }
  chordAt() { return this.cur || null; }

  playStep(t, s) {
    const cfg = this.cfg || { drums: 1, energy: 0.5 }, st = this.st, e = cfg.energy ?? 0.6;
    if (!(cfg.drums > 0.01)) return;
    const sec = this.cur ? this.cur.sec : 'A';
    const pat = st.drums[sec === 'F' ? 'F' : sec === 'B' ? 'B' : 'A'];
    const sd = this.stepDur(t), ems = this.ems(), kit = cfg.kit || st.kit;
    for (const [role, str] of Object.entries(pat)) {
      const c = str[s]; if (!c || c === '.') continue;
      const core = role === 'kick' || role === 'snare' || role === 'clap';
      if (sec === 'intro' && core) continue;
      if (sec === 'break' && (core || role === 'perc')) continue;
      if (e < 0.25 && core && c !== 'X') continue;
      if (c === '?' && Math.random() > 0.25 + e * 0.35) continue;
      if (c === 'o' && Math.random() > 0.45 + e * 0.5) continue;
      let v = (VEL[c] ?? 0.6) * (0.86 + Math.random() * 0.24) * cfg.drums * (0.65 + e * 0.45);
      if (role === 'hat' && sec === 'break') v *= 0.6;
      const tt = t + this.swingOff(s, sd) + (Math.random() - 0.5) * 0.008;
      const em = ems[ROLE_EM[role] || 'perc'];
      const useKit = role === 'snare' && st.snareKit && Math.random() < 0.6 ? st.snareKit : kit;
      const end = this.lib.hit(em.input, tt, useKit, role, v, { lp: role === 'kick' || role === 'snare' || role === 'clap' ? st.tone : st.tone * 1.6, cut: role === 'ohat' ? sd * 3.5 : undefined });
      // хип-хоп: хлопок поверх малого на сильных долях
      if (role === 'snare' && c === 'X' && this.styleKey === 'hiphop') this.lib.hit(em.input, tt + 0.004, kit, 'clap', v * 0.55, { lp: st.tone });
      em.flash(tt, Math.min(0.25, end - tt));
    }
  }

  // ---------- Бас ----------
  bassBar(t, sd, pat, ch, root, sec, e) {
    const st = this.st, cfg = this.cfg, ems = this.ems(), tones = CHORD_TONES[ch.q] || CHORD_TONES.m7;
    let base = root; while (base > 45) base -= 12; while (base < 31) base += 12;
    const vel = 0.75 * cfg.bass;
    const notes = [];
    if (st.bassLine === 'kick') {
      const k = sec === 'break' || sec === 'intro' ? 'X...............' : pat.kick || 'X...............';
      const hits = [...k].map((c, i) => (c !== '.' ? i : -1)).filter((i) => i >= 0);
      if (!hits.length) hits.push(0);
      hits.forEach((s, j) => {
        const nxt = j + 1 < hits.length ? hits[j + 1] : 16;
        const m = j === 0 ? base : pick([base, base, base + 12, base + 7, base + tones[3] - 12 + 12]);
        notes.push({ s, m, d: (nxt - s) * sd * 0.92, v: j === 0 ? vel : vel * 0.8 });
      });
    } else if (st.bassLine === 'walk') {
      const next = this.chordFor(this.bar + 1), nroot = this.key() + next.deg;
      let nb = nroot; while (nb > 45) nb -= 12; while (nb < 31) nb += 12;
      const second = base + pick([tones[1], tones[2]]), third = base + pick([tones[2], tones[3], 9]);
      const approach = nb + pick([-1, 1, -2]);
      [base, second, third, approach].forEach((m, i) => notes.push({ s: i * 4, m, d: sd * 3.6, v: vel * (i === 0 ? 1 : 0.82) }));
    } else if (st.bassLine === 'funk') {
      const F = pick([
        [[0, 'R', 3], [3, 'O', 1], [6, 'R', 2], [7, 'g', 1], [10, 'b7', 2], [11, 'O', 1], [14, '5', 2]],
        [[0, 'R', 4], [4, 'g', 1], [6, 'O', 1], [8, 'R', 2], [10, 'b7', 1], [12, '5', 1], [13, 'O', 1], [14, 'R', 2]],
        [[0, 'R', 2], [2, 'O', 1], [3, 'R', 1], [6, '5', 2], [9, 'R', 1], [10, 'O', 1], [12, 'b7', 2], [15, 'g', 1]],
      ]);
      F.forEach(([s, n, len]) => {
        const m = n === 'R' ? base : n === 'O' ? base + 12 : n === '5' ? base + 7 : n === 'b7' ? base + 10 : base;
        notes.push({ s, m, d: len * sd * 0.85, v: n === 'g' ? vel * 0.35 : vel * (s === 0 ? 1 : 0.85), ghost: n === 'g' });
      });
    } else {
      notes.push({ s: 0, m: base, d: sd * 16 * (ch.bars > 1 && ch.first ? ch.bars : 1) * 0.98, v: vel * 0.8 });
      if (!ch.first) notes.length = 0;
    }
    for (const n of notes) {
      const tt = t + n.s * sd + this.swingOff(n.s, sd);
      this.bassNote(ems.bass.input, tt, n.m, n.d, n.v, n.ghost);
      ems.bass.flash(tt, Math.min(0.3, n.d));
    }
  }
  bassNote(dest, t, m, dur, vel, ghost = false) {
    const kind = this.st.bass, E = this.E, ctx = E.ctx;
    if (kind === 'sub' || kind === 'sub808') {
      return this.lib.play(dest, t, 'sub', m, Math.max(0.08, dur), vel * (kind === 'sub808' ? 1.1 : 0.9), { att: 0.006, rel: 0.09, fold: false, glide: kind === 'sub808' ? 1.06 : 0 });
    }
    const f = mtof(m), end = t + dur + 0.15;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    if (kind === 'upright') {
      o.type = 'triangle'; lp.frequency.setValueAtTime(1100, t); lp.frequency.setTargetAtTime(380, t, 0.12); lp.Q.value = 0.6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.008); g.gain.setTargetAtTime(0.2 * vel, t + 0.01, 0.18); g.gain.setTargetAtTime(0, t + dur, 0.06);
      const s = ctx.createOscillator(); s.frequency.value = f; const sg = ctx.createGain(); sg.gain.value = 0.6; s.connect(sg); sg.connect(g); s.start(t); s.stop(end);
    } else {
      o.type = 'sawtooth'; lp.frequency.setValueAtTime(ghost ? 500 : 2200, t); lp.frequency.setTargetAtTime(420, t, ghost ? 0.02 : 0.09); lp.Q.value = 3.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.005); g.gain.setTargetAtTime(0.18 * vel, t + 0.01, 0.15); g.gain.setTargetAtTime(0, t + dur, 0.03);
    }
    o.frequency.value = f; o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(end);
    E.after(end, () => g.disconnect());
    E.noteOn && E.noteOn(m, t, vel * 0.6, Math.min(1.5, dur));
    return end;
  }

  // ---------- Клавиши и пэды ----------
  keyInst(q) {
    const want = this.st.keys;
    const M = this.lib.meta && this.lib.meta.inst[want];
    if (M && (M.q === q || (q === 'm7' && M.q === 'sus') || (q === 'dom' && M.q === 'sus'))) return want;
    return { m7: 'rhodes', dom: 'classic', maj: 'soulsynth', sus: 'samplepad' }[q] || 'samplepad';
  }
  compChord(t, sd, ch, root, e, offbeatOnly = false) {
    const st = this.st, cfg = this.cfg, ems = this.ems(), inst = this.keyInst(ch.q), barDur = sd * 16;
    const kv = 0.6 * cfg.keys;
    const play = (s, len, v, opts = {}) => { const tt = t + s * sd + this.swingOff(s, sd); this.lib.play(ems.keys.input, tt, inst, root, len, v, { wobble: st.wobble, ...opts }); ems.keys.flash(tt, 0.4); };
    switch (st.comp) {
      case 'lofi':
        play(0, barDur * ch.bars - 0.25, kv, { att: 0.01, rel: 0.8, lp: 2600 });
        if (Math.random() < 0.4) play(10, sd * 5, kv * 0.6, { lp: 2400, rel: 0.4 });
        if (e < 0.45) this.padLayer(t, barDur * ch.bars, ch, root, 0.35);
        break;
      case 'jazz': {
        const R = pick([[[0, 2], [6, 3]], [[3, 2], [10, 3]], [[2, 1], [6, 2], [14, 1]], [[6, 2], [12, 3]], [[0, 3], [7, 2], [11, 1]]]);
        R.forEach(([s, len]) => { if (offbeatOnly && s === 0) return; play(s, len * sd * 1.3, kv * rnd(0.75, 0.95), { rel: 0.25, lp: 4200 }); });
        break;
      }
      case 'funk':
        if (!offbeatOnly && Math.random() < 0.5) play(14, sd * 2, kv * 0.55, { rel: 0.15 });
        if (e > 0.5 && ch.q === 'dom') this.padLayer(t, barDur * ch.bars, ch, root, 0.3);
        break;
      case 'chop': {
        if (offbeatOnly) break;
        play(0, sd * 7.5, kv, { off: 0.25, rel: 0.12, lp: 3200 });
        play(8, sd * 5.5, kv * 0.85, { off: 1.3, rel: 0.12, lp: 3000 });
        if (Math.random() < 0.35) { play(14, sd * 0.9, kv * 0.6, { off: 0.25, rel: 0.03 }); play(15, sd * 0.9, kv * 0.5, { off: 0.25, rel: 0.03 }); }
        break;
      }
      case 'pad':
        play(0, barDur * ch.bars + 0.5, kv * 0.8, { att: 1.6, rel: 2.5, lp: 5200 });
        if (ch.q === 'm7' || ch.q === 'sus') this.padLayer(t, barDur * ch.bars, ch, root, 0.4);
        break;
    }
  }
  padLayer(t, dur, ch, root, lvl) {
    const ems = this.ems(), inst = ch.q === 'maj' ? 'soulsynth' : ch.q === 'dom' ? 'classic' : this.st.pad;
    this.lib.play(ems.pad.input, t, inst, root, dur + 0.5, lvl * (this.cfg.keys ?? 1), { att: 1.8, rel: 2.5, lp: 3800 });
    ems.pad.glow = 0.4;
  }
  clavBar(t, sd, ch, root, e) {
    const E = this.E, ctx = E.ctx, ems = this.ems();
    if (!clavWave) { const n = 24, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.55) / k; clavWave = ctx.createPeriodicWave(re, im); }
    const P = pick(['..x..x.x..x..x.x', 'x..x..x...x.x..x', '..x.x..x..x...x.', '.x.x..x..x.x..x.']);
    const tones = (CHORD_TONES[ch.q] || CHORD_TONES.m7).slice(1, 4);
    let top = root + 12; while (top < 58) top += 12; while (top > 70) top -= 12;
    [...P].forEach((c, s) => {
      if (c !== 'x' || (e < 0.4 && s % 4 !== 2)) return;
      const tt = t + s * sd + this.swingOff(s, sd), v = 0.12 * this.cfg.keys * rnd(0.7, 1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.003); g.gain.setTargetAtTime(0, tt + 0.01, 0.045);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
      bp.connect(g); g.connect(ems.keys.input);
      tones.forEach((iv) => { const o = ctx.createOscillator(); o.setPeriodicWave(clavWave); o.frequency.value = mtof(top + iv - 12); o.connect(bp); o.start(tt); o.stop(tt + 0.25); });
      E.after(tt + 0.3, () => g.disconnect());
    });
  }

  // ---------- Флейта и вокальные чопы ----------
  flutePhrase(t, sd, ch, root) {
    const E = this.E, key = this.key();
    const pent = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    let lo = key + 12; while (lo < 60) lo += 12; while (lo > 71) lo -= 12;
    const pos = polar(pick([-1, 1]) * rnd(40, 110), rnd(5, 25), rnd(3, 5));
    const em = E.spawn({ group: 'instr', pos, send: 0.5, kind: 'ocarina', label: 'флейта' });
    const cells = pick([[[0, 3], [4, 2], [6, 2], [8, 6]], [[2, 2], [4, 2], [7, 3], [12, 8]], [[0, 6], [8, 2], [10, 2], [12, 2], [14, 10]], [[4, 4], [8, 2], [11, 5], [16, 8]]]);
    let i = Math.floor(rnd(2, 6)), end = t;
    cells.forEach(([s, len], j) => {
      if (j === cells.length - 1) i = pick([0, 2, 4, 5]);
      const m = lo + pent[Math.max(0, Math.min(pent.length - 1, i))];
      const tt = t + s * sd + this.swingOff(s, sd);
      end = Math.max(end, this.lib.play(em.input, tt, 'flute', m, len * sd * 0.95, 0.55 * this.cfg.lead, { att: 0.05, rel: 0.25, fold: false, off: 0.02 }));
      em.flash(tt, len * sd);
      i += pick([-2, -1, 1, 1, 2]);
    });
    em.path([{ t, pos }, { t: end, pos: polar(((pos.x > 0 ? 1 : -1) * rnd(60, 140)), rnd(10, 30), 4) }]);
    em.end = end; E.after(end + 0.5, () => em.dispose());
  }
  chops(t, sd, ch, root, e) {
    const E = this.E, amt = (this.cfg.chops ?? this.st.chops) * (0.4 + e * 0.6);
    if (Math.random() > amt) return;
    const n = Math.random() < 0.5 ? 1 : Math.floor(rnd(2, 4));
    const steps = [2, 6, 7, 10, 14, 15].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
    const tones = CHORD_TONES[ch.q] || CHORD_TONES.m7;
    let base = root; while (base < 57) base += 12; while (base > 68) base -= 12;
    const idx = Math.floor(Math.random() * 12);
    steps.forEach((s) => {
      const pos = polar(rnd(-150, 150), rnd(0, 40), rnd(2.2, 4));
      const tt = t + s * sd + this.swingOff(s, sd);
      const em = E.spawn({ group: 'instr', pos, send: 0.55, kind: 'live', label: 'голос', life: tt + 1.5 });
      this.lib.chop(em.input, tt, base + pick(tones.slice(0, 4)), 0.5 * (this.cfg.chops ?? 0.5) * 2, { idx });
      em.flash(tt, 0.3);
    });
  }

  // ---------- Винил: редкие мягкие щелчки, без шипения ----------
  setVinyl(level, fade = 2) {
    const E = this.E, ctx = E.ctx;
    if (level > 0.01 && !this.vinylGain) {
      const len = ctx.sampleRate * 6, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c); let lp = 0;
        for (let i = 0; i < len; i++) {
          let x = 0;
          if (Math.random() < 14 / ctx.sampleRate) x = (Math.random() - 0.5) * (Math.random() < 0.15 ? 0.9 : 0.3);
          lp = lp * 0.55 + x * 0.45; d[i] = lp;
        }
        for (let i = 0; i < len; i++) d[i] += 0.004 * Math.sin((i / ctx.sampleRate) * 2 * Math.PI * 0.55) * Math.sin(i / 997);
      }
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5200;
      this.vinylGain = ctx.createGain(); this.vinylGain.gain.value = 0;
      src.connect(f); f.connect(this.vinylGain); this.vinylGain.connect(E.groups.groove.dry); src.start();
    }
    if (this.vinylGain) this.vinylGain.gain.setTargetAtTime(level * 0.5, E.now, Math.max(0.1, fade / 3));
  }
}
