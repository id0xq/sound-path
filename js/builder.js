// Конструктор сцены: атмосфера собирается из блоков, как из кубиков.
// Видно всё, что звучит сейчас; каждый блок можно убавить, прибавить, выключить или заменить.
// Сцены сохраняются, из них собирается свой сет.
import { DEFAULTS } from './sets.js';
import { SPACES } from './dsp.js';
import { TUNINGS } from './theory.js';
import { PATTERNS } from './rhythm.js';
import { PAD_TIMBRES } from './atmos.js';
import { EVENT_NAMES } from './generators.js';
import { KIND_COLORS } from './sphere.js';
import { NOTE_NAMES } from './util.js';

const opt = (o) => Object.entries(o).map(([v, l]) => ({ v, l: typeof l === 'string' ? l : l.name }));
const CHORDS = {
  '0,7,12': 'Пустая квинта', '-12,0,7,12': 'Квинта с басом', '-12,0,7,12,16': 'Мажор', '-12,0,7,12,15': 'Минор',
  '-12,0,5,12,14': 'Подвешенный', '-12,0,7,11,16': 'Мажор с септимой', '-12,0,7,10,15': 'Минор с септимой', '-12,0,7,11,16,18': 'Лидийский свет',
};
const SPECIES = {
  'robin,thrush,distant': 'Утренний лес', 'tit,chaffinch,cuckoo': 'Солнечный день', 'dove,nightingale': 'Вечер и соловьи',
  'cuckoo,thrush,dove,distant': 'Глубина леса', 'robin,dove,distant': 'Тихий сад',
};
const HEAL = ['crystal', 'fork', 'monochord', 'templeBell', 'chimes', 'belltree', 'overtone', 'bowl', 'bowlSing', 'gong', 'tingsha', 'koshi', 'shimmer', 'rainstick', 'oceanDrum', 'chimesOrbit', 'dissolve'];
const lvl = (k, label = 'Громкость', max = 1) => ({ k, type: 'level', label, max });

