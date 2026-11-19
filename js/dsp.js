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
// space — ясное пространство (предзадержка сохраняет направление звука),
// atmos — атмосферный хвост: длинный, тёмный, «дышащий», в него звуки превращаются.
export const SPACES = {
  temple: {
    name: 'Храм', hint: 'Зеркальный купол: тёплое пространство, звук собирается вокруг',
    space: { size: 1.25, decay: 5.2, damp: 5200, lowcut: 170, mod: 0.35, diffusion: 0.72, predelay: 0.045, width: 1, shimmer: 0 },
    atmos: { size: 2.2, decay: 18, damp: 3000, lowcut: 200, mod: 0.8, diffusion: 0.75, predelay: 0.09, width: 1.1, shimmer: 0.06 },
    atmosMix: 0.55, tone: 8500,
  },
  fog: {
    name: 'Туман', hint: 'Мягкая тёмная пелена',
    space: { size: 1.0, decay: 4.2, damp: 2600, lowcut: 150, mod: 0.5, diffusion: 0.75, predelay: 0.02, width: 1, shimmer: 0 },
    atmos: { size: 2.0, decay: 15, damp: 2000, lowcut: 180, mod: 0.9, diffusion: 0.75, predelay: 0.06, width: 1.1, shimmer: 0 },
    atmosMix: 0.6, tone: 5500,
  },
  cloud: {
    name: 'Облако', hint: 'Светлое воздушное пространство над головой',
    space: { size: 1.4, decay: 5, damp: 7000, lowcut: 260, mod: 0.45, diffusion: 0.7, predelay: 0.06, width: 1.15, shimmer: 0 },
    atmos: { size: 2.4, decay: 22, damp: 4200, lowcut: 300, mod: 0.9, diffusion: 0.75, predelay: 0.1, width: 1.2, shimmer: 0.22 },
    atmosMix: 0.55, tone: 10000,
  },
  infinity: {
    name: 'Бесконечность', hint: 'Звук растворяется и почти не кончается',
    space: { size: 1.8, decay: 8.5, damp: 4200, lowcut: 200, mod: 0.6, diffusion: 0.75, predelay: 0.07, width: 1.15, shimmer: 0 },
    atmos: { size: 2.6, decay: 40, damp: 2800, lowcut: 220, mod: 1, diffusion: 0.75, predelay: 0.12, width: 1.25, shimmer: 0.12 },
    atmosMix: 0.7, tone: 7500,
  },
  forest: {
    name: 'Лес', hint: 'Открытый воздух: близкие звуки сухие, дальние тонут в лесу',
    space: { size: 0.75, decay: 1.7, damp: 6000, lowcut: 200, mod: 0.25, diffusion: 0.55, predelay: 0.025, width: 1.1, shimmer: 0 },
    atmos: { size: 1.8, decay: 10, damp: 2400, lowcut: 220, mod: 0.7, diffusion: 0.72, predelay: 0.08, width: 1.1, shimmer: 0 },
    atmosMix: 0.4, tone: 8000,
  },
  grotto: {
    name: 'Грот', hint: 'Каменная пещера: плотные отражения',
    space: { size: 1.1, decay: 3.2, damp: 3600, lowcut: 140, mod: 0.2, diffusion: 0.45, predelay: 0.03, width: 1, shimmer: 0 },
    atmos: { size: 2.0, decay: 12, damp: 2200, lowcut: 160, mod: 0.6, diffusion: 0.7, predelay: 0.08, width: 1, shimmer: 0 },
    atmosMix: 0.5, tone: 6000,
  },
  hall: {
    name: 'Зал', hint: 'Настоящий отклик зала из Handpan Sphere',
    hall: true,
    space: { size: 1.2, decay: 3.5, damp: 5000, lowcut: 170, mod: 0.3, diffusion: 0.7, predelay: 0.04, width: 1, shimmer: 0 },
    atmos: { size: 2.2, decay: 16, damp: 2800, lowcut: 200, mod: 0.8, diffusion: 0.75, predelay: 0.09, width: 1.1, shimmer: 0.05 },
    atmosMix: 0.45, tone: 9000,
  },
};

// Маленькая комната для голоса: даёт присутствие, но не размывает слова.
export const VOICE_ROOM = { duration: 0.7, preDelay: 0.012, bloom: 0.004, lpStart: 7000, lpEnd: 2600, hp: 250,
  early: [{ t: 0.007, g: 0.3, pan: -0.5 }, { t: 0.012, g: 0.25, pan: 0.5 }] };
// Ореол голоса: длинный тёмный хвост, который звучит только в паузах речи.
export const VOICE_HALO = { duration: 3.4, preDelay: 0.05, bloom: 0.12, lpStart: 5200, lpEnd: 1200, hp: 300, width: 1.2 };
