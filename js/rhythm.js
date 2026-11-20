// Ритмические партии: шаг, сердце, колыбель 6/8, грув ханга.
// Символы: X — акцент, x — удар, o — тихий, ? — иногда, . — пауза; в партии ханга цифры — номер ноты (0 — динг).
import { polar, mtof } from './util.js';
import * as I from './instruments.js';

export const PATTERNS = {
  heartbeat: { name: 'Сердце', spb: 4, len: 16, tracks: { lub: 'X...X...X...X...', dub: '.x...x...x...x..' } },
  heartwalk: { name: 'Шаг', spb: 4, len: 16, tracks: { dum: 'x...x...x...x...', shaker: '..o...o...o...o.', tek: '..............?.' } },
  walkGroove: { name: 'Тропа', spb: 4, len: 16, tracks: {
    dum: 'X...x...X...x...', tek: '......o.......o?', shaker: 'o.x.o.x.o.x.o.x.', udu: '...o.......?..o.', hp: '0..2..4.0..3.5..' } },
  walkGroove2: { name: 'Тропа сердца', spb: 4, len: 32, tracks: {
    dum: 'X...x...X...x...X...x...X..ox...', tek: '....o.......o.......o.....o.o...', shaker: 'o.x.o.x.o.x.o.x.',
    udu: '..o.....?.o.....', hp: '0.3.5.3.6.5.3.2.0.3.5.7.6.5.4.2.', rattle: '................X...............' } },
  cradle: { name: 'Колыбель 6/8', spb: 3, len: 12, tracks: { dum: 'X.....x.....', tek: '...o.....o..', shaker: 'o.oo.oo.oo.o', hp: '0.3.5.2.4.6.' } },
  heartGroove: { name: 'Раскрытое сердце', spb: 4, len: 32, tracks: {
    lub: 'X...X...X...X...', dub: '.x...x...x...x..', hp: '1.3.5.3.2.4.6.4.1.3.5.7.6.4.3.2.', udu: '......o.......o?', shaker: '..o...o...o...o.' } },
  pulse: { name: 'Пульс', spb: 4, len: 32, tracks: { dum: 'x...............o...............', hp: '0.......5.......3.......4.......', shaker: '........o...............o.......' } },
};

const VEL = { X: 1, x: 0.72, o: 0.42, '?': 0.45 };

const POS = {
  dum: polar(0, -10, 2.4), tek: polar(14, -6, 2.4), lub: polar(0, -28, 1.4), dub: polar(0, -28, 1.4),
  shaker: polar(40, 6, 2.2), udu: polar(-42, -6, 2.6), hp: polar(-8, -4, 1.8), rattle: polar(58, 12, 2.4),
};
const KIND = { dum: 'rhythm', tek: 'rhythm', lub: 'heart', dub: 'heart', shaker: 'rattle', udu: 'rhythm', hp: 'handpan', rattle: 'rattle' };

