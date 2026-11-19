// Генерация буферов: шумы и импульсные отклики пространств.
// Все отклики синтезируются процедурно — без сэмплов, мягкие, с «расцветом» (плавной атакой хвоста).

export function makeNoise(ctx, seconds = 6, type = 'white') {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w * 0.5;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { // brown
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2;
      }
    }
    // бесшовная петля: короткий кроссфейд конца с началом
    const fade = Math.min(4096, len >> 3);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
  }
  return buf;
}

// Процедурный отклик пространства.
// duration — время спада до −60 дБ; bloom — плавность нарастания хвоста (мягкость);
// lpStart→lpEnd — как темнеет хвост; early — ранние отражения [{t, g, pan}]; focus — фокусирующее эхо купола.
export function makeIR(ctx, o) {
  const sr = ctx.sampleRate;
  const duration = o.duration ?? 4, pre = o.preDelay ?? 0.02, bloom = o.bloom ?? 0.05;
  const lpStart = o.lpStart ?? 9000, lpEnd = o.lpEnd ?? 1500, hp = o.hp ?? 90, width = o.width ?? 1;
  const len = Math.floor(sr * (duration * 1.05 + pre));
  const buf = ctx.createBuffer(2, len, sr);
  const preS = Math.floor(pre * sr);
  const decayPerSample = Math.exp(-6.9 / (duration * sr));
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];

  for (let ch = 0; ch < 2; ch++) {
    const d = chans[ch];
    let env = 1, lp1 = 0, lp2 = 0, hpPrevIn = 0, hpPrevOut = 0;
    const hpA = Math.exp((-2 * Math.PI * hp) / sr);
    for (let i = preS; i < len; i++) {
      const t = (i - preS) / sr;
      env *= decayPerSample;
      const onset = 1 - Math.exp(-t / Math.max(bloom, 0.0005));
      // разреженность в начале хвоста даёт естественную «зернистость», затем плотность растёт
      let n = Math.random() * 2 - 1;
      if (o.sparse && t < o.sparse) n *= Math.random() < 0.25 + 0.75 * (t / o.sparse) ? 1 : 0;
      const fc = lpEnd + (lpStart - lpEnd) * Math.exp(-t / (duration * 0.28));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp1 += a * (n - lp1); lp2 += a * (lp1 - lp2);
      // односполюсный ФВЧ против гула
      const hpOut = hpA * (hpPrevOut + lp2 - hpPrevIn);
      hpPrevIn = lp2; hpPrevOut = hpOut;
      d[i] = hpOut * env * onset;
    }
  }

  // Ранние отражения: короткие мягкие «щелчки» отфильтрованного шума
  const addTap = (time, g, pan, color = 6000) => {
    const start = Math.floor((pre + time) * sr), tapLen = Math.floor(0.006 * sr);
    const gl = g * Math.cos(((pan + 1) * Math.PI) / 4), gr = g * Math.sin(((pan + 1) * Math.PI) / 4);
    let lp = 0; const a = 1 - Math.exp((-2 * Math.PI * color) / sr);
    for (let i = 0; i < tapLen && start + i < len; i++) {
      const e = Math.exp(-i / (tapLen * 0.25));
      lp += a * ((Math.random() * 2 - 1) - lp);
      chans[0][start + i] += lp * e * gl;
      chans[1][start + i] += lp * e * gr;
    }
  };
  (o.early || []).forEach((r) => addTap(r.t, r.g, r.pan ?? 0, r.color ?? 6000));
  // Купол: звук фокусируется обратно в центр — серия мягких затухающих повторов
  if (o.focus) {
    const { interval, count, g, color } = o.focus;
    for (let k = 1; k <= count; k++) {
      addTap(interval * k, g * Math.pow(0.72, k - 1), (Math.random() - 0.5) * 0.4, color * Math.pow(0.85, k));
      addTap(interval * k + 0.0013, g * 0.6 * Math.pow(0.72, k - 1), (Math.random() - 0.5) * 0.4, color * Math.pow(0.85, k));
    }
  }

  // Ширина стерео (M/S)
  if (width !== 1) {
    for (let i = 0; i < len; i++) {
      const m = (chans[0][i] + chans[1][i]) * 0.5, s = (chans[0][i] - chans[1][i]) * 0.5 * width;
      chans[0][i] = m + s; chans[1][i] = m - s;
    }
  }
  return buf;
}

