// Сэмплы: киты PO-33 (натуральные барабаны, EDM, «мокрый» кит с каплями и всплесками, вокальные чопы),
// пэды и аккорды (электропиано, JX-8P, синт-пэды, соул-аккорд, винтажный синт), саб-бас и флейта.
// Карта нарезки и корни аккордов лежат в samples/lib.json. Загрузка ленивая: всё весит меньше мегабайта.
import { tuning } from './util.js';

// если нужной роли в ките нет — берём похожую
const FALLBACK = {
  kick: ['kickHat', 'kickLong', 'tomLo'], kickHat: ['kick'], kickLong: ['kick'], snare: ['snareHat', 'clap', 'perc'],
  snareHat: ['snare', 'clap'], clap: ['snare', 'snareHat', 'perc'], hat: ['shaker', 'drip', 'ohat'], ohat: ['hat', 'splash', 'shaker'],
  shaker: ['hat', 'drip'], tom: ['tomLo', 'perc'], tomLo: ['tom', 'kick'], bell: ['drip', 'perc'], crash: ['splash', 'ohat'],
  splash: ['crash', 'ohat'], drip: ['bell', 'perc', 'hat'], perc: ['tom', 'drip'], sub808: ['kickLong', 'kick'], fx: ['bell', 'perc'],
};
// какие сэмплы подходят под качество аккорда
export const CHORD_INST = { m7: ['rhodes', 'mantra', 'brokenpad', 'synthpad'], dom: ['classic'], maj: ['soulsynth'], sus: ['samplepad'] };
export const INST_NAMES = {
  rhodes: 'Электропиано', mantra: 'Пэд «Мантра» (JX-8P)', brokenpad: 'Пэд «Трещина»', synthpad: 'Синт-пэд', classic: 'Соул-аккорд',
  soulsynth: 'Винтажный синт', samplepad: 'Пэд «Воздух»', sub: 'Саб-бас', flute: 'Флейта',
};
export const KIT_NAMES = { natural: 'Живые барабаны', edm: 'Электронный', wet: 'Вода и капли' };

export class SampleLib {
  constructor(E) { this.E = E; this.meta = null; this.buf = {}; this.shift = {}; this.jobs = {}; this.sel = {}; }

