// Интерфейс: связывает кнопки, купол, ханг и панели с аудиодвижком.
import { App } from './app.js';
import { SETS } from './sets.js';
import { BRAINWAVES } from './live.js';
import { motionAvailable } from './headtrack.js';
import { SPACES } from './dsp.js';
import { TUNINGS } from './theory.js';
import { LIVE } from './live.js';
import { Sphere, KIND_COLORS } from './sphere.js';
import { fmtTime, noteName, tuning as A4, clamp } from './util.js';
import { Breathwork, PROGRAMS } from './breath.js';
import { Builder } from './builder.js';
import { PATH_VOICES } from './path.js';

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
  // датчики поворота: iPhone спрашивает разрешение только прямо в ответ на нажатие
  let motion = null;
  if (motionAvailable() && store.get('headAuto', true)) {
    const D = window.DeviceOrientationEvent;
    motion = typeof D.requestPermission === 'function' ? D.requestPermission().then((r) => r === 'granted').catch(() => false) : Promise.resolve(true);
  }
  try {
    $('#gateProgress').hidden = false;
    await app.init((k) => { $('#gateProgress div').style.width = Math.round(k * 100) + '%'; });
    if (motion) { app.head.permission = motion; app.head.startGyro().catch(() => {}); }
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
  app.breathwork = new Breathwork(app);
  bindLines(); bindNarrator(); bindHead(); bindViz(); bindTabs(); bindBreath(); bindBuilder(); bindMedia(); bindWaves(); bindPath(); bindNow();

  C.on('load', renderSet);
  C.on('chapter', ({ idx, ch }) => {
    document.documentElement.style.setProperty('--chapter', ch.color || '#7fc4c0');
    sphere.tint = ch.color || '#7fc4c0';
    $('#cueTitle').textContent = ch.title;
    if (!C.lines.length || C.shownLine < 0) $('#cueText').textContent = ch.cue || '';
    $$('#chapters li').forEach((li, i) => { li.classList.toggle('now', i === idx); li.classList.toggle('done', i < idx); });
    buildHang();
  });
  C.on('state', syncTransport);
  C.on('line', renderLine);
  C.on('end', () => {
    $('#cueNext').textContent = 'Сет завершён. Спасибо.';
    if (app.recorder.active && recWithSet) setTimeout(() => stopRecording(), 2500);
    releaseWake();
  });
  E.onSpace = (name) => {
    $$('.space-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.space === name)));
    $('#spaceName').textContent = (SPACES[name] && SPACES[name].name) || name;
  };
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
  const box = $('#spaces'), btn = $('#spaceBtn'); box.innerHTML = '';
  for (const [k, sp] of Object.entries(SPACES)) {
    const b = document.createElement('button');
    b.className = 'space-opt'; b.dataset.space = k; b.setAttribute('role', 'radio');
    b.innerHTML = '<span class="dot"></span><span class="n"></span><span class="h"></span>';
    b.querySelector('.n').textContent = sp.name; b.querySelector('.h').textContent = sp.hint;
    b.addEventListener('click', () => { app.E.setSpace(k, 4); close(); });
    box.appendChild(b);
  }
  const close = () => { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); const open = box.hidden; box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (e) => { if (!box.hidden && !box.contains(e.target)) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// ---------- Сеты ----------
function buildSets() {
  const sel = $('#setSelect'); sel.innerHTML = '';
  const all = [...SETS, { id: 'free', group: 'Свободно', title: 'Свободная атмосфера', subtitle: 'Бесконечный поток, каждый раз новый', minutes: 0 }];
  const groups = {};
  for (const st of all) {
    const g = groups[st.group || 'Сеты'] || (groups[st.group || 'Сеты'] = Object.assign(document.createElement('optgroup'), { label: st.group || 'Сеты' }));
    const o = document.createElement('option'); o.value = st.id; o.textContent = st.title + (st.minutes ? ' · ' + Math.round(st.minutes * 0.92) + ' мин' : ' · ∞');
    g.appendChild(o);
  }
  Object.values(groups).forEach((g) => sel.appendChild(g));
  sel.value = setId;
  const desc = () => { const st = all.find((x) => x.id === sel.value); $('#setDesc').textContent = st ? st.subtitle : ''; };
  desc();
  sel.addEventListener('change', () => {
    if (app.conductor.running && !confirm('Сейчас идёт сет. Завершить его и выбрать другой?')) { sel.value = setId; return; }
    setId = sel.value; desc();
    app.conductor.load(setId, Number($('#seed').value) || 1);
  });
  $('#playBtn').addEventListener('click', () => startSet(false));
  $('#guidedBtn').addEventListener('click', () => startSet(true));
  $('#holdBtn').addEventListener('click', () => app.conductor.hold());
  $('#stopBtn').addEventListener('click', () => {
    if (paused) setPaused(false);
    app.conductor.stop(); app.narrator.stop(); if (app.breathwork.active) app.breathwork.stop(true);
    if (app.recorder.active && recWithSet) setTimeout(() => stopRecording(), 6500);
    releaseWake();
  });
  $('#dice').addEventListener('click', () => {
    const seed = Math.floor(Math.random() * 9000) + 1000; $('#seed').value = seed;
    if (!app.conductor.running) app.conductor.load(setId, seed);
  });
  $('#seed').addEventListener('change', () => { if (!app.conductor.running) app.conductor.load(setId, Number($('#seed').value) || 1); });
  $('#storySpeed').addEventListener('input', (e) => { const v = Number(e.target.value); $('#storySpeedOut').value = Math.round(v * 100) + '%'; app.conductor.speed = v; });
  $('#tempo').addEventListener('input', (e) => { const v = Number(e.target.value); $('#tempoOut').value = Math.round(v * 100) + '%'; app.conductor.setTempoFactor(v); });
}

// на телефоне после старта меню режима сворачивается — видны слова, купол и пауза внизу
function foldPanelOnPhone() { if (window.matchMedia('(max-width: 820px)').matches) { $('#modePanel').open = false; window.scrollTo({ top: 0, behavior: 'smooth' }); } }
async function startSet(withVoice) {
  const C = app.conductor;
  if (C.running) return;
  app.narrator.on = !!withVoice; $('#narrOn').checked = !!withVoice;
  if ('speechSynthesis' in window && withVoice) speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); // разрешение звука речи на iPhone
  await app.E.ctx.resume();
  if (!C.set || /^(path|breath-)/.test(C.set.id)) C.load(setId, Number($('#seed').value) || 1);
  C.start(); foldPanelOnPhone();
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

// ---------- Сердце и волны мозга ----------
function bindWaves() {
  const L = app.live, hb = $('#heartBtn');
  const toggle = () => { const on = !L.heart.on; L.setHeart(on); hb.setAttribute('aria-pressed', String(on)); hb.classList.toggle('on', on); };
  hb.addEventListener('click', toggle);
  $$('#heartRate button').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.bpm === 'set' ? 'set' : Number(b.dataset.bpm); L.heart.bpm = v;
    $$('#heartRate button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  const box = $('#brainWaves'), hint = $('#wavesHint'), base = hint.textContent;
  for (const w of BRAINWAVES) {
    const b = document.createElement('button'); b.dataset.w = w.id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(w.id === 'off'));
    b.textContent = w.name; if (w.hint) b.title = w.hint;
    b.addEventListener('click', () => {
      app.binaural.setOverride(w.hz);
      $$('#brainWaves button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      hint.textContent = w.hz ? `${w.name}: ${w.hint}. Слышно только в наушниках. Громкость — «Бинауральный тон» в микшере.` : base;
    });
    box.appendChild(b);
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyY' || e.repeat) return;
    const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    toggle();
  });
}

// ---------- Плеер «Сейчас звучит»: пауза всегда под рукой, в любом режиме ----------
function updateNow() {
  const C = app.conductor, B = app.breathwork, P = app.path, bar = $('#nowBar');
  const active = !!(C.running || (B && B.active) || (P && P.active));
  bar.hidden = !active; document.body.classList.toggle('has-now', active);
  if (!active) return;
  let title, sub;
  if (P && P.active) { title = 'Путь · мир через микрофон'; sub = ((SPACES[app.E.spaceName] || {}).name || '') + ' · ' + fmtTime(C.elapsed); }
  else if (B && B.active) { const st = B.state(app.E.now); title = 'Дыхание · ' + (B.P ? B.P.name : ''); sub = (st && st.label ? st.label + ' · ' : '') + Math.round(B.progress(app.E.now) * 100) + '%'; }
  else { const ch = C.chapter; title = (C.set ? C.set.title : '') + (ch ? ' · ' + ch.title : ''); sub = fmtTime(C.elapsed) + (isFinite(C.duration) ? ' из ' + fmtTime(C.duration) : '') + (C.held ? ' · глава задержана' : ''); }
  $('#nowTitle').textContent = title; $('#nowSub').textContent = sub;
  $('#nowPause').textContent = paused ? 'Продолжить' : 'Пауза';
}
function bindNow() {
  $('#nowPause').addEventListener('click', togglePause);
  $('#nowStop').addEventListener('click', () => {
    if (app.path.active) $('#pathStop').click();
    else if (app.breathwork.active) $('#bwStop').click();
    else $('#stopBtn').click();
  });
  setInterval(updateNow, 250);
}

// ---------- Пауза и фоновая работа ----------
// Пауза замирает весь звук вместе с сюжетом и дыханием: время сета стоит, после «Продолжить» всё идёт с того же места.
let paused = false;
async function setPaused(p) {
  const E = app.E; paused = p;
  try { if (p) await E.ctx.suspend(); else await E.ctx.resume(); } catch (e) {}
  if ('speechSynthesis' in window) { try { p ? speechSynthesis.pause() : speechSynthesis.resume(); } catch (e) {} }
  for (const id of ['#pauseBtn', '#bwPause']) { const b = $(id); if (b) { b.textContent = p ? 'Продолжить' : 'Пауза'; b.setAttribute('aria-pressed', String(p)); } }
  document.body.classList.toggle('is-paused', p);
  syncTransport();
}
function togglePause() { if (app.conductor.running || (app.breathwork && app.breathwork.active)) setPaused(!paused); }
// Экран блокировки, наушники и медиаклавиши: пауза, продолжить, следующая и предыдущая глава
function updateMedia() {
  if (!('mediaSession' in navigator)) return;
  const C = app.conductor, B = app.breathwork, active = C.running || (B && B.active);
  try {
    navigator.mediaSession.playbackState = !active ? 'none' : paused ? 'paused' : 'playing';
    if (active && C.set) {
      const ch = C.chapter;
      navigator.mediaSession.metadata = new MediaMetadata({ title: ch ? ch.title : C.set.title, artist: C.set.title, album: 'Звуковой путь',
        artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] });
    }
  } catch (e) {}
}
function bindMedia() {
  $('#pauseBtn').addEventListener('click', togglePause);
  $('#bwPause').addEventListener('click', togglePause);
  if ('mediaSession' in navigator) {
    const C = app.conductor;
    const h = { play: () => paused && setPaused(false), pause: () => !paused && togglePause(), stop: () => $('#stopBtn').click(),
      nexttrack: () => C.set && C.seek(C.chapterIdx + 1), previoustrack: () => C.set && C.seek(Math.max(0, C.chapterIdx - 1)) };
    for (const [k, f] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(k, f); } catch (e) {} }
  }
  // вернуться к звуку после звонка, сворачивания или блокировки экрана, если пользователь не ставил паузу
  const wake = () => { const ctx = app.E.ctx; if (!paused && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  window.addEventListener('pageshow', wake); window.addEventListener('focus', wake);
  app.E.ctx.addEventListener('statechange', () => { if (app.E.ctx.state === 'interrupted') setTimeout(wake, 800); });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag)) return;
    if (app.conductor.running || (app.breathwork && app.breathwork.active)) { e.preventDefault(); togglePause(); }
  });
}

