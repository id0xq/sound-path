// Запись сессии: общий микс (атмосфера + голос) и по желанию — голос отдельной дорожкой.
// Форматы: WAV 16 бит (студийно, без потерь) или сжатый (Opus/AAC, компактно для долгих сетов).
export class Recorder {
  constructor(E, voice) {
    this.E = E; this.voice = voice; this.active = false; this.paused = false; this.takes = [];
    this.workletReady = null;
  }
  async ensureWorklet() {
    if (!this.workletReady) this.workletReady = this.E.ctx.audioWorklet.addModule(new URL('./worklets/capture.js', import.meta.url));
    return this.workletReady;
  }
  static compressedMime() {
    if (!window.MediaRecorder) return null;
    const list = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
    return list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
  }

  async start({ format = 'wav', voiceStem = false, name = 'sessiya' } = {}) {
    if (this.active) return;
    const E = this.E, ctx = E.ctx;
    this.name = name; this.format = format; this.startedAt = ctx.currentTime; this.pausedTotal = 0; this.pauseStart = 0;
    this.parts = [];
    if (format === 'wav') {
      await this.ensureWorklet();
      this.parts.push(this.wavPart(E.recTap, 2, 'mix'));
    } else {
      const mime = Recorder.compressedMime();
      if (!mime) { await this.ensureWorklet(); this.parts.push(this.wavPart(E.recTap, 2, 'mix')); }
      else {
        const dest = ctx.createMediaStreamDestination(); dest.channelCount = 2;
        E.recTap.connect(dest);
        const mr = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 256000 });
        const chunks = []; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        mr.start(1000);
        this.parts.push({ kind: 'mix', type: 'mr', mr, chunks, dest, mime });
      }
    }
    if (voiceStem) {
      await this.ensureWorklet();
      this.parts.push(this.wavPart(this.voice.toStereo, 1, 'voice'));
    }
    this.active = true; this.paused = false;
  }

  wavPart(source, channels, kind) {
    const ctx = this.E.ctx;
    const node = new AudioWorkletNode(ctx, 'capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: channels, channelCountMode: 'explicit', channelInterpretation: 'speakers', processorOptions: { channels } });
    // узел должен «тянуться» графом: подключаем к выходу через нулевую громкость
    const silent = ctx.createGain(); silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    const part = { kind, type: 'wav', node, silent, channels, chunks: [], frames: 0, source, paused: false };
    node.port.onmessage = (e) => {
      if (e.data.chunk) { if (!part.paused) { part.chunks.push(e.data.chunk); part.frames += e.data.chunk.length / channels; } }
      if (e.data.done) part.resolve && part.resolve();
    };
    source.connect(node);
    return part;
  }

  pause() {
    if (!this.active || this.paused) return;
    this.paused = true; this.pauseStart = this.E.ctx.currentTime;
    this.parts.forEach((p) => { if (p.type === 'mr') p.mr.pause(); else p.paused = true; });
  }
  resume() {
    if (!this.active || !this.paused) return;
    this.paused = false; this.pausedTotal += this.E.ctx.currentTime - this.pauseStart;
    this.parts.forEach((p) => { if (p.type === 'mr') p.mr.resume(); else p.paused = false; });
  }
  get elapsed() {
    if (!this.active) return 0;
    const now = this.E.ctx.currentTime;
    return now - this.startedAt - this.pausedTotal - (this.paused ? now - this.pauseStart : 0);
  }
  // примерный объём WAV в памяти
  get sizeMB() { return this.parts.filter((p) => p.type === 'wav').reduce((a, p) => a + p.frames * p.channels * 2, 0) / 1048576; }

  async stop() {
    if (!this.active) return [];
    this.active = false;
    const sr = this.E.ctx.sampleRate, stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const base = `${this.name}_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}-${pad(stamp.getMinutes())}`;
    const results = [];
    for (const p of this.parts) {
      if (p.type === 'mr') {
        await new Promise((res) => { p.mr.onstop = res; p.mr.stop(); });
        try { this.E.recTap.disconnect(p.dest); } catch (e) {}
        const ext = p.mime.includes('mp4') ? 'm4a' : p.mime.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(p.chunks, { type: p.mime.split(';')[0] });
        results.push({ name: `${base}_${p.kind === 'voice' ? 'golos' : 'miks'}.${ext}`, blob, kind: p.kind, duration: this.elapsed });
      } else {
        await new Promise((res) => { p.resolve = res; p.node.port.postMessage('stop'); setTimeout(res, 1500); });
        try { p.source.disconnect(p.node); p.node.disconnect(); p.silent.disconnect(); } catch (e) {}
        const blob = encodeWav(p.chunks, p.channels, sr);
        results.push({ name: `${base}_${p.kind === 'voice' ? 'golos' : 'miks'}.wav`, blob, kind: p.kind, duration: p.frames / sr });
      }
    }
    results.forEach((r) => { r.url = URL.createObjectURL(r.blob); r.size = r.blob.size; });
    this.takes.unshift(...results);
    return results;
  }
}

function encodeWav(chunks, channels, sr) {
  const dataLen = chunks.reduce((a, c) => a + c.byteLength, 0);
  const h = new ArrayBuffer(44), v = new DataView(h);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataLen, true);
  return new Blob([h, ...chunks], { type: 'audio/wav' });
}
