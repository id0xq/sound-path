// Дыхательные практики (breathwork): музыка ведёт дыхание.
// Вдох — ноты ханга поднимаются и звук взлетает над головой; выдох — ноты опускаются и уходят назад;
// задержка — сияющая тишина; пауза на выдохе — глубина и сердце. Бит держит ритм дыхания.
// Ритмы собраны по известным методикам: резонансное дыхание (HRV, ~6 в минуту), квадрат, 4-7-8,
// циклический вздох (Стэнфорд, 2023), дыхание в бит (SOMA), метод Вима Хофа, капалабхати, бхрамари,
// нади шодхана и связное дыхание.
import { polar, mtof, clamp } from './util.js';
import * as I from './instruments.js';
import { arc } from './generators.js';

const LABEL = {
  in: 'Вдох', in2: 'Ещё вдох', out: 'Выдох', hold: 'Задержка', holdOut: 'Пауза', retention: 'Задержка на выдохе',
  rIn: 'Глубокий вдох', rHold: 'Задержите вдох', pump: 'Резкие выдохи', hum: 'Выдох со звуком «ммм»',
  inL: 'Вдох левой ноздрёй', outR: 'Выдох правой', inR: 'Вдох правой ноздрёй', outL: 'Выдох левой', rest: 'Дышите свободно',
};
const SAY = { in: 'Вдох', in2: 'Ещё', out: 'Выдох', hold: 'Задержка', holdOut: 'Пауза', retention: 'Выдох и задержка', rIn: 'Глубокий вдох', rHold: 'Держим', pump: 'Выдохи', hum: 'Ммм', inL: 'Вдох слева', outR: 'Выдох справа', inR: 'Вдох справа', outL: 'Выдох слева', rest: 'Свободно' };
// насколько «наполнен» шар дыхания: 'up' — растёт, 'down' — сдувается, число — стоит
const FILL = { in: 'up', in2: 'up', rIn: 'up', inL: 'up', inR: 'up', out: 'down', outL: 'down', outR: 'down', hum: 'down', hold: 1, rHold: 1, holdOut: 0, retention: 0, pump: 'pump', rest: 'wave' };

