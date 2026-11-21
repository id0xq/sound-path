// Путь — как в Sound Temple: микрофон слушает мир, и всё, что звучит вокруг, превращается в музыку.
//  • резонаторы на нотах строя вытягивают из шума гармонию;
//  • атмосферный хвост (как в Valhalla) делает из звуков облако;
//  • на каждый заметный звук мира рождается нота: высота звука — к ближайшей ступени строя,
//    инструмент на выбор, место — где-то вокруг головы. Голос и шаги становятся мелодией.
// Нужны наушники: иначе колонки попадут обратно в микрофон.
import { polar, mtof, noteName } from './util.js';
import { scaleInRange } from './theory.js';
import * as I from './instruments.js';
import { arc } from './generators.js';

export const PATH_VOICES = { handpan: 'Ханг', bells: 'Колокольчики', kalimba: 'Калимба', tongue: 'Глюкофон', piano: 'Фортепиано', glass: 'Поющее стекло' };

export class Path {
  constructor(app) {
    this.app = app; this.E = app.E; this.active = false; this.last = 0; this.prev = null; this.flux = 0;
    this.opts = { tuning: 'amara', root: 50, space: 'cloud', melody: 0.5, voice: 'handpan', drone: 0.4 };
    this.onNote = null;
  }

  chapter() {
    const o = this.opts;
    return { at: 0, title: 'Путь', color: '#a99cf0', space: o.space, spaceMix: 0.72, tuning: o.tuning, chord: [-12, 0, 7, 12],
      pad: { timbre: 'glass', level: 0.24 * o.drone }, tanpura: 0.32 * o.drone, wash: 0.12 * o.drone, binaural: 0, handpan: 0, events: [],
      cue: 'Слушайте мир. Всё, что звучит вокруг, превращается в музыку и пространство.', script: [] };
  }

  async start(opts = {}, deviceId) {
    Object.assign(this.opts, opts);
    const A = this.app, C = A.conductor;
    C.loadSet({ id: 'path', title: 'Путь', subtitle: 'Мир через микрофон', minutes: 0, duration: Infinity, base: this.opts.root, transpose: [0], chapters: [this.chapter()] }, 1);
    await this.E.ctx.resume();
    C.start();
    A.voice.set('mode', 'path');
    if (!A.voice.enabled) await A.voice.enable(deviceId);
    this.active = true; this.prev = null; this.last = 0;
    clearInterval(this.timer); this.timer = setInterval(() => this.listen(), 60);
  }
  // поменять строй, пространство или основу на ходу
  update(opts = {}) {
    Object.assign(this.opts, opts);
    if (!this.active) return;
    const C = this.app.conductor;
    if (opts.root !== undefined && C.set) { C.ding = this.opts.root; }
    C.applyLive(this.chapter());
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    if (!this.active) return;
    this.active = false;
    this.app.voice.set('mode', 'voice');
    this.app.conductor.stop();
  }

  // Слушать: всплеск энергии в спектре = новый звук мира; его высота — нота строя
  listen() {
    const V = this.app.voice, an = V.spec; if (!V.enabled || !an) return;
    const n = an.frequencyBinCount, buf = this._b || (this._b = new Float32Array(n));
    an.getFloatFrequencyData(buf);
    const hz = this.E.ctx.sampleRate / 2 / n, lo = Math.floor(90 / hz), hi = Math.floor(3500 / hz);
    if (!this.prev) { this.prev = Float32Array.from(buf); return; }
    let flux = 0, peak = -200, pi = 0;
    for (let i = lo; i < hi; i++) {
      const a = Math.pow(10, buf[i] / 20), b = Math.pow(10, this.prev[i] / 20);
      if (a > b) flux += a - b;
      if (i * hz < 2000 && buf[i] > peak) { peak = buf[i]; pi = i; }
    }
    this.prev.set(buf);
    this.flux = this.flux ? this.flux * 0.92 + flux * 0.08 : flux;
    const now = this.E.now, o = this.opts;
    const gap = 0.22 + (1 - o.melody) * 1.6;
    if (o.melody < 0.03 || now - this.last < gap) return;
    if (flux < this.flux * 2.4 || peak < V.noiseFloor + 14) return;
    this.last = now;
    // высота звука → ближайшая ступень строя
    const f = pi * hz, midi = 69 + 12 * Math.log2(f / 440);
    const pool = scaleInRange(o.tuning, this.app.conductor.curDing, this.app.conductor.curDing + 5, this.app.conductor.curDing + 31, { pentatonic: true });
    let m = pool[0], best = 99;
    for (const p of pool) { const d = Math.abs(((midi - p) % 12 + 18) % 12 - 6); if (d < best) { best = d; m = p; } }
    const vel = Math.max(0.28, Math.min(0.8, (peak - V.noiseFloor - 10) / 35));
    this.play(m, vel);
  }

  play(m, vel) {
    const E = this.E, A = this.app, t = E.now + 0.02, v = this.opts.voice;
    const pos = polar(Math.random() * 360 - 180, Math.random() * 40, 2.2 + Math.random() * 3);
    const kind = v === 'bells' || v === 'glass' ? 'bells' : v === 'piano' ? 'piano' : v === 'handpan' ? 'handpan' : 'kalimba';
    const em = E.spawn({ group: 'live', pos, send: 0.55, atmos: 0.6, kind, label: 'путь', life: t + 8 });
    em.path(arc(pos, (Math.random() < 0.5 ? -1 : 1) * 40, t, t + 7, 10));
    const F = A.field;
    const rec = (name, mm, opts) => (F ? F.tuned(em.input, t, name, mm, opts) : null);
    if (v === 'handpan') I.handpan(E, em.input, t, { freq: mtof(m), vel, bright: 0.4 });
    else if (v === 'bells') I.koshi(E, em.input, t, { freq: mtof(m + 24), vel: vel * 0.8 });
    else if (v === 'piano') A.piano.note(em.input, t, m + 12, vel * 0.8, 3, 1.2);
    else if (v === 'glass') rec('glass', m + 24, { vel: vel * 1.2, att: 0.4, dur: 4, rel: 2, hold: true }) ?? I.crystalBowl(E, em.input, t, { freq: mtof(m + 12), vel: vel * 0.5, hold: 4 });
    else rec(v, m + (v === 'kalimba' ? 12 : 0), { vel }) ?? I.kalimba(E, em.input, t, { freq: mtof(m + 12), vel });
    em.flash(t, 0.6);
    this.onNote && this.onNote(noteName(m), m);
  }
}
