// Аудиодвижок: шины, пространство (HRTF), реверберация с кроссфейдом пространств,
// мягкий кроссфид для наушников, приглушение фона под голос, отдельная шина записи.
import { makeNoise, makeIR, SPACES } from './dsp.js';
import { clamp, dbToGain, toPolar } from './util.js';

let vizId = 1;

export class Engine {
  constructor() {
    this.ctx = null;
    this.groups = {};
    this.viz = new Map();          // источники для визуализации купола
    this.hrtf = true;
    this.softness = 0.6;
    this.spaceName = null;
    this.spaceUser = 1;            // ручка «Пространство»
    this.spaceScene = 0.55;        // уровень пространства, заданный сюжетом
    this.irCache = {};
  }

  async init() {
    // iPhone: без этого беззвучный режим (переключатель сбоку) глушит веб-звук
    setAudioSession('playback');
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    const L = ctx.listener;
    if (L.forwardX) {
      L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
    } else { L.setOrientation(0, 0, -1, 0, 1, 0); L.setPosition(0, 0, 0); }

    this.noise = {
      white: makeNoise(ctx, 5, 'white'),
      pink: makeNoise(ctx, 7, 'pink'),
      brown: makeNoise(ctx, 7, 'brown'),
    };

    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.G = G;

    // --- Музыкальная часть ---
    this.dryBus = G();
    this.revSend = G();
    this.revPre = ctx.createBiquadFilter(); this.revPre.type = 'highpass'; this.revPre.frequency.value = 140; this.revPre.Q.value = 0.5;
    this.revSend.connect(this.revPre);
    this.revReturn = G();
    this.chorus = createChorus(ctx);
    this.revReturn.connect(this.chorus.input);
    this.revLevel = G(this.spaceScene);
    this.chorus.output.connect(this.revLevel);
    this.revDuck = G(); this.dryDuck = G();
    this.revLevel.connect(this.revDuck);
    this.dryBus.connect(this.dryDuck);

    this.musicSum = G();
    this.revDuck.connect(this.musicSum); this.dryDuck.connect(this.musicSum);

    // Вырез в середине спектра фона, когда звучит голос (динамический «карман» для речи)
    this.carve = ctx.createBiquadFilter(); this.carve.type = 'peaking'; this.carve.frequency.value = 2600; this.carve.Q.value = 0.8; this.carve.gain.value = 0;
    // Смягчение верха
    this.tame = ctx.createBiquadFilter(); this.tame.type = 'highshelf'; this.tame.frequency.value = 7500; this.tame.gain.value = 0;
    this.crossfeed = createCrossfeed(ctx);
    this.musicSum.connect(this.carve); this.carve.connect(this.tame); this.tame.connect(this.crossfeed.input);
    this.musicOut = G(1.5);   // общий уровень музыки (калибровка: тихие главы около −24 дБ, ритмичные около −20 дБ)
    this.crossfeed.output.connect(this.musicOut);

    // --- Голос (подключается модулем Voice) ---
    this.voiceSum = G();
    this.voiceMonitor = G(1);      // «слышать себя»
    this.voiceRec = G(1);          // голос в записи
    this.voiceSum.connect(this.voiceMonitor); this.voiceSum.connect(this.voiceRec);

    // --- Бинауральный тон: мимо кроссфида, иначе эффект пропадёт ---
    this.binauralBus = G();

    // --- Выход в наушники ---
    this.outSum = G();
    this.musicOut.connect(this.outSum); this.voiceMonitor.connect(this.outSum); this.binauralBus.connect(this.outSum);
    this.hpVol = G(0.9);
    this.outLimiter = makeLimiter(ctx);
    this.outSum.connect(this.hpVol); this.hpVol.connect(this.outLimiter); this.outLimiter.connect(ctx.destination);

    // --- Шина записи: независима от громкости в наушниках ---
    this.recSum = G();
    this.musicOut.connect(this.recSum); this.voiceRec.connect(this.recSum); this.binauralBus.connect(this.recSum);
    this.recLimiter = makeLimiter(ctx);
    this.recSum.connect(this.recLimiter);
    this.recTap = G();
    this.recLimiter.connect(this.recTap);
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 2048; this.meter.smoothingTimeConstant = 0.6;
    this.recTap.connect(this.meter);
    this.masterFade = this.musicSum.gain; // для плавного входа/выхода сета

    for (const name of ['atmos', 'nature', 'birds', 'instr', 'rhythm', 'live', 'resonance']) this.createGroup(name);

    this.setSoftness(this.softness);
    this.setSpace('temple', 0.01);
    return this;
  }

  get now() { return this.ctx.currentTime; }

  // Группа: собственные «сухая» и «пространственная» шины с общим фейдером (пользователь × сюжет)
  createGroup(name) {
    const g = { dry: this.G(), send: this.G(), user: 1, scene: 1 };
    g.dry.connect(this.dryBus); g.send.connect(this.revSend);
    this.groups[name] = g;
    return g;
  }
  setGroup(name, { user, scene, tau = 0.15 } = {}) {
    const g = this.groups[name]; if (!g) return;
    if (user !== undefined) g.user = user;
    if (scene !== undefined) g.scene = scene;
    const v = g.user * g.scene, t = this.now;
    g.dry.gain.setTargetAtTime(v, t, tau); g.send.gain.setTargetAtTime(v, t, tau);
  }

