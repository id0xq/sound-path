// Живые записи: фоны природы — настоящие записи, сведённые в бесшовные петли, — и голоса птиц и животных,
// нарезанные на отдельные фразы. Киты — настоящие песни горбачей с гидрофонов (Ocean Song: NOAA SanctSound,
// MBARI MARS), остальное — полевые записи с Freesound под лицензией CC0. Список авторов — в README.
//
// Фон звучит из четырёх точек вокруг слушателя: спереди — одна часть записи, сзади — другая, поэтому
// пространство обволакивает и остаётся на месте, когда вы поворачиваете голову. Голос птицы или зверя
// звучит из своего места в 3D, как и синтезированные голоса раньше. Пока запись грузится, звучит синтез.
import { polar } from './util.js';

// какие фоны заменяют синтезированные слои природы
const LAYER_BED = { wind: 'wind', stream: 'stream', waves: 'waves', rain: 'rain', crickets: 'crickets', fire: 'fire',
  dawn: 'dawn', woodland: 'woodland', meadow: 'meadow', cave: 'cave', cityrain: 'cityrain' };
// сколько синтеза оставить поверх записи (листва остаётся синтезом — записи шелеста нет)
const SYNTH_KEEP = { wind: 0.15, stream: 0, waves: 0, rain: 0, crickets: 0, fire: 0 };
// громкость фонов относительно синтеза (записи выровнены по −24 дБ)
const BED_GAIN = { wind: 0.9, stream: 0.8, waves: 0.85, rain: 0.8, crickets: 0.5, fire: 0.75, dawn: 0.55, woodland: 0.55, meadow: 0.5,
  cave: 0.6, cityrain: 0.55, underwater: 0.75, frogs: 0.6, cicadas: 0.35, cat: 0.55 };
const BED_GROUP = { dawn: 'birds', woodland: 'birds', frogs: 'birds', cicadas: 'birds', cat: 'birds' };
// где звучит фон: [азимут, высота, расстояние, часть записи F/R, канал L/R/M]
const QUAD = [[-60, 5, 4, 'F', 0], [60, 5, 4, 'F', 1], [-130, 8, 4.5, 'R', 0], [130, 8, 4.5, 'R', 1]];
const PLACE = {
  cat: [[-50, -30, 1.1, 'F', 'M']],
  fire: [[-20, -22, 2.2, 'F', 0], [20, -22, 2.2, 'F', 1]],
  stream: [[-80, -18, 3, 'F', 0], [-40, -18, 3.6, 'F', 1], [-120, -18, 4, 'R', 0]],
  dawn: [[-50, 25, 7, 'F', 0], [50, 25, 7, 'F', 1], [-140, 30, 8, 'R', 0], [140, 30, 8, 'R', 1]],
  woodland: [[-50, 20, 7, 'F', 0], [50, 20, 7, 'F', 1], [-140, 25, 8, 'R', 0], [140, 25, 8, 'R', 1]],
  underwater: [[-70, -10, 3, 'F', 0], [70, -10, 3, 'F', 1], [-130, 10, 3, 'R', 0], [130, 10, 3, 'R', 1]],
  waves: [[-55, -8, 6, 'F', 0], [55, -8, 6, 'F', 1], [-120, -5, 8, 'R', 0], [120, -5, 8, 'R', 1]],
};

export class Field {
  constructor(app) {
    this.app = app; this.E = app.E; this.meta = null; this.buf = {}; this.jobs = {}; this.beds = {}; this.want = {};
    this.lastNature = {}; this.sel = {};
  }
  async init() {
    if (this.meta) return this.meta;
    if (!this._init) this._init = fetch(new URL('../samples/field/field.json', import.meta.url)).then((r) => r.json()).then((m) => (this.meta = m)).catch(() => (this.meta = { beds: {}, calls: {} }));
    return this._init;
  }
  load(kind, name) {
    const key = kind + ':' + name;
    if (this.jobs[key]) return this.jobs[key];
    return (this.jobs[key] = (async () => {
      await this.init();
      const M = kind === 'bed' ? this.meta.beds[name] : this.meta.calls[name];
      if (!M) return null;
      const r = await fetch(new URL('../samples/' + M.file, import.meta.url));
      const b = await this.E.ctx.decodeAudioData(await r.arrayBuffer());
      this.buf[key] = b;
      return b;
    })().catch(() => null));
  }
  has(kind, name) { return !!this.buf[kind + ':' + name]; }
  known(kind, name) { return !!(this.meta && (kind === 'bed' ? this.meta.beds : this.meta.calls)[name]); }