export const BLOCKS = [
  { id: 'space', name: 'Пространство', cat: 'Пространство', color: '#bfe7f5', always: true,
    fields: [{ k: 'space', type: 'select', label: 'Тип', options: opt(SPACES) }, lvl('spaceMix', 'Глубина', 1)] },
  { id: 'motion', name: 'Движение звука', cat: 'Пространство', color: '#bfe7f5', always: true,
    fields: [{ k: 'motion', type: 'select', label: 'Как движется', options: [{ v: 'still', l: 'Вокруг, плавно' }, { v: 'walk', l: 'Прогулка: мимо и назад' }, { v: 'orbit', l: 'Кружит вокруг головы' }, { v: 'float', l: 'Парит над головой' }] }] },
  { id: 'tuning', name: 'Строй и аккорд', cat: 'Гармония', color: '#f0d49a', always: true,
    fields: [{ k: 'tuning', type: 'select', label: 'Строй ханга', options: opt(TUNINGS) },
      { k: 'root', type: 'select', label: 'Сдвиг тональности', options: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((v) => ({ v: String(v), l: (v > 0 ? '+' : '') + v + ' пт' })) },
      { k: 'chord', type: 'select', label: 'Аккорд', options: opt(CHORDS) }] },
  { id: 'pad', name: 'Пэд', cat: 'Атмосфера', color: '#cfc2ff', on: 'pad.level', fields: [{ k: 'pad.timbre', type: 'select', label: 'Тембр', options: opt(PAD_TIMBRES) }, lvl('pad.level', 'Громкость', 0.6)] },
  { id: 'wash', name: 'Облако ханга', cat: 'Атмосфера', color: '#cfc2ff', on: 'wash', fields: [lvl('wash', 'Плотность')] },
  { id: 'tanpura', name: 'Танпура', cat: 'Атмосфера', color: '#cfc2ff', on: 'tanpura', fields: [lvl('tanpura', 'Громкость', 0.8)] },
  { id: 'binaural', name: 'Бинауральный тон', cat: 'Атмосфера', color: '#cfc2ff', on: 'binaural',
    fields: [{ k: 'binaural', type: 'select', label: 'Частота биений', options: [[4, '4 Гц, тета'], [6, '6 Гц, тета'], [8, '8 Гц, альфа'], [10, '10 Гц, альфа'], [12, '12 Гц, альфа']].map(([v, l]) => ({ v: String(v), l })) }] },
  { id: 'breath', name: 'Дыхание атмосферы', cat: 'Атмосфера', color: '#cfc2ff', on: 'breath',
    fields: [{ k: 'breath', type: 'select', label: 'Вдохов в минуту', options: [4, 4.5, 5, 5.5, 6, 7].map((v) => ({ v: String(v), l: String(v).replace('.', ',') })) }] },
  { id: 'handpan', name: 'Ханг', cat: 'Инструменты', color: KIND_COLORS.handpan, on: 'handpan', fields: [lvl('handpan', 'Сколько играет')] },
  { id: 'bells', name: 'Колокольчики', cat: 'Инструменты', color: KIND_COLORS.bells, on: 'bells', fields: [lvl('bells', 'Как часто')] },
  { id: 'ocarina', name: 'Окарина', cat: 'Инструменты', color: KIND_COLORS.ocarina, on: 'ocarina', fields: [lvl('ocarina', 'Как часто')] },
  { id: 'kalimba', name: 'Калимба', cat: 'Инструменты', color: KIND_COLORS.kalimba, on: 'kalimba', fields: [lvl('kalimba', 'Как часто')] },
  { id: 'heal', name: 'Звукотерапия', cat: 'Инструменты', color: KIND_COLORS.wash, on: 'healEvery',
    fields: [{ k: 'healEvent', type: 'select', label: 'Звук', options: HEAL.map((v) => ({ v, l: EVENT_NAMES[v] || v })) },
      { k: 'healEvery', type: 'range', label: 'Каждые, секунд', min: 20, max: 240, step: 10 }] },
  { id: 'rhythm', name: 'Ритм', cat: 'Ритм', color: KIND_COLORS.rhythm, on: 'rhythm',
    fields: [{ k: 'rhythm', type: 'select', label: 'Рисунок', options: opt(PATTERNS) }, { k: 'tempo', type: 'range', label: 'Темп, уд/мин', min: 40, max: 120, step: 1 }, lvl('rhythmLevel', 'Громкость')] },
  { id: 'birds', name: 'Птицы', cat: 'Природа', color: KIND_COLORS.bird, on: 'birds', fields: [{ k: 'species', type: 'select', label: 'Какие', options: opt(SPECIES) }, lvl('birds', 'Сколько')] },
  ...[['wind', 'Ветер'], ['leaves', 'Листва'], ['stream', 'Ручей'], ['waves', 'Волны'], ['rain', 'Дождь'], ['crickets', 'Сверчки'], ['fire', 'Костёр']].map(([k, n]) => ({
    id: k, name: n, cat: 'Природа', color: KIND_COLORS[k === 'stream' || k === 'waves' || k === 'rain' ? 'water' : k === 'fire' ? 'fire' : k === 'crickets' ? 'crickets' : 'bird'], on: 'nature.' + k, fields: [lvl('nature.' + k, 'Громкость', 1)],
  })),
];
const DEF_ON = { 'pad.level': 0.28, wash: 0.25, tanpura: 0.3, binaural: 8, breath: 5.5, handpan: 0.3, bells: 0.2, ocarina: 0.25, kalimba: 0.15, healEvery: 90, rhythm: 'heartwalk', birds: 0.35 };

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
const isOn = (b, sc) => b.always || (b.on && (() => { const v = get(sc, b.on); return v !== null && v !== undefined && v !== 0 && v !== '0'; })());
const store = {
  get(k, d) { try { const v = localStorage.getItem('zp:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('zp:' + k, JSON.stringify(v)); } catch (e) {} },
};

export class Builder {
  constructor(app, root) {
    this.app = app; this.root = root; this.live = true; this.name = 'Моя сцена';
    this.scene = this.fresh(); this.blocks = BLOCKS.filter((b) => isOn(b, this.scene)).map((b) => b.id);
    this.saved = store.get('scenes', []); this.myset = store.get('myset', { items: [] });
    this.timer = null;
  }
  fresh() {
    const s = JSON.parse(JSON.stringify(DEFAULTS));
    Object.assign(s, { space: 'temple', tuning: 'astra', chord: [-12, 0, 7, 12, 16], pad: { timbre: 'warm', level: 0.28 }, wash: 0.25, handpan: 0.3, bells: 0.15 });
    return s;
  }
  // взять то, что звучит прямо сейчас
  fromCurrent() {
    const S = this.app.conductor.state;
    this.scene = JSON.parse(JSON.stringify({ ...DEFAULTS, ...S, nature: { ...DEFAULTS.nature, ...(S.nature || {}) }, pad: { ...DEFAULTS.pad, ...(S.pad || {}) } }));
    if (Array.isArray(this.scene.species)) this.scene.species = this.scene.species.join(',');
    this.blocks = BLOCKS.filter((b) => isOn(b, this.scene)).map((b) => b.id);
    const ch = this.app.conductor.chapter; if (ch) this.name = ch.title;
    this.render();
  }
  // сцена → глава сюжета
  toChapter(minutes = 0) {
    const s = JSON.parse(JSON.stringify(this.scene));
    BLOCKS.forEach((b) => { if (!b.always && !this.blocks.includes(b.id) && b.on) set(s, b.on, b.on === 'rhythm' ? null : 0); });
    s.chord = typeof s.chord === 'string' ? s.chord.split(',').map(Number) : s.chord;
    s.species = typeof s.species === 'string' ? s.species.split(',') : s.species;
    s.root = Number(s.root) || 0; s.binaural = Number(s.binaural) || 0; s.breath = Number(s.breath) || 0;
    if (s.rhythm === '' || s.rhythm === 'null') s.rhythm = null;
    const events = [];
    if (this.blocks.includes('heal') && s.healEvery) {
      const total = minutes ? minutes * 60 : 1800;
      for (let t = 4; t < total && events.length < 60; t += Number(s.healEvery)) events.push({ t, type: s.healEvent || 'crystal' });
    }
    s.events = events; s.transition = 4; s.title = this.name; s.color = s.color || '#86d3e8';
    s.cue = 'Своя сцена из конструктора. Ведите голосом и добавляйте живые звуки.'; s.script = [];
    return s;
  }
  apply() {
    const C = this.app.conductor, ch = this.toChapter();
    if (C.running && C.set) { C.applyLive(ch); return; }
    C.loadSet({ id: 'scene', title: this.name, subtitle: 'Своя сцена', minutes: 0, duration: Infinity, base: 52, transpose: [0], chapters: [{ ...ch, at: 0 }] }, 1);
    C.start();
  }
  changed() {
    if (!this.live) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.apply(), 250);
  }
  add(id) {
    const b = BLOCKS.find((x) => x.id === id); if (!b || this.blocks.includes(id)) return;
    if (b.on && !isOn(b, this.scene)) set(this.scene, b.on, DEF_ON[b.on] ?? 0.4);
    if (id === 'heal' && !this.scene.healEvent) this.scene.healEvent = 'crystal';
    if (id === 'birds' && !this.scene.species) this.scene.species = 'robin,thrush,distant';
    if (id === 'rhythm') { this.scene.tempo = this.scene.tempo || 66; this.scene.rhythmLevel = this.scene.rhythmLevel || 0.5; }
    this.blocks.push(id); this.render(); this.changed();
  }
  remove(id) { this.blocks = this.blocks.filter((x) => x !== id); this.render(); this.changed(); }

  // ---------- Сохранение ----------
  save() {
    const i = this.saved.findIndex((s) => s.name === this.name);
    const item = { name: this.name, scene: JSON.parse(JSON.stringify(this.scene)), blocks: [...this.blocks] };
    if (i >= 0) this.saved[i] = item; else this.saved.unshift(item);
    store.set('scenes', this.saved); this.render();
  }
  load(i) { const s = this.saved[i]; if (!s) return; this.name = s.name; this.scene = JSON.parse(JSON.stringify(s.scene)); this.blocks = [...s.blocks]; this.render(); this.changed(); }
  del(i) { this.saved.splice(i, 1); store.set('scenes', this.saved); this.render(); }
  addToSet(minutes) {
    this.myset.items.push({ name: this.name, minutes, scene: JSON.parse(JSON.stringify(this.scene)), blocks: [...this.blocks] });
    store.set('myset', this.myset); this.render();
  }
  runSet() {
    const items = this.myset.items; if (!items.length) return;
    let at = 0; const chapters = [];
    const keep = { scene: this.scene, blocks: this.blocks, name: this.name };
    items.forEach((it) => {
      this.scene = it.scene; this.blocks = it.blocks; this.name = it.name;
      chapters.push({ ...this.toChapter(it.minutes), at, transition: 12, color: ['#86d3e8', '#cfc2ff', '#f0d49a', '#a6e3d0', '#ffc99a'][chapters.length % 5] });
      at += it.minutes * 60;
    });
    Object.assign(this, keep);
    const C = this.app.conductor;
    C.loadSet({ id: 'myset', title: 'Мой сет', subtitle: 'Собран в конструкторе', minutes: Math.round(at / 60), duration: at, base: 52, transpose: [0], chapters }, 1);
    C.start();
  }

  // ---------- Отрисовка ----------
  render() {
    const R = this.root; if (!R) return;
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    // палитра блоков
    const pal = R.querySelector('#bPalette'); pal.innerHTML = '';
    const cats = [...new Set(BLOCKS.map((b) => b.cat))];
    cats.forEach((cat) => {
      if (!BLOCKS.some((b) => b.cat === cat && !b.always)) return;
      const box = el('div', 'b-cat'); box.appendChild(el('h4', '', cat));
      BLOCKS.filter((b) => b.cat === cat && !b.always).forEach((b) => {
        const btn = el('button', 'b-add', b.name); btn.style.setProperty('--c', b.color);
        btn.disabled = this.blocks.includes(b.id);
        btn.addEventListener('click', () => this.add(b.id)); box.appendChild(btn);
      });
      pal.appendChild(box);
    });
    // блоки сцены
    const grid = R.querySelector('#bGrid'); grid.innerHTML = '';
    BLOCKS.filter((b) => b.always || this.blocks.includes(b.id)).forEach((b) => {
      const card = el('div', 'b-card'); card.style.setProperty('--c', b.color);
      const head = el('div', 'b-head'); head.appendChild(el('span', 'b-dot')); head.appendChild(el('span', 'b-name', b.name));
      if (!b.always) { const x = el('button', 'b-x', '✕'); x.title = 'Убрать блок'; x.addEventListener('click', () => this.remove(b.id)); head.appendChild(x); }
      card.appendChild(head);
      b.fields.forEach((f) => {
        const row = el('label', 'b-row'); row.appendChild(el('span', '', f.label));
        let input;
        const cur = get(this.scene, f.k);
        if (f.type === 'select') {
          input = el('select');
          f.options.forEach((o) => { const op = el('option', '', o.l); op.value = o.v; input.appendChild(op); });
          input.value = Array.isArray(cur) ? cur.join(',') : String(cur ?? '');
          if (input.selectedIndex < 0 && f.options[0]) input.value = f.options[0].v;
          input.addEventListener('change', () => { let v = input.value; if (['root', 'binaural', 'breath'].includes(f.k)) v = Number(v); set(this.scene, f.k, v); this.changed(); });
        } else {
          input = el('input'); input.type = 'range';
          input.min = f.type === 'level' ? 0 : f.min; input.max = f.type === 'level' ? f.max : f.max; input.step = f.type === 'level' ? 0.01 : f.step;
          input.value = cur ?? (f.type === 'level' ? 0.3 : f.min);
          input.addEventListener('input', () => { set(this.scene, f.k, Number(input.value)); this.changed(); });
        }
        row.appendChild(input); card.appendChild(row);
      });
      grid.appendChild(card);
    });
    R.querySelector('#bName').value = this.name;
    // сохранённые сцены
    const sv = R.querySelector('#bSaved'); sv.innerHTML = '';
    if (!this.saved.length) sv.appendChild(el('p', 'drawer-note', 'Сохранённых сцен пока нет. Соберите атмосферу и нажмите «Сохранить сцену».'));
    this.saved.forEach((s, i) => {
      const chip = el('span', 'b-chip'); const l = el('button', 'b-chip-l', s.name); l.addEventListener('click', () => this.load(i));
      const d = el('button', 'b-chip-x', '✕'); d.title = 'Удалить'; d.addEventListener('click', () => this.del(i));
      chip.append(l, d); sv.appendChild(chip);
    });
    // мой сет
    const ms = R.querySelector('#bSet'); ms.innerHTML = '';
    let total = 0;
    this.myset.items.forEach((it, i) => {
      total += it.minutes;
      const row = el('div', 'b-set-item');
      row.appendChild(el('span', 'b-set-n', `${i + 1}`));
      row.appendChild(el('span', 'b-set-name', it.name));
      const m = el('input'); m.type = 'number'; m.min = 1; m.max = 60; m.value = it.minutes; m.title = 'Минут';
      m.addEventListener('change', () => { it.minutes = Math.max(1, Number(m.value) || 1); store.set('myset', this.myset); this.render(); });
      const up = el('button', 'b-mini', '↑'), down = el('button', 'b-mini', '↓'), del = el('button', 'b-mini', '✕');
      up.title = 'Выше'; down.title = 'Ниже'; del.title = 'Убрать из сета';
      up.addEventListener('click', () => { if (i > 0) { const a = this.myset.items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; store.set('myset', this.myset); this.render(); } });
      down.addEventListener('click', () => { const a = this.myset.items; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; store.set('myset', this.myset); this.render(); } });
      del.addEventListener('click', () => { this.myset.items.splice(i, 1); store.set('myset', this.myset); this.render(); });
      row.append(m, el('span', 'b-set-min', 'мин'), up, down, del);
      ms.appendChild(row);
    });
    R.querySelector('#bTotal').textContent = this.myset.items.length ? `Всего ${total} мин` : 'Добавляйте сцены — из них сложится сет с плавными переходами.';
    R.querySelector('#bRunSet').disabled = !this.myset.items.length;
  }
}
