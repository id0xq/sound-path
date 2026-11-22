// Аудиодвижок: шины, 3D-источники (HRTF + усиленные подсказки направления), два ревербератора
// (пространство и атмосферный хвост, как в Valhalla), мягкий кроссфид, поворот головы,
// приглушение фона под голос, отдельная шина записи.
import { makeNoise, makeIR, SPACES } from './dsp.js';
import { clamp, dbToGain, toPolar } from './util.js';

let vizId = 1;

// Сколько каждого вида звука уходит в атмосферный хвост — звуки «превращаются» в атмосферу
export const ATMOS_SEND = {
  wash: 0.9, pad: 0.8, bells: 0.55, bowl: 0.5, gong: 0.6, handpan: 0.32, ocarina: 0.35, kalimba: 0.25,
  bird: 0.12, water: 0.08, rattle: 0.15, rhythm: 0.05, heart: 0.02, live: 0.3, instr: 0.3, crickets: 0.05, fire: 0,
};

export class Engine {
  constructor() {
    this.ctx = null;
    this.groups = {};
    this.viz = new Map();          // источники для визуализации
    this.hrtf = true;
    this.softness = 0.4;
    this.spaceName = null;
    this.spaceUser = 1; this.spaceScene = 0.55;   // ручка «Пространство» × сюжет
    this.atmosUser = 1;                           // ручка «Атмосферный хвост»
    this.head = { yaw: 0, pitch: 0 };
    this.irCache = {};
    this.fdnOk = false;
    this.notes = [];               // недавние ноты — для пластины Хладни
  }

  // Нота прозвучала (или прозвучит в момент t): пластина Хладни покажет её узор
  noteOn(midi, t, vel = 0.6, decay = 1.5) {
    if (!isFinite(midi)) return;
    this.notes.push({ midi, t, vel, decay });
    if (this.notes.length > 48) this.notes.splice(0, this.notes.length - 48);
  }

  // Под водой: весь музыкальный фон темнеет и становится глухим, голос проводника остаётся ясным
  setUnderwater(v = 0, fade = 4) {
    v = clamp(v, 0, 1); this.underwater = v;
    const f = v < 0.01 ? 20000 : 14500 * Math.pow(700 / 14500, v), tau = Math.max(0.1, fade / 3);
    this.uwDry.frequency.setTargetAtTime(f, this.now, tau); this.uwRev.frequency.setTargetAtTime(f, this.now, tau);
    // глухой звук кажется тише — немного возвращаем громкость
    this.musicOut.gain.setTargetAtTime(2.1 * (1 + 0.55 * v), this.now, Math.max(0.1, fade / 3));
  }

  async init() {
    setAudioSession('playback'); // iPhone: иначе беззвучный режим глушит веб-звук
    const AC = window.AudioContext || window.webkitAudioContext;
    let hint = 'playback';
    try { if (localStorage.getItem('zp:fast') === 'true') hint = 'interactive'; } catch (e) {}
    const ctx = (this.ctx = new AC({ latencyHint: hint }));
    const L = ctx.listener;
    if (L.forwardX) {
      L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
    } else { L.setOrientation(0, 0, -1, 0, 1, 0); L.setPosition(0, 0, 0); }

    this.noise = { white: makeNoise(ctx, 5, 'white'), pink: makeNoise(ctx, 7, 'pink'), brown: makeNoise(ctx, 7, 'brown') };
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.G = G;

    // --- Шины музыки ---
    this.dryBus = G(); this.revSend = G(); this.atmosSend = G();

    // Ревербераторы: «пространство» (ясное, с предзадержкой) и «атмосферный хвост» (длинный, модулированный)
    try {
      await ctx.audioWorklet.addModule(new URL('./worklets/fdn.js', import.meta.url));
      const mk = (opts) => new AudioWorkletNode(ctx, 'fdn-reverb', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: opts });
      this.spaceRev = mk({ decay: 4 }); this.atmosRev = mk({ decay: 16, size: 2.2, mod: 0.8 });
      this.fdnOk = true;
    } catch (e) {
      console.warn('FDN недоступен, использую свёртку', e);
      this.spaceRev = ctx.createConvolver(); this.spaceRev.buffer = makeIR(ctx, { duration: 4.5, preDelay: 0.04, bloom: 0.12, lpStart: 4500, lpEnd: 1200 });
      this.atmosRev = ctx.createConvolver(); this.atmosRev.buffer = makeIR(ctx, { duration: 10, preDelay: 0.08, bloom: 0.5, lpStart: 3500, lpEnd: 900 });
    }
    this.revSend.connect(this.spaceRev); this.atmosSend.connect(this.atmosRev);
    // Зал Handpan Sphere: настоящий отклик зала (подгружается позже)
    this.hallConv = ctx.createConvolver(); this.hallGain = G(0);
    this.revSend.connect(this.hallConv); this.hallConv.connect(this.hallGain);
    this.spaceGain = G(1);
    this.spaceRev.connect(this.spaceGain);

