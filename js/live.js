// Живые звуки: проводник добавляет инструменты прямо внутрь атмосферы.
// Каждый инструмент — настоящая запись (Freesound, CC0), подстроенная под строй сета, и каждый раз звучит
// по-новому: другие ноты аккорда, другой рисунок, сила удара, место в пространстве. Если идёт ритм или грув,
// звук вступает на ближайшую долю, поэтому всё звучит в темп. Пока запись грузится — звучит синтез.
// Место звука: «вокруг» (случайно, мягко), «точка» (куда коснулись купола), «кружение» (облетает голову).
import { polar, mtof } from './util.js';
import * as I from './instruments.js';
import { scaleInRange, handpanNotes } from './theory.js';
import { arc } from './generators.js';

export const LIVE = [
  { id: 'bells', name: 'Колокольчики', key: '1', kind: 'bells' },
  { id: 'tingsha', name: 'Тингши', key: '2', kind: 'bells' },
  { id: 'bowl', name: 'Чаша', key: '3', kind: 'bowl' },
  { id: 'bowlSing', name: 'Поющая чаша', key: '4', kind: 'bowl' },
  { id: 'ocarina', name: 'Окарина', key: '5', kind: 'ocarina' },
  { id: 'piano', name: 'Фортепиано', key: 'u', kind: 'piano' },
  { id: 'kalimba', name: 'Калимба', key: '6', kind: 'kalimba' },
  { id: 'rattle', name: 'Погремушка', key: '7', kind: 'rattle' },
  { id: 'rainstick', name: 'Дождевая палка', key: '8', kind: 'rattle' },
  { id: 'ocean', name: 'Океанский барабан', key: '9', kind: 'water' },
  { id: 'gong', name: 'Гонг', key: '0', kind: 'gong' },
  { id: 'drum', name: 'Барабан', key: '-', kind: 'rhythm' },
  { id: 'bird', name: 'Птица', key: '=', kind: 'bird' },
  { id: 'shimmer', name: 'Луч', key: 'b', kind: 'wash' },
  { id: 'flyby', name: 'Стайка', key: 'n', kind: 'bird' },
  { id: 'crystal', name: 'Хрустальная чаша', key: 'z', kind: 'wash', heal: true },
  { id: 'fork', name: 'Камертоны', key: 'x', kind: 'bells', heal: true },
  { id: 'monochord', name: 'Монохорд', key: 'c', kind: 'wash', heal: true },
  { id: 'shruti', name: 'Шрути', key: 'v', kind: 'wash', heal: true },
  { id: 'templeBell', name: 'Храмовый колокол', key: 'm', kind: 'gong', heal: true },
  { id: 'chimes', name: 'Ветряные колокольчики', key: ',', kind: 'bells', heal: true },
  { id: 'belltree', name: 'Дерево колокольчиков', key: '.', kind: 'bells', heal: true },
  { id: 'overtone', name: 'Обертоновое пение', key: '/', kind: 'wash', heal: true },
  { id: 'tongue', name: 'Глюкофон', key: 'q', kind: 'kalimba', heal: true },
  { id: 'didg', name: 'Диджериду', key: 'w', kind: 'wash', heal: true },
  { id: 'glass', name: 'Поющее стекло', key: 'e', kind: 'bells', heal: true },
  { id: 'shaman', name: 'Шаманский бубен', key: 'r', kind: 'rhythm', heal: true },
  { id: 'lyre', name: 'Лира', key: 't', kind: 'ocarina', heal: true },
  { id: 'dissolve', name: 'Растворение', key: 'p', kind: 'wash', heal: true },
];

// Бинауральные волны мозга: разница частот между ушами
export const BRAINWAVES = [
  { id: 'off', name: 'Выкл', hz: null },
  { id: 'delta', name: 'Дельта · 2 Гц', hz: 2, hint: 'глубокий сон' },
  { id: 'theta', name: 'Тета · 6 Гц', hz: 6, hint: 'медитация, образы' },
  { id: 'alpha', name: 'Альфа · 10 Гц', hz: 10, hint: 'спокойное бодрствование' },
  { id: 'beta', name: 'Бета · 14 Гц', hz: 14, hint: 'ясность, внимание' },
  { id: 'gamma', name: 'Гамма · 40 Гц', hz: 40, hint: 'собранность' },
];

