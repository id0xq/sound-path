// Интерфейс: связывает кнопки, купол, ханг и панели с аудиодвижком.
import { App } from './app.js';
import { SETS } from './sets.js';
import { SPACES } from './dsp.js';
import { TUNINGS } from './theory.js';
import { LIVE } from './live.js';
import { Sphere, KIND_COLORS } from './sphere.js';
import { fmtTime, noteName, tuning as A4, clamp } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = new App();
window.soundPath = app; // для отладки из консоли

// Офлайн-режим на опубликованной версии (на localhost не мешаем разработке)
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
let sphere, wakeLock = null, recWithSet = true, recFormat = 'wav', setId = 'walk30';
const store = {
  get(k, d) { try { const v = localStorage.getItem('zp:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('zp:' + k, JSON.stringify(v)); } catch (e) {} },
};

$('#enter').addEventListener('click', async () => {
  const btn = $('#enter'); btn.disabled = true; btn.textContent = 'Открываю пространство…';
  try {
    await app.init();
    await app.E.ctx.resume();
    boot();
    $('#gate').classList.add('hide');
    setTimeout(() => $('#gate').remove(), 1300);
  } catch (e) {
    console.error(e);
    $('#gateErr').hidden = false; $('#gateErr').textContent = 'Не удалось запустить звук: ' + e.message;
    btn.disabled = false; btn.textContent = 'Попробовать ещё раз';
  }
});

function boot() {
  const C = app.conductor, E = app.E;
  sphere = new Sphere($('#dome'), app);
  buildSpaces(); buildSets(); buildPads(); buildHang(); bindHang(); buildMixer(); bindVoice(); bindRecorder(); bindSettings(); bindPlacement(); bindKeys();

  C.on('load', renderSet);
  C.on('chapter', ({ idx, ch }) => {
    document.documentElement.style.setProperty('--chapter', ch.color || '#7fc4c0');
    sphere.tint = ch.color || '#7fc4c0';
    $('#cueTitle').textContent = ch.title; $('#cueText').textContent = ch.cue || '';
    $$('#chapters li').forEach((li, i) => { li.classList.toggle('now', i === idx); li.classList.toggle('done', i < idx); });
    buildHang();
  });
  C.on('state', syncTransport);
  C.on('end', () => {
    $('#cueNext').textContent = 'Сет завершён. Спасибо.';
    if (app.recorder.active && recWithSet) setTimeout(() => stopRecording(), 2500);
    releaseWake();
  });
  E.onSpace = (name) => $$('.space-chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.space === name)));
  E.onSpace(E.spaceName);

  const seed = Math.floor(Math.random() * 9000) + 1000;
  $('#seed').value = seed;
  C.load(setId, seed);
  setInterval(ui, 200);
  requestAnimationFrame(breathLoop);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && C.running) requestWake(); });
}

// ---------- Пространства ----------
function buildSpaces() {
  const box = $('#spaces'); box.innerHTML = '';
  for (const [k, s] of Object.entries(SPACES)) {
    const b = document.createElement('button');
    b.className = 'space-chip'; b.dataset.space = k; b.textContent = s.name; b.title = s.hint; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => app.E.setSpace(k, 4));
    box.appendChild(b);
  }
}

// ---------- Сеты ----------
function buildSets() {
  const box = $('#setPicker'); box.innerHTML = '';
  const all = [...SETS, { id: 'free', title: 'Свободная атмосфера', subtitle: 'Бесконечный поток, каждый раз новый', minutes: 0 }];
  for (const s of all) {
    const b = document.createElement('button');
    b.className = 'set-opt'; b.dataset.id = s.id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(s.id === setId));
    b.innerHTML = `<span class="t"></span><span class="m"></span><span class="s"></span>`;
    b.querySelector('.t').textContent = s.title; b.querySelector('.m').textContent = s.minutes ? s.minutes + ' мин' : '∞'; b.querySelector('.s').textContent = s.subtitle;
    b.addEventListener('click', () => {
      if (app.conductor.running && !confirm('Сейчас идёт сет. Завершить его и выбрать другой?')) return;
      setId = s.id; $$('.set-opt').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.id === s.id)));
      app.conductor.load(s.id, Number($('#seed').value) || 1);
    });
    box.appendChild(b);
  }
  $('#playBtn').addEventListener('click', startSet);
  $('#holdBtn').addEventListener('click', () => app.conductor.hold());
  $('#stopBtn').addEventListener('click', () => {
    app.conductor.stop();
    if (app.recorder.active && recWithSet) setTimeout(() => stopRecording(), 6500);
    releaseWake();
  });
  $('#dice').addEventListener('click', () => {
    const seed = Math.floor(Math.random() * 9000) + 1000; $('#seed').value = seed;
    if (!app.conductor.running) app.conductor.load(setId, seed);
  });
  $('#seed').addEventListener('change', () => { if (!app.conductor.running) app.conductor.load(setId, Number($('#seed').value) || 1); });
  $('#tempo').addEventListener('input', (e) => { const v = Number(e.target.value); $('#tempoOut').value = Math.round(v * 100) + '%'; app.conductor.setTempoFactor(v); });
}