    this.revLevel = G(0.6); this.atmosLevel = G(0.5);
    this.spaceGain.connect(this.revLevel); this.hallGain.connect(this.revLevel);
    this.atmosRev.connect(this.atmosLevel);
    // хвостам — мягкий верх: никакого «шипения»
    this.revTone = ctx.createBiquadFilter(); this.revTone.type = 'lowpass'; this.revTone.frequency.value = 9000; this.revTone.Q.value = 0.4;
    this.revDuck = G(); this.dryDuck = G();
    this.revLevel.connect(this.revTone); this.atmosLevel.connect(this.revTone); this.revTone.connect(this.revDuck);
    this.dryBus.connect(this.dryDuck);

    this.musicSum = G();
    // «под водой»: глохнут фон и отражения, а голос кита (группа «глубина») остаётся ясным
    this.uwDry = ctx.createBiquadFilter(); this.uwDry.type = 'lowpass'; this.uwDry.frequency.value = 20000; this.uwDry.Q.value = 0.5;
    this.uwRev = ctx.createBiquadFilter(); this.uwRev.type = 'lowpass'; this.uwRev.frequency.value = 20000; this.uwRev.Q.value = 0.5;
    this.revDuck.connect(this.uwRev); this.uwRev.connect(this.musicSum); this.dryDuck.connect(this.uwDry); this.uwDry.connect(this.musicSum);
    this.deepDuck = G(); this.deepDuck.connect(this.musicSum);

    this.carve = ctx.createBiquadFilter(); this.carve.type = 'peaking'; this.carve.frequency.value = 2600; this.carve.Q.value = 0.8; this.carve.gain.value = 0;
    this.tame = ctx.createBiquadFilter(); this.tame.type = 'highshelf'; this.tame.frequency.value = 8000; this.tame.gain.value = 0;
    this.air = ctx.createBiquadFilter(); this.air.type = 'lowpass'; this.air.frequency.value = 14500; this.air.Q.value = 0.5;
    this.crossfeed = createCrossfeed(ctx);
    this.musicSum.connect(this.carve); this.carve.connect(this.tame); this.tame.connect(this.air); this.air.connect(this.crossfeed.input);
    this.musicOut = G(2.1);   // калибровка: тихие главы около −27 дБ, ритмичные около −20 дБ
    // Мягкий выравниватель: медленно подтягивает слишком громкие и слишком тихие главы к ровному уровню,
    // оставляя часть динамики сюжета. Голос проводника идёт мимо и не меняется.
    this.leveler = G(1); this.levelAn = ctx.createAnalyser(); this.levelAn.fftSize = 2048;
    this.musicOut.connect(this.levelAn); this.musicOut.connect(this.leveler);
    this.lvl = { env: 0, gainDb: 0, n: 0 };
    this.crossfeed.output.connect(this.musicOut);

    // --- Голос ---
    this.voiceSum = G(); this.voiceMonitor = G(1); this.voiceRec = G(1);
    this.voiceSum.connect(this.voiceMonitor); this.voiceSum.connect(this.voiceRec);
    this.binauralBus = G();

    // --- Наушники ---
    this.outSum = G();
    this.leveler.connect(this.outSum); this.voiceMonitor.connect(this.outSum); this.binauralBus.connect(this.outSum);
    this.hpVol = G(0.9);
    this.outLimiter = makeLimiter(ctx);
    this.outSum.connect(this.hpVol); this.hpVol.connect(this.outLimiter); this.outLimiter.connect(ctx.destination);