// выравнивание громкости живых записей между собой (длинные звуки тише, тихие тингши громче)
const REC_GAIN = { tingsha: 1.5, crystal: 0.4, templebell: 2.0, shaman: 0.6, ocarina: 0.7, kalimba: 0.75, glass: 1.3, bowlsing: 0.75,
  gong: 1.8, didg: 0.65, lyre: 0.9, bowl: 0.5, tongue: 1, shruti: 0.9, rattle: 1, rainstick: 1, heart: 1 };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Live {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.mode = 'around';             // around | point | orbit
    this.point = { az: 0, el: 10, d: 3 };
    this.elevation = 10;
    this.samples = [];
    this.orbitDir = 1;
    this.tuning = '';                 // '' — строй сюжета
    this.lastVar = {};
    this.heart = { on: false, bpm: 'set', next: 0 };
  }
  get C() { return this.app.conductor; }
  get F() { return this.app.field; }

  place(life, { high = false, front = false, far = false } = {}) {
    const E = this.E, now = E.now;
    // из точки: звук стоит ровно там, близко и сухо — смена места слышна сразу
    if (this.mode === 'point') return { pos: polar(this.point.az, this.elevation, Math.min(5, Math.max(1.6, this.point.d)) * (far ? 1.8 : 1)), dry: true };
    if (this.mode === 'orbit') {
      const start = Math.random() * 360, rev = Math.max(0.5, Math.min(2, life / 10)), pts = [];
      const n = 16; for (let k = 0; k <= n; k++) pts.push({ t: now + (life * k) / n, pos: polar(start + this.orbitDir * 360 * rev * (k / n), this.elevation + 8 * Math.sin(k / 2), far ? 5 : 2.8) });
      this.orbitDir *= -1;
      return { pos: pts[0].pos, path: pts };
    }
    // вокруг: каждый раз новое место, звук медленно плывёт по дуге
    let az; do { az = front ? (Math.random() - 0.5) * 140 : (Math.random() - 0.5) * 340; } while (this._lastAz !== undefined && Math.abs(az - this._lastAz) < 50);
    this._lastAz = az;
    const d = far ? rnd(5.5, 8) : rnd(2.2, 4.4);
    const pos = polar(az, high ? rnd(30, 60) : rnd(0, 20), d);
    return { pos, path: arc(pos, (Math.random() < 0.5 ? -1 : 1) * rnd(20, 50), now, now + Math.min(life, 12)) };
  }

  voice(kind, label, life, send = 0.4, opts) {
    const p = this.place(life, opts);
    const em = this.E.spawn({ group: 'live', pos: p.pos, send: p.dry ? send * 0.5 : send, kind, label, life: this.E.now + life });
    if (p.path) em.path(p.path);
    return em;
  }

  get tuningKey() { return this.tuning || this.C.state.tuning; }
  notes() { return handpanNotes(this.tuningKey, this.C.curDing); }
  pentatonic(lo, hi) { const C = this.C; return scaleInRange(this.tuningKey, C.curDing, C.curDing + lo, C.curDing + hi, { pentatonic: true }); }
  scale(lo, hi) { const C = this.C; return scaleInRange(this.tuningKey, C.curDing, C.curDing + lo, C.curDing + hi); }
  // тоны аккорда сюжета (или грува), в нужном диапазоне
  chord(lo, hi) {
    const C = this.C, ding = C.curDing, g = this.app.groove;
    const iv = g.active && g.cur ? g.cur.tones.map((x) => x + g.cur.root - ding) : (C.state.chord || [0, 7, 12]);
    const pcs = new Set(iv.map((x) => ((x % 12) + 12) % 12));
    const out = []; for (let m = ding + lo; m <= ding + hi; m++) if (pcs.has((((m - ding) % 12) + 12) % 12)) out.push(m);
    return out.length ? out : [ding + lo + 12];
  }
  // каждый раз другой вариант исполнения
  vari(id, n) { let v = Math.floor(Math.random() * n); if (n > 1 && v === this.lastVar[id]) v = (v + 1) % n; this.lastVar[id] = v; return v; }
  // когда вступить: в ритме — на ближайшую долю (или её часть), без ритма — сразу
  when(sub = 1) {
    const E = this.E, ck = this.app.clock, now = E.now + 0.02;
    if (this.C.running && ck.active) {
      const b = ck.beatDur(); const t = ck.nextBeat(now);
      if (sub > 1) for (let k = 1; k < sub; k++) { const c = t - b + (b / sub) * k; if (c >= now) return { t: c, beat: b, sync: true }; }
      return { t, beat: b, sync: true };
    }
    return { t: now, beat: 60 / Math.max(48, Math.min(96, this.C.state.tempo || 66)), sync: false };
  }
  // сыграть ноту записи; если запись ещё грузится — синтез
  rec(dest, t, name, midi, opts = {}, fallback) {
    opts = { ...opts, vel: (opts.vel ?? 0.7) * (REC_GAIN[name] ?? 1) };
    const end = this.F ? (midi === null ? this.F.call(dest, t, name, opts) : this.F.tuned(dest, t, name, midi, opts)) : null;
    if (end === null || end === undefined) return fallback ? fallback() : t;
    return end;
  }

  // ханг: одна нота, позиция — впереди (или по выбранному режиму)
  handpan(index, vel = 0.7) {
    const E = this.E, notes = this.notes();
    const m = notes[Math.min(index, notes.length - 1)];
    const t = E.now + 0.005;
    if (!this.hpEm || this.mode !== this._hpMode || (this.mode === 'point' && this._hpPoint !== this.point) || this.mode === 'orbit') {
      const p = this.mode === 'around' ? { pos: polar(0, -8, 1.6) } : this.place(6, {});
      if (this.hpEm && !this.hpEm._oneshot) { const old = this.hpEm; E.after(E.now + 7, () => old.dispose()); }
      this.hpEm = E.spawn({ group: 'live', pos: p.pos, send: 0.25, kind: 'handpan', label: 'ханг' });
      if (p.path) this.hpEm.path(p.path);
      this._hpMode = this.mode; this._hpPoint = this.point;
    }
    I.handpan(E, this.hpEm.input, t, { freq: mtof(m), vel, bright: 0.55 });
    this.hpEm.flash(t, 0.6);
    return m;
  }

  play(id) {
    const E = this.E, C = this.C, S = C.state, ding = C.curDing;
    const fn = this['_' + id];
    if (fn) return fn.call(this, E, C, S, ding);
    switch (id) {
      case 'bird': {
        const sp = (S.species && S.species.length) ? S.species : ['robin', 'thrush'];
        const b = this.app.birds.spawn(E.now, sp[Math.floor(Math.random() * sp.length)], { motion: 'still' });
        b.live = true;
        if (this.mode === 'point') { b.pos = polar(this.point.az, Math.max(15, this.elevation), this.point.d * 2); b.em.setPos(b.pos, 0); }
        b.next = E.now + 0.1; E.after(E.now + 40, () => this.app.birds.remove(b)); return;
      }
      case 'flyby': this.app.birds.flyby(E.now + 0.05); return;
      case 'dissolve': E.dissolve(10); return;
      default: { const s = this.samples.find((x) => x.id === id); if (s) return this.playSample(s); }
    }
  }

  // ---------- Колокольчики, тингши, чаши ----------
  _bells(E) {
    const { t, beat } = this.when(2), v = this.vari('bells', 4);
    const pool = this.pentatonic(32, 46), em = this.voice('bells', 'колокольчики', 8, 0.55, { high: true });
    const n = Math.floor(rnd(3, 8)), gap = beat * pick([0.25, 1 / 3, 0.5]);
    let seq = pool.slice(0, n);
    if (v === 1) seq = pool.slice(-n).reverse(); else if (v === 2) seq = Array.from({ length: n }, () => pick(pool)); else if (v === 3) seq = pool.filter((_, i) => i % 2 === 0).slice(0, n);
    seq.forEach((m, k) => I.koshi(E, em.input, t + k * gap * rnd(0.9, 1.15), { freq: mtof(m), vel: rnd(0.35, 0.6) * (1 - k * 0.05) }));
  }
  _tingsha(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('tingsha', 3);
    const em = this.voice('bells', 'тингши', 10, 0.5, { high: true, far: v === 2 });
    const target = pick(this.chord(42, 54));
    const hit = (tt, vel) => this.rec(em.input, tt, 'tingsha', target, { vel }, () => I.tingsha(E, em.input, tt, { freq: mtof(ding + 48) * 0.94, vel }));
    hit(t, v === 2 ? 0.45 : 0.75);
    if (v === 1) hit(t + beat * 2, 0.55);
  }
  _bowl(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('bowl', 4);
    const em = this.voice('bowl', 'чаша', 24, 0.35, { front: true });
    const tones = this.chord(7, 24), m = pick(tones);
    const strike = (tt, mm, vel) => this.rec(em.input, tt, 'bowl', mm, { vel }, () => I.bowl(E, em.input, tt, { freq: mtof(mm), vel }));
    if (v === 0) strike(t, m, 0.8);
    else if (v === 1) strike(t, m, 0.45);
    else if (v === 2) { strike(t, m, 0.75); strike(t + beat * 2, pick(tones), 0.5); }
    else { strike(t, m, 0.6); this.rec(em.input, t + beat, 'bowlsing', m + 12, { vel: 0.35, att: 2, dur: 9, rel: 3 }); }
  }
  _bowlSing(E, C, S, ding) {
    const { t } = this.when(), em = this.voice('bowl', 'поющая чаша', 24, 0.4, { front: true });
    const m = pick(this.chord(10, 26));
    this.rec(em.input, t, 'bowlsing', m, { vel: 0.7, att: 2.2, dur: rnd(10, 15), rel: 4, hold: true }, () => I.bowl(E, em.input, t, { freq: mtof(m), vel: 0.6, mode: 'sing', hold: 8 }));
  }

  // ---------- Окарина: живые ноты, фраза в темп сета ----------
  _ocarina(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('ocarina', 4);
    const pool = this.pentatonic(10, 27); if (pool.length < 3) return;
    const n = Math.floor(rnd(3, 6));
    let i = v === 1 ? pool.length - 1 : v === 2 ? 0 : Math.floor(rnd(1, pool.length - 2));
    const notes = [];
    for (let k = 0; k < n; k++) {
      notes.push({ m: pool[Math.max(0, Math.min(pool.length - 1, i))], d: k === n - 1 ? beat * pick([2, 3]) : beat * pick([0.5, 1, 1, 1.5]) });
      i += v === 1 ? -pick([1, 1, 2]) : v === 2 ? pick([1, 1, 2]) : pick([-2, -1, 1, 2]);
    }
    const life = notes.reduce((a, b) => a + b.d, 0) + 2;
    const playPhrase = (t0, em, list) => {
      let tt = t0;
      for (const nt of list) {
        this.rec(em.input, tt, 'ocarina', nt.m, { vel: 0.75, att: 0.04, dur: nt.d + 0.06, rel: 0.2 }, () => I.ocarina(E, em.input, tt, [{ f: mtof(nt.m), d: nt.d, v: 0.9 }], { vel: 0.7 }));
        em.flash(tt, nt.d); tt += nt.d;
      }
      return tt;
    };
    const em = this.voice('ocarina', 'окарина', life, 0.5);
    const end = playPhrase(t, em, notes);
    // зов и отклик: вторая окарина отвечает с другой стороны
    if (v === 3) {
      const em2 = this.voice('ocarina', 'окарина', life + 3, 0.55, { far: true });
      playPhrase(end + beat, em2, notes.map((x) => ({ ...x, m: pool[Math.max(0, Math.min(pool.length - 1, pool.indexOf(x.m) + 1))] })));
    }
  }

  // ---------- Фортепиано: аккорд врассыпную, такт арпеджио или три ноты мелодии ----------
  _piano(E) {
    const { t, beat } = this.when(), v = this.vari('piano', 3);
    const em = this.voice('piano', 'фортепиано', 14, 0.3, { front: true });
    this.app.piano.phrase(em.input, t, beat, v);
  }

  // ---------- Калимба, глюкофон, лира ----------
  arpeggio(E, name, label, kind, lo, hi, vel, fallback) {
    const { t, beat } = this.when(2), v = this.vari(name, 5);
    const pool = this.pentatonic(lo, hi); if (pool.length < 4) return;
    const em = this.voice(kind, label, 7, 0.38, { front: true });
    const n = Math.floor(rnd(4, 8)), step = beat * pick([0.5, 1 / 3, 0.25]);
    let seq;
    if (v === 0) seq = pool.slice(0, n);                                          // вверх
    else if (v === 1) seq = pool.slice(-n).reverse();                             // вниз
    else if (v === 2) seq = pool.slice(0, n).map((m, k) => pool[Math.min(pool.length - 1, k + (k % 2 ? 2 : 0))]); // ломаное
    else if (v === 3) seq = this.chord(lo, hi).slice(0, 4);                       // аккорд, разложенный быстро
    else seq = Array.from({ length: n }, (_, k) => pool[Math.min(pool.length - 1, Math.floor(pool.length / 2) + (k % 2 ? -1 : 1) * Math.ceil(k / 2))]); // от центра в стороны
    const gap = v === 3 ? 0.045 : step;
    seq.forEach((m, k) => {
      const tt = t + k * gap * rnd(0.95, 1.05);
      this.rec(em.input, tt, name, m, { vel: vel * rnd(0.75, 1.05) }, () => fallback(tt, m, em));
      em.flash(tt, 0.3);
    });
  }
  _kalimba(E) { this.arpeggio(E, 'kalimba', 'калимба', 'kalimba', 12, 31, 0.7, (tt, m, em) => I.kalimba(E, em.input, tt, { freq: mtof(m), vel: 0.55 })); }
  _tongue(E) { this.arpeggio(E, 'tongue', 'глюкофон', 'kalimba', 7, 26, 0.75, (tt, m, em) => I.kalimba(E, em.input, tt, { freq: mtof(m), vel: 0.5 })); }
  _lyre(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('lyre', 3);
    const em = this.voice('ocarina', 'лира', 8, 0.5, { front: true });
    const sc = this.scale(5, 29); if (sc.length < 5) return;
    let seq = v === 0 ? sc.slice(0, 10) : v === 1 ? sc.slice(-10).reverse() : this.chord(5, 29).slice(0, 5);
    const gap = v === 2 ? beat / 4 : rnd(0.055, 0.09);
    seq.forEach((m, k) => this.rec(em.input, t + k * gap, 'lyre', m, { vel: 0.55 * (1 - k * 0.03), dur: 3.5, rel: 1.2 }, () => I.kalimba(E, em.input, t + k * gap, { freq: mtof(m), vel: 0.4 })));
  }

  // ---------- Погремушка, дождевая палка, океан ----------
  _rattle(E) {
    const { t, beat } = this.when(2), v = this.vari('rattle', 3), em = this.voice('rattle', 'погремушка', 3, 0.3, { front: true });
    const n = v === 0 ? 1 : v === 1 ? 2 : 3, gap = v === 2 ? beat / 4 : beat / 2;
    for (let k = 0; k < n; k++) this.rec(em.input, t + k * gap, 'rattle', null, { vel: rnd(0.5, 0.8) }, () => I.rattle(E, em.input, t + k * gap, { dur: 0.6, shakes: 1, vel: 0.6 }));
  }
  _rainstick(E) {
    const t = E.now + 0.02, dir = Math.random() < 0.5 ? 1 : -1, v = this.vari('rainstick', 3), rate = rnd(0.85, 1.12);
    const em = E.spawn({ group: 'live', pos: polar(-80 * dir, 15, 2.6), send: 0.4, kind: 'rattle', label: 'дождевая палка', life: t + 12 });
    if (v === 2) em.path([{ t, pos: polar(0, 70, 2.2) }, { t: t + 8, pos: polar(dir * 150, 10, 3) }]);
    else em.path([{ t, pos: polar(-85 * dir, 15, 2.6) }, { t: t + 4, pos: polar(0, 35, 2.2) }, { t: t + 8, pos: polar(85 * dir, 15, 2.6) }]);
    this.rec(em.input, t, 'rainstick', null, { vel: 0.8, rate }, () => I.rainstick(E, em.input, t, { dur: 5 }));
  }
  _ocean(E) {
    const t = E.now + 0.02, dir = Math.random() < 0.5 ? 1 : -1, dur = rnd(6, 10);
    const em = E.spawn({ group: 'live', pos: polar(-85 * dir, 5, 3), send: 0.45, kind: 'water', label: 'океан', life: t + dur + 1 });
    em.path([{ t, pos: polar(-85 * dir, 5, 3) }, { t: t + dur / 2, pos: polar(0, 25, 2.5) }, { t: t + dur, pos: polar(85 * dir, 5, 3) }]);
    I.oceanDrum(E, em.input, t, { dur, vel: rnd(0.5, 0.75) });
  }

  // ---------- Гонг, барабан, бубен ----------
  _gong(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('gong', 3);
    const em = this.voice('gong', 'гонг', 28, 0.5, { front: true, far: true });
    const m = pick([ding - 12, ding - 5, ding]);
    const hit = (tt, vel) => this.rec(em.input, tt, 'gong', m, { vel }, () => I.gong(E, em.input, tt, { freq: mtof(ding - 12), vel }));
    if (v === 1) { [0.2, 0.3, 0.4].forEach((vel, k) => hit(t + k * beat, vel)); hit(t + 3 * beat, 0.8); }  // разогреть гонг
    else hit(t, v === 2 ? 0.45 : 0.8);
  }
  _drum(E) { this._shaman(E, null, null, null, true); }
  _shaman(E, C, S, ding, short = false) {
    const { t, beat } = this.when(), v = short ? this.vari('drum', 2) + 1 : this.vari('shaman', 3);
    const em = this.voice('rhythm', short ? 'барабан' : 'шаманский бубен', 10, 0.25, { front: true });
    const hit = (tt, vel) => this.rec(em.input, tt, 'shaman', null, { vel }, () => I.frameDrum(E, em.input, tt, { hit: 'dum', vel }));
    if (v === 0) for (let k = 0; k < 8; k++) hit(t + k * beat, 0.35 + 0.5 * Math.sin(Math.PI * (k + 0.5) / 8));  // нарастает и стихает
    else if (v === 1) for (let k = 0; k < (short ? 1 : 4); k++) { hit(t + k * beat * 2, 0.75); hit(t + k * beat * 2 + beat * 0.32, 0.5); } // сердце
    else for (let k = 0; k < 3; k++) hit(t + k * beat * 2, 0.8 - k * 0.15);
  }

  // ---------- Свет, хрусталь, камертоны, монохорд, шрути ----------
  _shimmer(E) {
    const fr = this.pentatonic(36, 50).filter((_, i) => i % 2 === 0).slice(0, 6).map(mtof);
    const em = this.voice('wash', 'луч', 18, 0.8, { high: true }); I.shimmer(E, em.input, E.now + 0.02, { freqs: fr, dur: rnd(7, 11) });
  }
  _crystal(E, C, S, ding) {
    const { t } = this.when(), v = this.vari('crystal', 2), em = this.voice('wash', 'хрустальная чаша', 28, 0.5, { front: true });
    const m = pick(this.chord(12, 26));
    this.rec(em.input, t, 'crystal', m, { vel: 0.7, att: v ? 2.5 : 0.02, dur: rnd(9, 14), rel: 4, hold: true }, () => I.crystalBowl(E, em.input, t, { freq: mtof(m), hold: 9 }));
  }
  _fork(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('fork', 3);
    let root = ding; while (mtof(root) > 270) root -= 12; while (mtof(root) < 120) root += 12;
    const em = this.voice('bells', 'камертон', 22, 0.3, { front: true });
    I.tuningFork(E, em.input, t, { freq: mtof(root) });
    if (v >= 1) { const em2 = this.voice('bells', 'камертон', 22, 0.3, { front: true }); I.tuningFork(E, em2.input, t + beat * 2, { freq: mtof(root + (v === 1 ? 7 : 12)) }); }
  }
  _monochord(E, C, S, ding) { const em = this.voice('wash', 'монохорд', 16, 0.5); I.monochord(E, em.input, E.now + 0.02, { freq: mtof(ding - 12), strokes: Math.floor(rnd(2, 5)) }); }
  _shruti(E, C, S, ding) {
    const { t } = this.when(), em = this.voice('wash', 'шрути', 20, 0.45, { front: true });
    const m = pick([ding, ding - 12, ding + 7]);
    this.rec(em.input, t, 'shruti', m, { vel: 0.7, att: 2.5, dur: rnd(12, 18), rel: 3, hold: true }, () => I.shruti(E, em.input, t, { freq: mtof(ding - 12), dur: 14 }));
  }
  _didg(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('didg', 2), em = this.voice('wash', 'диджериду', 20, 0.35, { front: true });
    const m = ding - 12;
    const g = E.ctx.createGain(); g.connect(em.input);
    if (v === 1) { const lfo = E.ctx.createOscillator(), lg = E.ctx.createGain(); lfo.frequency.value = 1 / beat; lg.gain.value = 0.35; lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + 20); } // дыхание в темп
    this.rec(g, t, 'didg', m, { vel: 0.75, att: 1.2, dur: rnd(10, 15), rel: 2.5, hold: true }, () => I.overtone(E, g, t, { freq: mtof(m), dur: 10 }));
    E.after(t + 22, () => g.disconnect());
  }
  _glass(E, C, S, ding) {
    const { t, beat } = this.when(), v = this.vari('glass', 3);
    const tones = this.chord(19, 38), n = v === 0 ? 1 : v === 1 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const em = this.voice('bells', 'поющее стекло', 18, 0.6, { high: true });
      const m = tones[(k * 2 + Math.floor(rnd(0, 2))) % tones.length];
      this.rec(em.input, t + k * beat * 2, 'glass', m, { vel: 0.55, att: 1.4, dur: rnd(7, 11), rel: 3, hold: true }, () => I.crystalBowl(E, em.input, t + k * beat * 2, { freq: mtof(m), vel: 0.4, hold: 7 }));
    }
  }
  _templeBell(E, C, S, ding) {
    const { t } = this.when(), em = this.voice('gong', 'храмовый колокол', 22, 0.6, { far: true });
    const m = pick([ding + 36, ding + 31, ding + 24]);
    this.rec(em.input, t, 'templebell', m, { vel: 0.7 }, () => I.templeBell(E, em.input, t, { freq: mtof(ding) * 0.75 }));
  }
  _chimes(E) {
    const em = this.voice('bells', 'ветряные колокольчики', 12, 0.5, { high: true });
    I.windChimes(E, em.input, E.now + 0.02, { freqs: this.pentatonic(24, 36).map(mtof), dur: rnd(4, 8), vel: rnd(0.35, 0.55) });
  }
  // Дерево колокольчиков — вдали и мягко, чтобы не перетягивать внимание
  _belltree(E, C, S, ding) {
    const t = E.now + 0.02, up = Math.random() < 0.5, az = rnd(-150, 150), d = rnd(6, 8.5);
    const em = E.spawn({ group: 'live', pos: polar(az, 40, d), send: 0.75, atmos: 0.6, kind: 'bells', label: 'дерево колокольчиков', life: t + 9 });
    em.path([{ t, pos: polar(az, up ? 20 : 55, d) }, { t: t + 2.5, pos: polar(az + (Math.random() < 0.5 ? -40 : 40), up ? 55 : 20, d) }]);
    const g = E.ctx.createGain(); g.gain.value = 1.0; g.connect(em.input);
    I.bellTree(E, g, t, { base: mtof(ding + 36), vel: 0.45 });
    E.after(t + 9, () => g.disconnect());
  }
  _overtone(E, C, S, ding) { const em = this.voice('wash', 'обертоны', 16, 0.45, { front: true }); I.overtone(E, em.input, E.now + 0.02, { freq: mtof(ding - 12), dur: rnd(10, 14) }); }

  // ---------- Сердцебиение: живая запись в темпе сета или своём ----------
  setHeart(on, bpm) {
    this.heart.on = on; if (bpm !== undefined) this.heart.bpm = bpm;
    if (on && !this.heartEm) this.heartEm = this.E.spawn({ group: 'live', pos: polar(0, -35, 1.0), send: 0.05, atmos: 0.02, kind: 'heart', label: 'сердце', hrtf: false });
    if (on && this.F) this.F.load('call', 'heart');
    this.heart.next = 0;
  }
  heartBpm() { const b = this.heart.bpm; return b === 'set' ? Math.max(48, Math.min(78, (this.C.running ? this.C.state.tempo : 60) || 60)) : b; }
  tick(now, horizon) {
    const H = this.heart; if (!H.on) return;
    const period = 60 / this.heartBpm();
    if (!H.next || H.next < now) H.next = now + 0.1;
    while (H.next < horizon) {
      const t = H.next, em = this.heartEm;
      this.rec(em.input, t, 'heart', null, { vel: rnd(0.75, 0.9) }, () => { I.heart(this.E, em.input, t, { hit: 'lub', vel: 0.5 }); I.heart(this.E, em.input, t + 0.3, { hit: 'dub', vel: 0.35 }); });
      em.flash(t, 0.3);
      H.next += period * rnd(0.985, 1.015);   // живое сердце бьётся чуть неровно
    }
  }

  // Свой звук: любой аудиофайл (запись своего ханга, голоса природы и т.д.)
  async addSample(file) {
    const buf = await file.arrayBuffer();
    const audio = await this.E.ctx.decodeAudioData(buf);
    const s = { id: 'smp' + Date.now(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 22), buffer: audio, loop: audio.duration > 20 };
    this.samples.push(s);
    return s;
  }
  playSample(s) {
    const E = this.E, t = E.now + 0.01;
    if (s.playing) { const p = s.playing; s.playing = null; p.g.gain.setTargetAtTime(0, E.now, 0.6); E.after(E.now + 3, () => { try { p.src.stop(); } catch (e) {} p.em.dispose(); }); return false; }
    const life = s.loop ? null : s.buffer.duration + 1;
    const p = this.place(life || 30, {});
    const em = E.spawn({ group: 'live', pos: p.pos, send: 0.4, kind: 'live', label: s.name, life: life ? t + life : null });
    if (p.path && life) em.path(p.path);
    if (!life) em.glow = 0.8;
    const src = E.ctx.createBufferSource(); src.buffer = s.buffer; src.loop = s.loop;
    const g = E.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + (s.loop ? 2 : 0.01));
    src.connect(g); g.connect(em.input); src.start(t);
    if (s.loop) { s.playing = { src, g, em }; return true; }
    return false;
  }
}
