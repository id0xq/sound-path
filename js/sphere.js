// Живая картина звука. Четыре вида:
//  • Купол — вид сверху на зеркальный купол: грани вспыхивают там, где звучат звуки; голова повёрнута как у слушателя.
//  • Поле — каждое мгновение звука как точка в полукруге: слева — левое ухо, справа — правое, дальше от центра — громче.
//  • Лиссажу — форма стерео: светящаяся нить, которая дышит вместе со звуком.
//  • Кристалл — спектр, собранный в шестилучевую снежинку: низы у центра, верха на кончиках лучей.
//  • Хладни — песок на звучащей пластине: у каждой ноты свой узор, песок собирается в её узловых линиях.
import { toPolar, clamp } from './util.js';

export const KIND_COLORS = {
  handpan: '#f0d49a', bells: '#e8f6ff', bowl: '#ffe2bd', ocarina: '#b5f0d2', bird: '#fff1a8', water: '#8fe3f5',
  rhythm: '#f7b99a', heart: '#ffa9b6', rattle: '#efd9b8', wash: '#cfc2ff', gong: '#ffc99a', kalimba: '#aef3ea',
  crickets: '#cdf3a6', fire: '#ffb08a', live: '#ffffff', instr: '#f0d49a', piano: '#f6ecdc',
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
  setMode(m) { this.mode = m; this.ctx.clearRect(0, 0, this.w, this.h); this.img = null; }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
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
    if (this.mode === 'chladni') return this.drawChladni();
    if (this.mode === 'breath') return this.drawBreath();
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
      c.fillStyle = `rgba(${rr},${gg},${bb},${(base + lit * 0.62) * (0.8 + 0.2 * Math.cos(f.a0 * 2))})`; c.fill();
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
  // Каждый сэмпл — крошечная светящаяся точка; точки копятся и медленно гаснут, как на экране анализатора
  buffer() {
    const W = this.cv.width, H = this.cv.height;
    if (!this.img || this.img.width !== W || this.img.height !== H) { this.img = this.ctx.createImageData(W, H); this.acc = new Float32Array(W * H); }
    return { W, H, img: this.img, acc: this.acc };
  }
  flush(col, gain = 1) {
    const { W, H, img, acc } = this.buffer(), d = img.data;
    for (let i = 0, j = 0; i < acc.length; i++, j += 4) {
      const v = acc[i]; if (v < 0.004) { if (d[j + 3]) d[j + 3] = 0; acc[i] = 0; continue; }
      const a = Math.min(1, v * gain);
      d[j] = col[0] + (255 - col[0]) * a * a; d[j + 1] = col[1] + (255 - col[1]) * a * a; d[j + 2] = col[2] + (255 - col[2]) * a * a; d[j + 3] = 255 * a;
    }
    this.ctx.putImageData(img, 0, 0);
  }
  drawField() {
    const c = this.ctx, { W, H, acc } = this.buffer();
    const decay = this.reduced ? 0 : 0.86;
    for (let i = 0; i < acc.length; i++) acc[i] *= decay;
    const n = this.stereo(), L = this.L, Rr = this.Rr, dpr = W / this.w;
    const base = H * 0.84, R = Math.min(W * 0.46, H * 0.76), cx = W / 2, inv = 1 / this.peak;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = Rr[i];
      const m = (l + r) * 0.7071, s = (r - l) * 0.7071;
      const amp = Math.sqrt(l * l + r * r) * inv; if (amp < 0.008) continue;
      const th = Math.atan2(s, Math.abs(m)), rad = Math.min(1, Math.sqrt(amp)) * R;
      const x = (cx + Math.sin(th) * rad) | 0, y = (base - Math.cos(th) * rad) | 0;
      if (x >= 0 && x < W && y >= 0 && y < H) acc[y * W + x] += 0.24;
    }
    this.flush(hexRgb(mix(this.tint, '#bfe7f5', 0.5)), 1);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = 'rgba(220,240,255,0.18)'; c.lineWidth = dpr;
    c.beginPath(); c.arc(cx, base, R, Math.PI, 0); c.lineTo(cx - R, base); c.stroke();
    c.beginPath(); c.moveTo(cx, base); c.lineTo(cx - R * 0.707, base - R * 0.707); c.moveTo(cx, base); c.lineTo(cx + R * 0.707, base - R * 0.707); c.stroke();
    c.fillStyle = 'rgba(237,246,251,0.5)'; c.font = `${11 * dpr}px "Golos Text", system-ui`; c.textAlign = 'center';
    c.fillText('Л', cx - R - 12 * dpr, base); c.fillText('П', cx + R + 12 * dpr, base);
    c.restore();
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
  // ---------- Пластина Хладни ----------
  // У каждой ноты свой узор: чем выше нота, тем сложнее фигура (как у настоящей пластины, где высокие
  // собственные частоты дают больше узловых линий). Ноты приходят прямо от инструментов, поэтому узор
  // меняется точно в момент удара: песок подпрыгивает и собирается в линии новой ноты. Когда звучит
  // аккорд, узоры смешиваются по громкости. Для голоса и живых звуков — высота из спектра.
  drawChladni() {
    const c = this.ctx, E = this.app.E, now = E.now, P = Math.PI;
    if (!this.sand) {
      const count = (navigator.hardwareConcurrency || 4) <= 4 ? 9000 : 15000;
      this.sand = new Float32Array(count * 2);
      for (let i = 0; i < this.sand.length; i++) this.sand[i] = Math.random() * 2 - 1;
      this.fb = new Float32Array(E.anL.frequencyBinCount);
      this.mix = new Map(); this.kick = 0; this.seen = 0; this.label = '';
      // таблица узоров по возрастанию сложности (n² + m²), у каждой — два знака
      const T = [];
      for (let m = 1; m <= 13; m++) for (let n = 0; n < m; n++) T.push({ n, m, k: n * n + m * m });
      T.sort((a, b) => a.k - b.k || a.n - b.n);
      this.modes = []; T.forEach((t) => { this.modes.push({ ...t, s: -1 }); if (t.n > 0) this.modes.push({ ...t, s: 1 }); });
      this.cosTab = []; this.sinTab = [];
      for (let n = 0; n <= 13; n++) {
        const a = new Float32Array(1025), b = new Float32Array(1025);
        for (let i = 0; i <= 1024; i++) { a[i] = Math.cos(n * P * i / 1024); b[i] = -n * P * Math.sin(n * P * i / 1024); }
        this.cosTab.push(a); this.sinTab.push(b);
      }
      this.lastKick = 0;
    }
    const modeFor = (midi) => this.modes[clamp(Math.round(midi) - 33, 0, this.modes.length - 1)];

    // какие ноты звучат сейчас и насколько громко
    const act = [];
    for (const n of E.notes) {
      if (n.t > now + 0.02 || now - n.t > 8) continue;
      const a = n.vel * Math.exp(-(now - n.t) / Math.min(1.1, Math.max(0.3, n.decay)));
      if (a > 0.04) act.push({ midi: n.midi, a, t: n.t });
      // песок подпрыгивает на удар, но не чаще, чем успевает лечь
      if (n.t > this.seen && n.t <= now + 0.02 && now - this.lastKick > 0.28) { this.kick = Math.max(this.kick, 0.25 + n.vel * 0.45); this.lastKick = now; }
    }
    for (const n of E.notes) if (n.t <= now + 0.02) this.seen = Math.max(this.seen, n.t);
    // одна и та же нота могла прозвучать несколько раз — складываем
    const by = new Map(); for (const n of act) { const k = Math.round(n.midi); const p = by.get(k); by.set(k, p ? { ...p, a: Math.max(p.a, n.a) + 0.3 * Math.min(p.a, n.a) } : n); }
    let top = [...by.values()].sort((x, y) => y.a - x.a).slice(0, 2);
    let energy = clamp(top.reduce((s, n) => s + n.a, 0), 0, 1.2);
    if (!top.length) {
      // голос, живой звук, природа: высота из спектра
      E.anL.getFloatFrequencyData(this.fb);
      const len = this.fb.length, hz = E.ctx.sampleRate / 2 / len;
      let best = -200, bi = 0; for (let i = Math.floor(70 / hz); i < Math.floor(1800 / hz); i++) if (this.fb[i] > best) { best = this.fb[i]; bi = i; }
      energy = clamp((best + 80) / 45, 0, 1) * 0.8;
      if (energy > 0.15 && bi) top = [{ midi: 69 + 12 * Math.log2((bi * hz) / 440), a: energy }];
    }
    // плавное перетекание узоров
    const sum = top.reduce((s, n) => s + n.a * n.a, 0) || 1;
    for (const v of this.mix.values()) v.target = 0;
    top.forEach((n, i) => {
      const md = modeFor(n.midi), key = md.n + ':' + md.m + ':' + md.s;
      const v = this.mix.get(key) || { md, w: 0, midi: n.midi };
      v.target = (n.a * n.a) / sum; v.midi = n.midi; this.mix.set(key, v);
      if (i === 0) this.lead = v;
    });
    for (const [key, v] of this.mix) { v.w += (v.target - v.w) * (v.target > v.w ? 0.35 : 0.08); if (v.w < 0.01 && !v.target) this.mix.delete(key); }
    if (!this.mix.size) { const md = modeFor(57); this.mix.set('idle', { md, w: 1, target: 1, midi: 57 }); }
    const parts = [...this.mix.values()].sort((a, b) => b.w - a.w).slice(0, 2);

    this.kick *= 0.86;
    // Песок подпрыгивает там, где пластина дрожит, и соскальзывает туда, где она неподвижна (узловые линии)
    const shake = this.reduced ? 0 : 0.004 + energy * 0.018 + this.kick * 0.05;
    const S = this.sand, CT = this.cosTab, DT = this.sinTab;
    const p0 = parts[0], p1 = parts[1];
    // шаг скольжения подстроен под сложность узора: и простые, и сложные фигуры ложатся одинаково быстро
    const kk = Math.max(1, p0.md.n * p0.md.n + p0.md.m * p0.md.m);
    const slide = this.reduced ? 0 : (0.32 / (P * P * kk)) * (0.6 + energy) * (1 - Math.min(0.8, this.kick));
    const a0 = CT[p0.md.n], b0 = CT[p0.md.m], da0 = DT[p0.md.n], db0 = DT[p0.md.m], s0 = p0.md.s, q0 = Math.max(0.35, p0.w * p0.w);
    const a1 = p1 ? CT[p1.md.n] : null, b1 = p1 ? CT[p1.md.m] : null, s1 = p1 ? p1.md.s : 0, q1 = p1 ? p1.w * p1.w : 0;
    for (let i = 0; i < S.length; i += 2) {
      const x = S[i], y = S[i + 1], xi = ((x + 1) * 512) | 0, yi = ((y + 1) * 512) | 0;
      const ax = a0[xi], ay = a0[yi], bx = b0[xi], by = b0[yi];
      const u0 = ax * by + s0 * bx * ay;
      let A = q0 * u0 * u0;
      let gx = q0 * u0 * (da0[xi] * by + s0 * db0[xi] * ay), gy = q0 * u0 * (ax * db0[yi] + s0 * bx * da0[yi]);
      if (a1) {
        const cx = a1[xi], cy = a1[yi], ex = b1[xi], ey = b1[yi], u1 = cx * ey + s1 * ex * cy;
        // вторая нота только встряхивает песок: линии рисует ведущая, иначе песок соберётся в точки пересечений
        A += 0.25 * q1 * u1 * u1;
      }
      const k = Math.sqrt(A) * shake;
      let dx = (Math.random() - 0.5) * k * 2 - gx * slide, dy = (Math.random() - 0.5) * k * 2 - gy * slide;
      if (dx > 0.04) dx = 0.04; else if (dx < -0.04) dx = -0.04;
      if (dy > 0.04) dy = 0.04; else if (dy < -0.04) dy = -0.04;
      let nx = x + dx, ny = y + dy;
      if (nx < -1) nx = -1 - (nx + 1); if (nx > 1) nx = 1 - (nx - 1); if (ny < -1) ny = -1 - (ny + 1); if (ny > 1) ny = 1 - (ny - 1);
      S[i] = nx; S[i + 1] = ny;
    }
    const { W, H, acc } = this.buffer();
    for (let i = 0; i < acc.length; i++) acc[i] *= 0.5;
    const side = Math.min(W, H) * 0.78, ox = (W - side) / 2, oy = (H - side) / 2, half = side / 2;
    for (let i = 0; i < S.length; i += 2) {
      const x = (ox + half + S[i] * half) | 0, y = (oy + half + S[i + 1] * half) | 0;
      if (x >= 0 && x < W - 1 && y >= 0 && y < H - 1) { const j = y * W + x; acc[j] += 0.55; acc[j + 1] += 0.25; acc[j + W] += 0.25; acc[j + W + 1] += 0.15; }
    }
    this.flush(hexRgb(mix(this.tint, '#e8f6ff', 0.6)), 1.2);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = `rgba(220,240,255,${0.22 + this.kick * 0.3})`; c.lineWidth = W / this.w;
    c.strokeRect(ox - 2, oy - 2, side + 4, side + 4);
    const L = this.lead && this.lead.target ? this.lead : parts[0];
    if (L && L.midi !== undefined) {
      const SOLF = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'];
      const m = Math.round(L.midi); this.label = `${SOLF[((m % 12) + 12) % 12]} ${Math.floor(m / 12) - 1}  ·  узор ${L.md.n}·${L.md.m}`;
    }
    c.fillStyle = 'rgba(237,246,251,0.55)'; c.font = `${12 * W / this.w}px "Golos Text", system-ui`; c.textAlign = 'center';
    c.fillText(this.label, W / 2, oy + side + 22 * W / this.w);
    c.restore();
  }

  // ---------- Шар дыхания ----------
  drawBreath() {
    const c = this.ctx, A = this.app, E = A.E, now = E.now, cx = this.cx, cy = this.cy, R = this.R;
    c.clearRect(0, 0, this.w, this.h);
    const st = A.breathwork && A.breathwork.state(now);
    if (!st) return;
    const col = hexRgb(this.tint);
    const r = R * (0.32 + 0.58 * st.fill);
    // орбита прогресса программы
    const prog = A.breathwork.progress(now);
    c.strokeStyle = 'rgba(220,240,255,0.14)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, R * 1.02, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = `rgba(${col.join(',')},0.8)`; c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, R * 1.02, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); c.stroke();
    // ледяной шар
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.35, `rgba(${col.join(',')},0.35)`); g.addColorStop(1, `rgba(${col.join(',')},0.05)`);
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(235,248,255,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    // шесть граней-лучей, как у снежинки
    c.strokeStyle = 'rgba(235,248,255,0.16)'; c.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3 + now * 0.02; c.beginPath(); c.moveTo(cx + Math.cos(an) * r * 0.3, cy + Math.sin(an) * r * 0.3); c.lineTo(cx + Math.cos(an) * r * 0.95, cy + Math.sin(an) * r * 0.95); c.stroke(); }
    // фаза внутри фазы — тонкая дуга
    if (st.k !== undefined && !st.open) { c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.k); c.stroke(); }
    c.fillStyle = '#f2fbff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${Math.round(R * 0.15)}px Forum, Georgia, serif`;
    c.fillText(st.label || '', cx, cy - R * 0.05);
    c.font = `${Math.round(R * 0.1)}px "Golos Text", system-ui`; c.fillStyle = 'rgba(242,251,255,0.8)';
    const sec = Math.max(0, st.remain);
    c.fillText(st.open ? `${Math.floor(sec)} с` : `${Math.ceil(sec)}`, cx, cy + R * 0.12);
    if (st.rounds) { c.font = `${Math.round(R * 0.06)}px "Golos Text", system-ui`; c.fillStyle = 'rgba(242,251,255,0.55)'; c.fillText(`раунд ${st.round || 1} из ${st.rounds}`, cx, cy + R * 0.26); }
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