  noiseSource(type = 'pink', loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[type]; s.loop = loop;
    return s;
  }
  startNoise(src, t) { src.start(t, Math.random() * (src.buffer.duration - 0.5)); }

  // Выполнить действие, когда аудиовремя дойдёт до time (для уборки узлов)
  after(time, fn) { setTimeout(fn, Math.max(0, (time - this.now) * 1000 + 200)); }

  // ---------- Пространственный источник ----------
  // pos: {x,y,z}; send — доля в пространство (растёт с расстоянием); kind — для визуализации.
  spawn({ group = 'instr', pos, send = 0.35, life = null, kind = 'instr', label = '', hrtf = this.hrtf } = {}) {
    const em = new Emitter(this, { group, pos, send, kind, label, hrtf });
    if (life) { em.end = life; em.glow = 1; this.after(life, () => em.dispose()); }
    return em;
  }

  // ---------- Пространства ----------
  setSpace(name, fade = 6) {
    const preset = SPACES[name]; if (!preset || name === this.spaceName) return;
    this.spaceName = name;
    const ctx = this.ctx, t = this.now;
    const ir = this.irCache[name] || (this.irCache[name] = makeIR(ctx, preset.ir));
    const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = ir;
    const g = ctx.createGain(); g.gain.value = 0;
    this.revPre.connect(conv); conv.connect(g); g.connect(this.revReturn);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + Math.max(0.02, fade));
    const old = this.activeRev;
    if (old) {
      old.g.gain.cancelScheduledValues(t);
      old.g.gain.setValueAtTime(old.g.gain.value, t);
      old.g.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
      this.after(t + fade + 0.5, () => { try { this.revPre.disconnect(old.conv); } catch (e) {} old.conv.disconnect(); old.g.disconnect(); });
    }
    this.activeRev = { conv, g };
    this.chorus.setDepth(preset.chorus ?? 0.5);
    this.onSpace && this.onSpace(name);
  }
  setSpaceLevel({ user, scene, tau = 2 } = {}) {
    if (user !== undefined) this.spaceUser = user;
    if (scene !== undefined) this.spaceScene = scene;
    this.revLevel.gain.setTargetAtTime(this.spaceUser * this.spaceScene * 1.6, this.now, tau);
  }
  prewarmSpaces() { for (const k of Object.keys(SPACES)) if (!this.irCache[k]) this.irCache[k] = makeIR(this.ctx, SPACES[k].ir); }

  // Мягкость: кроссфид + приглушение верха. Делает объём в наушниках бархатным, без «звука в одном ухе».
  setSoftness(v) {
    this.softness = clamp(v, 0, 1);
    this.crossfeed.setAmount(0.15 + this.softness * 0.65);
    this.tame.gain.setTargetAtTime(-this.softness * 4, this.now, 0.1);
  }

  // Приглушение фона под голос: amount 0..1 (насколько сейчас звучит речь), depthDb — глубина
  duck(amount, depthDb = 7, speaking = false) {
    const t = this.now, tau = speaking ? 0.06 : 0.45;
    this.dryDuck.gain.setTargetAtTime(dbToGain(-depthDb * amount), t, tau);
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

  // Визуальные источники с ограниченным временем жизни (например, нота без отдельного панорамирования)
  vizPulse(kind, pos, life = 2, label = '') {
    const id = vizId++, born = this.now;
    this.viz.set(id, { id, kind, label, born, end: born + life, posAt: () => pos, activity: (now) => Math.max(0, Math.min(1, (born + life - now) / life)) });
    this.after(born + life, () => this.viz.delete(id));
  }
}