// b — длительность в долях (ударах); при bpm=60 доля = секунда
export const PROGRAMS = [
  { id: 'coherence', name: 'Резонанс сердца', rhythm: '5,5 вдоха в минуту', goal: 'Спокойствие и ровное сердце', minutes: 10, bpm: 66, beat: 'heart',
    cycle: [['in', 6], ['out', 6]], color: '#9fd6e8',
    about: 'Вдох и выдох по 5,5 секунды. Около шести вдохов в минуту дыхание и сердечный ритм входят в резонанс — это основа тренировок вариабельности сердечного ритма.',
    scene: { space: 'temple', tuning: 'astra', chord: [-12, 0, 7, 12, 16], pad: { timbre: 'warm', level: 0.3 }, wash: 0.12, nature: { stream: 0.1 }, binaural: 6 } },
  { id: 'deep4', name: 'Глубокий покой', rhythm: '4 вдоха в минуту', goal: 'Глубокое расслабление', minutes: 10, bpm: 60, beat: 'pulse',
    cycle: [['in', 5], ['hold', 2], ['out', 8]], color: '#a9b8f0',
    about: 'Медленный вдох на 5, короткая задержка и долгий выдох на 8. Длинный выдох включает «тормоз» нервной системы.',
    scene: { space: 'fog', tuning: 'amara', chord: [-12, 0, 7, 12, 15], pad: { timbre: 'choir', level: 0.26 }, wash: 0.15, binaural: 5 } },
  { id: 'box', name: 'Квадрат', rhythm: '4 — 4 — 4 — 4', goal: 'Собранность и ясная голова', minutes: 8, bpm: 60, beat: 'pulse',
    cycle: [['in', 4], ['hold', 4], ['out', 4], ['holdOut', 4]], color: '#bfe7f5',
    about: 'Четыре равные стороны: вдох, задержка, выдох, пауза. Техника, которой пользуются пилоты и спасатели, чтобы успокоиться и собраться.',
    scene: { space: 'cloud', tuning: 'pentaMaj', chord: [-12, 0, 7, 12, 14], pad: { timbre: 'glass', level: 0.26 }, wash: 0.1, binaural: 10 } },
  { id: '478', name: '4 — 7 — 8', rhythm: 'вдох 4, задержка 7, выдох 8', goal: 'Сон и снятие тревоги', minutes: 6, bpm: 60, beat: 'none',
    cycle: [['in', 4], ['hold', 7], ['out', 8]], color: '#b6a8ff',
    about: 'Вдох носом на 4, задержка на 7, медленный выдох ртом на 8. Хорошо перед сном.',
    scene: { space: 'infinity', tuning: 'sabye', chord: [-12, 0, 7, 12, 16], pad: { timbre: 'warm', level: 0.28 }, wash: 0.15, nature: { crickets: 0.12 }, binaural: 4 } },
  { id: 'sigh', name: 'Вздох облегчения', rhythm: 'двойной вдох, долгий выдох', goal: 'Быстро снять напряжение', minutes: 5, bpm: 72, beat: 'none',
    cycle: [['in', 3], ['in2', 1], ['out', 8]], color: '#a6e3d0',
    about: 'Вдох носом, короткий довдох до полной груди и долгий выдох ртом. В исследовании Стэнфорда (2023) пять минут такого дыхания в день улучшали настроение сильнее медитации.',
    scene: { space: 'cloud', tuning: 'astra', chord: [-12, 0, 7, 12, 16], pad: { timbre: 'glass', level: 0.26 }, wash: 0.12, birds: 0.15, species: ['robin', 'dove'], binaural: 8 } },
  { id: 'soma', name: 'Дыхание в бит', rhythm: '6 ударов вдох, 6 выдох, задержки', goal: 'Погружение и энергия', bpm: 120, beat: 'drive', rounds: 2, color: '#f0c08a',
    round: () => [...rep([['in', 12], ['out', 12]], 12), ['retention', 0, { open: true, max: 60 }], ['rIn', 4], ['rHold', 30], ['out', 8], ['rest', 20]],
    about: 'Дыхание строго в бит: шесть ударов на вдох и шесть на выдох (как в практике SOMA), затем задержка на выдохе и задержка на вдохе. Музыка держит ритм — нужно только следовать.',
    scene: { space: 'temple', tuning: 'kurd', chord: [-12, 0, 7, 12, 15], pad: { timbre: 'warm', level: 0.28 }, wash: 0.15, binaural: 8 } },
  { id: 'power', name: 'Сила', rhythm: '30 глубоких вдохов и задержки', goal: 'Энергия, тепло, бодрость', bpm: 80, beat: 'drive', rounds: 3, intense: true, color: '#ffb48a',
    round: (r) => [...rep([['in', 2], ['out', 2]], 30), ['retention', 0, { open: true, max: [60, 90, 120][r] || 90 }], ['rIn', 3], ['rHold', 20], ['out', 4], ['rest', 12]],
    about: 'По мотивам метода Вима Хофа: 30 глубоких вдохов и свободных выдохов, затем задержка на выдохе (нажмите «Вдохнуть», когда захочется) и восстанавливающий вдох с задержкой на 15–20 секунд.',
    scene: { space: 'grotto', tuning: 'kurd', chord: [-12, 0, 7, 12, 15], pad: { timbre: 'choir', level: 0.24 }, wash: 0.1, binaural: 10 } },
  { id: 'fire', name: 'Дыхание огня', rhythm: 'резкие выдохи 2 в секунду', goal: 'Очищение и тонус', bpm: 120, beat: 'drive', rounds: 3, intense: true, color: '#ff9f7a',
    round: () => [['pump', 60], ['rIn', 3], ['rHold', 20], ['out', 6], ['rest', 20]],
    about: 'Капалабхати: короткие активные выдохи животом, вдох происходит сам. После каждого подхода — глубокий вдох и задержка.',
    scene: { space: 'temple', tuning: 'hijaz', chord: [-12, 0, 7, 12, 15], pad: { timbre: 'warm', level: 0.24 }, wash: 0.1, binaural: 12 } },
  { id: 'bee', name: 'Пчела', rhythm: 'вдох 4, выдох со звуком 8', goal: 'Тишина в голове', minutes: 6, bpm: 60, beat: 'none',
    cycle: [['in', 4], ['hum', 8]], color: '#e8d48a',
    about: 'Бхрамари: на выдохе тихо мычите «ммм» с закрытым ртом. Если включён микрофон, ваш звук превращается в аккорд купола.',
    scene: { space: 'temple', tuning: 'astra', chord: [-12, 0, 7, 12], pad: { timbre: 'warm', level: 0.22 }, tanpura: 0.3, binaural: 6 } },
  { id: 'nadi', name: 'Попеременное дыхание', rhythm: 'левая и правая ноздря, 4 — 4 — 4', goal: 'Баланс и ясность', minutes: 8, bpm: 60, beat: 'pulse',
    cycle: [['inL', 4], ['hold', 4], ['outR', 4], ['inR', 4], ['hold', 4], ['outL', 4]], color: '#9fe0c8',
    about: 'Нади шодхана: вдох одной ноздрёй, задержка, выдох другой. Звук приходит с той стороны, с которой вы дышите.',
    scene: { space: 'cloud', tuning: 'pentaMaj', chord: [-12, 0, 7, 12, 14], pad: { timbre: 'glass', level: 0.24 }, wash: 0.12, binaural: 8 } },
  { id: 'connected', name: 'Связное дыхание', rhythm: 'волной, без пауз, 15 минут', goal: 'Глубокое путешествие', minutes: 15, bpm: 96, beat: 'drive', intense: true, journey: true,
    cycle: [['in', 4], ['out', 4]], color: '#c9a8ff',
    about: 'Вдох и выдох соединены без пауз, как волна. Музыка постепенно нарастает, а в конце отпускает в тишину и свободное дыхание.',
    scene: { space: 'temple', tuning: 'lydian', chord: [-12, 0, 7, 11, 16], pad: { timbre: 'choir', level: 0.28 }, wash: 0.2, binaural: 8 } },
];
function rep(list, n) { const out = []; for (let i = 0; i < n; i++) out.push(...list); return out; }

