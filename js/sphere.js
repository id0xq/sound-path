// Живая картина звука. Четыре вида:
//  • Купол — вид сверху на зеркальный купол: грани вспыхивают там, где звучат звуки; голова повёрнута как у слушателя.
//  • Поле — каждое мгновение звука как точка в полукруге: слева — левое ухо, справа — правое, дальше от центра — громче.
//  • Лиссажу — форма стерео: светящаяся нить, которая дышит вместе со звуком.
//  • Кристалл — спектр, собранный в шестилучевую снежинку: низы у центра, верха на кончиках лучей.
import { toPolar, clamp } from './util.js';

export const KIND_COLORS = {
  handpan: '#f0d49a', bells: '#e8f6ff', bowl: '#ffe2bd', ocarina: '#b5f0d2', bird: '#fff1a8', water: '#8fe3f5',
  rhythm: '#f7b99a', heart: '#ffa9b6', rattle: '#efd9b8', wash: '#cfc2ff', gong: '#ffc99a', kalimba: '#aef3ea',
  crickets: '#cdf3a6', fire: '#ffb08a', live: '#ffffff', instr: '#f0d49a',
};

const RINGS = 8;

export class Sphere {
  constructor(canvas, app) {
    this.cv = canvas; this.app = app; this.ctx = canvas.getContext('2d');
    this.tint = '#86d3e8'; this.sprites = {}; this.marker = null; this.onPick = null; this.mode = 'dome';
    this.peak = 0.05; this.spec = new Float32Array(72);
    this.facets = [];
    for (let k = 1; k <= RINGS; k++) {
      const n = 6 * k, off = (k % 2) * (Math.PI / n);
      for (let i = 0; i < n; i++) {
        const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 1) / n) * Math.PI * 2;
        const r0 = (k - 1) / RINGS, r1 = k / RINGS, rm = (r0 + r1) / 2, am = (a0 + a1) / 2;
        this.facets.push({ a0, a1, r0, r1, cx: Math.sin(am) * rm, cy: -Math.cos(am) * rm });
      }
    }
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.pick(e));
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  setMode(m) { this.mode = m; this.ctx.clearRect(0, 0, this.w, this.h); }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.R = Math.min(this.w, this.h) * 0.4; this.cx = this.w / 2; this.cy = this.h / 2;
  }
  radial(rh) { return rh <= 8 ? Math.log1p(rh) / Math.log1p(8) : 1 + 0.22 * Math.min(1, Math.log(rh / 8) / Math.log(5)); }
  project(p) {
    const { az, el, d } = toPolar(p);
    const rh = d * Math.cos((el * Math.PI) / 180);
    const r = this.radial(rh) * this.R, a = (az * Math.PI) / 180;
    return { x: this.cx + Math.sin(a) * r, y: this.cy - Math.cos(a) * r, el, d };
  }
  pick(e) {
    if (this.mode !== 'dome') return;
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left - this.cx, y = e.clientY - r.top - this.cy;
    const rr = Math.hypot(x, y) / this.R; if (rr > 1.25) return;
    const az = (Math.atan2(x, -y) * 180) / Math.PI;
    const rh = rr <= 1 ? Math.expm1(rr * Math.log1p(8)) : 8 * Math.pow(5, (rr - 1) / 0.22);
    this.marker = { x: x + this.cx, y: y + this.cy, t: performance.now() };
    this.onPick && this.onPick({ az, d: clamp(rh, 1.3, 30) });
  }
  sprite(color) {
    if (this.sprites[color]) return this.sprites[color];
    const s = document.createElement('canvas'); s.width = s.height = 64; const c = s.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.12, color); g.addColorStop(0.45, color + '40'); g.addColorStop(1, color + '00');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (this.sprites[color] = s);
  }
  fade(alpha) {
    const c = this.ctx; c.globalCompositeOperation = 'destination-out'; c.fillStyle = `rgba(0,0,0,${alpha})`; c.fillRect(0, 0, this.w, this.h); c.globalCompositeOperation = 'source-over';
  }
  stereo() {
    const E = this.app.E; const n = E.anL.fftSize;
    this.L = this.L || new Float32Array(n); this.Rr = this.Rr || new Float32Array(n);
    E.anL.getFloatTimeDomainData(this.L); E.anR.getFloatTimeDomainData(this.Rr);
    let p = 0; for (let i = 0; i < n; i += 4) p = Math.max(p, Math.abs(this.L[i]), Math.abs(this.Rr[i]));
    this.peak = Math.max(this.peak * 0.992, p, 0.02);
    return n;
  }

  draw() {
    if (!this.w || !this.app.E) return;
    if (this.mode === 'field') return this.drawField();
    if (this.mode === 'lissajous') return this.drawLissajous();
    if (this.mode === 'crystal') return this.drawCrystal();
    this.drawDome();
  }

  // ---------- Купол ----------
  drawDome() {
    const c = this.ctx, A = this.app, E = A.E, now = E.now, R = this.R, cx = this.cx, cy = this.cy;
    c.clearRect(0, 0, this.w, this.h);
    const br = A.breath ? A.breath.state(now) : null, breathK = br ? br.k : 0;
    const srcs = [];
    for (const v of E.viz.values()) {
      const act = v.activity ? v.activity(now) : 1; if (act < 0.02) continue;
      const pos = v.posAt(now); if (!pos) continue;
      srcs.push({ ...this.project(pos), act, color: KIND_COLORS[v.kind] || '#ffffff' });
    }
    const tint = hexRgb(this.tint);
    // слабое ледяное свечение под куполом
    const glow = c.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.15);
    glow.addColorStop(0, `rgba(${tint.join(',')},${0.08 + breathK * 0.08})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow; c.fillRect(0, 0, this.w, this.h);
    const k = this.reduced ? 1 : 0.16;
    for (const f of this.facets) {
      let L = 0, rC = 0, gC = 0, bC = 0;
      const fx = cx + f.cx * R, fy = cy + f.cy * R;
      for (const s of srcs) {
        const d2 = ((fx - s.x) ** 2 + (fy - s.y) ** 2) / (R * R);
        const w = s.act * Math.exp(-d2 * 24) * (0.6 + 0.4 * clamp((s.el + 10) / 60, 0, 1));
        if (w < 0.004) continue;
        const col = hexRgb(s.color); L += w; rC += col[0] * w; gC += col[1] * w; bC += col[2] * w;
      }
      const tr = L > 0 ? rC / L : tint[0], tg = L > 0 ? gC / L : tint[1], tb = L > 0 ? bC / L : tint[2];
      f.L = (f.L ?? 0) + (Math.min(1, L) - (f.L ?? 0)) * k;
      f.r = (f.r ?? tr) + (tr - (f.r ?? tr)) * k; f.g = (f.g ?? tg) + (tg - (f.g ?? tg)) * k; f.b = (f.b ?? tb) + (tb - (f.b ?? tb)) * k;
      const lit = f.L, base = 0.04 + 0.06 * (1 - f.r1) + breathK * 0.05;
      c.beginPath();
      c.arc(cx, cy, f.r1 * R, f.a0 - Math.PI / 2, f.a1 - Math.PI / 2);
      c.arc(cx, cy, f.r0 * R, f.a1 - Math.PI / 2, f.a0 - Math.PI / 2, true);
      c.closePath();
      // зеркальная грань: холодное серебро + отражённый цвет звука
      const rr = Math.round(lerp(214, f.r, lit)), gg = Math.round(lerp(236, f.g, lit)), bb = Math.round(lerp(250, f.b, lit));
      const grad = c.createLinearGradient(fx - 8, fy - 8, fx + 8, fy + 8);
      grad.addColorStop(0, `rgba(${rr},${gg},${bb},${base + lit * 0.62})`);
      grad.addColorStop(1, `rgba(${rr},${gg},${bb},${(base + lit * 0.62) * 0.55})`);
      c.fillStyle = grad; c.fill();
      c.strokeStyle = 'rgba(8,20,30,0.6)'; c.lineWidth = 1; c.stroke();
    }
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.strokeStyle = 'rgba(220,240,255,0.42)'; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.arc(cx, cy, R + 4, -2.4, -0.7); c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1; c.stroke();

    c.globalCompositeOperation = 'lighter';
    for (const s of srcs) {
      const size = (10 + 22 * clamp((s.el + 20) / 80, 0, 1)) * (s.d > 8 ? 0.7 : 1) * (0.6 + 0.4 * s.act);
      c.globalAlpha = clamp(s.act, 0, 1) * (s.d > 8 ? 0.55 : 0.95);
      c.drawImage(this.sprite(s.color), s.x - size, s.y - size, size * 2, size * 2);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // слушатель, повёрнутый так же, как его голова
    const vk = A.voice && A.voice.enabled ? A.voice.speaking : (A.narrator ? A.narrator.level : 0);
    if (vk > 0.02) { c.beginPath(); c.arc(cx, cy, 16 + vk * 14, 0, Math.PI * 2); c.strokeStyle = `rgba(191,231,245,${0.25 + vk * 0.5})`; c.lineWidth = 2; c.stroke(); }
    const yaw = ((E.head && E.head.yaw) || 0) * Math.PI / 180;
    c.save(); c.translate(cx, cy); c.rotate(yaw);
    if (Math.abs(yaw) > 0.02) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R * 0.35, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35); c.closePath(); c.fillStyle = 'rgba(191,231,245,0.08)'; c.fill(); }
    c.fillStyle = '#eef8fc';
    c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-4, -6.5); c.lineTo(0, -13); c.lineTo(4, -6.5); c.fill();
    c.fillRect(-10.5, -3, 2.5, 6); c.fillRect(8, -3, 2.5, 6);
    c.restore();

    c.fillStyle = 'rgba(237,246,251,0.55)'; c.font = '12px "Golos Text", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lr = R * 1.13;
    c.fillText('впереди', cx, cy - lr); c.fillText('позади', cx, cy + lr);
    c.save(); c.translate(cx - lr, cy); c.rotate(-Math.PI / 2); c.fillText('слева', 0, 0); c.restore();
    c.save(); c.translate(cx + lr, cy); c.rotate(Math.PI / 2); c.fillText('справа', 0, 0); c.restore();

    if (this.marker && A.live && A.live.mode === 'point') {
      const m = this.marker, pulse = 1 + 0.25 * Math.max(0, 1 - (performance.now() - m.t) / 600);
      c.strokeStyle = '#bfe7f5'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(m.x, m.y, 11 * pulse, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(m.x - 17, m.y); c.lineTo(m.x - 6, m.y); c.moveTo(m.x + 6, m.y); c.lineTo(m.x + 17, m.y);
      c.moveTo(m.x, m.y - 17); c.lineTo(m.x, m.y - 6); c.moveTo(m.x, m.y + 6); c.lineTo(m.x, m.y + 17); c.stroke();
    }
  }

  // ---------- Поле (полярные точки) ----------
  drawField() {
    const c = this.ctx; this.fade(this.reduced ? 1 : 0.2);
    const n = this.stereo(), L = this.L, Rr = this.Rr;
    const base = this.h * 0.82, R = Math.min(this.w * 0.46, this.h * 0.74), cx = this.cx;
    c.strokeStyle = 'rgba(220,240,255,0.16)'; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, base, R, Math.PI, 0); c.lineTo(cx - R, base); c.stroke();
    c.beginPath(); c.moveTo(cx, base); c.lineTo(cx - R * 0.707, base - R * 0.707); c.moveTo(cx, base); c.lineTo(cx + R * 0.707, base - R * 0.707); c.stroke();
    c.fillStyle = 'rgba(237,246,251,0.45)'; c.font = '11px "Golos Text", system-ui'; c.textAlign = 'center';
    c.fillText('Л', cx - R - 10, base); c.fillText('П', cx + R + 10, base);
    const col = hexRgb(mix(this.tint, '#bfe7f5', 0.5));
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(${col.join(',')},0.55)`;
    const inv = 1 / this.peak;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = Rr[i];
      const m = (l + r) * 0.7071, s = (r - l) * 0.7071;
      const amp = Math.sqrt(l * l + r * r) * inv; if (amp < 0.01) continue;
      const th = Math.atan2(s, Math.abs(m)), rad = Math.min(1, Math.sqrt(amp)) * R;
      c.fillRect(cx + Math.sin(th) * rad, base - Math.cos(th) * rad, 1.7, 1.7);
    }
    c.globalCompositeOperation = 'source-over';
  }

  // ---------- Лиссажу ----------
  drawLissajous() {
    const c = this.ctx; this.fade(this.reduced ? 1 : 0.16);
    const n = this.stereo(), L = this.L, Rr = this.Rr;
    const cx = this.cx, cy = this.cy, S = this.R * 1.05;
    c.strokeStyle = 'rgba(220,240,255,0.14)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx, cy - S); c.lineTo(cx + S, cy); c.lineTo(cx, cy + S); c.lineTo(cx - S, cy); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(cx, cy - S); c.lineTo(cx, cy + S); c.moveTo(cx - S, cy); c.lineTo(cx + S, cy); c.stroke();
    const col = hexRgb(mix(this.tint, '#e8f6ff', 0.55)), inv = 1 / this.peak;
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(${col.join(',')},0.32)`; c.lineWidth = 1.1;
    c.beginPath();
    for (let i = 0; i < n; i += 2) {
      const l = L[i] * inv, r = Rr[i] * inv;
      const x = cx + (r - l) * 0.7071 * S * 0.9, y = cy - (l + r) * 0.7071 * S * 0.9;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  }

  // ---------- Кристалл (спектр-снежинка) ----------
  drawCrystal() {
    const c = this.ctx, E = this.app.E; this.fade(this.reduced ? 1 : 0.22);
    const a = E.anL, n = a.frequencyBinCount;
    this.fb = this.fb || new Float32Array(n); this.fb2 = this.fb2 || new Float32Array(n);
    a.getFloatFrequencyData(this.fb); E.anR.getFloatFrequencyData(this.fb2);
    const sr = E.ctx.sampleRate, bins = this.spec.length;
    for (let j = 0; j < bins; j++) {
      const f0 = 60 * Math.pow(12000 / 60, j / bins), f1 = 60 * Math.pow(12000 / 60, (j + 1) / bins);
      const i0 = Math.max(1, Math.floor((f0 / (sr / 2)) * n)), i1 = Math.max(i0 + 1, Math.floor((f1 / (sr / 2)) * n));
      let m = -140; for (let i = i0; i < i1; i++) m = Math.max(m, (this.fb[i] + this.fb2[i]) / 2);
      const v = clamp((m + 95) / 65, 0, 1);
      this.spec[j] += (v - this.spec[j]) * (v > this.spec[j] ? 0.5 : 0.08);
    }
    const cx = this.cx, cy = this.cy, R = this.R * 1.05, rot = this.reduced ? 0 : E.now * 0.03;
    const col = hexRgb(mix(this.tint, '#e8f6ff', 0.6));
    let total = 0; for (let j = 0; j < bins; j++) total += this.spec[j];
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
    glow.addColorStop(0, `rgba(${col.join(',')},${0.05 + total / bins * 0.25})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow; c.fillRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const ang = rot + (k * Math.PI) / 3;
      const dx = Math.sin(ang), dy = -Math.cos(ang);
      c.strokeStyle = `rgba(${col.join(',')},0.22)`; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + dx * R * 0.97, cy + dy * R * 0.97); c.stroke();
      for (let j = 2; j < bins; j += 2) {
        const v = this.spec[j]; if (v < 0.04) continue;
        const r = R * (0.1 + 0.86 * (j / bins)), px = cx + dx * r, py = cy + dy * r;
        const len = v * R * 0.3 * (1 - (j / bins) * 0.55);
        c.strokeStyle = `rgba(${col.join(',')},${0.15 + v * 0.6})`; c.lineWidth = 0.8 + v * 1.4;
        for (const side of [-1, 1]) {
          const ba = ang + side * (Math.PI / 3);
          c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.sin(ba) * len, py - Math.cos(ba) * len); c.stroke();
        }
      }
    }
    c.globalCompositeOperation = 'source-over';
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const rgbCache = {};
function hexRgb(h) {
  if (rgbCache[h]) return rgbCache[h];
  const n = parseInt(h.slice(1), 16);
  return (rgbCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return '#' + A.map((x, i) => Math.round(lerp(x, B[i], t)).toString(16).padStart(2, '0')).join('');
}
