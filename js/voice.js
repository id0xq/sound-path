// Голос проводника. Главный принцип — разборчивость:
//  • голос сухой и в центре, его не отправляем в большое пространство;
//  • маленькая «комната» даёт присутствие без размытия;
//  • «ореол» — реверб, который звучит только в паузах (приглушается, пока вы говорите);
//  • фон автоматически уходит под голос, а в его середине вырезается «карман» для речи.
// Плюс «Резонанс мира» — как в Sound Temple: звуки вокруг микрофона превращаются в гармонию строя.
import { makeIR, VOICE_ROOM, VOICE_HALO } from './dsp.js';
import { mtof, dbToGain, gainToDb, clamp } from './util.js';
import { setAudioSession } from './engine.js';

export class Voice {
  constructor(E) {
    this.E = E; this.enabled = false; this.stream = null;
    this.settings = {
      level: 0.9, clarity: 0.6, halo: 0.25, duckDb: 7, gate: true, noiseSuppression: false,
      monitor: true, resonance: 0, resonanceDuck: true, warmth: 0.2,
    };
    this.env = 0; this.speaking = 0; this.levelDb = -90; this.holdUntil = 0;
    this.build();
  }

  build() {
    const E = this.E, ctx = E.ctx, f = (type, fr, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; b.gain.value = gain; return b; };
    this.input = ctx.createGain(); this.input.channelCount = 1; this.input.channelCountMode = 'explicit'; this.input.channelInterpretation = 'speakers';
    this.trim = ctx.createGain(); this.trim.gain.value = 1;
    this.hp1 = f('highpass', 85, 0.6); this.hp2 = f('highpass', 85, 0.9);
    this.mud = f('peaking', 280, 1.0, -2.5);
    this.box = f('peaking', 620, 1.4, -1);
    this.presence = f('peaking', 3200, 0.9, 2.5);
    this.air = f('highshelf', 9500, 0.7, 2);
    this.sib = f('peaking', 6800, 2.5, -1.5);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -26; this.comp.knee.value = 10; this.comp.ratio.value = 3.5; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.makeup = ctx.createGain(); this.makeup.gain.value = dbToGain(7);
    this.warm = ctx.createWaveShaper(); this.warm.oversample = '2x'; this.setWarmth(this.settings.warmth);
    this.gateG = ctx.createGain(); this.gateG.gain.value = 1;
    this.fader = ctx.createGain(); this.fader.gain.value = this.settings.level;
    // голос — моно по центру: равные уровни в оба уха
    this.toStereo = ctx.createGain(); this.toStereo.channelCount = 2; this.toStereo.channelCountMode = 'explicit'; this.toStereo.channelInterpretation = 'speakers';

    this.input.connect(this.trim); this.trim.connect(this.hp1); this.hp1.connect(this.hp2); this.hp2.connect(this.mud); this.mud.connect(this.box);
    this.box.connect(this.presence); this.presence.connect(this.air); this.air.connect(this.sib); this.sib.connect(this.comp);
    this.comp.connect(this.makeup); this.makeup.connect(this.warm); this.warm.connect(this.gateG); this.gateG.connect(this.fader); this.fader.connect(this.toStereo);
    this.toStereo.connect(E.voiceSum);

    // анализ для приглушения фона и индикатора
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024; this.box.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);

    // комната: короткая, всегда немного
    this.roomSend = ctx.createGain(); this.roomSend.gain.value = 0.1;
    this.room = ctx.createConvolver(); this.room.buffer = makeIR(ctx, VOICE_ROOM);
    const roomHp = f('highpass', 260, 0.7), roomLp = f('lowpass', 6000, 0.5);
    this.fader.connect(this.roomSend); this.roomSend.connect(this.room); this.room.connect(roomHp); roomHp.connect(roomLp); roomLp.connect(E.voiceSum);

    // ореол: звучит в паузах
    this.haloSend = ctx.createGain(); this.haloSend.gain.value = 1;
    this.halo = ctx.createConvolver(); this.halo.buffer = makeIR(ctx, VOICE_HALO);
    const haloHp = f('highpass', 380, 0.6), haloLp = f('lowpass', 5200, 0.5);
    this.haloDuck = ctx.createGain(); this.haloDuck.gain.value = 0;
    this.haloLevel = ctx.createGain(); this.haloLevel.gain.value = this.settings.halo * 0.6;
    this.fader.connect(this.haloSend); this.haloSend.connect(haloHp); haloHp.connect(this.halo); this.halo.connect(haloLp); haloLp.connect(this.haloDuck);
    this.haloDuck.connect(this.haloLevel); this.haloLevel.connect(E.voiceSum);

