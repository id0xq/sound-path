// Живые звуки: проводник добавляет инструменты прямо внутрь атмосферы.
// Место звука: «вокруг» (случайно, мягко), «точка» (куда коснулись купола), «кружение» (облетает голову).
import { polar, mtof, toPolar } from './util.js';
import * as I from './instruments.js';
import { scaleInRange, handpanNotes } from './theory.js';
import { arc } from './generators.js';

export const LIVE = [
  { id: 'bells', name: 'Колокольчики', key: '1', kind: 'bells' },
  { id: 'tingsha', name: 'Тингши', key: '2', kind: 'bells' },
  { id: 'bowl', name: 'Чаша', key: '3', kind: 'bowl' },
  { id: 'bowlSing', name: 'Поющая чаша', key: '4', kind: 'bowl' },
  { id: 'ocarina', name: 'Окарина', key: '5', kind: 'ocarina' },
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
  { id: 'fork', name: 'Камертон «Ом»', key: 'x', kind: 'bells', heal: true },
  { id: 'monochord', name: 'Монохорд', key: 'c', kind: 'wash', heal: true },
  { id: 'shruti', name: 'Шрути', key: 'v', kind: 'wash', heal: true },
  { id: 'templeBell', name: 'Храмовый колокол', key: 'm', kind: 'gong', heal: true },
  { id: 'chimes', name: 'Ветряные колокольчики', key: ',', kind: 'bells', heal: true },
  { id: 'belltree', name: 'Дерево колокольчиков', key: '.', kind: 'bells', heal: true },
  { id: 'overtone', name: 'Обертоновое пение', key: '/', kind: 'wash', heal: true },
  { id: 'dissolve', name: 'Растворение', key: 'p', kind: 'wash', heal: true },
];