async function startSet() {
  const C = app.conductor;
  if (C.running) return;
  await app.E.ctx.resume();
  if (!C.set) C.load(setId, Number($('#seed').value) || 1);
  C.start();
  if (recWithSet && !app.recorder.active) startRecording();
  requestWake();
}

function renderSet(set) {
  const ol = $('#chapters'); ol.innerHTML = '';
  set.chapters.forEach((ch, i) => {
    if (!isFinite(set.duration) && i > 8) return;
    const li = document.createElement('li');
    li.innerHTML = '<button><span class="pip"></span><span class="ct"></span><span class="cm"></span></button><span class="bar"></span>';
    li.querySelector('.ct').textContent = ch.title; li.querySelector('.cm').textContent = fmtTime(ch.at);
    li.querySelector('button').addEventListener('click', () => app.conductor.seek(i));
    li.querySelector('button').title = 'Перейти к главе «' + ch.title + '»';
    ol.appendChild(li);
  });
  $('#total').textContent = isFinite(set.duration) ? fmtTime(set.duration) : '∞';
  $('#elapsed').textContent = '0:00';
  const first = set.chapters[0];
  $('#cueTitle').textContent = set.title;
  $('#cueText').textContent = 'Первая глава — «' + first.title + '». ' + (first.cue || '');
  $('#cueNext').textContent = 'Нажмите «Начать сет», когда люди будут готовы.';
  document.documentElement.style.setProperty('--chapter', first.color);
  sphere.tint = first.color;
  $('#tempo').parentElement.querySelector('label').textContent = set.id === 'walk30' ? 'Темп шага' : 'Темп ритма';
  syncTransport(); buildHang();
}

function syncTransport() {
  const C = app.conductor;
  $('#playBtn').disabled = C.running; $('#playBtn').textContent = C.running ? 'Сет идёт' : C.elapsed > 0 ? 'Начать с этой главы' : 'Начать сет';
  $('#holdBtn').disabled = !C.running; $('#stopBtn').disabled = !C.running;
  $('#holdBtn').setAttribute('aria-pressed', String(C.held)); $('#holdBtn').textContent = C.held ? 'Продолжить сюжет' : 'Задержать главу';
}

// ---------- Обновление интерфейса ----------
function ui() {
  const C = app.conductor, set = C.set; if (!set) return;
  $('#elapsed').textContent = fmtTime(C.elapsed);
  const idx = C.chapterIdx;
  if (C.running && idx >= 0) {
    const ch = set.chapters[idx], next = set.chapters[idx + 1];
    const end = next ? next.at : set.duration;
    $('#cueTime').textContent = fmtTime(C.elapsed - ch.at) + (isFinite(end) ? ' / ' + fmtTime(end - ch.at) : '');
    if (C.held) $('#cueNext').textContent = 'Глава задержана — сюжет ждёт вас. Звук продолжает жить.';
    else if (next) $('#cueNext').textContent = 'Дальше «' + next.title + '» через ' + fmtTime(next.at - C.elapsed);
    else if (isFinite(set.duration)) $('#cueNext').textContent = 'Завершение через ' + fmtTime(set.duration - C.elapsed);
    const li = $$('#chapters li')[idx];
    if (li && isFinite(end)) li.querySelector('.bar').style.transform = `scaleX(${clamp((C.elapsed - ch.at) / (end - ch.at), 0, 1)})`;
  } else $('#cueTime').textContent = '';

  // голос
  const V = app.voice;
  if (V.enabled) {
    const w = clamp((V.levelDb + 60) / 60, 0, 1);
    $('#micMeter').style.width = (w * 100).toFixed(1) + '%';
    $('#micState').textContent = V.speaking > 0.5 ? 'Звучит голос — фон отступил' : V.levelDb > -20 ? 'Громко: отодвиньте микрофон' : 'Слушаю';
  }
  // запись
  const R = app.recorder;
  if (R.active) {
    $('#recTime').textContent = fmtTime(R.elapsed);
    const mb = R.sizeMB;
    $('#recNote').textContent = mb > 0 ? `В памяти ${mb.toFixed(0)} МБ` + (mb > 350 ? ' — для долгих сетов удобнее сжатый формат' : '') : '';
  }
}