    // --- Запись (не зависит от громкости наушников) ---
    this.recSum = G();
    this.leveler.connect(this.recSum); this.voiceRec.connect(this.recSum); this.binauralBus.connect(this.recSum);
    this.recLimiter = makeLimiter(ctx);
    this.recSum.connect(this.recLimiter);
    this.recTap = G();
    this.recLimiter.connect(this.recTap);
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 2048; this.meter.smoothingTimeConstant = 0.6;
    this.recTap.connect(this.meter);
    // стерео-анализ для визуализаций «Поле», «Лиссажу», «Кристалл»
    const split = ctx.createChannelSplitter(2);
    this.recTap.connect(split);
    this.anL = ctx.createAnalyser(); this.anR = ctx.createAnalyser();
    [this.anL, this.anR].forEach((a) => { a.fftSize = 8192; a.smoothingTimeConstant = 0.75; });
    split.connect(this.anL, 0); split.connect(this.anR, 1);

    for (const name of ['atmos', 'nature', 'birds', 'instr', 'rhythm', 'groove', 'live', 'resonance', 'narrator', 'deep']) this.createGroup(name);
    this.groups.deep.dry.disconnect(); this.groups.deep.dry.connect(this.deepDuck);

    this.setSoftness(this.softness);
    this.setSpace('temple', 0.01);
    this.loadHall();
    return this;
  }

  get now() { return this.ctx.currentTime; }

  async loadHall() {
    try {
      const res = await fetch(new URL('../samples/handpan/hall.mp3', import.meta.url));
      this.hallConv.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) { /* без зала — не страшно */ }
  }

  // Группа: «сухая» шина, посыл в пространство и посыл в атмосферный хвост, общий фейдер (пользователь × сюжет)
  createGroup(name) {
    const g = { dry: this.G(), send: this.G(), atmos: this.G(), user: 1, scene: 1 };
    g.dry.connect(this.dryBus); g.send.connect(this.revSend); g.atmos.connect(this.atmosSend);
    this.groups[name] = g;
    return g;
  }
  setGroup(name, { user, scene, tau = 0.15 } = {}) {
    const g = this.groups[name]; if (!g) return;
    if (user !== undefined) g.user = user;
    if (scene !== undefined) g.scene = scene;
    const v = g.user * g.scene, t = this.now;
    g.dry.gain.setTargetAtTime(v, t, tau); g.send.gain.setTargetAtTime(v, t, tau); g.atmos.gain.setTargetAtTime(v, t, tau);
  }

  noiseSource(type = 'pink', loop = true) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise[type]; s.loop = loop; return s;
  }
  startNoise(src, t) { src.start(t, Math.random() * (src.buffer.duration - 0.5)); }
  after(time, fn) { setTimeout(fn, Math.max(0, (time - this.now) * 1000 + 200)); }

  // ---------- Источник в 3D ----------
  spawn({ group = 'instr', pos, send = 0.35, atmos, life = null, kind = 'instr', label = '', hrtf = this.hrtf } = {}) {
    const em = new Emitter(this, { group, pos, send, atmos: atmos ?? ATMOS_SEND[kind] ?? 0.25, kind, label, hrtf });
    if (life) { em.end = life; em.glow = 1; this.after(life, () => em.dispose()); }
    return em;
  }

  // ---------- Пространства ----------
  setSpace(name, fade = 6) {
    const P = SPACES[name]; if (!P || name === this.spaceName) return;
    this.spaceName = name;
    const t = this.now, tau = Math.max(0.05, fade / 3);
    if (this.fdnOk) {
      this.spaceRev.port.postMessage(P.space);
      this.atmosRev.port.postMessage({ freeze: 0, ...P.atmos });
    }
    const hall = !!P.hall;
    this.hallGain.gain.setTargetAtTime(hall ? 1.6 : 0, t, tau);
    this.spaceGain.gain.setTargetAtTime(hall ? 0.25 : 1, t, tau);
    this.revTone.frequency.setTargetAtTime(P.tone || 9000, t, tau);
    this.atmosMix = P.atmosMix ?? 0.5;
    this.applyReverbLevels(tau);
    this.onSpace && this.onSpace(name);
  }
  applyReverbLevels(tau = 1) {
    const t = this.now;
    this.revLevel.gain.setTargetAtTime(this.spaceUser * this.spaceScene * 1.3, t, tau);
    this.atmosLevel.gain.setTargetAtTime(this.atmosUser * (this.atmosMix ?? 0.5) * (0.4 + this.spaceScene) * 2.0, t, tau);
  }
  setSpaceLevel({ user, scene, tau = 2 } = {}) {
    if (user !== undefined) this.spaceUser = user;
    if (scene !== undefined) this.spaceScene = scene;
    this.applyReverbLevels(tau);
  }
  setAtmosLevel(user) { this.atmosUser = user; this.applyReverbLevels(0.2); }
  // Растворение: атмосферный хвост замирает и звучит как бесконечный аккорд
  dissolve(seconds = 8) {
    if (!this.fdnOk) return;
    this.atmosRev.port.postMessage({ freeze: 1 });
    clearTimeout(this._dissolveT);
    this._dissolveT = setTimeout(() => this.atmosRev.port.postMessage({ freeze: 0 }), seconds * 1000);
  }

  setSoftness(v) {
    this.softness = clamp(v, 0, 1);
    this.crossfeed.setAmount(0.06 + this.softness * 0.5);
    this.tame.gain.setTargetAtTime(-1 - this.softness * 3.5, this.now, 0.1);
  }

  // ---------- Поворот головы: сцена остаётся на месте, когда слушатель поворачивается ----------
  setHead(yaw, pitch = 0) {
    this.head = { yaw, pitch };
    const L = this.ctx.listener, t = this.now;
    const y = (yaw * Math.PI) / 180, p = (clamp(pitch, -60, 60) * Math.PI) / 180;
    const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
    const u = [-Math.sin(y) * Math.sin(p), Math.cos(p), Math.cos(y) * Math.sin(p)];
    if (L.forwardX) {
      L.forwardX.value = f[0]; L.forwardY.value = f[1]; L.forwardZ.value = f[2];
      L.upX.value = u[0]; L.upY.value = u[1]; L.upZ.value = u[2];
    } else L.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
    // подсказки «сзади / сверху» пересчитываем относительно головы
    if (Math.abs(yaw - (this._cueYaw || 0)) > 6 || Math.abs(pitch - (this._cuePitch || 0)) > 6) {
      this._cueYaw = yaw; this._cuePitch = pitch;
      for (const v of this.viz.values()) if (v.updateCue) v.updateCue();
    }
  }

  // Выравниватель громкости: цель −20 дБ, поправка на 60 % отклонения, от −9 до +3 дБ, плавно
  autoLevel() {
    const L = this.lvl, a = this._lvlBuf || (this._lvlBuf = new Float32Array(this.levelAn.fftSize));
    this.levelAn.getFloatTimeDomainData(a);
    let s = 0; for (let i = 0; i < a.length; i += 2) s += a[i] * a[i];
    const ms = s / (a.length / 2);
    L.env = L.env ? L.env + (ms - L.env) * 0.12 : ms;
    const db = 10 * Math.log10(L.env + 1e-12);
    // тише и мягче в наушниках: цель −23 дБ, громкие всплески убираются быстрее, чем возвращаются
    const target = db < -55 ? 0 : clamp(-(db + 23) * 0.65, -12, 1);
    L.gainDb += (target - L.gainDb) * (target < L.gainDb ? 0.5 : 0.15);
    this.leveler.gain.setTargetAtTime(dbToGain(L.gainDb), this.now, target < L.gainDb ? 0.4 : 1.6);
  }

  // Моторный цикл: двигает все источники по их путям
  motion(now = this.now) { for (const v of this.viz.values()) if (v.step) v.step(now); }

  duck(amount, depthDb = 7, speaking = false) {
    const t = this.now, tau = speaking ? 0.06 : 0.45;
    this.dryDuck.gain.setTargetAtTime(dbToGain(-depthDb * amount), t, tau);
    this.deepDuck.gain.setTargetAtTime(dbToGain(-depthDb * amount), t, tau);
    this.revDuck.gain.setTargetAtTime(dbToGain(-depthDb * 1.5 * amount), t, tau);
    this.carve.gain.setTargetAtTime(-Math.min(6, depthDb * 0.8) * amount, t, tau);
  }

  setHeadphones(v) { this.hpVol.gain.setTargetAtTime(v, this.now, 0.05); }

  level() {
    const a = this._meterBuf || (this._meterBuf = new Float32Array(this.meter.fftSize));
    this.meter.getFloatTimeDomainData(a);
    let s = 0, p = 0; for (let i = 0; i < a.length; i++) { s += a[i] * a[i]; p = Math.max(p, Math.abs(a[i])); }
    return { rms: Math.sqrt(s / a.length), peak: p };
  }

  vizPulse(kind, pos, life = 2, label = '') {
    const id = vizId++, born = this.now;
    this.viz.set(id, { id, kind, label, born, end: born + life, posAt: () => pos, activity: (now) => Math.max(0, Math.min(1, (born + life - now) / life)) });
    this.after(born + life, () => this.viz.delete(id));
  }
}

