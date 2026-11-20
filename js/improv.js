// Импровизация ханга квадратами. Квадрат — четыре такта: мотив, ответ, повтор с вариацией, каденция.
// Вторая четвёрка отвечает первой и разрешается сильнее (в динг), потом рождается новый мотив —
// он вырастает из старого, поэтому музыка узнаваемая, но каждый раз другая.
// В пространстве квадрат тоже рисуется: такты приходят из четырёх углов вокруг головы и плывут к следующему.
import { polar, mtof, clamp } from './util.js';
import * as I from './instruments.js';

// ритмические ячейки: [шаг, длительность в шагах] на такт из 16 шестнадцатых (или 12 — для 6/8)
const CELLS = {
  4: {
    sparse: [[[0, 6], [8, 8]], [[0, 4], [6, 10]], [[2, 6], [8, 8]], [[0, 10], [12, 4]], [[0, 8], [10, 6]]],
    mid: [[[0, 3], [3, 3], [6, 2], [8, 8]], [[0, 2], [4, 2], [6, 4], [12, 4]], [[0, 4], [6, 2], [8, 4], [14, 2]], [[2, 2], [4, 4], [10, 2], [12, 4]], [[0, 3], [6, 3], [10, 2], [12, 4]], [[0, 2], [3, 3], [8, 2], [11, 5]]],
    dense: [[[0, 2], [2, 1], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]], [[0, 1], [2, 2], [4, 2], [7, 2], [9, 1], [10, 2], [12, 2], [14, 2]], [[0, 3], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 2], [14, 2]], [[0, 2], [2, 2], [5, 1], [6, 2], [8, 2], [11, 3], [14, 2]]],
  },
  3: {
    sparse: [[[0, 6], [6, 6]], [[0, 9], [9, 3]], [[3, 3], [6, 6]]],
    mid: [[[0, 3], [3, 3], [6, 6]], [[0, 2], [3, 3], [6, 3], [9, 3]], [[0, 3], [4, 2], [6, 6]]],
    dense: [[[0, 2], [2, 1], [3, 3], [6, 2], [8, 1], [9, 3]], [[0, 1], [1, 2], [3, 3], [6, 1], [7, 2], [9, 3]]],
  },
};
const CORNERS = [-45, 45, 135, -135];