export class Breathwork {
  constructor(app) {
    this.app = app; this.E = app.E; this.active = null; this.opts = { beat: true, ticks: true, voice: false, tempo: 1, sound: 'hang' };
    this.phases = []; this.handlers = {};
  }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, d) { (this.handlers[evt] || []).forEach((f) => f(d)); }

  // Собрать последовательность фаз для программы
  plan(P, minutes) {
    const list = [];
    const bpm = P.bpm * this.opts.tempo, beat = 60 / bpm;
    const push = (k, b, extra = {}, round = 0, cycle = 0) => list.push({ kind: k, dur: extra.open ? extra.max : b * beat, beats: b, round, cycle, ...extra });
    if (P.rounds) {
      for (let r = 0; r < P.rounds; r++) P.round(r).forEach(([k, b, extra], i) => push(k, b, extra, r + 1, i));
    } else {
      const cycleSec = P.cycle.reduce((a, [, b]) => a + b, 0) * beat;
      const n = Math.max(2, Math.round(((minutes || P.minutes) * 60) / cycleSec));
      for (let c = 0; c < n; c++) P.cycle.forEach(([k, b]) => push(k, b, {}, 0, c + 1));
      if (P.journey) list.forEach((ph, i) => (ph.intensity = Math.min(1, 0.3 + (i / list.length) * 1.1)));
    }
    push('rest', 30 / beat, {}, 0, 0);
    return list;
  }

  start(id, { minutes, seed } = {}) {
    const P = PROGRAMS.find((p) => p.id === id); if (!P) return;
    this.stop(true);
    const C = this.app.conductor, E = this.E;
    const set = {
      id: 'breath-' + P.id, title: P.name, subtitle: P.rhythm, minutes: 0, duration: Infinity, base: 52, transpose: [0],
      chapters: [{ at: 0, title: P.name, color: P.color, ...P.scene, handpan: 0, bells: 0, ocarina: 0, kalimba: 0, rhythm: null, breath: 0, events: [],
        cue: P.about, script: [] }],
    };
    C.loadSet(set, seed || 1);
    C.start();
    this.P = P; this.queue = this.plan(P, minutes); this.qi = 0;
    this.beat = 60 / (P.bpm * this.opts.tempo);
    const now = E.now;
    this.t0 = now + 4;                 // мягкий вход: 4 секунды до первого вдоха
    this.nextT = this.t0; this.beatNext = this.t0; this.beatIdx = 0;
    this.phases = []; this.padLevel = 0.75; this.active = true;
    this.totalSec = this.queue.reduce((a, p) => a + p.dur, 0);
    this.emit('start', P);
  }

  stop(silent = false) {
    if (!this.active) return;
    this.active = false;
    if (this.holdGain) { try { this.holdGain.gain.setTargetAtTime(0, this.E.now, 0.4); } catch (e) {} }
    const pad = this.app.conductor.pad;
    if (pad) { const p = pad.breath.gain; p.cancelScheduledValues(this.E.now); p.setTargetAtTime(1, this.E.now, 1); }
    if (this.resOn) { this.app.voice.set('resonance', this.resBefore || 0); this.resOn = false; }
    if (!silent) this.app.conductor.stop();
    this.emit('stop');
  }

  // Задержка «до желания»: закончить её сейчас
  release() {
    const ph = this.current(this.E.now);
    if (!ph || !ph.open) return;
    const t = this.E.now + 0.1;
    ph.end = t; this.nextT = t;
    if (ph.gain) ph.gain.gain.setTargetAtTime(0, this.E.now, 0.5);
    if (ph.heart) ph.heart.gain.setTargetAtTime(0, this.E.now, 0.1);
    if (ph.synthGain) ph.synthGain.gain.setTargetAtTime(0, this.E.now, 0.6);
  }

  current(now) { for (let i = this.phases.length - 1; i >= 0; i--) { const p = this.phases[i]; if (now >= p.t) return now < p.end ? p : null; } return null; }

  state(now) {
    if (!this.active) return null;
    if (now < this.t0) return { kind: 'ready', label: 'Приготовьтесь', k: (now - (this.t0 - 4)) / 4, remain: this.t0 - now, fill: 0.15 };
    const p = this.current(now); if (!p) return { kind: 'rest', label: '', k: 0, remain: 0, fill: 0.5 };
    const k = clamp((now - p.t) / (p.end - p.t), 0, 1);
    const f = FILL[p.kind];
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
    let fill = typeof f === 'number' ? f : f === 'up' ? ease(k) : f === 'down' ? 1 - ease(k) : f === 'pump' ? 0.35 + 0.1 * Math.abs(Math.sin((now - p.t) * Math.PI / this.beat)) : 0.5 + 0.15 * Math.sin(now * 0.8);
    if (p.kind === 'in2') fill = 0.85 + 0.15 * ease(k);
    if (p.kind === 'out' && this.prevKind(p) === 'in2') fill = 1 - ease(k);
    return { kind: p.kind, label: LABEL[p.kind], k, remain: p.open ? now - p.t : p.end - now, open: p.open, fill, round: p.round, rounds: this.P.rounds, cycle: p.cycle, phase: p };
  }
  prevKind(p) { const i = this.phases.indexOf(p); return i > 0 ? this.phases[i - 1].kind : null; }
  progress(now) { return this.active ? clamp((now - this.t0) / this.totalSec, 0, 1) : 0; }

  tick(now, horizon) {
    if (!this.active) return;
    // фазы
    while (this.nextT < horizon && this.qi < this.queue.length) {
      const ph = { ...this.queue[this.qi++], t: this.nextT };
      ph.end = ph.t + ph.dur;
      this.phases.push(ph); if (this.phases.length > 12) this.phases.shift();
      this.schedule(ph);
      this.nextT = ph.open ? Infinity : ph.end;
    }
    const cur = this.current(now);
    if (this.nextT === Infinity && cur && cur.open && now >= cur.end - 0.4) this.nextT = cur.end;
    if (this.nextT === Infinity && !cur && this.phases.length) { const last = this.phases[this.phases.length - 1]; if (last.open) this.nextT = Math.max(now + 0.1, last.end); }
    if (this.qi >= this.queue.length && now > this.nextT + 1) { this.emit('end'); this.stop(); return; }
    // бит
    if (this.opts.beat && this.P.beat !== 'none') {
      while (this.beatNext < horizon) {
        const t = this.beatNext, ph = this.phaseAt(t);
        const still = ph && ['hold', 'holdOut', 'retention', 'rHold', 'rest'].includes(ph.kind);
        if (!still && t >= this.t0) this.playBeat(t, this.beatIdx, ph);
        this.beatNext += this.beat; this.beatIdx++;
      }
    } else this.beatNext = Math.max(this.beatNext, horizon);
  }
  phaseAt(t) { for (let i = this.phases.length - 1; i >= 0; i--) { const p = this.phases[i]; if (t >= p.t) return t < p.end ? p : null; } return null; }

  em(pos, kind, life, send = 0.3) { return this.E.spawn({ group: 'live', pos, send, kind, label: 'дыхание', life }); }

  playBeat(t, i, ph) {
    const E = this.E, rhythmEm = this.beatEm || (this.beatEm = E.spawn({ group: 'rhythm', pos: polar(0, -12, 2.2), send: 0.15, kind: 'rhythm', label: 'бит', hrtf: false }));
    E.setGroup('rhythm', { scene: 0.8 });
    const inten = ph && ph.intensity !== undefined ? ph.intensity : 0.8;
    const style = this.P.beat;
    if (this.opts.sound !== 'hang' && style !== 'heart') {
      const L = this.app.lib, d = rhythmEm.input;
      if (style === 'pulse') { if (i % 2 === 0) L.hit(d, t, 'natural', 'kick', 0.55); rhythmEm.flash(t, 0.2); return; }
      const b4 = i % 4;
      if (b4 === 0 || b4 === 2) L.hit(d, t, 'edm', 'kick', (b4 === 0 ? 0.6 : 0.48) * inten, { lp: 5000 });
      if (b4 === 1 || b4 === 3) L.hit(d, t, 'natural', 'clap', 0.38 * inten, { lp: 7000 });
      if (inten > 0.45) L.hit(d, t + this.beat / 2, 'natural', 'hat', 0.32 * inten);
      rhythmEm.flash(t, 0.2);
      return;
    }
    if (style === 'heart') { I.heart(E, rhythmEm.input, t, { hit: 'lub', vel: 0.45 }); I.heart(E, rhythmEm.input, t + this.beat * 0.28, { hit: 'dub', vel: 0.32 }); return; }
    if (style === 'pulse') { if (i % 2 === 0) I.frameDrum(E, rhythmEm.input, t, { hit: 'dum', vel: 0.3 }); return; }
    // drive: глубокий удар, ободок, шейкер на восьмых
    const b4 = i % 4;
    if (b4 === 0 || b4 === 2) I.frameDrum(E, rhythmEm.input, t, { hit: 'dum', vel: (b4 === 0 ? 0.55 : 0.4) * inten });
    if (b4 === 1 || b4 === 3) I.frameDrum(E, rhythmEm.input, t, { hit: 'tek', vel: 0.32 * inten });
    if (inten > 0.45) { I.shaker(E, rhythmEm.input, t + this.beat / 2, { vel: 0.22 * inten }); }
    rhythmEm.flash(t, 0.2);
  }

  // Звук фазы
  schedule(ph) {
    const E = this.E, C = this.app.conductor, S = C.state, ding = C.curDing, t = ph.t, dur = ph.dur, beat = this.beat;
    const chord = (S.chord || [0, 7, 12]).map((i) => ding + i).sort((a, b) => a - b);
    const up = [...chord, ...chord.map((m) => m + 12)].filter((m) => m >= ding).slice(0, 8);
    const pad = C.pad && C.pad.breath.gain;
    const ramp = (to, at, d) => { if (!pad) return; pad.setValueAtTime(this.padLevel, at); pad.linearRampToValueAtTime(to, at + Math.max(0.05, d)); this.padLevel = to; };
    const side = ph.kind.endsWith('L') ? -1 : ph.kind.endsWith('R') ? 1 : 0;
    const k = ph.kind;
    if (this.opts.voice && 'speechSynthesis' in window && k !== 'pump') this.say(SAY[k], t);
    if (this.opts.sound !== 'hang') this.synthPhase(ph);
    if (this.opts.sound === 'synth') {
      if (this.opts.ticks && (k === 'hold' || k === 'rHold')) this.ticks(t, dur, polar(0, 60, 2.2));
      if (this.opts.ticks && k === 'holdOut') this.ticks(t, dur, polar(0, -10, 2));
      if (k === 'retention') E.dissolve(Math.min(dur, 30));
      if (ph.cycle === 1 || k === 'rIn' || k === 'retention') this.emit('phase', ph);
      return;
    }

    if (k === 'in' || k === 'rIn' || k === 'inL' || k === 'inR' || k === 'in2') {
      ramp(1, t, dur);
      const n = k === 'in2' ? 1 : Math.max(2, Math.min(8, Math.round(dur / beat)));
      const step = dur / n;
      const az0 = side ? side * 70 : (Math.random() - 0.5) * 30;
      const em = this.em(polar(az0, -15, 1.8), 'handpan', t + dur + 5);
      em.path([{ t, pos: polar(az0, -15, 1.8) }, { t: t + dur, pos: polar(az0 * (side ? 1 : 0.5), 55, 2.4) }]);
      const notes = k === 'in2' ? [up[Math.min(up.length - 1, 6)]] : up.slice(0, n);
      notes.forEach((m, j) => { I.handpan(E, em.input, t + j * step, { freq: mtof(m), vel: 0.3 + 0.28 * (j / Math.max(1, n - 1)), bright: 0.45 }); });
      if (k !== 'in2') {
        const top = this.em(polar(0, 45, 2.8), 'wash', t + dur + 6, 0.6);
        I.handpan(E, top.input, t, { freq: mtof(up[Math.min(up.length - 1, 4)]), vel: 0.45, bowed: true });
        if (k === 'in' || k === 'rIn') I.koshi(E, top.input, t, { freq: mtof(up[Math.min(up.length - 1, 5)] + 24), vel: 0.22 });
      }
    } else if (k === 'out' || k === 'outL' || k === 'outR' || k === 'hum') {
      ramp(0.45, t, dur);
      const n = Math.max(1, Math.min(5, Math.round(dur / beat / 2)));
      const azEnd = side ? side * 80 : 160 * (Math.random() < 0.5 ? -1 : 1);
      const em = this.em(polar(side ? side * 70 : 0, 50, 2.4), 'handpan', t + dur + 5);
      em.path([{ t, pos: polar(side ? side * 70 : 0, 50, 2.4) }, { t: t + dur, pos: polar(azEnd, -10, 2.6) }]);
      const down = up.slice(0, Math.max(n, 2)).reverse();
      for (let j = 0; j < n; j++) I.handpan(E, em.input, t + j * (dur / n), { freq: mtof(down[j % down.length]), vel: 0.38 - 0.05 * j, bright: 0.35 });
      I.handpan(E, em.input, t, { freq: mtof(ding), vel: 0.3, bowed: true });
      if (k === 'hum') {
        const low = this.em(polar(0, -20, 1.6), 'bowl', t + dur + 8, 0.3);
        I.bowl(E, low.input, t, { freq: mtof(ding), vel: 0.4, mode: 'sing', hold: Math.max(1, dur - 3) });
        const V = this.app.voice;
        if (V.enabled && !this.resOn) { this.resBefore = V.settings.resonance; this.resOn = true; V.set('resonance', 0.7); }
      }
    } else if (k === 'hold' || k === 'rHold') {
      ramp(this.padLevel, t, 0.05);
      const top = this.em(polar(0, 70, 2.6), 'bells', t + dur + 8, 0.6);
      I.tingsha(E, top.input, t, { freq: mtof(ding + 48) * 0.94, vel: 0.22 });
      if (dur >= 3) I.shimmer(E, top.input, t + 0.3, { freqs: up.slice(1, 6).map((m) => mtof(m + 24)), dur: Math.max(2, dur - 1), vel: 0.45 });
      if (this.opts.ticks) this.ticks(t, dur, polar(0, 60, 2.2));
      if (k === 'rHold') I.gong(E, top.input, t + dur - 0.3, { freq: mtof(ding - 12), vel: 0.25 });
    } else if (k === 'holdOut' || k === 'retention') {
      ramp(0.4, t, 1.5);
      const g = E.ctx.createGain(); g.gain.value = 1; ph.gain = g;
      const low = this.em(polar(0, -25, 2.2), 'bowl', t + dur + 12, 0.4);
      g.connect(low.input);
      I.bowl(E, g, t, { freq: mtof(ding - 12) * 2, vel: 0.35, mode: 'sing', hold: Math.max(1, dur - 2) });
      const hb = this.em(polar(0, -30, 1.4), 'heart', t + dur + 2, 0.05);
      const hg = E.ctx.createGain(); hg.connect(hb.input); ph.heart = hg;
      for (let tt = t + 0.8; tt < t + dur - 0.5; tt += 1.15) { I.heart(E, hg, tt, { hit: 'lub', vel: 0.35 }); I.heart(E, hg, tt + 0.3, { hit: 'dub', vel: 0.25 }); }
      if (k === 'retention') E.dissolve(Math.min(dur, 30));
      if (this.opts.ticks && k === 'holdOut') this.ticks(t, dur, polar(0, -10, 2));
    } else if (k === 'pump') {
      ramp(0.7, t, 1);
      const em = this.em(polar(0, -5, 1.6), 'rhythm', t + dur + 2, 0.15);
      for (let tt = t, j = 0; tt < t + dur - 0.05; tt += beat, j++) {
        I.frameDrum(E, em.input, tt, { hit: 'tek', vel: 0.35 + (j % 4 === 0 ? 0.1 : 0) });
        if (j % 4 === 0) I.handpan(E, em.input, tt, { freq: mtof(ding), vel: 0.3 });
      }
    } else if (k === 'rest') {
      ramp(0.8, t, 3);
      if (this.resOn) { const V = this.app.voice; setTimeout(() => { V.set('resonance', this.resBefore || 0); this.resOn = false; }, Math.max(0, (t - E.now) * 1000)); }
    }
    if (ph.cycle === 1 || k === 'rIn' || k === 'retention') this.emit('phase', ph);
  }

  // Пэды и бас, как на драм-машине: вдох — пэд раскрывается и взлетает, бас идёт вверх (тоника → квинта);
  // выдох — аккорд меняется, бас опускается; задержка — светлый пэд и флейта; пауза — глубокий саб.
  synthPhase(ph) {
    const A = this.app, L = A.lib, E = this.E, ctx = E.ctx, key = A.conductor.curDing, t = ph.t, dur = ph.dur, k = ph.kind;
    const em = this.padEm || (this.padEm = E.spawn({ group: 'live', pos: polar(0, 20, 3.2), send: 0.45, kind: 'wash', label: 'пэд', atmos: 0.55 }));
    const bem = this.bassEm || (this.bassEm = E.spawn({ group: 'live', pos: polar(0, -15, 2), send: 0.04, kind: 'rhythm', label: 'бас', hrtf: false, atmos: 0.02 }));
    let base = key; while (base > 43) base -= 12; while (base < 31) base += 12;
    const vol = this.opts.sound === 'mix' ? 0.7 : 1;
    const side = k.endsWith('L') ? -1 : k.endsWith('R') ? 1 : 0;
    if (k === 'in' || k === 'rIn' || k === 'inL' || k === 'inR' || k === 'in2') {
      if (k === 'in2') { L.play(em.input, t, 'samplepad', key + 12, dur + 1, 0.35 * vol, { att: 0.2, rel: 1 }); return; }
      this.cyc = (this.cyc || 0) + 1;
      em.path([{ t, pos: polar(side * 60, -5, 3) }, { t: t + dur, pos: polar(side * 60, 55, 3) }]);
      L.play(em.input, t, this.cyc % 2 ? 'samplepad' : 'mantra', key, dur + 1.2, 0.55 * vol, { att: Math.max(0.3, dur * 0.85), rel: 1.4, lp: 3400 });
      L.play(bem.input, t, 'sub', base, dur * 0.5, 0.7 * vol, { att: 0.02, rel: 0.25, fold: false });
      L.play(bem.input, t + dur * 0.5, 'sub', base + 7, dur * 0.5, 0.6 * vol, { att: 0.02, rel: 0.3, fold: false });
    } else if (k === 'out' || k === 'outL' || k === 'outR' || k === 'hum') {
      const alt = (this.cyc || 0) % 2 ? key + 8 : key + 5;
      em.path([{ t, pos: polar(side * 60, 55, 3) }, { t: t + dur, pos: polar(side ? side * 80 : 170, -5, 3.4) }]);
      L.play(em.input, t, (this.cyc || 0) % 2 ? 'soulsynth' : 'synthpad', alt, dur + 1.5, 0.5 * vol, { att: 0.6, rel: 1.6, lp: 2600 });
      L.play(bem.input, t, 'sub', base + 7, dur * 0.4, 0.6 * vol, { att: 0.02, rel: 0.3, fold: false });
      L.play(bem.input, t + dur * 0.4, 'sub', base, dur * 0.6, 0.65 * vol, { att: 0.02, rel: 0.5, fold: false });
    } else if (k === 'hold' || k === 'rHold') {
      L.play(em.input, t, 'samplepad', key, dur + 1, 0.42 * vol, { att: 0.8, rel: 1.5, lp: 4400 });
      if (dur >= 3) {
        let fl = key + 12; while (fl < 62) fl += 12; while (fl > 74) fl -= 12;
        const fem = E.spawn({ group: 'live', pos: polar(0, 65, 3), send: 0.5, kind: 'ocarina', label: 'флейта', life: t + dur + 2 });
        L.play(fem.input, t + 0.2, 'flute', fl, dur - 0.5, 0.3 * vol, { att: 0.5, rel: 0.8, fold: false });
      }
    } else if (k === 'holdOut' || k === 'retention') {
      const g = ctx.createGain(); g.connect(em.input); const gb = ctx.createGain(); gb.connect(bem.input);
      // при «Вдохнуть» в открытой задержке оба слоя мягко уходят
      ph.synthGain = { gain: { setTargetAtTime: (v, at, tau) => { g.gain.setTargetAtTime(v, at, tau); gb.gain.setTargetAtTime(v, at, tau); } } };
      L.play(gb, t, 'sub', base, dur, 0.4 * vol, { att: 1.5, rel: 2, fold: false });
      L.play(g, t, 'mantra', key - 12, dur, 0.32 * vol, { att: 2, rel: 2, lp: 1200 });
    } else if (k === 'pump') {
      for (let tt = t, j = 0; tt < t + dur - 0.05; tt += this.beat, j++) if (j % 2 === 0) L.play(bem.input, tt, 'sub', base, this.beat * 0.45, 0.5 * vol, { att: 0.005, rel: 0.08, fold: false });
    } else if (k === 'rest') {
      L.play(em.input, t, 'samplepad', key, Math.min(dur, 20), 0.35 * vol, { att: 3, rel: 3, lp: 3000 });
    }
  }

  ticks(t, dur, pos) {
    const E = this.E, em = this.em(pos, 'bells', t + dur + 1, 0.2);
    for (let s = 1; s < dur - 0.3; s += 1) I.kalimba(E, em.input, t + s, { freq: mtof(this.app.conductor.curDing + 36), vel: 0.12 });
  }

  say(word, t) {
    const delay = Math.max(0, (t - this.E.now) * 1000 - 120);
    setTimeout(() => {
      if (!this.active) return;
      const u = new SpeechSynthesisUtterance(word); u.lang = 'ru-RU'; u.rate = 0.85; u.pitch = 0.95; u.volume = 0.8;
      const v = this.app.narrator && this.app.narrator.sysVoice; if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }, delay);
  }
}