function breathLoop() {
  const st = app.breath && app.breath.state(app.E.now);
  const el = $('#breath');
  if (st) {
    el.hidden = false; $('#breathWord').textContent = st.phase === 'in' ? 'вдох' : 'выдох';
    el.style.opacity = String(0.35 + 0.6 * st.k);
  } else el.hidden = true;
  requestAnimationFrame(breathLoop);
}

// ---------- Ханг ----------
const HANG_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'];
function buildHang() {
  const svg = $('#hang'); if (!svg || !app.live) return;
  const notes = app.live.notes();
  const n = notes.length - 1;
  const parts = [`<defs><radialGradient id="hangShell" cx="40%" cy="35%" r="75%"><stop offset="0%" stop-color="#5a4a33"/><stop offset="60%" stop-color="#3a3024"/><stop offset="100%" stop-color="#211c16"/></radialGradient></defs>`,
    '<circle class="shell" r="108"/>'];
  const pos = [];
  for (let i = 0; i < n; i++) {
    const step = Math.ceil(i / 2) * (i % 2 ? -1 : 1);
    const a = Math.PI + (step * 2 * Math.PI) / n;
    const r = 74, size = 21 - (i / n) * 6;
    pos.push({ x: Math.sin(a) * r, y: -Math.cos(a) * r, size, i: i + 1 });
  }
  const field = (x, y, rx, ry, i) => `<ellipse class="field" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx}" ry="${ry}"/>`
    + `<text x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}">${noteName(notes[i]).replace(/(\d)/, '<tspan font-size="7">$1</tspan>')}</text>`
    + (HANG_KEYS[i] ? `<text class="key" x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}">${HANG_KEYS[i].toUpperCase()}</text>` : '');
  parts.push(field(0, 0, 30, 30, 0));
  pos.forEach((p) => parts.push(field(p.x, p.y, p.size, p.size * 1.12, p.i)));
  svg.innerHTML = parts.join('');
  const T = TUNINGS[app.live.tuningKey];
  $('#hangName').textContent = (T ? T.name : '') + ', динг ' + noteName(notes[0]);
}
function hitHang(i, vel = 0.7) {
  app.live.handpan(i, vel);
  const f = $(`#hang .field[data-i="${i}"]`);
  if (f) { f.classList.add('hit'); setTimeout(() => f.classList.remove('hit'), 140); }
}
function bindHang() {
  const svg = $('#hang');
  svg.addEventListener('pointerdown', (e) => {
    const f = e.target.closest('.field'); if (!f) return;
    e.preventDefault();
    // сила удара: ближе к центру поля — мягче и круглее
    const r = f.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const vel = clamp(0.55 + Math.hypot(dx, dy) * 0.35, 0.45, 0.95);
    hitHang(Number(f.dataset.i), vel);
  });
}

// ---------- Пэды ----------
function buildPads() {
  const box = $('#pads'); box.innerHTML = '';
  for (const p of LIVE) box.appendChild(padBtn(p.id, p.name, p.key, KIND_COLORS[p.kind]));
  for (const s of app.live.samples) box.appendChild(padBtn(s.id, s.name, s.loop ? 'петля' : 'свой звук', '#ffffff'));
  const sel = $('#liveTuning');
  if (sel.options.length < 2) for (const [k, t] of Object.entries(TUNINGS)) { const o = document.createElement('option'); o.value = k; o.textContent = t.name; sel.appendChild(o); }
  sel.onchange = () => { app.live.tuning = sel.value; buildHang(); };
  $('#fileIn').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await app.live.addSample(file); buildPads(); } catch (err) { alert('Не получилось открыть файл: ' + err.message); }
    e.target.value = '';
  };
}
function padBtn(id, name, key, color) {
  const b = document.createElement('button');
  b.className = 'pad'; b.dataset.id = id; b.style.setProperty('--c', color);
  b.innerHTML = '<span class="n"></span><span class="k"></span><span class="sw"></span>';
  b.querySelector('.n').textContent = name; b.querySelector('.k').textContent = key;
  b.addEventListener('click', () => firePad(id));
  return b;
}
function firePad(id) {
  const res = app.live.play(id);
  const b = $(`.pad[data-id="${id}"]`); if (!b) return;
  const s = app.live.samples.find((x) => x.id === id);
  if (s) b.classList.toggle('on', !!s.playing);
  b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 160);
  return res;
}