function syncTransport() {
  const C = app.conductor;
  $('#playBtn').disabled = C.running; $('#guidedBtn').disabled = C.running;
  $('#guidedBtn').textContent = C.running ? (app.narrator.on ? 'Ведущий ведёт медитацию' : 'Сет идёт') : C.elapsed > 0 ? 'Медитация с голосом с этой главы' : 'Медитация с голосом';
  $('#playBtn').textContent = C.running ? 'Сет идёт' : C.elapsed > 0 ? 'Начать с этой главы' : 'Начать сет';
  $('#holdBtn').disabled = !C.running || paused; $('#stopBtn').disabled = !C.running; $('#pauseBtn').disabled = !C.running;
  updateMedia();
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
    $('#cueNext').classList.toggle('go', !!(C.running && next && !C.held));
    if (C.held) $('#cueNext').textContent = 'Глава задержана — сюжет ждёт вас. Звук продолжает жить.';
    else if (next) $('#cueNext').textContent = (C.running ? 'Перейти к «' + next.title + '» →  ' : 'Дальше «' + next.title + '» ') + 'через ' + fmtTime(next.at - C.elapsed);
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
  const parts = [`<defs><radialGradient id="hangShell" cx="40%" cy="35%" r="75%"><stop offset="0%" stop-color="#9a93bd"/><stop offset="55%" stop-color="#55507a"/><stop offset="100%" stop-color="#2a2742"/></radialGradient></defs>`,
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
  const box = $('#pads'); box.innerHTML = ''; const heal = $('#padsHeal'); heal.innerHTML = '';
  for (const p of LIVE) (p.heal ? heal : box).appendChild(padBtn(p.id, p.name, p.key, KIND_COLORS[p.kind]));
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
    // физическая клавиша: работает и в русской раскладке
    const code = e.code || '', PUNCT = { Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=' };
    const k = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : PUNCT[code] || e.key.toLowerCase();
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
    ['atmos', 'Атмосфера', 1], ['nature', 'Природа', 1], ['birds', 'Птицы и животные', 1], ['instr', 'Инструменты сюжета', 1],
    ['rhythm', 'Ритм', 1], ['groove', 'Грув: барабаны, бас, клавиши', 1], ['live', 'Живые звуки', 1], ['space', 'Пространство', 1], ['atmosTail', 'Атмосферный хвост', 1],
    ['narrator', 'Голос ведущего', 1], ['binaural', 'Бинауральный тон', 0.5], ['resonance', 'Резонанс мира', 1],
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
      else if (k === 'atmosTail') E.setAtmosLevel(val);
      else if (k === 'narrator') app.narrator.out.gain.setTargetAtTime(1.15 * val, E.now, 0.05);
      else { E.setGroup(k, { user: val }); if (k === 'birds') E.setGroup('deep', { user: val }); }
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
  toggle('#mixerBtn', '#mixer'); toggle('#settingsBtn', '#settings'); toggle('#narratorBtn', '#narratorPanel');
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
    if (V.enabled) { V.disable(); $('#micBtn').textContent = 'Включить'; $('#micState').textContent = 'Микрофон выключен'; $('#micMeter').style.width = '0'; return; }
    try {
      $('#micState').textContent = 'Разрешите доступ к микрофону…';
      await V.enable($('#micSelect').value || undefined);
      $('#micBtn').textContent = 'Выключить';
      const devs = await V.devices(), sel = $('#micSelect'), cur = sel.value;
      sel.innerHTML = '<option value="">Микрофон</option>' + devs.map((d) => `<option value="${d.deviceId}">${escapeHtml(d.label || 'Микрофон')}</option>`).join('');
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
  const soft = store.get('softness2', 0.4); $('#softness').value = soft; E.setSoftness(soft);
  $('#softness').addEventListener('input', (e) => { E.setSoftness(Number(e.target.value)); store.set('softness2', Number(e.target.value)); });
  $$('#a4 button').forEach((b) => b.addEventListener('click', () => {
    $$('#a4 button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); A4.a4 = Number(b.dataset.a4); store.set('a4', A4.a4);
  }));
  const a4 = store.get('a4', 440); A4.a4 = a4; $$('#a4 button').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.a4) === a4)));
  $('#hrtf').addEventListener('change', (e) => { E.hrtf = e.target.checked; });
  $('#dissolveBtn').addEventListener('click', () => E.dissolve(10));
  $('#fast').checked = store.get('fast', false);
  $('#fast').addEventListener('change', (e) => { store.set('fast', e.target.checked); $('#fastNote').hidden = false; });
  $('#binauralOn').addEventListener('change', (e) => { app.binaural.enabled = e.target.checked; app.binaural.apply(0.5); });
  $('#wake').addEventListener('change', (e) => { if (!e.target.checked) releaseWake(); else if (app.conductor.running) requestWake(); });
}

