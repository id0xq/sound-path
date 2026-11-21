// Неоклассическое фортепиано: живое пианино (VSCO-2 CE, CC0), три манеры — разложенные аккорды с простой
// мелодией сверху (в духе Эйнауди), повторяющееся остинато, которое медленно нарастает (в духе Фрама),
// и редкий ноктюрн с воздухом между нотами. Это манера, а не чьи-то мелодии: всё сочиняется на ходу.
// Аккорды строятся только из нот строя сета, поэтому фортепиано всегда в ладу с хангом и остальными.
import { polar, mtof, clamp } from './util.js';
import { handpanNotes } from './theory.js';
import * as I from './instruments.js';

export const PIANO_STYLES = { einaudi: 'Разложенные аккорды', frahm: 'Остинато, тихое пианино', nocturne: 'Ноктюрн: редкие ноты' };

// корни аккордов (полутоны от тоники): минорные и мажорные движения
const PROGS_MINOR = [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 10], [0, 3, 10, 5], [0, 0, 8, 8]];
const PROGS_MAJOR = [[0, 7, 9, 5], [0, 5, 9, 7], [9, 5, 0, 7], [0, 4, 5, 7]];

export class Piano {
  constructor(app) { this.app = app; this.E = app.E; this.bar = 0; this.prog = null; this.lastChord = null; }
  get C() { return this.app.conductor; }
  get rng() { return this.C.rng; }
  density() { return this.C.D.piano || 0; }
  reset() { this.bar = 0; this.prog = null; }

  ems() {
    if (this._ems) return this._ems;
    const E = this.E, mk = (az, lbl) => E.spawn({ group: 'instr', pos: polar(az, -6, 2.4), send: 0.3, atmos: 0.35, kind: 'piano', label: lbl });
    return (this._ems = { low: mk(-24, 'фортепиано'), high: mk(24, 'фортепиано') });
  }

  // Нота живого пианино: мягкий слой для тихой игры, средний — для громкой; педаль держит звук dur секунд
  note(dest, t, midi, vel, dur, rel = 0.9) {
    const F = this.app.field, layer = vel < 0.5 ? 'piano1' : 'piano2';
    const end = F ? F.tuned(dest, t, layer, midi, { vel: 0.35 + vel * 0.5, dur, rel, exact: true }) : null;
    if (end !== null && end !== undefined) return end;
    return I.kalimba(this.E, dest, t, { freq: mtof(midi), vel: vel * 0.6 });
  }

  // ноты строя: из них строятся аккорды (только лад сета — никаких чужих нот)
  pcs() { const C = this.C; return new Set(handpanNotes(C.state.tuning, C.curDing).map((m) => (((m - C.curDing) % 12) + 12) % 12)); }
  chordFrom(rootPc, pcs) {
    const has = (iv) => pcs.has((rootPc + iv) % 12);
    const third = has(3) ? 3 : has(4) ? 4 : has(2) ? 2 : has(5) ? 5 : null;
    const fifth = has(7) ? 7 : has(8) ? 8 : has(6) ? 6 : null;
    const color = has(10) ? 10 : has(11) ? 11 : has(14 % 12) ? 14 : null;
    return [0, third, fifth, color].filter((x) => x !== null);
  }
  nearestPc(pc, pcs) { for (const k of [0, -1, 1, -2, 2]) { const p = (((pc + k) % 12) + 12) % 12; if (pcs.has(p)) return p; } return 0; }

  chordForBar(info) {
    const C = this.C, ding = C.curDing;
    if (info.chord) {   // в груве — его гармония
      const root = (((info.chord.root - ding) % 12) + 12) % 12;
      return { root, tones: info.chord.tones.filter((x) => x < 12) };
    }
    const pcs = this.pcs(), r = this.rng;
    const minor = pcs.has(3) || !pcs.has(4);
    const per = 2;   // аккорд держится два такта
    if (!this.prog || this.bar % (4 * per) === 0) {
      const lib = minor ? PROGS_MINOR : PROGS_MAJOR;
      this.prog = (this.prog && r.chance(0.4)) ? this.prog : r.pick(lib);
    }
    const rootPc = this.nearestPc(this.prog[Math.floor(this.bar / per) % this.prog.length], pcs);
    return { root: rootPc, tones: this.chordFrom(rootPc, pcs), first: this.bar % per === 0, bars: per };
  }