    // Резонанс мира (Sound Temple): банк узких фильтров на нотах строя → в большое пространство
    this.resIn = ctx.createGain(); this.resIn.gain.value = 0;
    this.hp1.connect(this.resIn);
    this.resBands = [];
    const rg = E.groups.resonance;
    for (let i = 0; i < 14; i++) {
      const bp = f('bandpass', 220 * (i + 1), 45);
      const g = ctx.createGain(); g.gain.value = 9;
      const p = ctx.createStereoPanner(); p.pan.value = Math.sin(i * 2.4) * 0.85;
      this.resIn.connect(bp); bp.connect(g); g.connect(p); p.connect(rg.dry); p.connect(rg.send); p.connect(rg.atmos);
      this.resBands.push(bp);
    }
    E.setGroup('resonance', { user: 1, scene: 0.5 });
    this.applySettings();
  }

  async enable(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Браузер не даёт доступ к микрофону. Откройте приложение через localhost или https.');
    this.disable();
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false, autoGainControl: false, noiseSuppression: this.settings.noiseSuppression,
        channelCount: { ideal: 1 }, sampleRate: { ideal: this.E.ctx.sampleRate },
      },
    };
    setAudioSession('play-and-record');
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.src = this.E.ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.input);
    this.enabled = true;
    this.timer = setInterval(() => this.follow(), 20);
    return this.stream;
  }
  disable() {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    if (this.src) { try { this.src.disconnect(); } catch (e) {} }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.stream) setAudioSession('playback');
    this.stream = null; this.src = null; this.enabled = false; this.speaking = 0; this.levelDb = -90;
    this.E.duck(0, this.settings.duckDb, false);
  }
  async devices() {
    try { const list = await navigator.mediaDevices.enumerateDevices(); return list.filter((d) => d.kind === 'audioinput'); } catch (e) { return []; }
  }

  // Следящий за голосом: уровень, детектор речи, гейт, приглушение фона, ореол
  follow() {
    const E = this.E, t = E.ctx.currentTime, s = this.settings;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0; for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const db = gainToDb(Math.sqrt(sum / this.buf.length));
    this.levelDb = db;
    const thr = -46;
    const now = performance.now();
    if (db > thr) this.holdUntil = now + 380;
    const target = now < this.holdUntil ? 1 : 0;
    // быстрая атака, мягкое отпускание
    this.speaking += (target - this.speaking) * (target > this.speaking ? 0.5 : 0.06);
    E.duck(this.speaking, s.duckDb, target > 0.5);
    // гейт: убирает шум между фразами (−14 дБ, не до тишины — звучит естественно)
    if (s.gate) this.gateG.gain.setTargetAtTime(db > thr - 8 || target ? 1 : dbToGain(-14), t, db > thr - 8 ? 0.01 : 0.2);
    else this.gateG.gain.setTargetAtTime(1, t, 0.05);
    // ореол слышен, когда речь закончилась
    this.haloDuck.gain.setTargetAtTime(1 - this.speaking * 0.94, t, target ? 0.04 : 0.25);
    // резонанс мира уходит в тень, пока проводник говорит
    if (s.resonance > 0) this.resIn.gain.setTargetAtTime(s.resonance * (s.resonanceDuck ? 1 - this.speaking * 0.9 : 1), t, 0.08);
  }

  setScale(midis) {
    const t = this.E.ctx.currentTime;
    const fr = midis.map(mtof).filter((x) => x > 90 && x < 4000);
    this.resBands.forEach((bp, i) => bp.frequency.setTargetAtTime(fr[i % fr.length] * (i >= fr.length ? 2 : 1), t, 1.5));
  }

  setWarmth(v) {
    const n = 2048, c = new Float32Array(n), k = 1 + v * 3;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    this.warm.curve = c;
  }

  applySettings() {
    const s = this.settings, t = this.E.ctx.currentTime;
    this.fader.gain.setTargetAtTime(s.level, t, 0.05);
    this.presence.gain.setTargetAtTime(0.5 + s.clarity * 4, t, 0.05);
    this.air.gain.setTargetAtTime(s.clarity * 3.5, t, 0.05);
    this.mud.gain.setTargetAtTime(-1 - s.clarity * 3, t, 0.05);
    this.haloLevel.gain.setTargetAtTime(s.halo * 0.7, t, 0.1);
    this.E.voiceMonitor.gain.setTargetAtTime(s.monitor ? 1 : 0, t, 0.03);
    if (!s.resonance) this.resIn.gain.setTargetAtTime(0, t, 0.1);
    this.setWarmth(s.warmth);
  }
  set(key, val) { this.settings[key] = val; this.applySettings(); if (key === 'noiseSuppression' && this.stream) { const tr = this.stream.getAudioTracks()[0]; tr && tr.applyConstraints({ noiseSuppression: val }).catch(() => {}); } }
}
