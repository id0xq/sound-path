// Голос ведущего: сам читает реплики сюжета — медитация по одной кнопке.
// Откуда берётся голос (по порядку): ваш записанный голос → файлы озвучки (например, ElevenLabs) → голос системы.
const DB_NAME = 'zvukovoy-put-voice';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('clips', mode), st = tx.objectStore('clips');
    const req = fn(st);
    tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
  });
}

export class Narrator {
  constructor(app) {
    this.app = app; this.E = app.E; const ctx = this.E.ctx;
    this.on = false; this.volume = 1; this.rate = 0.86; this.pitch = 0.95;
    this.sysVoice = null; this.packs = []; this.pack = ''; this.ownKeys = new Set();
    this.playing = null; this.speakingSys = false;
    // мягкая обработка: срез низа, лёгкое присутствие, ровная громкость; голос по центру
    const f = (type, fr, q, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; b.gain.value = gain; return b; };
    this.inGain = ctx.createGain();
    const hp = f('highpass', 90, 0.7), pres = f('peaking', 3000, 0.9, 1.5), warm = f('lowshelf', 180, 0.7, 1.5);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 2.5; comp.attack.value = 0.005; comp.release.value = 0.2; comp.knee.value = 8;
    this.out = ctx.createGain(); this.out.channelCount = 2; this.out.channelCountMode = 'explicit'; this.out.channelInterpretation = 'speakers';
    this.out.gain.value = 1.15;
    this.inGain.connect(hp); hp.connect(warm); warm.connect(pres); pres.connect(comp); comp.connect(this.out);
    this.out.connect(this.E.outSum); this.out.connect(this.E.recSum);
    this.out.connect(app.voice.haloSend);          // ореол в паузах — как у живого голоса
    this.an = ctx.createAnalyser(); this.an.fftSize = 1024; this.out.connect(this.an); this.buf = new Float32Array(1024);
    this.level = 0;
  }

  async init() {
    try { const r = await fetch(new URL('../voice/manifest.json', import.meta.url)); if (r.ok) this.packs = (await r.json()).voices || []; } catch (e) {}
    try { const keys = await dbDo('readonly', (st) => st.getAllKeys()); (keys || []).forEach((k) => this.ownKeys.add(k)); } catch (e) {}
    if ('speechSynthesis' in window) {
      const pick = () => { const v = this.systemVoices(); if (!this.sysVoice && v.length) this.sysVoice = v[0]; };
      pick(); speechSynthesis.onvoiceschanged = pick;
    }
    if (!this.pack && this.packs.length) this.pack = this.packs[0].id;
  }

  // Русские голоса системы — лучшие первыми (нейронные «Natural»/«Online», затем улучшенные)
  systemVoices() {
    if (!('speechSynthesis' in window)) return [];
    const score = (v) => (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/premium|enhanced|улучш|siri/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
    return speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang)).sort((a, b) => score(b) - score(a));
  }

  sourceFor(key) {
    if (this.ownKeys.has(key)) return 'own';
    const p = this.packs.find((x) => x.id === this.pack);
    if (p && p.files && p.files[key]) return 'pack';
    return 'system';
  }

  async speak(line, setId) {
    if (!this.on || !line) return;
    const key = `${setId}:${line.key}`;
    this.stop();
    const src = this.sourceFor(key);
    try {
      if (src === 'own') return await this.playBlob(await dbDo('readonly', (st) => st.get(key)));
      if (src === 'pack') {
        const p = this.packs.find((x) => x.id === this.pack);
        const r = await fetch(new URL('../voice/' + p.files[key], import.meta.url));
        return await this.playBlob(await r.blob());
      }
    } catch (e) { console.warn('голос ведущего: файл не прочитан, читаю голосом системы', e); }
    this.speakSystem(line.text);
  }

  async playBlob(blob) {
    if (!blob) return;
    const ctx = this.E.ctx;
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = this.volume;
    s.connect(g); g.connect(this.inGain); s.start(ctx.currentTime + 0.05);
    this.playing = { s, g };
    s.onended = () => { if (this.playing && this.playing.s === s) this.playing = null; };
    this.follow();
  }

  speakSystem(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, '... '));
    u.lang = 'ru-RU'; if (this.sysVoice) u.voice = this.sysVoice;
    u.rate = this.rate; u.pitch = this.pitch; u.volume = Math.min(1, this.volume);
    u.onstart = () => { this.speakingSys = true; this.follow(); };
    u.onend = u.onerror = () => { this.speakingSys = false; };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.speakingSys = false;
    if (this.playing) { try { this.playing.s.stop(); } catch (e) {} this.playing = null; }
  }

  // Пока звучит ведущий, фон отступает; после фразы ореол мягко расцветает
  follow() {
    if (this.timer) return;
    const V = this.app.voice;
    this.timer = setInterval(() => {
      this.an.getFloatTimeDomainData(this.buf);
      let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(s / this.buf.length);
      const active = this.speakingSys || rms > 0.004;
      this.level += ((active ? 1 : 0) - this.level) * (active ? 0.4 : 0.05);
      if (!V.enabled) {
        this.E.duck(this.level, V.settings.duckDb, active);
        V.haloDuck.gain.setTargetAtTime(1 - this.level * 0.94, this.E.now, active ? 0.04 : 0.25);
      }
      if (!active && !this.playing && this.level < 0.01) { clearInterval(this.timer); this.timer = null; }
    }, 25);
  }

  // ---- Свой голос: запись реплик в браузере (хранится только на этом устройстве) ----
  async startRecording(key) {
    const V = this.app.voice;
    if (!V.stream) await V.enable();
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(V.stream, mime ? { mimeType: mime, audioBitsPerSecond: 160000 } : undefined);
    const chunks = []; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    this.rec = { mr, key, chunks, done: new Promise((res) => (mr.onstop = res)) };
    mr.start();
  }
  async stopRecording() {
    if (!this.rec) return;
    const { mr, key, chunks, done } = this.rec; this.rec = null;
    mr.stop(); await done;
    const blob = new Blob(chunks, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
    await dbDo('readwrite', (st) => st.put(blob, key));
    this.ownKeys.add(key);
  }
  async removeOwn(key) { await dbDo('readwrite', (st) => st.delete(key)); this.ownKeys.delete(key); }
  async previewOwn(key) { const b = await dbDo('readonly', (st) => st.get(key)); const was = this.on; this.on = true; this.stop(); await this.playBlob(b); this.on = was; }
}