export class Rhythm {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.ems = {};
    for (const k of Object.keys(POS)) {
      if (k === 'dub') continue;
      this.ems[k] = this.E.spawn({ group: 'rhythm', pos: POS[k], send: k === 'lub' ? 0.08 : 0.25, kind: KIND[k], label: k, hrtf: k === 'hp' });
    }
    this.ems.dub = this.ems.lub;
    this.pattern = null; this.pending = undefined; this.step = 0; this.nextTime = 0;
    this.tempo = { from: 66, to: 66, t0: 0, t1: 0 };
  }
  get key() { return this.pending !== undefined ? this.pending : this.pattern; }
  get patternDef() { return PATTERNS[this.pattern]; }
  get spb() { const P = PATTERNS[this.pattern]; return P ? P.spb : 4; }
  setPattern(key) {
    if (key === this.pattern && this.pending === undefined) return;
    if (!this.pattern) { this.pattern = key; this.step = 0; this.nextTime = 0; this.pending = undefined; }
    else this.pending = key;
  }
  setTempo(bpm, ramp = 0) {
    const now = this.E.now; const cur = this.bpmAt(now);
    this.tempo = { from: cur, to: bpm, t0: now, t1: now + Math.max(0.01, ramp) };
  }
  bpmAt(t) { const T = this.tempo; if (t >= T.t1) return T.to; if (t <= T.t0) return T.from; return T.from + (T.to - T.from) * (t - T.t0) / (T.t1 - T.t0); }
  stepDur(t) { const P = PATTERNS[this.pattern]; return 60 / this.bpmAt(t) / (P ? P.spb : 4); }

  // ближайшая доля после времени t — для привязки мелодий к ритму
  nextBeat(t) {
    if (!this.pattern || !this.nextTime) return t;
    const P = PATTERNS[this.pattern]; let tt = this.nextTime, s = this.step;
    while (tt < t || s % P.spb !== 0) { tt += this.stepDur(tt); s++; if (tt - t > 8) break; }
    return tt;
  }
  beatDur() { return this.pattern ? 60 / this.bpmAt(this.E.now) : 0.8; }
  nextBar(t) {
    if (!this.pattern || !this.nextTime) return t;
    const P = PATTERNS[this.pattern]; let tt = this.nextTime, s = this.step;
    while (tt < t || s % (P.spb * 4) !== 0) { tt += this.stepDur(tt); s++; if (tt - t > 16) break; }
    return tt;
  }
  get active() { return !!this.pattern; }

  tick(now, horizon) {
    if (!this.pattern) return;
    if (this.nextTime < now) this.nextTime = now + 0.06;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      let P = PATTERNS[this.pattern];
      if (this.pending !== undefined && this.step % P.len === 0) {
        this.pattern = this.pending; this.pending = undefined; this.step = 0;
        if (!this.pattern) return;
        P = PATTERNS[this.pattern];
      }
      // начало такта (четыре доли): ханг-импровизатор строит свой квадрат
      if (this.step % (P.spb * 4) === 0 && this.app.improv) this.app.improv.onBar(this.nextTime, { beat: 60 / this.bpmAt(this.nextTime), spb: P.spb, chord: null, source: 'rhythm' });
      this.playStep(P, this.step, this.nextTime);
      this.nextTime += this.stepDur(this.nextTime);
      this.step++;
    }
  }

  playStep(P, step, t) {
    const E = this.E, st = this.app.conductor.state;
    const notes = this.app.conductor.handpanNotes();
    for (const [tr, str] of Object.entries(P.tracks)) {
      const c = str[step % str.length]; if (!c || c === '.') continue;
      if (c === '?' && Math.random() > 0.35) continue;
      const tt = t + (Math.random() - 0.5) * 0.012;
      const em = this.ems[tr]; if (!em) continue;
      let end = tt;
      if (tr === 'hp') {
        const idx = parseInt(c, 10); if (isNaN(idx)) continue;
        const m = notes[Math.min(idx, notes.length - 1)];
        end = I.handpan(E, em.input, tt, { freq: mtof(m), vel: (step % P.spb === 0 ? 0.55 : 0.42) * (0.9 + Math.random() * 0.2), bright: 0.4 });
      } else {
        const v = (VEL[c] ?? 0.6) * (0.88 + Math.random() * 0.24);
        if (tr === 'dum' || tr === 'tek') end = I.frameDrum(E, em.input, tt, { hit: tr, vel: v });
        else if (tr === 'lub' || tr === 'dub') end = I.heart(E, em.input, tt, { hit: tr, vel: v });
        else if (tr === 'shaker') end = I.shaker(E, em.input, tt, { vel: v });
        else if (tr === 'udu') end = I.udu(E, em.input, tt, { vel: v, freq: mtof(notes[0]) });
        else if (tr === 'rattle') end = I.rattle(E, em.input, tt, { vel: v * 0.7, dur: 0.5, shakes: 1 });
      }
      em.flash && em.flash(tt, Math.min(0.4, end - tt));
    }
  }
}
