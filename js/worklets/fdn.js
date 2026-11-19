// Ревербератор в духе Valhalla: сеть из 16 задержек с обратной связью (FDN),
// матрица Адамара, диффузия на входе, медленная модуляция хвоста, затухание верхов,
// «шиммер» (октава вверх в петле) и «заморозка» (звук превращается в бесконечную атмосферу).
// Хвост получается гладким и тёплым — без зернистого «шипения» шумовых откликов.

const BASE_MS = [29.7, 33.1, 37.9, 41.3, 43.9, 47.3, 53.1, 57.7, 61.3, 66.1, 71.3, 75.7, 81.1, 87.3, 93.7, 99.1];
const AP_L = [4.771, 3.595, 12.73, 9.307, 6.11];
const AP_R = [4.981, 3.791, 13.13, 9.661, 6.43];
const MAX_SIZE = 2.6;

class FDN extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sr = sampleRate;
    this.N = 16;
    this.bufs = BASE_MS.map((ms) => new Float32Array(Math.ceil((ms / 1000) * MAX_SIZE * sr) + 128));
    this.w = new Int32Array(16);
    this.lp = new Float32Array(16);
    this.s = new Float32Array(16);
    this.g = new Float32Array(16);
    this.ph = new Float32Array(16);
    this.inc = new Float32Array(16);
    for (let i = 0; i < 16; i++) { this.ph[i] = Math.random() * Math.PI * 2; this.inc[i] = (2 * Math.PI * (0.07 + 0.06 * ((i * 7) % 16) / 16)) / sr; }
    this.aps = [AP_L, AP_R].map((list) => list.map((ms) => ({ buf: new Float32Array(Math.ceil((ms / 1000) * sr * 1.6) + 4), i: 0, len: Math.ceil((ms / 1000) * sr) })));
    this.pd = [new Float32Array(Math.ceil(sr * 0.35)), new Float32Array(Math.ceil(sr * 0.35))]; this.pdw = 0;
    this.ps = new Float32Array(8192); this.psw = 0; this.psD = 0; this.psW = 2400;
    this.shLp = 0; this.fb = 0;
    this.hpL = 0; this.hpR = 0; this.hpxL = 0; this.hpxR = 0;
    const d = { size: 1, decay: 4, damp: 6500, lowcut: 150, mod: 0.4, modRate: 1, diffusion: 0.7, shimmer: 0, freeze: 0, predelay: 0.04, width: 1, gain: 1 };
    this.t = { ...d, ...(options.processorOptions || {}) };
    this.c = { ...this.t };
    this.inGain = 1;
    this.port.onmessage = (e) => Object.assign(this.t, e.data);
  }

  process(inputs, outputs) {
    const inp = inputs[0] || [], out = outputs[0];
    const zero = this._zero || (this._zero = new Float32Array(128));
    const inL = inp[0] || zero, inR = inp[1] || inp[0] || zero;
    const oL = out[0], oR = out[1] || out[0];
    const n = oL.length, sr = sampleRate, t = this.t, c = this.c;

    // плавное следование параметрам (размер — очень медленно, чтобы не «плыла» высота)
    for (const k in t) c[k] += (t[k] - c[k]) * (k === 'size' ? 0.004 : 0.06);
    const frozen = c.freeze > 0.5;
    const decay = Math.max(0.2, c.decay);
    const size = Math.min(MAX_SIZE, Math.max(0.3, c.size));
    let gsum = 0;
    for (let i = 0; i < 16; i++) {
      const dl = (BASE_MS[i] / 1000) * size * sr;
      this.g[i] = frozen ? 0.99985 : Math.pow(10, (-3 * dl) / sr / decay);
      gsum += this.g[i] * this.g[i];
    }
    const gAvg2 = gsum / 16;
    const norm = Math.sqrt(Math.max(0.004, 1 - gAvg2)) * 0.9 * c.gain;
    const a = Math.exp((-2 * Math.PI * Math.min(18000, frozen ? Math.max(c.damp, 9000) : c.damp)) / sr);
    const hpA = Math.exp((-2 * Math.PI * c.lowcut) / sr);
    const modDepth = c.mod * 22;
    const apg = Math.min(0.75, c.diffusion);
    const pdS = Math.min(this.pd[0].length - 2, Math.floor(c.predelay * sr));
    const inTarget = frozen ? 0 : 1;
    const shimAmt = c.shimmer * 0.45;
    const width = c.width;
    const rateMul = c.modRate;

    const bufs = this.bufs, w = this.w, lp = this.lp, s = this.s, g = this.g, ph = this.ph, inc = this.inc;
    const pdL = this.pd[0], pdR = this.pd[1], pdLen = pdL.length;

    for (let k = 0; k < n; k++) {
      this.inGain += (inTarget - this.inGain) * 0.0005;
      // предзадержка: прямой звук успевает прозвучать раньше хвоста — направление слышно чётче
      pdL[this.pdw] = inL[k]; pdR[this.pdw] = inR[k];
      let ri = this.pdw - pdS; if (ri < 0) ri += pdLen;
      let xL = pdL[ri] * this.inGain, xR = pdR[ri] * this.inGain;
      this.pdw = (this.pdw + 1) % pdLen;

      // срез низа
      const hL = hpA * (this.hpL + xL - this.hpxL); this.hpxL = xL; this.hpL = hL; xL = hL;
      const hR = hpA * (this.hpR + xR - this.hpxR); this.hpxR = xR; this.hpR = hR; xR = hR;

      // шиммер: октава вверх из выхода обратно на вход
      if (shimAmt > 0.001) { xL += this.fb * shimAmt; xR += this.fb * shimAmt; }

      // диффузия: размазывает атаки, хвост становится шёлковым
      for (let j = 0; j < 5; j++) {
        const pL = this.aps[0][j], pR = this.aps[1][j];
        const bL = pL.buf[pL.i], yL = -apg * xL + bL; pL.buf[pL.i] = xL + apg * yL; pL.i = (pL.i + 1) % pL.len; xL = yL;
        const bR = pR.buf[pR.i], yR = -apg * xR + bR; pR.buf[pR.i] = xR + apg * yR; pR.i = (pR.i + 1) % pR.len; xR = yR;
      }

      // чтение линий с модуляцией
      let outL = 0, outR = 0;
      for (let i = 0; i < 16; i++) {
        const buf = bufs[i], len = buf.length;
        ph[i] += inc[i] * rateMul; if (ph[i] > 6.283185307) ph[i] -= 6.283185307;
        const dl = (BASE_MS[i] / 1000) * size * sr + modDepth * (1 + Math.sin(ph[i]));
        let rp = w[i] - dl; while (rp < 0) rp += len;
        const i0 = rp | 0, fr = rp - i0, i1 = i0 + 1 >= len ? 0 : i0 + 1;
        const v = buf[i0] + (buf[i1] - buf[i0]) * fr;
        lp[i] = v + (lp[i] - v) * a;
        s[i] = lp[i];
        if (i & 1) outR += (i & 2 ? -1 : 1) * s[i]; else outL += (i & 2 ? -1 : 1) * s[i];
      }
      // матрица Адамара 16×16 (быстрое преобразование Уолша)
      for (let h = 1; h < 16; h <<= 1) {
        for (let i = 0; i < 16; i += h << 1) {
          for (let j = i; j < i + h; j++) { const x = s[j], y = s[j + h]; s[j] = x + y; s[j + h] = x - y; }
        }
      }
      for (let i = 0; i < 16; i++) {
        const buf = bufs[i];
        buf[w[i]] = s[i] * 0.25 * g[i] + ((i & 1) ? xR : xL) * 0.35;
        w[i]++; if (w[i] >= buf.length) w[i] = 0;
      }

      outL *= 0.25 * norm; outR *= 0.25 * norm;
      const m = (outL + outR) * 0.5, sd = (outL - outR) * 0.5 * width;
      oL[k] = m + sd; if (oR !== oL) oR[k] = m - sd;

      // шиммер: питч-шифтер на два окна (октава вверх) + мягкий фильтр
      if (shimAmt > 0.001) {
        const ps = this.ps, W = this.psW;
        ps[this.psw] = m; this.psw = (this.psw + 1) & 8191;
        this.psD -= 1; if (this.psD < 0) this.psD += W;
        const d1 = this.psD, d2 = (d1 + W / 2) % W;
        const r1 = ps[(this.psw - 1 - d1 + 16384) & 8191], r2 = ps[(this.psw - 1 - (d2 | 0) + 16384) & 8191];
        const w1 = Math.sin((Math.PI * d1) / W), w2 = Math.sin((Math.PI * d2) / W);
        const sh = r1 * w1 * w1 + r2 * w2 * w2;
        this.shLp += (sh - this.shLp) * 0.18;
        this.fb = this.shLp;
      } else this.fb = 0;
    }
    return true;
  }
}
registerProcessor('fdn-reverb', FDN);
