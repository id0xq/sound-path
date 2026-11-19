// Общие утилиты: случайность с зерном, ноты, геометрия пространства.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = (Math.random() * 1e9) | 0) { this.seed = seed; this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
  gauss() { let u = 0, v = 0; while (!u) u = this.r(); while (!v) v = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  weighted(items, weights) {
    const sum = weights.reduce((a, b) => a + b, 0); let x = this.r() * sum;
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
    return items[items.length - 1];
  }
  exp(rate) { return -Math.log(1 - this.r()) / Math.max(rate, 1e-6); }
}

// Глобальная настройка строя: Ля 440 или 432
export const tuning = { a4: 440 };
export const mtof = (m) => tuning.a4 * Math.pow(2, (m - 69) / 12);

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-9));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

// Пространство: азимут 0° — впереди, +90° — справа; высота + вверх; дистанция в метрах.
// Web Audio: слушатель смотрит в −Z, верх +Y, право +X.
export function polar(az, el = 0, d = 3) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return { x: d * Math.cos(e) * Math.sin(a), y: d * Math.sin(e), z: -d * Math.cos(e) * Math.cos(a) };
}
export function toPolar(p) {
  const d = Math.hypot(p.x, p.y, p.z) || 1e-6;
  const az = (Math.atan2(p.x, -p.z) * 180) / Math.PI;
  const el = (Math.asin(clamp(p.y / d, -1, 1)) * 180) / Math.PI;
  return { az, el, d };
}
export const lerpPos = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