export class Live {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.mode = 'around';             // around | point | orbit
    this.point = { az: 0, el: 10, d: 3 };
    this.elevation = 10;
    this.samples = [];
    this.orbitDir = 1;
    this.tuning = '';                 // '' — строй сюжета
  }
  get C() { return this.app.conductor; }

  place(life, { high = false, front = false } = {}) {
    const E = this.E, now = E.now;
    // из точки: звук стоит ровно там, близко и сухо — смена места слышна сразу
    if (this.mode === 'point') return { pos: polar(this.point.az, this.elevation, Math.min(5, Math.max(1.6, this.point.d))), dry: true };
    if (this.mode === 'orbit') {
      const start = Math.random() * 360, rev = Math.max(0.5, Math.min(2, life / 10)), pts = [];
      const n = 16; for (let k = 0; k <= n; k++) pts.push({ t: now + (life * k) / n, pos: polar(start + this.orbitDir * 360 * rev * (k / n), this.elevation + 8 * Math.sin(k / 2), 2.8) });
      this.orbitDir *= -1;
      return { pos: pts[0].pos, path: pts };
    }
    // вокруг: каждый раз новое место, звук медленно плывёт по дуге
    let az; do { az = front ? (Math.random() - 0.5) * 140 : (Math.random() - 0.5) * 340; } while (this._lastAz !== undefined && Math.abs(az - this._lastAz) < 50);
    this._lastAz = az;
    const pos = polar(az, high ? 30 + Math.random() * 30 : Math.random() * 20, 2.2 + Math.random() * 2.2);
    return { pos, path: arc(pos, (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 30), now, now + Math.min(life, 12)) };
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
    const E = this.E, C = this.C, t = E.now + 0.01, S = C.state, ding = C.curDing;
    switch (id) {
      case 'bells': { const em = this.voice('bells', 'колокольчики', 7, 0.55, { high: true }); I.koshiStrum(E, em.input, t, { freqs: this.pentatonic(34, 46).map(mtof), count: 6, spread: 1.8 }); break; }
      case 'tingsha': { const em = this.voice('bells', 'тингши', 10, 0.5, { high: true }); I.tingsha(E, em.input, t, { freq: mtof(ding + 48) * 0.94 }); break; }
      case 'bowl': { const em = this.voice('bowl', 'чаша', 22, 0.35, { front: true }); I.bowl(E, em.input, t, { freq: mtof(ding + 12), vel: 0.75 }); break; }
      case 'bowlSing': { const em = this.voice('bowl', 'поющая чаша', 24, 0.4, { front: true }); I.bowl(E, em.input, t, { freq: mtof(ding + 12), vel: 0.65, mode: 'sing', hold: 8 }); break; }
      case 'ocarina': {
        const pool = this.pentatonic(22, 36); let i = Math.floor(Math.random() * (pool.length - 3)); const notes = [];
        const n = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) { notes.push({ f: mtof(pool[Math.max(0, Math.min(pool.length - 1, i))]), d: k === n - 1 ? 1.6 : [0.35, 0.5, 0.7][Math.floor(Math.random() * 3)] }); i += [-1, 1, 1, 2, -2][Math.floor(Math.random() * 5)]; }
        const life = notes.reduce((a, b) => a + b.d, 0) + 1;
        const em = this.voice('ocarina', 'окарина', life, 0.5); I.ocarina(E, em.input, t, notes, { vel: 0.7 }); break;
      }
      case 'kalimba': {
        const pool = this.pentatonic(12, 31); const em = this.voice('kalimba', 'калимба', 5, 0.35, { front: true });
        let i = Math.floor(Math.random() * (pool.length - 5)); for (let k = 0; k < 6; k++) { I.kalimba(E, em.input, t + k * 0.18, { freq: mtof(pool[Math.min(pool.length - 1, i)]), vel: 0.6 }); i += [1, 1, 2, -1][k % 4]; }
        break;
      }
      case 'rattle': { const em = this.voice('rattle', 'погремушка', 2, 0.3, { front: true }); I.rattle(E, em.input, t, { dur: 0.9, shakes: 3, vel: 0.6 }); break; }
      case 'rainstick': {
        const em = E.spawn({ group: 'live', pos: polar(-80, 15, 2.6), send: 0.4, kind: 'rattle', label: 'дождевая палка', life: t + 6 });
        const d = Math.random() < 0.5 ? 1 : -1;
        em.path([{ t, pos: polar(-85 * d, 15, 2.6) }, { t: t + 2.5, pos: polar(0, 35, 2.2) }, { t: t + 5, pos: polar(85 * d, 15, 2.6) }]);
        I.rainstick(E, em.input, t, { dur: 5 }); break;
      }
      case 'ocean': {
        const em = E.spawn({ group: 'live', pos: polar(-85, 5, 3), send: 0.45, kind: 'water', label: 'океан', life: t + 9 });
        em.path([{ t, pos: polar(-85, 5, 3) }, { t: t + 4, pos: polar(0, 25, 2.5) }, { t: t + 8, pos: polar(85, 5, 3) }]);
        I.oceanDrum(E, em.input, t, { dur: 8 }); break;
      }
      case 'gong': { const em = this.voice('gong', 'гонг', 24, 0.5, { front: true }); I.gong(E, em.input, t, { freq: mtof(ding - 12) }); break; }
      case 'drum': { const em = this.voice('rhythm', 'барабан', 2, 0.25, { front: true }); I.frameDrum(E, em.input, t, { hit: 'dum', vel: 0.75 }); break; }
      case 'bird': {
        const sp = (S.species && S.species.length) ? S.species : ['robin', 'thrush'];
        const b = this.app.birds.spawn(E.now, sp[Math.floor(Math.random() * sp.length)], { motion: 'still' });
        b.live = true;
        if (this.mode === 'point') { b.pos = polar(this.point.az, Math.max(15, this.elevation), this.point.d * 2); b.em.setPos(b.pos, 0); }
        b.next = E.now + 0.1; E.after(E.now + 40, () => this.app.birds.remove(b)); break;
      }
      case 'shimmer': {
        const fr = this.pentatonic(36, 50).filter((_, i) => i % 2 === 0).slice(0, 6).map(mtof);
        const em = this.voice('wash', 'луч', 18, 0.8, { high: true }); I.shimmer(E, em.input, t, { freqs: fr, dur: 9 }); break;
      }
      case 'flyby': this.app.birds.flyby(t); break;
      case 'crystal': { const em = this.voice('wash', 'хрустальная чаша', 28, 0.5, { front: true }); I.crystalBowl(E, em.input, t, { freq: mtof(ding + 12), hold: 9 }); break; }
      case 'fork': { const em = this.voice('bells', 'камертон', 22, 0.3, { front: true }); I.tuningFork(E, em.input, t, { freq: 136.1 }); break; }
      case 'monochord': { const em = this.voice('wash', 'монохорд', 14, 0.5); I.monochord(E, em.input, t, { freq: mtof(ding - 12), strokes: 3 }); break; }
      case 'shruti': { const em = this.voice('wash', 'шрути', 18, 0.45, { front: true }); I.shruti(E, em.input, t, { freq: mtof(ding - 12), dur: 14 }); break; }
      case 'templeBell': { const em = this.voice('gong', 'храмовый колокол', 20, 0.5); I.templeBell(E, em.input, t, { freq: mtof(ding) * 0.75 }); break; }
      case 'chimes': { const em = this.voice('bells', 'ветряные колокольчики', 10, 0.5, { high: true }); I.windChimes(E, em.input, t, { freqs: this.pentatonic(24, 36).map(mtof), dur: 6 }); break; }
      case 'belltree': {
        const em = E.spawn({ group: 'live', pos: polar(-60, 55, 2.4), send: 0.5, kind: 'bells', label: 'дерево колокольчиков', life: t + 7 });
        em.path([{ t, pos: polar(-60, 60, 2.4) }, { t: t + 2, pos: polar(60, 10, 2.4) }]);
        I.bellTree(E, em.input, t, { base: mtof(ding + 36) }); break;
      }
      case 'overtone': { const em = this.voice('wash', 'обертоны', 16, 0.45, { front: true }); I.overtone(E, em.input, t, { freq: mtof(ding - 12), dur: 12 }); break; }
      case 'dissolve': E.dissolve(10); break;
      default: {
        const s = this.samples.find((x) => x.id === id); if (s) this.playSample(s);
      }
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