// ---------- Размещение живых звуков ----------
function bindPlacement() {
  const hints = { around: 'Звуки появляются в случайных местах вокруг вас.', point: 'Коснитесь купола, чтобы выбрать точку, откуда будут звучать звуки.', orbit: 'Каждый звук облетает голову по кругу.' };
  $$('#placeMode button').forEach((b) => b.addEventListener('click', () => {
    $$('#placeMode button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    app.live.mode = b.dataset.mode; $('#placeHint').textContent = hints[b.dataset.mode];
  }));
  $('#elev').addEventListener('input', (e) => { app.live.elevation = Number(e.target.value); });
  sphere.onPick = ({ az, d }) => {
    app.live.point = { az, d, el: app.live.elevation };
    if (app.live.mode !== 'point') $$('#placeMode button')[1].click();
    $('#placeHint').textContent = `Точка выбрана: ${az > 5 ? 'справа' : az < -5 ? 'слева' : 'прямо'}${Math.abs(az) > 100 ? ' сзади' : ''}, ${d.toFixed(1)} м.`;
  };
}

// ---------- Клавиатура ----------
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    const hi = HANG_KEYS.indexOf(k);
    if (hi >= 0 && hi < app.live.notes().length) { hitHang(hi, 0.72); e.preventDefault(); return; }
    const p = LIVE.find((x) => x.key === k);
    if (p) { firePad(p.id); e.preventDefault(); }
  });
}

// ---------- Микшер ----------
function buildMixer() {
  const E = app.E, box = $('#faders');
  const saved = store.get('mix', {});
  const rows = [
    ['atmos', 'Атмосфера', 1], ['nature', 'Природа', 1], ['birds', 'Птицы', 1], ['instr', 'Инструменты сюжета', 1],
    ['rhythm', 'Ритм', 1], ['live', 'Живые звуки', 1], ['space', 'Пространство', 1], ['binaural', 'Бинауральный тон', 0.5], ['resonance', 'Резонанс мира', 1],
  ];
  for (const [k, name, def] of rows) {
    const v = saved[k] ?? def;
    const row = document.createElement('label'); row.className = 'fader';
    row.innerHTML = `<span>${name}</span><output></output><input type="range" min="0" max="1.5" step="0.01">`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.value = v;
    const apply = () => {
      const val = Number(input.value); out.value = Math.round(val * 100) + '%';
      if (k === 'space') E.setSpaceLevel({ user: val, tau: 0.1 });
      else if (k === 'binaural') { app.binaural.user = val; app.binaural.apply(0.3); }
      else E.setGroup(k, { user: val });
      saved[k] = val; store.set('mix', saved);
    };
    input.addEventListener('input', apply); apply();
    box.appendChild(row);
  }
  const toggle = (btn, panel) => {
    $(btn).addEventListener('click', () => {
      const open = $(panel).hidden; $$('.drawer').forEach((d) => (d.hidden = true)); $$('.top-tools .btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      $(panel).hidden = !open; $(btn).setAttribute('aria-expanded', String(open));
    });
  };
  toggle('#mixerBtn', '#mixer'); toggle('#settingsBtn', '#settings');
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => { b.closest('.drawer').hidden = true; $$('.top-tools .btn').forEach((x) => x.setAttribute('aria-expanded', 'false')); }));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.drawer').forEach((d) => (d.hidden = true)); });
  $('#hpVol').addEventListener('input', (e) => E.setHeadphones(Number(e.target.value)));
}

