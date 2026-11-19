// Захват PCM для записи WAV: копит блоки и отдаёт их в основной поток уже в 16-битном виде.
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = options.processorOptions.channels || 2;
    this.size = 16384;
    this.buf = new Int16Array(this.size * this.channels);
    this.pos = 0;
    this.running = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') { this.flush(); this.running = false; this.port.postMessage({ done: true }); }
    };
  }
  flush() {
    if (!this.pos) return;
    const out = this.buf.slice(0, this.pos * this.channels);
    this.port.postMessage({ chunk: out }, [out.buffer]);
    this.pos = 0;
  }
  process(inputs) {
    if (!this.running) return false;
    const inp = inputs[0];
    const n = inp && inp[0] ? inp[0].length : 128;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.channels; c++) {
        const ch = inp && inp[c] ? inp[c] : (inp && inp[0]);
        let s = ch ? ch[i] : 0;
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        // лёгкий TPDF-дизеринг
        const d = (Math.random() - Math.random()) / 32768;
        this.buf[this.pos * this.channels + c] = Math.round((s + d) * 32767);
      }
      this.pos++;
      if (this.pos === this.size) this.flush();
    }
    return true;
  }
}
registerProcessor('capture', Capture);