  // ---------- Фоны ----------
  setBed(name, v, fade = 3) {
    const E = this.E; this.want[name] = v;
    let B = this.beds[name];
    if (v > 0.004 && !B) {
      if (!this.has('bed', name)) { this.load('bed', name).then((b) => { if (b && (this.want[name] || 0) > 0.004) this.setBed(name, this.want[name], 4); }); return false; }
      B = this.beds[name] = this.startBed(name);
    }
    if (!B) return false;
    clearTimeout(B.stopT);
    B.setLevel(v * (BED_GAIN[name] ?? 0.7), E.now, Math.max(0.1, fade / 3));
    if (v <= 0.004) B.stopT = setTimeout(() => { if ((this.want[name] || 0) <= 0.004) this.stopBed(name); }, Math.max(2, fade * 2) * 1000);
    return true;
  }
  startBed(name) {
    const E = this.E, ctx = E.ctx, b = this.buf['bed:' + name];
    const group = BED_GROUP[name] || 'nature';
    const off0 = Math.random() * b.duration, srcs = {}, split = {};
    for (const part of ['F', 'R']) {
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      s.start(E.now + 0.05, (off0 + (part === 'R' ? b.duration / 2 : 0)) % b.duration);
      const sp = ctx.createChannelSplitter(2); s.connect(sp); srcs[part] = s; split[part] = sp;
    }
    const ems = [], lvls = [];
    for (const [az, el, d, part, ch] of PLACE[name] || QUAD) {
      const em = E.spawn({ group, pos: polar(az, el, d), send: 0.25, atmos: name === 'underwater' || name === 'cave' ? 0.3 : 0.08, kind: group === 'birds' ? 'bird' : 'water', label: 'запись', hrtf: false });
      const lvl = ctx.createGain(); lvl.gain.value = 0;
      if (ch === 'M') { const m = ctx.createGain(); m.gain.value = 0.5; split[part].connect(m, 0); split[part].connect(m, 1); m.connect(lvl); }
      else split[part].connect(lvl, ch);
      lvl.connect(em.input); ems.push(em); lvls.push(lvl);
    }
    return { srcs, ems, setLevel: (v, t, tau) => lvls.forEach((l) => l.gain.setTargetAtTime(v, t, tau)) };
  }
  stopBed(name) {
    const B = this.beds[name]; if (!B) return;
    delete this.beds[name];
    const t = this.E.now;
    Object.values(B.srcs).forEach((s) => { try { s.stop(t + 0.2); } catch (e) {} });
    this.E.after(t + 0.5, () => B.ems.forEach((em) => em.dispose()));
  }

  // Слои природы из главы: записи вместо синтеза, где запись есть
  applyNature(N = {}, S = {}, fade = 3) {
    this.lastNature = N; this.lastS = S;
    const synth = { ...N };
    for (const [layer, bed] of Object.entries(LAYER_BED)) {
      const v = N[layer] || 0;
      if (!this.known('bed', bed)) { if (!this.meta) this.init().then(() => this.applyNature(this.lastNature, this.lastS, 2)); continue; }
      const ready = this.setBed(bed, v, fade);
      if (ready || v <= 0.004) synth[layer] = v * (SYNTH_KEEP[layer] ?? 0);
    }
    // вода вокруг, когда «под водой»
    this.setBed('underwater', (S.underwater || 0) * 0.9, fade);
    this.app.nature.setLevels(synth, fade / 3);
  }

  // ---------- Голоса ----------
  // Сыграть фразу записи name в узел dest. Возвращает время окончания или null, если записи нет.
  call(dest, t, name, { vel = 0.7, idx, rate = 1, seq = false } = {}) {
    const key = 'call:' + name, b = this.buf[key], M = this.meta && this.meta.calls[name];
    if (!M) return null;
    if (!b) { this.load('call', name); return null; }
    const segs = M.segs; if (!segs.length) return null;
    let i;
    if (idx !== undefined) i = idx % segs.length;
    else if (seq) i = this.sel[name] = ((this.sel[name] ?? -1) + 1) % segs.length;
    else { i = Math.floor(Math.random() * segs.length); if (i === this.sel[name] && segs.length > 1) i = (i + 1) % segs.length; this.sel[name] = i; }
    const [off, dur, g] = segs[i];
    const ctx = this.E.ctx, src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const gn = ctx.createGain(); const amp = g * vel;
    const len = dur / rate;
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(amp, t + 0.02);
    gn.gain.setValueAtTime(amp, t + Math.max(0.03, len - 0.15)); gn.gain.linearRampToValueAtTime(0, t + len);
    src.connect(gn); gn.connect(dest);
    src.start(t, Math.max(0, off - 0.02), len + 0.05);
    this.E.after(t + len + 0.1, () => gn.disconnect());
    return t + len;
  }
  count(name) { const M = this.meta && this.meta.calls[name]; return M ? M.segs.length : 0; }
  preload(names) { names.forEach(([k, n]) => this.load(k, n)); }
}