async function requestWake() {
  if (!$('#wake').checked || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Реплики ведущего (телесуфлёр) ----------
function renderLine({ idx, manual } = {}) {
  const C = app.conductor, L = C.lines;
  const i = idx ?? C.shownLine;
  const cur = L[i];
  const el = $('#cueText');
  const text = cur ? cur.text : C.running ? ((C.chapter && C.chapter.cue) || '') : (C.set ? 'Нажмите «Начать сет» — здесь появятся слова для проводника. Их можно листать вперёд и назад.' : '');
  if (el.textContent !== text) {
    el.classList.add('fade');
    setTimeout(() => { el.textContent = text; el.classList.remove('fade'); }, manual ? 60 : 380);
  }
  const next = L[i + 1];
  $('#cuePrev').textContent = next ? 'Следом: ' + next.text : '';
  const ahead = C.viewIdx !== null && C.viewIdx > C.lineIdx, behind = C.viewIdx !== null && C.viewIdx < C.lineIdx;
  $('#cueCount').textContent = L.length ? `${Math.max(0, i + 1)} из ${L.length}${ahead ? ' · вы впереди сюжета' : behind ? ' · нажмите, чтобы вернуться к сюжету' : ''}` : '';
  $('#linePrev').disabled = i <= 0; $('#lineNext').disabled = i >= L.length - 1;
  cueFoot();
}
// листать реплики имеет смысл только в сете со словами
function cueFoot() {
  const C = app.conductor, own = C.set && !/^(path|breath-)/.test(C.set.id);
  $('#cueFoot').hidden = !(own && C.lines.length && (C.running || !$('#tabSets').hidden));
}
function bindLines() {
  $('#linePrev').addEventListener('click', () => app.conductor.stepLine(-1));
  $('#lineNext').addEventListener('click', () => app.conductor.stepLine(1));
  $('#cueCount').addEventListener('click', () => app.conductor.followLine());
  // перейти к следующей главе: музыка мягко перетекает за 8–13 секунд, без резких перепадов
  $('#cueNext').addEventListener('click', () => {
    const C = app.conductor; if (!C.running || C.held || !C.set) return;
    const i = C.chapterIdx + 1; if (i >= C.set.chapters.length) return;
    C.seek(i, 14 + Math.random() * 4);
  });
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' && e.target.type === 'text') return;
    if (e.key === 'ArrowLeft') { app.conductor.stepLine(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { app.conductor.stepLine(1); e.preventDefault(); }
  });
}

// ---------- Голос ведущего ----------
function bindNarrator() {
  const N = app.narrator;
  const saved = store.get('narr', {});
  N.rate = saved.rate ?? 0.86; N.volume = saved.volume ?? 1;
  $('#narrRate').value = N.rate; $('#narrVol').value = N.volume;
  const fillVoices = () => {
    const list = N.systemVoices(), sel = $('#sysVoice');
    sel.innerHTML = list.length ? list.map((v, i) => `<option value="${i}">${escapeHtml(v.name)}</option>`).join('') : '<option>Русских голосов в системе нет</option>';
    const want = saved.voice && list.findIndex((v) => v.name === saved.voice);
    if (want >= 0) { sel.value = want; N.sysVoice = list[want]; } else if (list[0]) N.sysVoice = list[0];
  };
  fillVoices(); if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', fillVoices);
  if (N.packs.length) {
    $('#packRow').hidden = false;
    $('#packSel').innerHTML = '<option value="">не использовать</option>' + N.packs.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    $('#packSel').value = N.pack;
    $('#packSel').addEventListener('change', (e) => { N.pack = e.target.value; });
  }
  const save = () => store.set('narr', { rate: N.rate, volume: N.volume, voice: N.sysVoice && N.sysVoice.name });
  $('#sysVoice').addEventListener('change', (e) => { N.sysVoice = N.systemVoices()[+e.target.value]; save(); });
  $('#narrRate').addEventListener('input', (e) => { N.rate = +e.target.value; save(); });
  $('#narrVol').addEventListener('input', (e) => { N.volume = +e.target.value; save(); });
  $('#narrOn').addEventListener('change', (e) => { N.on = e.target.checked; if (!N.on) N.stop(); syncTransport(); });
  $('#narrTest').addEventListener('click', () => {
    const C = app.conductor, line = C.lines[Math.max(0, C.shownLine)] || { text: 'Сделайте медленный вдох… и мягкий выдох.', key: 'test' };
    const was = N.on; N.on = true; N.speak(line, C.set ? C.set.id : 'test'); N.on = was;
  });
  app.conductor.on('load', renderOwnLines);
  renderOwnLines();
}
function renderOwnLines() {
  const C = app.conductor, N = app.narrator, ol = $('#ownLines'); if (!ol || !C.set) return;
  ol.innerHTML = '';
  let lastCh = -1;
  C.lines.forEach((ln) => {
    const key = `${C.set.id}:${ln.key}`, li = document.createElement('li');
    if (ln.ci !== lastCh) { const h = document.createElement('span'); h.className = 'ch'; h.textContent = C.set.chapters[ln.ci].title; li.appendChild(h); lastCh = ln.ci; }
    const tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = ln.text;
    const act = document.createElement('span'); act.className = 'act';
    const rec = document.createElement('button'), play = document.createElement('button'), del = document.createElement('button');
    rec.textContent = '● запись'; play.textContent = '▶'; del.textContent = '✕';
    play.title = 'Послушать'; del.title = 'Удалить запись';
    const sync = () => { const has = N.ownKeys.has(key); play.hidden = del.hidden = !has; rec.classList.toggle('has', has); rec.textContent = has ? '● заново' : '● запись'; };
    rec.addEventListener('click', async () => {
      try {
        if (N.rec && N.rec.key === key) { await N.stopRecording(); rec.classList.remove('rec-on'); sync(); return; }
        if (N.rec) return;
        await N.startRecording(key); rec.classList.add('rec-on'); rec.textContent = '■ стоп';
      } catch (e) { alert('Не получилось записать: ' + e.message); }
    });
    play.addEventListener('click', () => N.previewOwn(key));
    del.addEventListener('click', async () => { await N.removeOwn(key); sync(); });
    act.append(rec, play, del); sync();
    li.append(tx, act); ol.appendChild(li);
  });
}

// ---------- Поворот головы ----------
function bindHead() {
  const H = app.head, box = $('#headAuto'), note = $('#headNote');
  app.onHead = () => {};
  const can = motionAvailable();
  box.checked = can && store.get('headAuto', true);
  note.textContent = can ? 'Включается сам на телефоне. «Вперёд» мягко подстраивается под направление, куда вы идёте.'
    : 'Работает на телефоне и планшете: там включается сам. Датчики наушников браузер сайтам не передаёт.';
  box.disabled = !can;
  box.addEventListener('change', async () => {
    store.set('headAuto', box.checked);
    if (!box.checked) { H.stop(); return; }
    try { await H.startGyro(); } catch (e) { box.checked = false; note.textContent = 'Не получилось: ' + e.message; }
  });
}

// ---------- Виды визуализации ----------
function bindViz() {
  let saved = store.get('viz', 'dome'); if (!['dome', 'field', 'lissajous', 'chladni'].includes(saved)) saved = 'dome';
  const set = (m) => { sphere.setMode(m); $$('#vizModes button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.viz === m))); store.set('viz', m); };
  $$('#vizModes button').forEach((b) => b.addEventListener('click', () => set(b.dataset.viz)));
  set(saved);
}

// ---------- Вкладки «Сеты / Дыхание» ----------
function bindTabs() {
  $$('#modeTabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#modeTabs button').forEach((x) => { const on = x === b; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-selected', String(on)); });
    showTab(b.dataset.tab);
  }));
  // центр: звук вокруг или ханг
  const view = (v) => {
    $$('#stageSwitch button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.view === v)));
    $('#viewSpace').hidden = v !== 'space'; $('#viewHang').hidden = v !== 'hang'; $('#vizModes').hidden = v !== 'space';
    store.set('stage', v); if (v === 'space') sphere.resize();
  };
  $$('#stageSwitch button').forEach((b) => b.addEventListener('click', () => view(b.dataset.view)));
  view(store.get('stage', 'space'));
  // звуки: инструменты, звукотерапия, сердце
  $$('#soundTabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#soundTabs button').forEach((x) => { const on = x === b; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-selected', String(on)); });
    $$('#soundsCard [data-st]').forEach((el) => { if (el.tagName !== 'BUTTON') el.hidden = el.dataset.st !== b.dataset.st; });
  }));
  // на телефоне блоки свёрнуты — открываются по касанию
  if (window.matchMedia('(max-width: 820px)').matches) ['#voiceCard', '#recCard', '#soundsCard', '#chaptersWrap'].forEach((id) => { $(id).open = false; });
  // на компьютере всё разложено под экран: блоки не сворачиваются (только на телефоне и планшете)
  const desk = window.matchMedia('(min-width: 1025px)');
  const keepOpen = () => { if (desk.matches) $$('details.card, details.chapters-wrap').forEach((d) => { d.open = true; }); };
  $$('details.card, details.chapters-wrap').forEach((d) => d.addEventListener('toggle', () => { if (desk.matches && !d.open) d.open = true; }));
  desk.addEventListener('change', keepOpen); keepOpen();
}
let cueBorrowed = false;
function showTab(tab) {
  $$('#modeTabs button').forEach((x) => { const on = x.dataset.tab === tab; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-selected', String(on)); });
  $('#tabSets').hidden = tab !== 'sets'; $('#tabBreath').hidden = tab !== 'breath'; $('#tabPath').hidden = tab !== 'path';
  $('#panelTitle').textContent = { sets: 'Сет', breath: 'Дыхание', path: 'Путь' }[tab];
  $('#modePanel').open = true;
  $$('#micMode button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.mic === (tab === 'path' ? 'path' : 'voice'))));
  cueFoot();
  // в тишине вкладка показывает своё: выбранный сет, практику или путь
  const C = app.conductor, idle = !C.running && !app.breathwork.active && !app.path.active;
  if (!idle) return;
  if (tab === 'sets') {
    if (!C.set || /^(path|breath-)/.test(C.set.id)) C.load(setId, Number($('#seed').value) || 1);
    else if (cueBorrowed) C.load(C.set, C.seed); // вернуть сету его заголовок и слова
    cueBorrowed = false;
    return;
  }
  cueBorrowed = true;
  const cue = (title, text, prev, next) => { $('#cueTitle').textContent = title; $('#cueText').textContent = text; $('#cuePrev').textContent = prev; $('#cueNext').textContent = next; $('#cueCount').textContent = ''; };
  if (tab === 'breath') { const P = PROGRAMS.find((p) => p.id === breathId); if (P) cue(P.name, P.about, P.rhythm, 'Нажмите «Начать», когда будете готовы.'); }
  if (tab === 'path') cue('Путь', 'Наденьте наушники и включите путь: голос, шаги и звуки вокруг превращаются в музыку в выбранном строе.', '', '');
}

// ---------- Путь: мир через микрофон превращается в музыку ----------
function bindPath() {
  const P = app.path, V = app.voice;
  const tSel = $('#pathTuning'), rSel = $('#pathRoot'), vSel = $('#pathVoice');
  for (const [k, t] of Object.entries(TUNINGS)) tSel.appendChild(Object.assign(document.createElement('option'), { value: k, textContent: t.name + ' — ' + t.mood }));
  ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'].forEach((n, i) => rSel.appendChild(Object.assign(document.createElement('option'), { value: 48 + i, textContent: n })));
  for (const [k, n] of Object.entries(PATH_VOICES)) vSel.appendChild(Object.assign(document.createElement('option'), { value: k, textContent: n }));
  const saved = store.get('path', {});
  tSel.value = saved.tuning || 'amara'; rSel.value = saved.root || 50; vSel.value = saved.voice || 'handpan';
  const opts = () => ({ tuning: tSel.value, root: Number(rSel.value), voice: vSel.value, melody: Number($('#pathMelody').value), drone: Number($('#pathDrone').value), space: app.E.spaceName || 'cloud' });
  const save = () => store.set('path', { tuning: tSel.value, root: rSel.value, voice: vSel.value });
  [tSel, rSel].forEach((el) => el.addEventListener('change', () => { save(); P.update(opts()); }));
  vSel.addEventListener('change', () => { save(); P.opts.voice = vSel.value; });
  $('#pathMelody').addEventListener('input', (e) => { P.opts.melody = Number(e.target.value); });
  $('#pathDrone').addEventListener('input', (e) => { P.update({ drone: Number(e.target.value) }); });
  $('#pathTransform').addEventListener('input', (e) => V.set('pathTransform', Number(e.target.value)));
  $('#pathAtmos').addEventListener('input', (e) => V.set('pathAtmos', Number(e.target.value)));
  $('#pathDry').addEventListener('input', (e) => V.set('pathDry', Number(e.target.value)));
  const sync = () => { $('#pathStart').disabled = P.active; $('#pathStop').disabled = !P.active; $('#playBtn').disabled = P.active || app.conductor.running; };
  P.onNote = (name) => { $('#pathHint').textContent = 'Мир звучит: ' + name; };
  P.onKey = (r) => { rSel.value = r; save(); $('#pathHint').textContent = 'Путь перешёл в тональность ' + rSel.options[rSel.selectedIndex].text; };
  $('#pathStart').addEventListener('click', async () => {
    if (app.conductor.running && !confirm('Сейчас идёт сет. Завершить его и начать путь?')) return;
    if (app.breathwork.active) app.breathwork.stop(true);
    $('#pathHint').textContent = 'Включаю микрофон… Наденьте наушники.';
    try {
      await P.start(opts(), $('#micSelect').value || undefined); foldPanelOnPhone();
      $('#micBtn').textContent = 'Выключить';
      $('#pathHint').textContent = 'Слушаю мир. Говорите, дышите, идите — всё превращается в музыку.';
      if (recWithSet && !app.recorder.active) startRecording();
      requestWake();
    } catch (e) { $('#pathHint').textContent = 'Микрофон не включился: ' + e.message; }
    sync();
  });
  $('#pathStop').addEventListener('click', () => { P.stop(); $('#pathHint').textContent = 'Путь завершён.'; setTimeout(() => { if (!P.active && !app.conductor.running && !app.breathwork.active && $('#tabPath').hidden) app.conductor.load(setId, Number($('#seed').value) || 1); }, 1500); if (app.recorder.active && recWithSet) setTimeout(() => stopRecording(), 6500); sync(); });
  $('#pathFreeze').addEventListener('click', () => app.E.dissolve(12));
  // режим микрофона в карточке голоса
  $$('#micMode button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.mic === 'path') showTab('path');
    else { if (P.active) { P.stop(); sync(); } V.set('mode', 'voice'); showTab('sets'); }
  }));
  app.conductor.on('load', (set) => { if (P.active && set.id !== 'path') { P.active = false; clearInterval(P.timer); V.set('mode', 'voice'); sync(); } });
  sync();
}

// ---------- Дыхательные практики ----------
let breathId = 'coherence', vizBefore = 'dome';
let bwSound = 'hang';
function bindBreath() {
  bwSound = store.get('bwSound', 'hang');
  $$('#bwSound button').forEach((btn) => btn.addEventListener('click', () => {
    bwSound = btn.dataset.sound; store.set('bwSound', bwSound);
    $$('#bwSound button').forEach((x) => x.setAttribute('aria-checked', String(x === btn)));
    if (app.breathwork) app.breathwork.opts.sound = bwSound;
  }));
  $$('#bwSound button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.sound === bwSound)));
  const B = app.breathwork, list = $('#breathSelect');
  PROGRAMS.forEach((P) => list.appendChild(Object.assign(document.createElement('option'), { value: P.id, textContent: P.name + ' · ' + P.rhythm })));
  list.addEventListener('change', () => { breathId = list.value; render(); });
  const render = () => {
    list.value = breathId;
    const P = PROGRAMS.find((p) => p.id === breathId), box = $('#breathDetail');
    box.innerHTML = '';
    const pg = document.createElement('p'); pg.textContent = P.goal; pg.style.fontWeight = '500'; box.appendChild(pg);
    const pa = document.createElement('p'); pa.textContent = P.about; box.appendChild(pa);
    if (P.intense) {
      const w = document.createElement('p'); w.className = 'warn';
      w.textContent = 'Интенсивная практика: только сидя или лёжа, никогда в воде и за рулём. Не подходит при беременности, эпилепсии, болезнях сердца и высоком давлении. Если кружится голова, дышите спокойно.';
      box.appendChild(w);
    }
    $('#breathLenRow').hidden = !!P.rounds;
    if (!P.rounds) { $('#breathLen').value = P.minutes; $('#breathLenOut').value = P.minutes; }
  };
  render();
  $('#breathLen').addEventListener('input', (e) => { $('#breathLenOut').value = e.target.value; });
  $('#breathTempo').addEventListener('input', (e) => { $('#breathTempoOut').value = Math.round(e.target.value * 100) + '%'; });
  $('#bwStart').addEventListener('click', async () => {
    await app.E.ctx.resume();
    B.opts = { beat: $('#bwBeat').checked, ticks: $('#bwTicks').checked, voice: $('#bwVoice').checked, tempo: Number($('#breathTempo').value), sound: bwSound };
    vizBefore = sphere.mode === 'breath' ? vizBefore : sphere.mode;
    B.start(breathId, { minutes: Number($('#breathLen').value) });
    sphere.setMode('breath');
    if (recWithSet && !app.recorder.active) startRecording();
    requestWake();
  });
  $('#bwStop').addEventListener('click', () => B.stop());
  app.conductor.on('load', (set) => { if (B.active && !String(set.id).startsWith('breath-')) B.stop(true); });
  $('#bwRelease').addEventListener('click', () => B.release());
  B.on('start', (P) => { foldPanelOnPhone();
    $('#bwStart').disabled = true; $('#bwStop').disabled = false; $('#bwPause').disabled = false; updateMedia();
    $('#cueTitle').textContent = P.name; $('#cueText').textContent = P.about; $('#cuePrev').textContent = P.rhythm; $('#cueCount').textContent = '';
    document.documentElement.style.setProperty('--chapter', P.color); sphere.tint = P.color;
  });
  B.on('stop', () => {
    $('#bwStart').disabled = false; $('#bwStop').disabled = true; $('#bwPause').disabled = true; $('#bwRelease').hidden = true; if (paused) setPaused(false); updateMedia();
    sphere.setMode(vizBefore || 'dome');
    $('#cueNext').textContent = 'Практика завершена.';
    // вернуть выбранный сет, чтобы вкладка «Сеты» была готова
    setTimeout(() => { if (!app.breathwork.active && !app.conductor.running) app.conductor.load(setId, Number($('#seed').value) || 1); }, 1800);
    if (app.recorder.active && recWithSet) setTimeout(() => stopRecording(), 6500);
    releaseWake();
  });
  setInterval(() => {
    const st = B.state(app.E.now);
    $('#bwRelease').hidden = !(st && st.open);
    if (st && st.label) $('#cueNext').textContent = st.open ? 'Держите, сколько комфортно. Нажмите «Вдохнуть», когда захочется.' : `Сейчас: ${st.label.toLowerCase()}`;
  }, 200);
}

// ---------- Конструктор сцены ----------
function bindBuilder() {
  const root = $('#builder'), B = new Builder(app, root);
  app.builder = B;
  const open = () => { root.hidden = false; $('#builderBtn').setAttribute('aria-expanded', 'true'); if (app.conductor.running) B.fromCurrent(); else B.render(); };
  const close = () => { root.hidden = true; $('#builderBtn').setAttribute('aria-expanded', 'false'); };
  $('#builderBtn').addEventListener('click', () => (root.hidden ? open() : close()));
  root.querySelector('[data-close-builder]').addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) close(); });
  $('#bName').addEventListener('input', (e) => { B.name = e.target.value || 'Моя сцена'; });
  $('#bLive').addEventListener('change', (e) => { B.live = e.target.checked; });
  $('#bTake').addEventListener('click', () => B.fromCurrent());
  $('#bNew').addEventListener('click', () => { B.scene = B.fresh(); B.blocks = ['pad', 'wash', 'handpan', 'bells']; B.name = 'Моя сцена'; B.render(); B.changed(); });
  $('#bApply').addEventListener('click', async () => { await app.E.ctx.resume(); B.apply(); });
  $('#bSave').addEventListener('click', () => B.save());
  $('#bAddSet').addEventListener('click', () => B.addToSet(Math.max(1, Number($('#bMinutes').value) || 5)));
  $('#bRunSet').addEventListener('click', async () => { await app.E.ctx.resume(); B.runSet(); close(); });
}