// ---------- Источник в 3D ----------
// Цепочка: воздух (даль темнее) → подсказки направления (сзади темнее, сверху «воздушнее») → HRTF.
// Важно для плавности: позиции и фильтры меняются не автоматизацией (она заставляет браузер считать
// панораму на каждом сэмпле), а редкими точными шагами из общего «моторного» цикла — 25 раз в секунду.
class Emitter {
  constructor(E, { group, pos, send, atmos, kind, label, hrtf }) {
    const ctx = E.ctx; this.E = E;
    this.input = ctx.createGain();
    this.air = ctx.createBiquadFilter(); this.air.type = 'lowpass'; this.air.Q.value = 0.25;
    this.rear = ctx.createBiquadFilter(); this.rear.type = 'highshelf'; this.rear.frequency.value = 3200; this.rear.gain.value = 0;
    this.elev = ctx.createBiquadFilter(); this.elev.type = 'peaking'; this.elev.frequency.value = 7600; this.elev.Q.value = 1.1; this.elev.gain.value = 0;
    this.panner = ctx.createPanner();
    this.panner.panningModel = hrtf ? 'HRTF' : 'equalpower';
    this.panner.distanceModel = 'inverse'; this.panner.refDistance = 1.6; this.panner.rolloffFactor = 0.6; this.panner.maxDistance = 200;
    this.dryG = ctx.createGain(); this.sendG = ctx.createGain(); this.atmG = ctx.createGain();
    this.baseSend = send; this.baseAtmos = atmos;
    const g = E.groups[group] || E.groups.instr;
    this.input.connect(this.air); this.air.connect(this.rear); this.rear.connect(this.elev); this.elev.connect(this.panner);
    this.panner.connect(this.dryG); this.dryG.connect(g.dry);
    this.panner.connect(this.sendG); this.sendG.connect(g.send);
    this.panner.connect(this.atmG); this.atmG.connect(g.atmos);
    this.kf = []; this.applied = null; this.lastCue = -1;
    this.id = vizId++; this.kind = kind; this.label = label; this.born = E.now; this.end = Infinity;
    this.glow = 0; this.lastHit = -10; this.hitEnd = -10;
    this.setPos(pos || { x: 0, y: 0, z: -2 }, 0);
    E.viz.set(this.id, this);
  }
  // мгновенно поставить в точку
  _apply(p, force = false) {
    const a = this.applied;
    if (!force && a && Math.abs(a.x - p.x) + Math.abs(a.y - p.y) + Math.abs(a.z - p.z) < 0.015) return;
    const P = this.panner;
    if (P.positionX) { P.positionX.value = p.x; P.positionY.value = p.y; P.positionZ.value = p.z; }
    else P.setPosition(p.x, p.y, p.z);
    this.applied = p;
    const now = this.E.now;
    if (force || now - this.lastCue > 0.09) { this.lastCue = now; this._applyDistance(p); }
  }
  _applyDistance(p) {
    const { d } = toPolar(p);
    const near = clamp((d - 1.2) / 14, 0, 1.4);
    this.air.frequency.value = clamp(19000 / (1 + d / 7), 2400, 19000);
    this.sendG.gain.value = this.baseSend * (0.35 + 0.65 * near);   // ближние — сухие и чёткие
    this.atmG.gain.value = this.baseAtmos * (0.5 + 0.5 * near);      // дальние — тонут в пространстве
    this._applyCue(p);
  }
  _applyCue(p) {
    const { az, el } = toPolar(p);
    let rel = az - this.E.head.yaw; rel = ((rel + 540) % 360) - 180;
    const back = clamp((Math.abs(rel) - 95) / 70, 0, 1);
    const relEl = el - this.E.head.pitch;
    this.rear.gain.value = -6 * back;
    this.elev.gain.value = relEl > 0 ? clamp(relEl / 55, 0, 1) * 4.5 : -clamp(-relEl / 35, 0, 1) * 3;
  }
  updateCue() { if (this.applied) this._applyCue(this.applied); }
  // Переместить: glide — секунды плавного перехода
  setPos(p, glide = 0, t = this.E.now) {
    p = soften(p);
    if (glide <= 0.001) { this.kf = []; this.pos = p; this._apply(p, true); return; }
    const from = this.posAt(t) || p;
    this.kf = [{ t, pos: from }, { t: t + glide, pos: p }];
    this.pos = p;
  }
  // Путь по ключевым точкам [{t, pos}]
  path(points) {
    if (!points.length) return;
    this.kf = points.map((k) => ({ t: k.t, pos: soften(k.pos) }));
    this.pos = this.kf[this.kf.length - 1].pos;
    this._apply(this.kf[0].pos, true);
  }
  // Шаг движения (вызывается движком ~25 раз в секунду)
  step(now) {
    const k = this.kf; if (!k.length) return;
    if (now > k[k.length - 1].t + 0.1) { this._apply(k[k.length - 1].pos, true); this.kf = []; return; }
    if (now < k[0].t) return;
    this._apply(this.posAt(now));
  }
  posAt(time) {
    const k = this.kf; if (!k.length) return this.pos;
    if (time <= k[0].t) return k[0].pos;
    for (let i = 1; i < k.length; i++) {
      if (time <= k[i].t) {
        const a = k[i - 1], b = k[i]; let u = (time - a.t) / Math.max(1e-6, b.t - a.t);
        if (k.length === 2) u = u * u * (3 - 2 * u); // мягкий разгон и торможение
        return { x: a.pos.x + (b.pos.x - a.pos.x) * u, y: a.pos.y + (b.pos.y - a.pos.y) * u, z: a.pos.z + (b.pos.z - a.pos.z) * u };
      }
    }
    return k[k.length - 1].pos;
  }
  setEnd(t) { this.end = t; }
  flash(t, dur = 0.3) { this.lastHit = t; this.hitEnd = Math.max(this.hitEnd < t ? t : this.hitEnd, t + dur); }
  activity(now) {
    if (now < this.lastHit) return this.glow;
    const h = now <= this.hitEnd ? 1 : Math.exp(-(now - this.hitEnd) * 1.6);
    let life = 1;
    if (this.end !== Infinity) life = Math.max(0, Math.min(1, (this.end - now) / 1.5));
    return Math.max(this.glow, h) * life;
  }
  dispose() {
    this.E.viz.delete(this.id);
    try { [this.input, this.air, this.rear, this.elev, this.panner, this.dryG, this.sendG, this.atmG].forEach((n) => n.disconnect()); } catch (e) {}
  }
}