// ---------- Источник в 3D ----------
class Emitter {
  constructor(E, { group, pos, send, kind, label, hrtf }) {
    const ctx = E.ctx; this.E = E;
    this.input = ctx.createGain();
    this.air = ctx.createBiquadFilter(); this.air.type = 'lowpass'; this.air.Q.value = 0.25;
    this.panner = ctx.createPanner();
    this.panner.panningModel = hrtf ? 'HRTF' : 'equalpower';
    this.panner.distanceModel = 'inverse'; this.panner.refDistance = 1.6; this.panner.rolloffFactor = 0.55; this.panner.maxDistance = 200;
    this.dryG = ctx.createGain(); this.sendG = ctx.createGain();
    this.baseSend = send;
    const g = E.groups[group] || E.groups.instr;
    this.input.connect(this.air); this.air.connect(this.panner);
    this.panner.connect(this.dryG); this.dryG.connect(g.dry);
    this.panner.connect(this.sendG); this.sendG.connect(g.send);
    this.kf = [];
    this.id = vizId++; this.kind = kind; this.label = label; this.born = E.now; this.end = Infinity;
    this.glow = 0; this.lastHit = -10; this.hitEnd = -10;   // яркость для купола
    this.setPos(pos || { x: 0, y: 0, z: -2 }, 0);
    E.viz.set(this.id, this);
  }
  _applyDistance(p, t, tau) {
    const { d } = toPolar(p);
    const fc = clamp(19000 / (1 + d / 9), 2600, 19000);
    const send = this.baseSend * (0.55 + 0.45 * clamp(d / 14, 0, 1.6));
    if (tau > 0) { this.air.frequency.setTargetAtTime(fc, t, tau); this.sendG.gain.setTargetAtTime(send, t, tau); }
    else { this.air.frequency.setValueAtTime(fc, t); this.sendG.gain.setValueAtTime(send, t); }
  }
  // Мгновенно или плавно (glide — секунды) переместить источник
  setPos(p, glide = 0, t = this.E.now) {
    const P = this.panner;
    p = soften(p);
    if (P.positionX) {
      if (glide > 0) {
        P.positionX.setTargetAtTime(p.x, t, glide / 3); P.positionY.setTargetAtTime(p.y, t, glide / 3); P.positionZ.setTargetAtTime(p.z, t, glide / 3);
      } else { P.positionX.setValueAtTime(p.x, t); P.positionY.setValueAtTime(p.y, t); P.positionZ.setValueAtTime(p.z, t); }
    } else P.setPosition(p.x, p.y, p.z);
    this._applyDistance(p, t, glide / 3);
    const from = this.posAt(t);
    this.kf = [{ t, pos: from || p }, { t: t + Math.max(glide, 0.001), pos: p }];
    this.pos = p;
  }
  // Линейный путь по ключевым точкам [{t, pos}] (абсолютное аудиовремя)
  path(points) {
    const P = this.panner; if (!points.length) return;
    const pts = points.map((k) => ({ t: k.t, pos: soften(k.pos) }));
    if (P.positionX) {
      const f = pts[0];
      P.positionX.setValueAtTime(f.pos.x, f.t); P.positionY.setValueAtTime(f.pos.y, f.t); P.positionZ.setValueAtTime(f.pos.z, f.t);
      for (let i = 1; i < pts.length; i++) {
        const k = pts[i];
        P.positionX.linearRampToValueAtTime(k.pos.x, k.t); P.positionY.linearRampToValueAtTime(k.pos.y, k.t); P.positionZ.linearRampToValueAtTime(k.pos.z, k.t);
      }
    } else P.setPosition(pts[0].pos.x, pts[0].pos.y, pts[0].pos.z);
    // расстояние — по средней точке
    this._applyDistance(pts[Math.floor(pts.length / 2)].pos, pts[0].t, 0.3);
    this.kf = pts; this.pos = pts[pts.length - 1].pos;
  }
  posAt(time) {
    const k = this.kf; if (!k.length) return this.pos;
    if (time <= k[0].t) return k[0].pos;
    for (let i = 1; i < k.length; i++) {
      if (time <= k[i].t) {
        const a = k[i - 1], b = k[i], u = (time - a.t) / Math.max(1e-6, b.t - a.t);
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
    try { this.input.disconnect(); this.air.disconnect(); this.panner.disconnect(); this.dryG.disconnect(); this.sendG.disconnect(); } catch (e) {}
  }
}

// Мягкое пространство: не даём источникам вставать «внутрь уха» — минимум дистанции и лёгкий наклон к фронту
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
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 720; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    split.connect(dl, from); dl.connect(lp); lp.connect(g); g.connect(merge, 0, to);
    return g;
  };
  const xL = mk(0, 1), xR = mk(1, 0);
  merge.connect(output);
  return {
    input, output,
    setAmount(a) {
      const t = ctx.currentTime, k = a * 0.42;
      xL.gain.setTargetAtTime(k, t, 0.1); xR.gain.setTargetAtTime(k, t, 0.1);
      dL.gain.setTargetAtTime(1 - a * 0.12, t, 0.1); dR.gain.setTargetAtTime(1 - a * 0.12, t, 0.1);
    },
  };
}

// ---------- Медленный хорус на хвосте: «дыхание» пространства ----------
function createChorus(ctx) {
  const input = ctx.createGain(); input.channelCount = 2; input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
  const output = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 0.8;
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
  input.connect(dry); dry.connect(output);
  input.connect(split);
  const lfos = [];
  [[0, 0.013, 0.11], [1, 0.0185, 0.083]].forEach(([ch, base, rate]) => {
    const d = ctx.createDelay(0.05); d.delayTime.value = base;
    const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
    const depth = ctx.createGain(); depth.gain.value = 0.002;
    lfo.connect(depth); depth.connect(d.delayTime); lfo.start();
    split.connect(d, ch); d.connect(merge, 0, ch);
    lfos.push(depth);
  });
  merge.connect(wet); wet.connect(output);
  return {
    input, output,
    setDepth(v) { const t = ctx.currentTime; lfos.forEach((g) => g.gain.setTargetAtTime(0.0008 + v * 0.0028, t, 1)); wet.gain.setTargetAtTime(0.25 + v * 0.3, t, 1); },
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