  onBar(t, info) {
    const d = this.density();
    if (d < 0.02 || !this.C.running) { this.bar = 0; return; }
    const S = this.C.state, r = this.rng, E = this.E, ems = this.ems();
    this.style = S.pianoStyle || 'einaudi';
    const ch = this.chordForBar(info), ding = this.C.curDing;
    const beat = info.beat, spb = 4, bar = beat * 4, sw = info.swing || (() => 0);
    // регистры: бас во второй октаве, рука — от соль малой до ре второй
    let bass = ding + ch.root; while (bass > 47) bass -= 12; while (bass < 36) bass += 12;
    const rh = []; for (let m = 55; m <= 76; m++) if (ch.tones.some((iv) => (((m - ding - ch.root) % 12) + 12) % 12 === iv % 12)) rh.push(m);
    if (rh.length < 3) rh.push(rh[0] + 12, rh[0] + 19);
    // волна громкости по восьми тактам: нарастает к шестому и стихает
    const pos8 = this.bar % 8, swell = 0.55 + 0.45 * Math.sin(Math.PI * (pos8 + 0.5) / 8);
    const v = (x) => clamp(x * (0.55 + d * 0.5) * swell * r.range(0.88, 1.08), 0.08, 1);
    const hum = () => (Math.random() - 0.5) * 0.014;
    const changes = ch.first !== false;   // новый аккорд в этом такте
    const pedal = bar * (ch.bars || 1) + 0.4;

    if (changes) this.note(ems.low.input, t + hum(), bass, v(0.5), pedal, 1.2);
    if (this.style === 'einaudi') {
      // разложенный аккорд восьмыми: вверх и обратно; на плотности выше — шестнадцатые во второй половине
      const up = [rh[0], rh[1], rh[2], rh[Math.min(rh.length - 1, 3)] || rh[0] + 12];
      const seq = [up[0], up[1], up[2], up[3], up[2], up[1], up[2], up[3]];
      seq.forEach((m, k) => {
        if (d < 0.25 && k % 2) return;
        const tt = t + k * beat / 2 + sw(k * 2) + hum();
        this.note(ems.high.input, tt, m, v(k === 0 ? 0.42 : 0.32), beat * 1.6, 0.6);
      });
      // простая мелодия сверху: долгая нота каждые два такта, ответ во втором квадрате
      if (this.bar % 2 === 0 && d > 0.3) {
        const top = rh.filter((m) => m >= 64);
        const mel = (top.length ? r.pick(top) : rh[rh.length - 1]) + 12;
        this.note(ems.high.input, t + beat * r.pick([0, 2]) + hum(), mel, v(0.55), beat * 3.5, 1.4);
      }
    } else if (this.style === 'frahm') {
      // остинато из трёх нот, повторяется шестнадцатыми или восьмыми, медленно нарастая
      if (!this.ost || this.bar % 8 === 0) this.ost = [r.pick([0, 1]), r.pick([2, 3]), r.pick([1, 2])];
      const cell = this.ost.map((i) => rh[Math.min(rh.length - 1, i)]);
      const steps = d > 0.55 ? 16 : 8, dt = bar / steps;
      for (let k = 0; k < steps; k++) {
        const m = cell[k % cell.length] + (k % 6 === 5 && d > 0.7 ? 12 : 0);
        this.note(ems.high.input, t + k * dt + hum(), m, v(0.16 + 0.1 * (k % 4 === 0)), dt * 2.2, 0.35);
      }
      if (pos8 >= 4 && d > 0.45) this.note(ems.low.input, t + bar / 2 + hum(), bass + 12, v(0.3), bar / 2, 0.8);
    } else {
      // ноктюрн: аккорд, взятый чуть врассыпную, и одна-две ноты в тишине
      if (changes) rh.slice(0, 3).forEach((m, k) => this.note(ems.high.input, t + k * 0.05 + hum(), m, v(0.3), pedal, 1.2));
      const n = d > 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const b = r.pick([1, 2, 3]) + (r.chance(0.5) ? 0.5 : 0);
        this.note(ems.high.input, t + b * beat + hum(), r.pick(rh) + 12, v(0.38), beat * 2.5, 1.2);
      }
    }
    ems.low.flash(t, 0.6); ems.high.flash(t, bar * 0.8);
    this.bar++;
  }

  // Живая кнопка «Фортепиано»: фраза в строе и темпе сета, каждый раз по-новому
  phrase(dest, t, beat, variant) {
    const C = this.C, ding = C.curDing, pcs = this.pcs(), r = this.rng;
    const rootPc = this.nearestPc(r.pick([0, 0, 5, 7, 8, 3, 10]), pcs), tones = this.chordFrom(rootPc, pcs);
    const rh = []; for (let m = 55; m <= 79; m++) if (tones.some((iv) => (((m - ding - rootPc) % 12) + 12) % 12 === iv % 12)) rh.push(m);
    let bass = ding + rootPc; while (bass > 47) bass -= 12; while (bass < 36) bass += 12;
    let end = this.note(dest, t, bass, 0.4, beat * 6, 1.5);
    if (variant === 0) rh.slice(0, 4).forEach((m, k) => { end = Math.max(end, this.note(dest, t + 0.06 * k, m, 0.35, beat * 6, 1.5)); });   // аккорд врассыпную
    else if (variant === 1) [0, 1, 2, 3, 2, 1, 2, 3].forEach((i, k) => { end = Math.max(end, this.note(dest, t + k * beat / 2, rh[Math.min(rh.length - 1, i)], 0.32, beat * 1.6, 0.6)); });  // такт арпеджио
    else { const mel = rh.slice(-3); mel.forEach((m, k) => { end = Math.max(end, this.note(dest, t + k * beat, m, 0.42, beat * 2.5, 1.2)); }); }  // три ноты мелодии
    return end;
  }
}