function soften(p) {
  const d = Math.hypot(p.x, p.y, p.z);
  if (d < 1.2) { const k = 1.2 / Math.max(d, 1e-4); return { x: p.x * k, y: p.y * k, z: (p.z || -0.01) * k }; }
  return p;
}

// ---------- Кроссфид для наушников (по мотивам Bauer bs2b) ----------
function createCrossfeed(ctx) {
  const input = ctx.createGain(); input.channelCount = 2; input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
  const output = ctx.createGain();
  const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
  input.connect(split);
  const dL = ctx.createGain(), dR = ctx.createGain();
  split.connect(dL, 0); split.connect(dR, 1);
  dL.connect(merge, 0, 0); dR.connect(merge, 0, 1);
  const mk = (from, to) => {
    const dl = ctx.createDelay(0.01); dl.delayTime.value = 0.00032;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    split.connect(dl, from); dl.connect(lp); lp.connect(g); g.connect(merge, 0, to);
    return g;
  };
  const xL = mk(0, 1), xR = mk(1, 0);
  merge.connect(output);
  return {
    input, output,
    setAmount(a) {
      const t = ctx.currentTime, k = a * 0.36;
      xL.gain.setTargetAtTime(k, t, 0.1); xR.gain.setTargetAtTime(k, t, 0.1);
      dL.gain.setTargetAtTime(1 - a * 0.1, t, 0.1); dR.gain.setTargetAtTime(1 - a * 0.1, t, 0.1);
    },
  };
}

export function setAudioSession(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {}
}

function makeLimiter(ctx) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -4; c.knee.value = 3; c.ratio.value = 18; c.attack.value = 0.003; c.release.value = 0.25;
  return c;
}