  async init() {
    if (this.meta) return this.meta;
    if (!this._init) this._init = fetch(new URL('../samples/lib.json', import.meta.url)).then((r) => r.json()).then((m) => (this.meta = m));
    return this._init;
  }
  // key: 'kit:natural' | 'inst:rhodes'
  load(key) {
    if (this.jobs[key]) return this.jobs[key];
    return (this.jobs[key] = (async () => {
      await this.init();
      const [type, name] = key.split(':');
      const M = type === 'kit' ? this.meta.kits[name] : this.meta.inst[name];
      if (!M) return null;
      const r = await fetch(new URL('../samples/' + M.file, import.meta.url));
      const b = await this.E.ctx.decodeAudioData(await r.arrayBuffer());
      // mp3 может добавить тишину в начало — находим первый удар и сдвигаем карту нарезки
      const d = b.getChannelData(0); let mx = 0;
      for (let i = 0; i < d.length; i += 2) mx = Math.max(mx, Math.abs(d[i]));
      let first = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05 * mx) { first = i / b.sampleRate; break; }
      this.shift[key] = Math.max(-0.01, Math.min(0.08, first - (M.first || 0)));
      this.buf[key] = b;
      return b;
    })().catch(() => null));
  }
  async loadAll() {
    await this.init();
    const keys = [...Object.keys(this.meta.kits).map((k) => 'kit:' + k), ...Object.keys(this.meta.inst).map((k) => 'inst:' + k)];
    await Promise.allSettled(keys.map((k) => this.load(k)));
  }
  has(key) { return !!this.buf[key]; }

  // ---------- Удар из кита ----------
  slices(kit, role) {
    const K = this.meta && this.meta.kits[kit]; if (!K) return [];
    let list = K.slices.filter((s) => s.role === role);
    if (!list.length) for (const alt of FALLBACK[role] || []) { list = K.slices.filter((s) => s.role === alt); if (list.length) break; }
    return list;
  }
  hit(dest, t, kit, role, vel = 0.7, { rate = 1, idx, lp, cut } = {}) {
    const key = 'kit:' + kit, b = this.buf[key];
    if (!b) { this.load(key); return t; }
    const list = this.slices(kit, role); if (!list.length) return t;
    // чередуем варианты одного удара, чтобы не было «пулемёта»
    const sk = kit + role; let i = idx ?? ((this.sel[sk] = ((this.sel[sk] ?? -1) + 1 + (Math.random() < 0.3 ? 1 : 0)) % list.length));
    const s = list[i % list.length];
    const ctx = this.E.ctx, src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = ctx.createGain(); const amp = s.g * Math.pow(vel, 1.25) * 0.55;
    const dur = Math.min(s.d, cut || s.d) / rate;
    g.gain.setValueAtTime(amp, t); g.gain.setValueAtTime(amp, t + Math.max(0.005, dur - 0.012)); g.gain.linearRampToValueAtTime(0, t + dur);
    let head = src;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.4; src.connect(f); head = f; }
    head.connect(g); g.connect(dest);
    src.start(t, Math.max(0, s.s + (this.shift[key] || 0) - 0.002), dur + 0.02);
    this.E.after(t + dur + 0.1, () => g.disconnect());
    return t + dur;
  }

  // ---------- Высотные сэмплы ----------
  // голос: кусок буфера с огибающей; возвращает узел усиления
  _voice(dest, b, t, { off = 0, rate = 1, amp = 1, att = 0.01, end, rel = 0.4, lp, glide = 0 }) {
    const ctx = this.E.ctx, src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    if (glide) { src.playbackRate.setValueAtTime(rate * glide, t); src.playbackRate.exponentialRampToValueAtTime(rate, t + 0.09); }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + Math.max(0.004, att));
    const holdEnd = Math.max(t + att, end - rel);
    g.gain.setValueAtTime(amp, holdEnd); g.gain.linearRampToValueAtTime(0, end);
    let head = src;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5; src.connect(f); head = f; }
    head.connect(g); g.connect(dest);
    src.start(t, Math.max(0, off)); src.stop(end + 0.05);
    this.E.after(end + 0.1, () => g.disconnect());
    return { src, g };
  }
  // Сыграть сэмпл с высотой midi (для аккорда — его корень). Длинные ноты тянутся бесшовно:
  // голоса сменяют друг друга с перекрёстным затуханием, поэтому пэд может звучать сколько угодно.
  play(dest, t, name, midi, dur, vel = 0.7, { att = 0.02, rel = 0.6, off = 0, lp, fold = true, wobble = 0, glide = 0 } = {}) {
    const key = 'inst:' + name, b = this.buf[key], M = this.meta && this.meta.inst[name];
    if (!b || !M) { this.load(key); return t; }
    let semis = midi - M.root;
    if (fold) { semis = ((semis % 12) + 12) % 12; if (semis > 6) semis -= 12; }
    const rate = Math.pow(2, semis / 12) * (tuning.a4 / 440);
    const amp = M.g * Math.pow(vel, 1.15) * 0.5;
    const offs = off;
    const len = (b.duration - offs) / rate;
    const end = t + dur + rel;
    const voices = [];
    if (dur + rel <= len - 0.05) voices.push(this._voice(dest, b, t, { off: offs, rate, amp, att, end, rel, lp, glide }));
    else {
      // бесшовная протяжка
      const loopOff = Math.min(b.duration * 0.35, 1.6), xf = 1.4, seg = (b.duration - loopOff) / rate;
      let vt = t, vo = offs, first = true;
      while (vt < end) {
        const vlen = first ? len : seg;
        const vend = Math.min(end, vt + vlen);
        const last = vend >= end - 0.01;
        voices.push(this._voice(dest, b, vt, { off: vo, rate, amp, att: first ? att : xf, end: vend, rel: last ? rel : xf, lp }));
        vt = vend - xf; vo = loopOff; first = false;
        if (voices.length > 40) break;
      }
    }
    if (wobble) voices.forEach((v) => { // плёночное «плавание» высоты, как у кассеты
      const ctx = this.E.ctx, o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = 0.35 + Math.random() * 0.4; og.gain.value = rate * 0.0035 * wobble;
      o.connect(og); og.connect(v.src.playbackRate); o.start(t); o.stop(end + 0.1);
    });
    this.E.noteOn && this.E.noteOn(midi, t, vel, Math.min(4, dur + rel));
    return end;
  }
  // Аккорд нужного качества: подбираем сэмпл, если просили «любой подходящий»
  pickChord(q, prefer) {
    const list = CHORD_INST[q] || CHORD_INST.sus;
    if (prefer && list.includes(prefer)) return prefer;
    return list[0];
  }

  // Вокальный чоп, подстроенный под ноту
  chop(dest, t, midi, vel = 0.6, { idx } = {}) {
    const key = 'kit:vocal', b = this.buf[key], K = this.meta && this.meta.kits.vocal;
    if (!b || !K) { this.load(key); return t; }
    const list = K.slices; const s = list[idx ?? Math.floor(Math.random() * list.length)];
    let semis = midi - s.midi; semis = ((semis % 12) + 12) % 12; if (semis > 6) semis -= 12;
    const rate = Math.pow(2, semis / 12) * (tuning.a4 / 440);
    const dur = s.d / rate;
    this._voice(dest, b, t, { off: s.s + (this.shift[key] || 0), rate, amp: s.g * vel * 0.45, att: 0.012, end: t + dur, rel: Math.min(0.12, dur * 0.4) });
    return t + dur;
  }
}