// ---------- Голос ----------
function bindVoice() {
  const V = app.voice;
  const saved = store.get('voice', {});
  Object.assign(V.settings, saved); V.applySettings();
  $$('[data-voice]').forEach((el) => {
    const key = el.dataset.voice;
    if (el.type === 'checkbox') { el.checked = !!V.settings[key]; el.addEventListener('change', () => { V.set(key, el.checked); save(); }); }
    else { el.value = V.settings[key]; el.addEventListener('input', () => { V.set(key, Number(el.value)); save(); }); }
  });
  function save() { store.set('voice', V.settings); }
  $('#micBtn').addEventListener('click', async () => {
    if (V.enabled) { V.disable(); $('#micBtn').textContent = 'Включить микрофон'; $('#micState').textContent = 'Микрофон выключен'; $('#micMeter').style.width = '0'; return; }
    try {
      $('#micState').textContent = 'Разрешите доступ к микрофону…';
      await V.enable($('#micSelect').value || undefined);
      $('#micBtn').textContent = 'Выключить';
      const devs = await V.devices(), sel = $('#micSelect'), cur = sel.value;
      sel.innerHTML = '<option value="">Микрофон по умолчанию</option>' + devs.map((d) => `<option value="${d.deviceId}">${escapeHtml(d.label || 'Микрофон')}</option>`).join('');
      sel.value = cur;
    } catch (e) {
      $('#micState').textContent = e.name === 'NotAllowedError' ? 'Доступ запрещён. Разрешите микрофон в настройках браузера для этой страницы.' : 'Микрофон не включился: ' + e.message;
    }
  });
  $('#micSelect').addEventListener('change', async () => { if (V.enabled) { await V.enable($('#micSelect').value || undefined); } });
}

// ---------- Запись ----------
function bindRecorder() {
  $$('#recFormat button').forEach((b) => b.addEventListener('click', () => {
    if (app.recorder.active) return;
    $$('#recFormat button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); recFormat = b.dataset.fmt;
  }));
  $('#recWithSet').addEventListener('change', (e) => { recWithSet = e.target.checked; });
  $('#recBtn').addEventListener('click', () => (app.recorder.active ? stopRecording() : startRecording()));
}
async function startRecording() {
  const R = app.recorder;
  try {
    const name = { walk30: 'progulka', love45: 'blagodarnost', free: 'atmosfera' }[setId] || 'sessiya';
    await R.start({ format: recFormat, voiceStem: $('#recStem').checked, name });
    $('#recBtn').setAttribute('aria-pressed', 'true'); $('#recLabel').textContent = 'Остановить запись';
    $('#recNote').textContent = '';
  } catch (e) { $('#recNote').textContent = 'Запись не началась: ' + e.message; }
}
async function stopRecording() {
  const R = app.recorder; if (!R.active) return;
  $('#recLabel').textContent = 'Сохраняю…';
  const takes = await R.stop();
  $('#recBtn').setAttribute('aria-pressed', 'false'); $('#recLabel').textContent = 'Начать запись'; $('#recNote').textContent = '';
  const ul = $('#takes');
  for (const t of takes.reverse()) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="tk-head"><span class="tk-name"></span><a download>Скачать</a></div><audio controls preload="none"></audio>';
    li.querySelector('.tk-name').textContent = `${t.kind === 'voice' ? 'Голос' : 'Микс'}, ${fmtTime(t.duration)}, ${(t.size / 1048576).toFixed(1)} МБ`;
    li.querySelector('.tk-name').title = t.name;
    const a = li.querySelector('a'); a.href = t.url; a.download = t.name;
    li.querySelector('audio').src = t.url;
    ul.prepend(li);
  }
}

// ---------- Настройки ----------
function bindSettings() {
  const E = app.E;
  const soft = store.get('softness', 0.6); $('#softness').value = soft; E.setSoftness(soft);
  $('#softness').addEventListener('input', (e) => { E.setSoftness(Number(e.target.value)); store.set('softness', Number(e.target.value)); });
  $$('#a4 button').forEach((b) => b.addEventListener('click', () => {
    $$('#a4 button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); A4.a4 = Number(b.dataset.a4); store.set('a4', A4.a4);
  }));
  const a4 = store.get('a4', 440); A4.a4 = a4; $$('#a4 button').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.a4) === a4)));
  $('#hrtf').addEventListener('change', (e) => { E.hrtf = e.target.checked; });
  $('#binauralOn').addEventListener('change', (e) => { app.binaural.enabled = e.target.checked; app.binaural.apply(0.5); });
  $('#wake').addEventListener('change', (e) => { if (!e.target.checked) releaseWake(); else if (app.conductor.running) requestWake(); });
}

async function requestWake() {
  if (!$('#wake').checked || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
