// Купол: вид сверху на зеркальный купол из граней. Центр — зенит над головой слушателя,
// верх экрана — «впереди». Грани вспыхивают отражением звуков, которые звучат рядом с ними.
import { toPolar, clamp } from './util.js';

export const KIND_COLORS = {
  handpan: '#e6b866', bells: '#d9ecff', bowl: '#ffd7a3', ocarina: '#a6e3b8', bird: '#f6e27a', water: '#7fd0e3',
  rhythm: '#f0a174', heart: '#ff8f9c', rattle: '#e7c79d', wash: '#c9b2ff', gong: '#ffb877', kalimba: '#9fe8de',
  crickets: '#bfe88f', fire: '#ff9a5c', live: '#ffffff', instr: '#e6b866',
};

const RINGS = 8;

export class Sphere {
  constructor(canvas, app) {
    this.cv = canvas; this.app = app; this.ctx = canvas.getContext('2d');
    this.tint = '#7fc4c0'; this.sprites = {}; this.marker = null; this.onPick = null;
    this.facets = [];
    for (let k = 1; k <= RINGS; k++) {
      const n = 6 * k, off = (k % 2) * (Math.PI / n);
      for (let i = 0; i < n; i++) {
        const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 1) / n) * Math.PI * 2;
        const r0 = (k - 1) / RINGS, r1 = k / RINGS, rm = (r0 + r1) / 2, am = (a0 + a1) / 2;
        this.facets.push({ a0, a1, r0, r1, cx: Math.sin(am) * rm, cy: -Math.cos(am) * rm, light: [0, 0, 0] });
      }
    }
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.pick(e));
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.R = Math.min(this.w, this.h) * 0.4; this.cx = this.w / 2; this.cy = this.h / 2;
  }
  // метры по горизонтали → доля радиуса купола; дальше 8 м — за кромкой
  radial(rh) {
    if (rh <= 8) return Math.log1p(rh) / Math.log1p(8);
    return 1 + 0.22 * Math.min(1, Math.log(rh / 8) / Math.log(5));
  }
  project(p) {
    const { az, el, d } = toPolar(p);
    const rh = d * Math.cos((el * Math.PI) / 180);
    const r = this.radial(rh) * this.R, a = (az * Math.PI) / 180;
    return { x: this.cx + Math.sin(a) * r, y: this.cy - Math.cos(a) * r, el, d };
  }
  pick(e) {
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left - this.cx, y = e.clientY - r.top - this.cy;
    const rr = Math.hypot(x, y) / this.R; if (rr > 1.25) return;
    const az = (Math.atan2(x, -y) * 180) / Math.PI;
    const rh = rr <= 1 ? Math.expm1(rr * Math.log1p(8)) : 8 * Math.pow(5, (rr - 1) / 0.22);
    this.marker = { x: x + this.cx, y: y + this.cy };
    this.onPick && this.onPick({ az, d: clamp(rh, 1.3, 30) });
  }
  sprite(color) {
    if (this.sprites[color]) return this.sprites[color];
    const s = document.createElement('canvas'); s.width = s.height = 64; const c = s.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(0.18, color + 'cc'); g.addColorStop(0.5, color + '33'); g.addColorStop(1, color + '00');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (this.sprites[color] = s);
  }

  draw() {
    const c = this.ctx, A = this.app, E = A.E; if (!this.w) return;
    const now = E ? E.now : 0, R = this.R, cx = this.cx, cy = this.cy;
    c.clearRect(0, 0, this.w, this.h);

    // дыхание купола
    const br = A.breath ? A.breath.state(now) : null;
    const breathK = br ? (br.phase === 'in' ? br.k : br.k) : 0;

    // источники
    const srcs = [];
    if (E) for (const v of E.viz.values()) {
      const act = v.activity ? v.activity(now) : 1; if (act < 0.02) continue;
      const pos = v.posAt(now); if (!pos) continue;
      const p = this.project(pos);
      srcs.push({ ...p, act, color: KIND_COLORS[v.kind] || '#ffffff', kind: v.kind });
    }

    // грани: отражают ближайшие звуки
    const tint = hexRgb(this.tint);
    for (const f of this.facets) {
      let L = 0, rC = 0, gC = 0, bC = 0;
      const fx = cx + f.cx * R, fy = cy + f.cy * R;
      for (const s of srcs) {
        const d2 = ((fx - s.x) ** 2 + (fy - s.y) ** 2) / (R * R);
        const w = s.act * Math.exp(-d2 * 26) * (0.6 + 0.4 * clamp((s.el + 10) / 60, 0, 1));
        if (w < 0.004) continue;
        const col = hexRgb(s.color); L += w; rC += col[0] * w; gC += col[1] * w; bC += col[2] * w;
      }
      // плавное затухание отражения
      const k = this.reduced ? 1 : 0.18;
      const tr = L > 0 ? rC / L : tint[0], tg = L > 0 ? gC / L : tint[1], tb = L > 0 ? bC / L : tint[2];
      f.L = (f.L ?? 0) + (Math.min(1, L) - (f.L ?? 0)) * k;
      f.r = (f.r ?? tr) + (tr - (f.r ?? tr)) * k; f.g = (f.g ?? tg) + (tg - (f.g ?? tg)) * k; f.b = (f.b ?? tb) + (tb - (f.b ?? tb)) * k;
      const lit = f.L;
      const base = 0.035 + 0.05 * (1 - f.r1) + breathK * 0.05;
      c.beginPath();
      c.arc(cx, cy, f.r1 * R, f.a0 - Math.PI / 2, f.a1 - Math.PI / 2);
      c.arc(cx, cy, f.r0 * R, f.a1 - Math.PI / 2, f.a0 - Math.PI / 2, true);
      c.closePath();
      const rr = Math.round(lerp(201, f.r, lit)), gg = Math.round(lerp(214, f.g, lit)), bb = Math.round(lerp(223, f.b, lit));
      c.fillStyle = `rgba(${rr},${gg},${bb},${base + lit * 0.55})`;
      c.fill();
      c.strokeStyle = 'rgba(14,19,34,0.55)'; c.lineWidth = 1; c.stroke();
    }
    // кромка купола
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.strokeStyle = `rgba(${tint.join(',')},0.35)`; c.lineWidth = 1.2; c.stroke();

    // сами звуки
    c.globalCompositeOperation = 'lighter';
    for (const s of srcs) {
      const size = (10 + 22 * clamp((s.el + 20) / 80, 0, 1)) * (s.d > 8 ? 0.7 : 1) * (0.6 + 0.4 * s.act);
      c.globalAlpha = clamp(s.act, 0, 1) * (s.d > 8 ? 0.6 : 0.95);
      c.drawImage(this.sprite(s.color), s.x - size, s.y - size, size * 2, size * 2);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // слушатель: голова, нос — вперёд
    const vk = A.voice && A.voice.enabled ? A.voice.speaking : 0;
    if (vk > 0.02) { c.beginPath(); c.arc(cx, cy, 16 + vk * 14, 0, Math.PI * 2); c.strokeStyle = `rgba(127,196,192,${0.25 + vk * 0.5})`; c.lineWidth = 2; c.stroke(); }
    c.fillStyle = '#e9e6df';
    c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(cx - 4, cy - 6.5); c.lineTo(cx, cy - 13); c.lineTo(cx + 4, cy - 6.5); c.fill();
    c.fillRect(cx - 10.5, cy - 3, 2.5, 6); c.fillRect(cx + 8, cy - 3, 2.5, 6);

    // стороны света
    c.fillStyle = 'rgba(233,230,223,0.55)'; c.font = '12px "Golos Text", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lr = R * 1.13;
    c.fillText('впереди', cx, cy - lr); c.fillText('позади', cx, cy + lr);
    c.save(); c.translate(cx - lr, cy); c.rotate(-Math.PI / 2); c.fillText('слева', 0, 0); c.restore();
    c.save(); c.translate(cx + lr, cy); c.rotate(Math.PI / 2); c.fillText('справа', 0, 0); c.restore();

    if (this.marker && A.live && A.live.mode === 'point') {
      const m = this.marker; c.strokeStyle = '#7fc4c0'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(m.x, m.y, 11, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(m.x - 17, m.y); c.lineTo(m.x - 6, m.y); c.moveTo(m.x + 6, m.y); c.lineTo(m.x + 17, m.y);
      c.moveTo(m.x, m.y - 17); c.lineTo(m.x, m.y - 6); c.moveTo(m.x, m.y + 6); c.lineTo(m.x, m.y + 17); c.stroke();
    }
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const rgbCache = {};
function hexRgb(h) {
  if (rgbCache[h]) return rgbCache[h];
  const n = parseInt(h.slice(1), 16);
  return (rgbCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
