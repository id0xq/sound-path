// Генеративные голоса сета: ханг, облако из нот ханга, колокольчики, окарина (зов и отклик), калимба
// и сюжетные события: чаша, гонг, тингши, дождевая палка, хоровод колокольчиков, «луч», стайка птиц.
import { polar, mtof, clamp, toPolar } from './util.js';

// Дуга движения: звук плывёт вокруг головы на deg градусов за время жизни (движение помогает слуху точно услышать место)
export function arc(pos, deg, t0, t1, dEl = 0, n = 5) {
  const p = toPolar(pos), pts = [];
  for (let k = 0; k <= n; k++) { const u = k / n; pts.push({ t: t0 + (t1 - t0) * u, pos: polar(p.az + deg * u, Math.max(-20, Math.min(85, p.el + dEl * u)), p.d) }); }
  return pts;
}
import * as I from './instruments.js';
import { scaleInRange } from './theory.js';

export const EVENT_NAMES = {
  bowl: 'Чаша', bowlSing: 'Поющая чаша', tingsha: 'Тингши', koshi: 'Колокольчики', gong: 'Гонг', rainstick: 'Дождевая палка',
  chimesOrbit: 'Хоровод колокольчиков', shimmer: 'Луч', flyby: 'Стайка птиц', oceanDrum: 'Океанский барабан', dissolve: 'Растворение',
};