// Пространства. Имена вдохновлены пространствами Handpan Sphere и Храмом Звука на Алтае.
export const SPACES = {
  temple: {
    name: 'Храм', hint: 'Зеркальный купол: тёплый хвост, звук собирается в центре',
    ir: { duration: 7.2, preDelay: 0.03, bloom: 0.07, lpStart: 8500, lpEnd: 1300, hp: 110,
      focus: { interval: 0.035, count: 6, g: 0.22, color: 5200 },
      early: [{ t: 0.011, g: 0.25, pan: -0.6 }, { t: 0.017, g: 0.22, pan: 0.7 }, { t: 0.026, g: 0.18, pan: -0.2 }] },
    mix: 0.55, chorus: 0.6,
  },
  fog: {
    name: 'Туман', hint: 'Мягкая тёмная пелена, без отражений',
    ir: { duration: 5.2, preDelay: 0.008, bloom: 0.28, lpStart: 3400, lpEnd: 650, hp: 90 },
    mix: 0.6, chorus: 0.8,
  },
  cloud: {
    name: 'Облако', hint: 'Светлое воздушное пространство над головой',
    ir: { duration: 6.0, preDelay: 0.045, bloom: 0.16, lpStart: 13000, lpEnd: 2800, hp: 160, width: 1.15 },
    mix: 0.5, chorus: 0.7,
  },
  infinity: {
    name: 'Бесконечность', hint: 'Очень длинный хвост, звук растворяется',
    ir: { duration: 12.5, preDelay: 0.06, bloom: 0.45, lpStart: 6800, lpEnd: 1200, hp: 120, width: 1.1 },
    mix: 0.6, chorus: 1,
  },
  forest: {
    name: 'Лес', hint: 'Открытый воздух, рассеянные отражения от деревьев',
    ir: { duration: 2.1, preDelay: 0.012, bloom: 0.012, lpStart: 7500, lpEnd: 2200, hp: 140, sparse: 0.25,
      early: [{ t: 0.018, g: 0.16, pan: -0.8 }, { t: 0.031, g: 0.12, pan: 0.5 }, { t: 0.047, g: 0.1, pan: 0.9, color: 4000 },
        { t: 0.069, g: 0.08, pan: -0.4, color: 3500 }, { t: 0.093, g: 0.07, pan: 0.2, color: 3000 }, { t: 0.13, g: 0.05, pan: -0.9, color: 2500 }] },
    mix: 0.4, chorus: 0.3,
  },
  grotto: {
    name: 'Грот', hint: 'Каменная пещера: близкие отражения и мягкое эхо',
    ir: { duration: 3.8, preDelay: 0.022, bloom: 0.02, lpStart: 5200, lpEnd: 900, hp: 100,
      early: [{ t: 0.09, g: 0.2, pan: -0.5, color: 3500 }, { t: 0.18, g: 0.13, pan: 0.6, color: 3000 }, { t: 0.29, g: 0.08, pan: -0.1, color: 2500 }] },
    mix: 0.5, chorus: 0.4,
  },
};

// Маленькая комната для голоса: даёт присутствие, но не размывает слова.
export const VOICE_ROOM = { duration: 0.7, preDelay: 0.012, bloom: 0.004, lpStart: 7000, lpEnd: 2600, hp: 250,
  early: [{ t: 0.007, g: 0.3, pan: -0.5 }, { t: 0.012, g: 0.25, pan: 0.5 }] };
// Ореол голоса: длинный тёмный хвост, который звучит только в паузах речи.
export const VOICE_HALO = { duration: 3.4, preDelay: 0.05, bloom: 0.12, lpStart: 5200, lpEnd: 1200, hp: 300, width: 1.2 };
