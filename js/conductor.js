// Дирижёр: ведёт сюжет сета по главам, плавно перетекает между ними, запускает события,
// управляет плотностью генеративных голосов. «Задержать главу» останавливает сюжет, звук продолжается.
import { DEFAULTS, SETS, makeFreeSet } from './sets.js';
import { Rng, mtof } from './util.js';
import { Pad } from './atmos.js';
import { handpanNotes, scaleInRange } from './theory.js';

function merge(base, ch) {
  const S = { ...base, ...ch };
  S.nature = { ...base.nature, ...(ch.nature || {}) };
  S.pad = { ...base.pad, ...(ch.pad || {}) };
  return S;
}

export class Conductor {
  constructor(app) {
    this.app = app; this.E = app.E;
    this.set = null; this.rng = new Rng(1);
    this.state = merge(DEFAULTS, {});
    this.running = false; this.held = false; this.elapsed = 0; this.lastNow = 0; this.chapterIdx = -1;
    this.ding = 50; this.curDing = 50; this.tempoFactor = 1;
    this.D = { handpan: 0, wash: 0, bells: 0, ocarina: 0, kalimba: 0, birds: 0 };
    this.T = { ...this.D }; this.smoothTau = 6;
    this.pad = null; this.pendingEvents = []; this.handlers = {};
    this.fadingOut = false;
  }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, data) { (this.handlers[evt] || []).forEach((f) => f(data)); }

  handpanNotes() { return handpanNotes(this.state.tuning, this.curDing); }
  get chapter() { return this.set && this.chapterIdx >= 0 ? this.set.chapters[this.chapterIdx] : null; }
  get duration() { return this.set ? this.set.duration : 0; }

  loadSet(set, seed) { return this.load(set, seed); }
  load(setId, seed) {
    if (this.running) this.stop(true);
    this.rng = new Rng(seed);
    this.seed = seed;
    this.set = typeof setId === 'object' ? setId : setId === 'free' ? makeFreeSet(this.rng) : SETS.find((s) => s.id === setId);
    this.ding = this.set.base + this.rng.pick(this.set.transpose || [0]);
    this.curDing = this.ding + (this.set.chapters[0].root || 0);
    this.state = merge(DEFAULTS, this.set.chapters[0]);
    this.elapsed = 0; this.chapterIdx = -1;
    // все реплики ведущего на общей шкале времени
    this.lines = [];
    this.set.chapters.forEach((ch, ci) => (ch.script || []).forEach(([t, text], li) => this.lines.push({ at: ch.at + t, text, ci, li, key: `c${ci}l${li}` })));
    this.lineIdx = -1; this.viewIdx = null;
    this.emit('load', this.set);
    this.emit('line', { idx: -1 });
  }

  lineIndexAt(t) { let i = -1; while (i + 1 < this.lines.length && this.lines[i + 1].at <= t) i++; return i; }
  get shownLine() { return this.viewIdx !== null ? this.viewIdx : this.lineIdx; }
  // Листать реплики вручную (звук и сюжет при этом идут своим ходом)
  stepLine(dir) {
    if (!this.lines.length) return;
    const cur = this.shownLine < 0 ? (dir > 0 ? -1 : 0) : this.shownLine;
    this.viewIdx = Math.max(0, Math.min(this.lines.length - 1, cur + dir));
    if (this.viewIdx === this.lineIdx) this.viewIdx = null;
    this.emit('line', { idx: this.shownLine, manual: true });
  }
  followLine() { this.viewIdx = null; this.emit('line', { idx: this.lineIdx }); }

  chapterIndexAt(t) {
    const ch = this.set.chapters; let i = 0;
    while (i + 1 < ch.length && ch[i + 1].at <= t) i++;
    return i;
  }

  start() {
    if (!this.set || this.running) return;
    const E = this.E, now = E.now;
    this.running = true; this.held = false; this.fadingOut = false; this.lastNow = now;
    E.musicSum.gain.cancelScheduledValues(now);
    E.musicSum.gain.setValueAtTime(0, now); E.musicSum.gain.linearRampToValueAtTime(1, now + 6);
    this.app.gen.reset(now);
    this.applyChapter(this.chapterIndexAt(this.elapsed), 3, true);
    this.emit('state');
  }

  hold(v = !this.held) { this.held = v; this.emit('state'); }

  // Завершить: всё мягко уходит в тишину
  stop(quick = false) {
    const E = this.E, now = E.now, fade = quick ? 1.5 : 6;
    this.running = false; this.held = false; this.elapsed = 0; this.lineIdx = -1; this.viewIdx = null;
    E.musicSum.gain.cancelScheduledValues(now);
    E.musicSum.gain.setValueAtTime(E.musicSum.gain.value, now);
    E.musicSum.gain.linearRampToValueAtTime(0, now + fade);
    E.after(now + fade + 0.1, () => {
      if (this.running) return;
      this.silenceAll();
      const t = E.now; E.musicSum.gain.cancelScheduledValues(t); E.musicSum.gain.setValueAtTime(0, t); E.musicSum.gain.linearRampToValueAtTime(1, t + 0.5);
    });
    this.emit('state');
  }

  silenceAll() {
    const A = this.app;
    A.rhythm.setPattern(null); A.rhythm.pattern = null; A.rhythm.pending = undefined;
    A.nature.setLevels({}, 0.2);
    if (this.pad) { this.pad.dispose(0.5); this.pad = null; }
    A.tanpura.setLevel(0, 0.2); A.binaural.set({ scene: 0, tau: 0.5 }); A.breath.setRate(0);
    A.birds.clear();
    for (const k of Object.keys(this.T)) { this.T[k] = 0; this.D[k] = 0; }
    this.chapterIdx = -1;
  }

  seek(idx) {
    if (!this.set) return;
    idx = Math.max(0, Math.min(this.set.chapters.length - 1, idx));
    this.elapsed = this.set.chapters[idx].at + 0.01;
    // при переходе показываем первую реплику главы; ведущий прочтёт её, когда до неё дойдёт время
    const first = this.lines.findIndex((l) => l.ci === idx);
    this.lineIdx = first >= 0 ? first - 1 : this.lineIndexAt(this.elapsed); this.viewIdx = null;
    if (this.app.narrator) this.app.narrator.stop();
    this.emit('line', { idx: first >= 0 ? first : this.lineIdx, seek: true });
    if (this.running) this.applyChapter(idx, 4);
    else {
      this.chapterIdx = -1; this.state = merge(DEFAULTS, this.set.chapters[idx]);
      this.curDing = this.ding + (this.state.root || 0);
      this.emit('chapter', { idx, ch: this.set.chapters[idx], S: this.state, preview: true });
    }
    this.emit('state');
  }

  applyChapter(idx, fade, immediate = false) {
    const E = this.E, A = this.app, ch = this.set.chapters[idx];
    this.chapterIdx = idx;
    const S = (this.state = merge(DEFAULTS, ch));
    const ding = (this.curDing = this.ding + (S.root || 0));
    E.setSpace(S.space, immediate ? 1 : Math.min(fade, 10));
    E.setSpaceLevel({ scene: S.spaceMix, tau: fade / 3 });
    A.nature.setLevels(S.nature, fade / 3);

    const chord = S.chord.map((i) => ding + i);
    if (!this.pad || this.pad.timbre !== S.pad.timbre) {
      if (this.pad) this.pad.dispose(fade);
      this.pad = new Pad(E, 'atmos', S.pad.timbre); this.pad.setChord(chord, 0.05);
    } else this.pad.setChord(chord, fade * 0.6);
    this.pad.setLevel(S.pad.level, fade / 3);

    A.tanpura.setRoot(ding); A.tanpura.setLevel(S.tanpura, fade / 3);
    A.binaural.set({ carrier: mtof(ding), beat: S.binaural || 0, scene: S.binaural ? 1 : 0, tau: fade });
    A.breath.setRate(S.breath);

    const rh = A.rhythm;
    this._rhythmOffAt = 0;
    if (S.rhythm) {
      const wasActive = rh.active && rh.key;
      rh.setPattern(S.rhythm);
      rh.setTempo(S.tempo * this.tempoFactor, wasActive ? fade : 0.01);
      E.setGroup('rhythm', { scene: S.rhythmLevel, tau: wasActive ? fade / 4 : 1.5 });
    } else if (rh.active) {
      E.setGroup('rhythm', { scene: 0, tau: fade / 4 });
      this._rhythmOffAt = E.now + fade;
    }

    this.T = { handpan: S.handpan, wash: S.wash, bells: S.bells, ocarina: S.ocarina, kalimba: S.kalimba, birds: S.birds };
    this.smoothTau = Math.max(2, fade / 2);
    A.voice.setScale(scaleInRange(S.tuning, ding, ding, ding + 30));

    this.pendingEvents = (S.events || []).map((e) => ({ at: ch.at + e.t, type: e.type, done: ch.at + e.t < this.elapsed - 1 }));
    this.emit('chapter', { idx, ch, S });
  }

  // Конструктор: заменить звучание текущей главы на лету (тексты и время главы остаются)
  applyLive(patch) {
    if (!this.running || !this.set || this.chapterIdx < 0) return false;
    const idx = this.chapterIdx, ch = this.set.chapters[idx];
    const keep = { at: ch.at, title: ch.title, color: ch.color, cue: ch.cue, script: ch.script };
    this.set.chapters[idx] = { ...patch, ...keep };
    this.applyChapter(idx, 3);
    this.pendingEvents = (patch.events || []).map((e) => ({ at: this.elapsed + e.t, type: e.type, done: false }));
    return true;
  }

  setTempoFactor(f) {
    this.tempoFactor = f;
    if (this.running && this.state.rhythm) this.app.rhythm.setTempo(this.state.tempo * f, 2);
  }

  tick(now, horizon) {
    const A = this.app, E = this.E;
    const dt = Math.min(1, Math.max(0, now - (this.lastNow || now))); this.lastNow = now;
    const S = this.state;
    if (this.running && this.set) {
      if (!this.held) this.elapsed += dt;
      const idx = this.chapterIndexAt(this.elapsed);
      if (idx !== this.chapterIdx) this.applyChapter(idx, this.set.chapters[idx].transition ?? DEFAULTS.transition);
      const li = this.lineIndexAt(this.elapsed);
      if (li !== this.lineIdx) {
        const natural = li === this.lineIdx + 1;
        this.lineIdx = li; this.viewIdx = null;
        this.emit('line', { idx: li, speak: natural });
      }
      for (const ev of this.pendingEvents) {
        if (!ev.done && this.elapsed >= ev.at - 0.4) { ev.done = true; A.gen.fire(ev.type, now + Math.max(0.05, ev.at - this.elapsed), this.state); }
      }
      const dur = this.set.duration;
      if (isFinite(dur)) {
        if (!this.fadingOut && this.elapsed >= dur - 20) {
          this.fadingOut = true;
          const g = E.musicSum.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + Math.max(1, dur - this.elapsed));
        }
        if (this.elapsed >= dur + 0.5) { this.running = false; this.emit('end'); this.stop(true); }
      }
    }
    if (this._rhythmOffAt && now >= this._rhythmOffAt && !this.state.rhythm) { A.rhythm.setPattern(null); this._rhythmOffAt = 0; }

    const k = 1 - Math.exp(-dt / this.smoothTau);
    for (const key of Object.keys(this.D)) this.D[key] += (this.T[key] - this.D[key]) * k;

    A.tanpura.tick(now, horizon);
    A.breath.tick(now, horizon);
    A.rhythm.tick(now, horizon);
    A.nature.tick(now, horizon, S);
    A.birds.tick(now, horizon, { ...S, birds: this.D.birds });
    if (this.running) A.gen.tick(now, horizon, S, this.D);
  }
}