export class Improv {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.bar = 0; this.motif = null; this.freeNext = 0; this.rot = 0; this.lastSource = null;
  }
  get rng() { return this.app.conductor.rng; }
  get C() { return this.app.conductor; }
  reset() { this.bar = 0; this.motif = null; this.freeNext = 0; }

  density() {
    let d = this.C.D.handpan || 0;
    const rh = this.app.rhythm; const P = rh.active && rh.pattern ? rh.patternDef : null;
    if (P && P.tracks && P.tracks.hp) d *= 0.7;  // в ритме уже есть ханг-остинато
    return d;
  }

  // Без ритма — свой неслышный пульс: такты по четыре доли в темпе главы
  tick(now, horizon, S) {
    const d = this.density();
    if (d < 0.02) { this.freeNext = 0; return; }
    if (this.app.groove.active || this.app.rhythm.active) { this.freeNext = 0; return; }
    if (!this.freeNext || this.freeNext < now) this.freeNext = now + 0.3;
    if (this.freeNext < horizon + 0.2) {
      const beat = 60 / Math.max(48, Math.min(80, S.tempo || 62));
      this.onBar(this.freeNext, { beat, spb: 4, chord: null, source: 'free' });
      this.freeNext += beat * 4;
    }
  }

  chordPcs(info) {
    const C = this.C;
    if (info.chord) return new Set(info.chord.tones.map((i) => (((info.chord.root + i - C.curDing) % 12) + 12) % 12));
    return new Set((C.state.chord || [0, 7, 12]).map((i) => ((i % 12) + 12) % 12));
  }

  newMotif(spb, d, from) {
    const r = this.rng, N = this.C.handpanNotes(), L = N.length;
    const dens = d < 0.28 ? 'sparse' : d < 0.58 ? 'mid' : 'dense';
    const lib = CELLS[spb] || CELLS[4];
    let cell = r.pick(lib[dens]);
    let contour;
    if (from && r.chance(0.5)) {
      // мутация: та же ритмика, новый рисунок — или тот же рисунок в новом ритме
      if (r.chance(0.5)) { cell = from.cell; contour = from.contour.map((i) => clamp(i + r.pick([-1, 0, 1]), 1, L - 1)); }
      else contour = from.contour.slice(0, cell.length);
    }
    if (!contour || contour.length < cell.length) {
      contour = contour || [];
      let i = contour.length ? contour[contour.length - 1] : r.int(2, Math.min(5, L - 1));
      while (contour.length < cell.length) {
        contour.push(i);
        i = clamp(i + r.weighted([-2, -1, 0, 1, 2], [1, 3.2, 0.5, 3, 1]), 1, L - 1);
      }
    }
    return { cell, contour, dens };
  }

  // Такт: какую часть квадрата играем
  onBar(t, info) {
    const d = this.density();
    if (d < 0.02 || !this.C.running) return;
    const E = this.E, r = this.rng, N = this.C.handpanNotes(), L = N.length, spb = info.spb === 3 ? 3 : 4;
    if (info.source !== this.lastSource) { this.bar = 0; this.motif = null; this.lastSource = info.source; }
    const q = this.bar % 4, period = Math.floor(this.bar / 4) % 2;
    if (!this.motif || (q === 0 && period === 0)) this.motif = this.newMotif(spb, d, this.motif);
    const M = this.motif, sd = info.beat / spb, stepsInBar = spb * 4;
    const pcs = this.chordPcs(info), ding = this.C.curDing;
    const isChord = (i) => pcs.has((((N[i] - ding) % 12) + 12) % 12);
    const snap = (i) => { if (isChord(i)) return i; for (const k of [1, -1, 2, -2]) { const j = i + k; if (j >= 1 && j < L && isChord(j)) return j; } return i; };

    // ноты такта
    let notes = M.cell.map(([s, len], j) => ({ s, len, i: M.contour[j] ?? M.contour[M.contour.length - 1] }));
    const lift = period === 1 ? r.pick([1, 1, 2]) : 0;
    if (q === 1) {
      const shift = r.pick([1, 2, -1]) + lift; const inv = r.chance(0.3);
      notes = notes.map((n) => ({ ...n, i: clamp(inv ? notes[0].i - (n.i - notes[0].i) + shift : n.i + shift, 1, L - 1) }));
      const last = notes[notes.length - 1]; if (isChord(last.i) && last.i + 1 < L) last.i += 1;  // ответ остаётся открытым
    } else if (q === 2) {
      notes = notes.map((n) => ({ ...n, i: clamp(n.i + lift, 1, L - 1) }));
      const k = r.int(0, notes.length - 1);
      if (r.chance(0.5)) notes[k].i = clamp(notes[k].i + r.pick([-1, 1]), 1, L - 1);
      else if (notes[k].s > 0 && !notes.some((n) => n.s === notes[k].s - 1)) notes.splice(k, 0, { s: notes[k].s - 1, len: 1, i: clamp(notes[k].i + 1, 1, L - 1), grace: true });
    } else if (q === 3) {
      const half = Math.max(1, Math.ceil(notes.length / 2));
      notes = notes.slice(0, half).filter((n) => n.s < stepsInBar / 2);
      const fifth = N.findIndex((m, i) => i > 0 && (((m - ding) % 12) + 12) % 12 === 7);
      const octave = N.findIndex((m, i) => i > 0 && (((m - ding) % 12) + 12) % 12 === 0);
      const endI = period === 1 ? (r.chance(0.6) ? 0 : (octave > 0 ? octave : 0)) : (fifth > 0 ? fifth : 1);
      notes.push({ s: stepsInBar / 2, len: stepsInBar / 2, i: endI, cad: true });
      if (period === 1 && endI !== 0) notes.push({ s: stepsInBar / 2, len: stepsInBar / 2, i: 0, cad: true, soft: true });
    }
    // в брейке грува ханг солирует плотнее
    if (info.sec === 'break' && q !== 3 && notes.length < 6) notes.push({ s: stepsInBar - 2, len: 2, i: clamp(notes[notes.length - 1].i + 1, 1, L - 1) });

    // место в пространстве: угол квадрата, медленный дрейф к следующему углу
    if (this.bar % 8 === 0) this.rot = (this.rot + r.pick([20, 30, 45])) % 360;
    const az0 = CORNERS[q] + this.rot, az1 = CORNERS[(q + 1) % 4] + this.rot;
    const dist = info.source === 'groove' ? r.range(1.5, 1.9) : r.range(1.6, 2.2);
    const p0 = polar(az0, r.range(-6, 10), dist);
    const em = E.spawn({ group: 'instr', pos: p0, send: 0.24, kind: 'handpan', label: 'ханг' });
    const barDur = sd * stepsInBar;
    const mid = (az1 - az0 + 540) % 360 - 180;
    em.path([{ t, pos: p0 }, { t: t + barDur * 1.6, pos: polar(az0 + mid * 0.35, r.range(-4, 12), dist) }]);

    let end = t, lastT = t;
    const swing = info.swing || (() => 0);
    const vbase = info.source === 'groove' ? 0.62 : 0.55;
    for (const n of notes) {
      const strong = n.s % (spb * 2) === 0;
      let i = strong && !n.cad ? snap(n.i) : n.i;
      const tt = t + n.s * sd + swing(n.s) + (Math.random() - 0.5) * 0.01;
      const vel = (n.cad ? 0.6 : strong ? vbase : vbase * 0.75) * (n.grace ? 0.55 : 1) * (n.soft ? 0.6 : 1) * r.range(0.9, 1.08);
      end = Math.max(end, I.handpan(E, em.input, tt, { freq: mtof(N[clamp(i, 0, L - 1)]), vel, bright: 0.35 + d * 0.3 }));
      em.flash(tt, Math.min(0.5, n.len * sd));
      lastT = Math.max(lastT, tt);
    }
    // грув: тихие «костяшки» на слабых долях, ханг звучит как перкуссия
    if (info.source === 'groove' && d > 0.45 && E.hp && E.hp.ready) {
      for (let s = 1; s < stepsInBar; s += 2) if (!notes.some((n) => Math.abs(n.s - s) < 1) && Math.random() < 0.22 * d) E.hp.strike(em.input, t + s * sd + swing(s), 'knuckle', 0.18);
    }
    em.end = end; E.after(end, () => em.dispose());
    this.app.gen.busyUntil.handpan = lastT + 0.2;
    this.bar++;
  }
}
