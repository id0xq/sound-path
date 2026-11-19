// Строи ханга (интервалы от динга) — популярные строи + Astra из Handpan Sphere.
export const TUNINGS = {
  amara: { name: 'Celtic Amara', notes: [7, 10, 12, 14, 15, 17, 19, 22], mood: 'светлая грусть, воздух' },
  kurd: { name: 'Kurd', notes: [7, 8, 10, 12, 14, 15, 17, 19], mood: 'глубина, сердце' },
  pygmy: { name: 'Pygmy', notes: [7, 10, 12, 15, 17, 19, 22, 24], mood: 'древность, простота' },
  pentaMaj: { name: 'Мажорная пентатоника', notes: [7, 9, 12, 14, 16, 19, 21, 24], mood: 'ясность, утро' },
  sabye: { name: 'Sabye', notes: [7, 9, 11, 12, 14, 16, 19, 21], mood: 'нежность, радость' },
  astra: { name: 'Astra', notes: [5, 7, 9, 11, 12, 14, 16, 17, 19], mood: 'тепло, полнота' },
  lydian: { name: 'Лидийский свет', notes: [7, 9, 11, 12, 14, 16, 18, 19, 23], mood: 'сияние, раскрытие' },
  hijaz: { name: 'Hijaz', notes: [7, 8, 11, 12, 14, 15, 17, 19], mood: 'тайна, восток' },
};

export function handpanNotes(tuning, ding) {
  const T = TUNINGS[tuning] || TUNINGS.amara;
  return [ding, ...T.notes.map((i) => ding + i)];
}

// Ноты строя в нужном диапазоне (для колокольчиков, окарины, облака)
export function scaleInRange(tuning, ding, lo, hi, { pentatonic = false } = {}) {
  const T = TUNINGS[tuning] || TUNINGS.amara;
  let pcs = [...new Set([0, ...T.notes].map((i) => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  if (pentatonic) {
    // убираем ноты, образующие полутон с соседями — остаётся мягкая пентатоническая основа
    pcs = pcs.filter((pc, i) => { const prev = pcs[(i - 1 + pcs.length) % pcs.length]; return ((pc - prev + 12) % 12) !== 1 || pc === 0; });
  }
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes((((m - ding) % 12) + 12) % 12)) out.push(m);
  return out;
}