export class Generators {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.next = { handpan: 0, bells: 0, ocarina: 0, wash: 0, kalimba: 0 };
    this.busyUntil = { handpan: 0, ocarina: 0, kalimba: 0 };
    this.orbitPhase = Math.random() * 360;
  }
  get rng() { return this.app.conductor.rng; }
  get C() { return this.app.conductor; }

  reset(now) { for (const k of Object.keys(this.next)) this.next[k] = now + 1 + Math.random() * 4; }

  pos(S, now, { front = false, high = false } = {}) {
    const r = this.rng;
    switch (S.motion) {
      case 'orbit': { const az = (this.orbitPhase + now * 9) % 360; return polar(az, high ? r.range(25, 45) : r.range(5, 20), r.range(2.6, 3.6)); }
      case 'float': return polar(r.range(-180, 180), r.range(25, 60), r.range(3, 7));
      case 'walk': return polar(r.range(-30, 30), high ? r.range(25, 50) : r.range(0, 10), r.range(2.4, 3.8));
      default:
        if (front) return polar(r.range(-70, 70), r.range(-5, 15), r.range(2.2, 3.4));
        return polar(r.range(-140, 140), high ? r.range(25, 60) : r.range(0, 25), r.range(2.6, 5));
    }
  }

  tick(now, horizon, S, D) {
    if (D.handpan > 0.02 && now >= this.next.handpan && now >= this.busyUntil.handpan) this.handpanPhrase(now, S, D.handpan);
    if (D.wash > 0.02 && now >= this.next.wash) this.washNote(now, S, D.wash);
    if (D.bells > 0.02 && now >= this.next.bells) this.bells(now, S, D.bells);
    if (D.ocarina > 0.02 && now >= this.next.ocarina && now >= this.busyUntil.ocarina) this.ocarinaCall(now, S, D.ocarina);
    if (D.kalimba > 0.02 && now >= this.next.kalimba && now >= this.busyUntil.kalimba) this.kalimbaPhrase(now, S, D.kalimba);
  }

  // ---------- Ханг: фразы, привязанные к ритму, если он звучит ----------
  handpanPhrase(now, S, d) {
    const r = this.rng, E = this.E, notes = this.C.handpanNotes(), rh = this.app.rhythm;
    const n = Math.round(r.range(3, 5 + d * 6));
    const stable = notes.map((m, i) => (((m - notes[0]) % 12) === 0 || ((m - notes[0]) % 12) === 7 ? i : -1)).filter((i) => i >= 0);
    let idx = r.pick([1, 2, 3, Math.min(4, notes.length - 1)]);
    const seq = [];
    for (let i = 0; i < n; i++) {
      seq.push(idx);
      const s = r.weighted([-2, -1, 1, 2, 'ding'], [1, 3.2, 3, 1, 0.8]);
      if (s === 'ding') { seq.push(0); i++; idx = r.int(1, 3); }
      else idx = clamp(idx + s, 1, notes.length - 1);
    }
    seq[seq.length - 1] = r.pick(stable);
    const withRhythm = rh.active;
    let t = withRhythm ? rh.nextBeat(now + 0.25) : now + 0.2;
    const unit = withRhythm ? rh.beatDur() / 2 : r.range(0.32, 0.55);
    // фразы приходят то слева, то справа и медленно плывут по дуге
    this.hpSide = -(this.hpSide || 1);
    const p0 = S.motion === 'still' ? polar(this.hpSide * r.range(20, 115), r.range(-5, 20), r.range(2, 3.4)) : this.pos(S, now, { front: true });
    const em = E.spawn({ group: 'instr', pos: p0, send: 0.4, kind: 'handpan', label: 'ханг' });
    const phraseLen = seq.length * unit * 2.2 + 3;
    em.path(arc(p0, (S.motion === 'orbit' ? 60 : 30) * this.hpSide * -1 * r.range(0.6, 1.3), t, t + phraseLen, r.range(-5, 10)));
    let end = t;
    seq.forEach((ix, i) => {
      const arch = Math.sin(Math.PI * (i + 0.5) / seq.length);
      const vel = (0.38 + 0.32 * arch + (ix === 0 ? 0.1 : 0)) * r.range(0.85, 1.1) * (withRhythm ? 0.8 : 1);
      end = Math.max(end, I.handpan(E, em.input, t, { freq: mtof(notes[ix]), vel, bright: 0.35 + d * 0.3 }));
      em.flash(t, 0.4);
      const k = withRhythm ? r.weighted([1, 2, 3, 4], [3, 4, 1.5, 1]) : r.weighted([1, 1.5, 2, 3], [3, 2, 2, 1]) * r.range(0.9, 1.15);
      t += unit * k;
    });
    em.end = end; this.E.after(end, () => em.dispose());
    this.busyUntil.handpan = t;
    this.next.handpan = t + r.range(0.6, 1.6) * (1.2 + (1 - d) * 11);
  }

  // ---------- Облако: «атмосферный массив» из протяжных нот ханга ----------
  washNote(now, S, d) {
    const r = this.rng, E = this.E, C = this.C;
    const pool = scaleInRange(S.tuning, C.ding, C.ding, C.ding + 26, { pentatonic: true });
    const m = r.pick(pool), t = now + 0.1;
    const pos = polar(r.range(-180, 180), r.range(10, 60), r.range(4, 9));
    const em = E.spawn({ group: 'atmos', pos, send: 0.95, kind: 'wash', label: 'облако' });
    const end = I.handpan(E, em.input, t, { freq: mtof(m), vel: r.range(0.35, 0.6), bright: 0.3, bowed: true });
    em.end = end; em.glow = 0.7; E.after(end, () => em.dispose());
    em.path(arc(pos, r.sign() * r.range(40, S.motion === 'orbit' ? 160 : 90), t, end, r.range(5, 25)));
    this.next.wash = now + r.range(0.6, 1.4) * (1.4 + (1 - d) * 7);
  }

  // ---------- Колокольчики коши над головой ----------
  bells(now, S, d) {
    const r = this.rng, E = this.E, C = this.C;
    const pool = scaleInRange(S.tuning, C.ding, C.ding + 34, C.ding + 46, { pentatonic: true }).map(mtof);
    const t = now + 0.1, pos = this.pos(S, now, { high: true });
    const em = E.spawn({ group: 'instr', pos, send: 0.55, kind: 'bells', label: 'колокольчики' });
    const end = I.koshiStrum(E, em.input, t, { freqs: pool, count: r.int(3, 8), spread: r.range(0.8, 2.5), vel: 0.5 });
    em.path(arc(pos, r.sign() * r.range(60, 140), t, t + 4, r.range(-10, 10)));
    em.end = end; em.glow = 0.8; E.after(end, () => em.dispose());
    this.next.bells = now + r.range(0.6, 1.5) * (5 + (1 - d) * 28);
  }

  // ---------- Окарина: зов издалека и отклик с другой стороны ----------
  ocarinaCall(now, S, d) {
    const r = this.rng, E = this.E, C = this.C;
    const pool = scaleInRange(S.tuning, C.ding, C.ding + 22, C.ding + 36, { pentatonic: true });
    const n = r.int(3, 6);
    let i = r.int(1, Math.max(1, pool.length - 3));
    const motif = [];
    for (let k = 0; k < n; k++) {
      motif.push({ i, d: k === n - 1 ? r.range(1.3, 2.2) : r.pick([0.32, 0.45, 0.6, 0.9]), v: k === n - 1 ? 0.85 : r.range(0.7, 1) });
      i = clamp(i + r.weighted([-2, -1, 1, 2], [1, 3, 3, 1]), 0, pool.length - 1);
    }
    const side = r.sign();
    const play = (t, notes, az) => {
      const pos = polar(az, r.range(4, 16), r.range(10, 18));
      const em = E.spawn({ group: 'instr', pos, send: 0.55, kind: 'ocarina', label: 'окарина' });
      const end = I.ocarina(E, em.input, t, notes, { vel: 0.7, breath: 0.6 });
      em.path(arc(pos, r.sign() * r.range(10, 25), t, end));
      em.end = end; em.glow = 0.9; E.after(end, () => em.dispose());
      return end;
    };
    const t0 = now + 0.2;
    const e1 = play(t0, motif.map((x) => ({ f: mtof(pool[x.i]), d: x.d, v: x.v })), side * r.range(40, 75));
    // отклик: та же ритмика, мелодия сдвинута или отражена
    const shift = r.pick([-2, -1, 1, 2]), invert = r.chance(0.35);
    const resp = motif.map((x) => {
      const j = invert ? motif[0].i - (x.i - motif[0].i) : x.i + shift;
      return { f: mtof(pool[clamp(j, 0, pool.length - 1)]), d: x.d * r.range(0.95, 1.1), v: x.v * 0.9 };
    });
    const t1 = e1 + r.range(1.5, 4);
    const e2 = r.chance(0.8) ? play(t1, resp, -side * r.range(50, 110)) : e1;
    this.busyUntil.ocarina = e2;
    this.next.ocarina = e2 + r.range(0.6, 1.4) * (8 + (1 - d) * 40);
  }

  // ---------- Калимба: короткие арпеджио ----------
  kalimbaPhrase(now, S, d) {
    const r = this.rng, E = this.E, C = this.C;
    const pool = scaleInRange(S.tuning, C.ding, C.ding + 12, C.ding + 31, { pentatonic: true });
    const kp = polar(r.sign() * r.range(30, 120), r.range(-5, 15), r.range(2.2, 3.2));
    const em = E.spawn({ group: 'instr', pos: kp, send: 0.35, kind: 'kalimba', label: 'калимба' });
    em.path(arc(kp, r.sign() * r.range(25, 50), now, now + 5));
    let t = now + 0.15, i = r.int(0, pool.length - 4), end = t;
    const n = r.int(4, 9), u = this.app.rhythm.active ? this.app.rhythm.beatDur() / 2 : r.range(0.18, 0.3);
    for (let k = 0; k < n; k++) {
      end = Math.max(end, I.kalimba(E, em.input, t, { freq: mtof(pool[clamp(i, 0, pool.length - 1)]), vel: r.range(0.4, 0.75) }));
      em.flash(t, 0.3); t += u * r.pick([1, 1, 2]); i += r.weighted([-1, 1, 2, -2], [2, 3, 1, 1]);
    }
    em.end = end; E.after(end, () => em.dispose());
    this.busyUntil.kalimba = t;
    this.next.kalimba = t + r.range(0.6, 1.4) * (4 + (1 - d) * 25);
  }

  // ---------- Сюжетные события ----------
  fire(type, t, S) {
    const E = this.E, C = this.C, r = this.rng;
    const one = (pos, kind, label, send, fn) => {
      const em = E.spawn({ group: 'instr', pos, send, kind, label });
      const end = fn(em.input);
      em.end = end; em.glow = 1; E.after(end, () => em.dispose());
      return em;
    };
    switch (type) {
      case 'bowl': return one(polar(r.range(-8, 8), -12, 2), 'bowl', 'чаша', 0.35, (d) => I.bowl(E, d, t, { freq: mtof(C.ding + 12), vel: 0.75 }));
      case 'bowlSing': return one(polar(0, -10, 2.2), 'bowl', 'поющая чаша', 0.4, (d) => I.bowl(E, d, t, { freq: mtof(C.ding + 12), vel: 0.6, mode: 'sing', hold: 10 }));
      case 'tingsha': return one(polar(0, 40, 2.4), 'bells', 'тингши', 0.5, (d) => I.tingsha(E, d, t, { freq: mtof(C.ding + 48) * 0.94, vel: 0.6 }));
      case 'koshi': return one(polar(r.range(-60, 60), 45, 3), 'bells', 'колокольчики', 0.55,
        (d) => I.koshiStrum(E, d, t, { freqs: scaleInRange(S.tuning, C.ding, C.ding + 34, C.ding + 46, { pentatonic: true }).map(mtof), count: 7, spread: 2.2 }));
      case 'gong': return one(polar(0, 0, 4.5), 'gong', 'гонг', 0.5, (d) => I.gong(E, d, t, { freq: mtof(C.ding - 12), vel: 0.7 }));
      case 'oceanDrum': {
        const em = one(polar(-80, 0, 3), 'water', 'океанский барабан', 0.45, (d) => I.oceanDrum(E, d, t, { dur: 8, vel: 0.7 }));
        em.path([{ t, pos: polar(-85, 5, 3) }, { t: t + 4, pos: polar(0, 25, 2.5) }, { t: t + 8, pos: polar(85, 5, 3) }]); return em;
      }
      case 'rainstick': {
        const dir = r.sign();
        const em = one(polar(-80 * dir, 10, 2.5), 'rattle', 'дождевая палка', 0.4, (d) => I.rainstick(E, d, t, { dur: 5, vel: 0.65 }));
        em.path([{ t, pos: polar(-85 * dir, 15, 2.6) }, { t: t + 2.5, pos: polar(0, 30, 2.2) }, { t: t + 5, pos: polar(85 * dir, 15, 2.6) }]); return em;
      }
      case 'chimesOrbit': {
        // колокольчики кружат вокруг головы полтора оборота
        const dur = 14, em = E.spawn({ group: 'instr', pos: polar(0, 30, 2.6), send: 0.5, kind: 'bells', label: 'хоровод' });
        const pts = []; const start = r.range(-180, 180), dir = r.sign();
        for (let k = 0; k <= 24; k++) pts.push({ t: t + (dur * k) / 24, pos: polar(start + dir * 540 * (k / 24), 25 + 15 * Math.sin(k / 3), 2.6) });
        em.path(pts);
        const pool = scaleInRange(S.tuning, C.ding, C.ding + 34, C.ding + 46, { pentatonic: true }).map(mtof);
        let end = t;
        for (let k = 0; k < 22; k++) { const tt = t + (dur * k) / 22 + r.range(0, 0.15); end = Math.max(end, I.koshi(E, em.input, tt, { freq: r.pick(pool), vel: r.range(0.35, 0.7) })); }
        em.end = end; em.glow = 1; E.after(end, () => em.dispose()); return em;
      }
      case 'shimmer': {
        const fr = scaleInRange(S.tuning, C.ding, C.ding + 36, C.ding + 50, { pentatonic: true }).filter((_, i) => i % 2 === 0).slice(0, 6).map(mtof);
        return one(polar(0, 78, 3), 'wash', 'луч', 0.8, (d) => I.shimmer(E, d, t, { freqs: fr, dur: 10, vel: 0.7 }));
      }
      case 'flyby': this.app.birds.flyby(t); return null;
      case 'dissolve': setTimeout(() => E.dissolve(10), Math.max(0, (t - E.now) * 1000)); return null;
    }
    return null;
  }
}
