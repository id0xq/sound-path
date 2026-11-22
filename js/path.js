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
    const V = [{ chord: [-12, 0, 7, 12], tan: 0.32, wash: 0.12, pad: 0.24 }, { chord: [-12, 0, 5, 12], tan: 0.18, wash: 0.2, pad: 0.3 },
      { chord: [-12, -5, 0, 7], tan: 0.26, wash: 0.08, pad: 0.2 }, { chord: [0, 7, 12, 19], tan: 0.12, wash: 0.22, pad: 0.26 }][(this.voicing || 0) % 4];
    return { at: 0, title: 'Путь', color: '#a99cf0', space: o.space, spaceMix: 0.72, tuning: o.tuning, chord: V.chord,
      pad: { timbre: 'glass', level: V.pad * o.drone }, tanpura: V.tan * o.drone, wash: V.wash * o.drone, binaural: 0, handpan: 0, events: [],
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
    this.active = true; this.prev = null; this.last = 0; this.nextKey = 0; this.nextFx = 0;
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

  // Слушать мир. Голос не трогаем: он и так звучит. Отвечаем на другие звуки — шаги, ветер, воду, город.
  listen() {
    const V = this.app.voice, an = V.spec; if (!V.enabled || !an) return;
    const n = an.frequencyBinCount, buf = this._b || (this._b = new Float32Array(n));
    an.getFloatFrequencyData(buf);
    const hz = this.E.ctx.sampleRate / 2 / n, lo = Math.floor(90 / hz), hi = Math.floor(6000 / hz);
    if (!this.prev) { this.prev = Float32Array.from(buf); return; }
    let flux = 0, peak = -200, pi = 0, bl = 0, bm = 0, bh = 0, lg = 0, ar = 0, k = 0;
    for (let i = lo; i < hi; i++) {
      const a = Math.pow(10, buf[i] / 20), b = Math.pow(10, this.prev[i] / 20), f = i * hz;
      if (a > b) flux += a - b;
      if (f < 300) bl += a * a; else if (f < 1500) bm += a * a; else bh += a * a;
      if (f > 200 && f < 4000) { const pw = a * a + 1e-12; lg += Math.log(pw); ar += pw; k++; }
      if (f < 2000 && buf[i] > peak) { peak = buf[i]; pi = i; }
    }
    this.prev.set(buf);
    this.flux = this.flux ? this.flux * 0.93 + flux * 0.07 : flux;
    const now = this.E.now, o = this.opts;
    this.keyTick(now);
    if (flux < this.flux * 2.2 || peak < V.noiseFloor + 12) return;
    // голос — гармоничный (низкая «плоскостность» спектра) и сидит в середине; такие всплески пропускаем
    const flat = Math.exp(lg / k) / (ar / k), tot = bl + bm + bh + 1e-12;
    const voiceLike = flat < 0.12 && bm / tot > 0.45;
    const band = bh / tot > 0.35 ? 'high' : bl / tot > 0.45 ? 'low' : 'mid';
    if (!voiceLike) this.react(now, band, peak - V.noiseFloor);
    const gap = 2.6 + (1 - o.melody) * 6;
    if (o.melody < 0.03 || voiceLike || now - this.last < gap) return;
    this.last = now;
    const f = pi * hz, midi = 69 + 12 * Math.log2(f / 440);
    const C = this.app.conductor, pool = scaleInRange(o.tuning, C.curDing, C.curDing + 5, C.curDing + 26, { pentatonic: true });
    let j = 0, best = 99;
    pool.forEach((p, q) => { const d = Math.abs(((midi - p) % 12 + 18) % 12 - 6); if (d < best) { best = d; j = q; } });
    const chord = [pool[j], pool[Math.min(pool.length - 1, j + 2)], pool[Math.max(0, j - 2)]];
    const vel = Math.max(0.2, Math.min(0.5, (peak - V.noiseFloor - 8) / 50));
    this.chord(chord, vel);
  }

  // смена тональности: путь сам идёт по родственным тональностям, мягко, раз в минуту-полторы
  keyTick(now) {
    if (!this.nextKey) this.nextKey = now + 50 + Math.random() * 30;
    if (now < this.nextKey) return;
    this.nextKey = now + 55 + Math.random() * 40;
    const steps = [7, 5, -5, -7, 2, -2, 3, -3], o = this.opts;
    let r = o.root + steps[Math.floor(Math.random() * steps.length)];
    while (r > 59) r -= 12; while (r < 48) r += 12;
    this.voicing = (this.voicing || 0) + 1 + Math.floor(Math.random() * 2);
    this.update({ root: r });
    this.onKey && this.onKey(r);
  }

  // реакции мира по частотам: случайно, но не чаще раза в 10–20 секунд, и всегда слышно, что это ответ
  react(now, band, lvl) {
    if (now < (this.nextFx || 0) || lvl < 16 || Math.random() < 0.35) return;
    this.nextFx = now + 10 + Math.random() * 10;
    const E = this.E, t = now + 0.03, C = this.app.conductor, d = C.curDing;
    const pos = polar(Math.random() * 360 - 180, 10 + Math.random() * 40, 3 + Math.random() * 3);
    const em = E.spawn({ group: 'live', pos, send: 0.8, atmos: 0.85, kind: band === 'high' ? 'bells' : band === 'low' ? 'gong' : 'wash', label: 'отклик', life: t + 14 });
    em.path(arc(pos, (Math.random() < 0.5 ? -1 : 1) * 70, t, t + 12, 10));
    const pool = scaleInRange(this.opts.tuning, d, d + 12, d + 36, { pentatonic: true });
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    let name;
    if (band === 'low') { E.dissolve(7); I.crystalBowl(E, em.input, t, { freq: mtof(d - 12), vel: 0.22, hold: 6 }); name = 'низы растворились в пространстве'; }
    else if (band === 'high') { for (let q = 0; q < 4; q++) I.koshi(E, em.input, t + q * (0.35 + Math.random() * 0.4), { freq: mtof(pick() + 12), vel: 0.18 + Math.random() * 0.1 }); name = 'высокие звуки рассыпались колокольчиками'; }
    else { const F = this.app.field, m = pick(); (F && F.tuned(em.input, t, 'glass', m, { vel: 0.35, att: 1.2, dur: 6, rel: 3, hold: true })) ?? I.crystalBowl(E, em.input, t, { freq: mtof(m), vel: 0.2, hold: 5 }); name = 'середина запела стеклом'; }
    em.flash(t, 0.4);
    this.onNote && this.onNote(name);
  }

  // мягкий продолжительный аккорд вместо резкого удара
  chord(notes, vel) {
    const E = this.E, A = this.app, t0 = E.now + 0.03, v = this.opts.voice, F = A.field;
    const pos = polar(Math.random() * 360 - 180, Math.random() * 35, 3 + Math.random() * 3);
    const kind = v === 'bells' || v === 'glass' ? 'bells' : v === 'piano' ? 'piano' : v === 'handpan' ? 'handpan' : 'kalimba';
    const em = E.spawn({ group: 'live', pos, send: 0.7, atmos: 0.75, kind, label: 'путь', life: t0 + 14 });
    em.path(arc(pos, (Math.random() < 0.5 ? -1 : 1) * 50, t0, t0 + 12, 10));
    const pad = (m, t) => (F && F.tuned(em.input, t, 'glass', m + 12, { vel: vel * 0.7, att: 1.4, dur: 6, rel: 3, hold: true })) ?? I.crystalBowl(E, em.input, t, { freq: mtof(m + 12), vel: vel * 0.35, hold: 5 });
    notes.forEach((m, q) => {
      const t = t0 + q * (0.18 + Math.random() * 0.22); // аккорд раскрывается, как арпеджио на выдохе
      if (v === 'handpan') { I.handpan(E, em.input, t, { freq: mtof(m), vel: vel * 0.42, bright: 0.18 }); if (q === 0) pad(m, t); }
      else if (v === 'bells') I.koshi(E, em.input, t, { freq: mtof(m + 24), vel: vel * 0.55 });
      else if (v === 'piano') A.piano.note(em.input, t, m + 12, vel * 0.6, 5, 2.5);
      else if (v === 'glass') pad(m, t);
      else (F && F.tuned(em.input, t, v, m + (v === 'kalimba' ? 12 : 0), { vel: vel * 0.6, att: 0.03 })) ?? I.kalimba(E, em.input, t, { freq: mtof(m + 12), vel: vel * 0.6 });
    });
    em.flash(t0, 0.4);
    this.onNote && this.onNote('аккорд ' + noteName(notes[0]));
  }
}
