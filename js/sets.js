// Сюжеты сетов. Каждая глава задаёт пространство, строй, слои, ритм, движение звука и подсказку проводнику.
// Время глав (at) — в секундах от начала. events: t — секунды от начала главы.
// Поля, которых нет в главе, берутся из DEFAULTS. Можно свободно менять и добавлять главы.
// Тексты ведущего по главам лежат в scripts.js.
import { SCRIPTS, FREE_LINES } from './scripts.js';
import { STORIES } from './stories.js';

export const DEFAULTS = {
  space: 'temple', spaceMix: 0.55,
  tuning: 'amara', root: 0, chord: [0, 7, 12],
  pad: { timbre: 'warm', level: 0.3 },
  tanpura: 0, wash: 0, handpan: 0, bells: 0, ocarina: 0, kalimba: 0,
  birds: 0, species: ['robin', 'thrush', 'distant'],
  nature: { wind: 0, leaves: 0, stream: 0, waves: 0, rain: 0, crickets: 0, fire: 0, dawn: 0, woodland: 0, meadow: 0, cave: 0, cityrain: 0 },
  rhythm: null, tempo: 66, rhythmLevel: 0.6,
  groove: null, grooveLevel: 0.8, fauna: {}, underwater: 0,
  binaural: 8, breath: 0, motion: 'still',
  color: '#7fc4c0', transition: 14, events: [],
};

export const SETS = [
  {
    id: 'walk30', group: 'Медитации',
    title: 'Прогулка',
    subtitle: 'Голос проводника и шаг под ритм',
    minutes: 30,
    duration: 30 * 60,
    base: 50, // D3
    transpose: [-2, 0, 0, 2],
    chapters: [
      {
        at: 0, title: 'Порог', color: '#8fb8a8',
        space: 'forest', spaceMix: 0.5, tuning: 'amara', chord: [-12, 0, 7, 12],
        pad: { timbre: 'warm', level: 0.22 }, wash: 0.15, bells: 0.08,
        birds: 0.3, species: ['robin', 'tit', 'distant'],
        nature: { wind: 0.35, leaves: 0.2, dawn: 0.35 }, binaural: 10,
        events: [{ t: 2, type: 'bowl' }, { t: 22, type: 'bowl' }, { t: 45, type: 'tingsha' }],
        cue: 'Поприветствуйте людей. Пусть встанут удобно, почувствуют стопы и землю. Три медленных вдоха вместе со звоном чаши. Расскажите: скоро появится мягкий ритм — шаг будет идти за ним.',
      },
      {
        at: 180, title: 'Первые шаги', color: '#a3c49a',
        space: 'forest', spaceMix: 0.5, tuning: 'amara', chord: [-12, 0, 7, 12, 15],
        pad: { timbre: 'warm', level: 0.25 }, wash: 0.12, handpan: 0.18, bells: 0.06,
        birds: 0.45, species: ['robin', 'tit', 'chaffinch', 'distant'],
        nature: { wind: 0.3, leaves: 0.25, woodland: 0.3 }, rhythm: 'heartwalk', tempo: 66, rhythmLevel: 0.55,
        motion: 'walk', binaural: 10, transition: 10,
        events: [{ t: 0, type: 'koshi' }],
        cue: 'Начинаем движение. Каждый шаг — на мягкий удар барабана. Внимание в стопах: пятка, середина, носок. Дыхание свободное, взгляд мягкий.',
      },
      {
        at: 480, title: 'Ручей', color: '#79c3d6',
        space: 'forest', spaceMix: 0.55, tuning: 'amara', chord: [-12, 0, 7, 10, 15],
        pad: { timbre: 'warm', level: 0.22 }, wash: 0.18, handpan: 0.32, ocarina: 0.35, bells: 0.05,
        birds: 0.55, species: ['thrush', 'robin', 'cuckoo', 'blackbird', 'chaffinch', 'distant'],
        nature: { wind: 0.22, leaves: 0.25, stream: 0.55 }, fauna: { woodpecker: 0.35, frogs: 0.15 }, rhythm: 'walkGroove', tempo: 72, rhythmLevel: 0.6,
        motion: 'walk', binaural: 10,
        events: [{ t: 6, type: 'rainstick' }, { t: 130, type: 'flyby' }],
        cue: 'Слушайте воду. Ручей проходит рядом и остаётся позади — так же, как мысли, которые не нужно удерживать. Замечайте звуки: слева, справа, сверху. Где-то далеко перекликаются окарины.',
      },
      {
        at: 840, title: 'Поляна света', color: '#f1d48a',
        space: 'cloud', spaceMix: 0.7, tuning: 'pentaMaj', root: 3, chord: [-12, 0, 7, 12, 16],
        pad: { timbre: 'glass', level: 0.28 }, wash: 0.4, handpan: 0.15, bells: 0.5,
        birds: 0.7, species: ['robin', 'oriole', 'tit', 'chaffinch', 'blackbird'], fauna: { bees: 0.5 },
        nature: { wind: 0.18, leaves: 0.15, stream: 0.12, meadow: 0.45 }, rhythm: null,
        motion: 'still', binaural: 8, transition: 12,
        events: [{ t: 0, type: 'tingsha' }, { t: 5, type: 'shimmer' }, { t: 35, type: 'chimesOrbit' }, { t: 120, type: 'chimes' }, { t: 170, type: 'koshi' }, { t: 240, type: 'shimmer' }],
        cue: 'Остановитесь. Поднимите взгляд. Пространство раскрывается — услышьте, как звон кружит над головой. Вдохните, будто вдыхаете свет. Можно на минуту закрыть глаза и просто слушать птиц.',
      },
      {
        at: 1140, title: 'Тропа сердца', color: '#e59a7c',
        space: 'forest', spaceMix: 0.6, tuning: 'kurd', chord: [-12, 0, 7, 12, 15],
        pad: { timbre: 'warm', level: 0.26 }, wash: 0.2, handpan: 0.45, ocarina: 0.2, kalimba: 0.15, bells: 0.08,
        birds: 0.45, species: ['cuckoo', 'thrush', 'dove', 'wren', 'distant'],
        nature: { wind: 0.25, leaves: 0.3, stream: 0.2 }, rhythm: 'walkGroove2', tempo: 76, rhythmLevel: 0.5, fauna: { woodpecker: 0.2 },
        motion: 'walk', binaural: 10, transition: 10,
        events: [{ t: 0, type: 'bowl' }, { t: 100, type: 'flyby' }, { t: 200, type: 'rainstick' }],
        cue: 'Снова в путь, чуть бодрее. Ритм становится живым — позвольте телу самому найти шаг. С каждым шагом мысленно говорите: «я здесь». Почувствуйте, как бьётся сердце.',
      },
      {
        at: 1500, title: 'Возвращение', color: '#b5a7d6',
        space: 'forest', spaceMix: 0.6, tuning: 'amara', chord: [-12, 0, 7, 12],
        pad: { timbre: 'warm', level: 0.3 }, wash: 0.25, handpan: 0.18, bells: 0.06,
        birds: 0.4, species: ['robin', 'dove', 'distant'],
        nature: { wind: 0.4, leaves: 0.25, stream: 0.22 }, rhythm: 'heartwalk', tempo: 54, rhythmLevel: 0.45,
        motion: 'walk', binaural: 8, transition: 30,
        events: [{ t: 160, type: 'rainstick' }],
        cue: 'Шаг замедляется. Каждый шаг — медленнее и мягче, вместе с ритмом. Соберите в себе всё, что увидели и услышали по дороге.',
      },
      {
        at: 1710, title: 'Тишина', color: '#9cc6c1',
        space: 'cloud', spaceMix: 0.6, tuning: 'amara', chord: [-12, 0, 7, 12],
        pad: { timbre: 'glass', level: 0.24 }, wash: 0.25, bells: 0.15,
        birds: 0.35, species: ['robin', 'thrush', 'distant'],
        nature: { wind: 0.25, leaves: 0.1, dawn: 0.3 }, rhythm: null,
        motion: 'still', binaural: 8, transition: 10,
        events: [{ t: 3, type: 'bowl' }, { t: 16, type: 'bowl' }, { t: 29, type: 'bowl' }, { t: 45, type: 'crystal' }, { t: 60, type: 'tingsha' }],
        cue: 'Остановитесь. Три удара чаши — три вдоха. Поблагодарите путь и себя. Постойте в тишине, слушая птиц. Когда будете готовы — медленно снимите наушники.',
      },
    ],
  },
  {
    id: 'love45', group: 'Медитации',
    title: 'Благодарность и любовь',
    subtitle: 'Медитация сидя или лёжа, дыхание сердца',
    minutes: 45,
    duration: 45 * 60,
    base: 52, // E3 — как динг Astra
    transpose: [-3, 0, 0, 2],
    chapters: [
      {
        at: 0, title: 'Прибытие', color: '#8e9fd0',
        space: 'temple', spaceMix: 0.65, tuning: 'astra', chord: [-12, 0, 7, 12],
        pad: { timbre: 'choir', level: 0.32 }, tanpura: 0.55, bells: 0.04,
        birds: 0.06, species: ['dove'], nature: { rain: 0.25 }, binaural: 10,
        events: [{ t: 3, type: 'gong' }, { t: 28, type: 'bowl' }, { t: 75, type: 'bowl' }, { t: 150, type: 'fork' }],
        cue: 'Добро пожаловать. Устройтесь удобно, сидя или лёжа. Наушники — плотно. Закройте глаза. Гонг открывает пространство: просто слушайте, как звук наполняет купол.',
      },
      {
        at: 240, title: 'Дыхание сердца', color: '#c99bb3',
        space: 'temple', spaceMix: 0.6, tuning: 'pentaMaj', chord: [-12, 0, 7, 12, 16],
        pad: { timbre: 'warm', level: 0.3 }, tanpura: 0.25, handpan: 0.12, wash: 0.15,
        nature: { rain: 0.08 }, rhythm: 'heartbeat', tempo: 60, rhythmLevel: 0.3,
        breath: 5.5, binaural: 7, events: [{ t: 0, type: 'koshi' }],
        cue: 'Дыхание становится ровным: вдох примерно на пять счётов, выдох — так же. Следуйте за волной звука: поднимается — вдох, опускается — выдох. Положите ладонь на сердце и услышьте его ритм.',
      },
      {
        at: 600, title: 'Благодарность телу', color: '#e6b98a',
        space: 'temple', spaceMix: 0.6, tuning: 'astra', chord: [-12, 0, 7, 12, 16, 19],
        pad: { timbre: 'warm', level: 0.26 }, tanpura: 0.15, handpan: 0.35, wash: 0.35, bells: 0.2,
        birds: 0.15, species: ['dove', 'robin'], nature: { stream: 0.22, woodland: 0.12 }, breath: 5.5, binaural: 6,
        events: [{ t: 0, type: 'bowl' }, { t: 60, type: 'crystal' }, { t: 130, type: 'shimmer' }, { t: 210, type: 'monochord' }, { t: 290, type: 'koshi' }],
        cue: 'Поблагодарите своё тело. Стопы, которые вас носят. Руки, которые обнимают. Сердце, которое бьётся не переставая. Пройдите вниманием по телу и в каждом месте скажите про себя «спасибо».',
      },
      {
        at: 1020, title: 'Благодарность людям', color: '#d7a0a0',
        space: 'fog', spaceMix: 0.62, tuning: 'astra', chord: [-15, -3, 4, 9, 12],
        pad: { timbre: 'warm', level: 0.28 }, handpan: 0.3, wash: 0.25, ocarina: 0.45, bells: 0.1,
        birds: 0.1, species: ['dove', 'distant'], rhythm: 'cradle', tempo: 54, rhythmLevel: 0.4,
        binaural: 6, events: [{ t: 0, type: 'tingsha' }, { t: 210, type: 'rainstick' }],
        cue: 'Вспомните людей, благодаря которым вы здесь: родителей, учителей, друзей. Увидьте их лица. Звуки приходят с разных сторон — как голоса тех, кто вас любит. Каждому мысленно скажите: «спасибо, что ты есть».',
      },
      {
        at: 1440, title: 'Любовь', color: '#f0a7c4',
        space: 'cloud', spaceMix: 0.7, tuning: 'lydian', chord: [-12, 0, 7, 11, 16, 18],
        pad: { timbre: 'choir', level: 0.3 }, handpan: 0.5, wash: 0.45, bells: 0.35, kalimba: 0.15,
        rhythm: 'heartGroove', tempo: 64, rhythmLevel: 0.42, motion: 'orbit', binaural: 10,
        events: [{ t: 0, type: 'koshi' }, { t: 22, type: 'chimesOrbit' }, { t: 120, type: 'belltree' }, { t: 200, type: 'chimesOrbit' }, { t: 300, type: 'gong' }, { t: 304, type: 'shimmer' }],
        cue: 'Сердце раскрывается. Представьте тёплый свет в центре груди — с каждым вдохом его больше. Звук кружит вокруг вас — это любовь, которая уже рядом. Позвольте себе её принять. Можно улыбнуться.',
      },
      {
        at: 1860, title: 'Океан любви', color: '#7fb6d9',
        space: 'infinity', spaceMix: 0.8, tuning: 'sabye', root: 5, chord: [-12, 0, 7, 12, 14, 19],
        pad: { timbre: 'glass', level: 0.32 }, handpan: 0.12, wash: 0.5, bells: 0.1,
        nature: { waves: 0.45 }, fauna: { whales: 0.35 }, rhythm: null, breath: 5, motion: 'float', binaural: 5, transition: 18,
        events: [{ t: 2, type: 'oceanDrum' }, { t: 100, type: 'monochord' }, { t: 190, type: 'bowl' }, { t: 250, type: 'crystal' }, { t: 300, type: 'oceanDrum' }],
        cue: 'Растворитесь. Любовь как океан: в ней нет границы между вами и миром. Ничего не нужно делать — просто будьте. Дайте звуку говорить, сделайте длинную паузу.',
      },
      {
        at: 2280, title: 'Отдать миру', color: '#f2d27e',
        space: 'temple', spaceMix: 0.6, tuning: 'astra', chord: [-12, 0, 7, 12, 16],
        pad: { timbre: 'warm', level: 0.3 }, handpan: 0.35, wash: 0.25, ocarina: 0.2, bells: 0.25,
        birds: 0.5, species: ['robin', 'blackbird', 'oriole', 'dove', 'nightingale'], nature: { stream: 0.2, dawn: 0.35 },
        rhythm: 'pulse', tempo: 60, rhythmLevel: 0.32, binaural: 8,
        events: [{ t: 0, type: 'tingsha' }, { t: 70, type: 'flyby' }, { t: 200, type: 'koshi' }],
        cue: 'Поделитесь этим светом. Отправьте любовь близким, потом тем, с кем было непросто, и наконец всему миру. Звук светлеет, как утро. Просыпаются птицы.',
      },
      {
        at: 2580, title: 'Возвращение', color: '#a9c7b8',
        space: 'temple', spaceMix: 0.55, tuning: 'astra', chord: [-12, 0, 7, 12],
        pad: { timbre: 'warm', level: 0.25 }, tanpura: 0.2, handpan: 0.1, bells: 0.15,
        birds: 0.4, species: ['robin', 'dove', 'distant'], rhythm: null, binaural: 10, transition: 10,
        events: [{ t: 2, type: 'bowl' }, { t: 16, type: 'bowl' }, { t: 30, type: 'bowl' }, { t: 62, type: 'koshi' }, { t: 85, type: 'templeBell' }],
        cue: 'Возвращаемся. Пошевелите пальцами, сделайте глубокий вдох. Три удара чаши. Сохраните это тепло в сердце. Когда будете готовы — откройте глаза.',
      },
    ],
  },
];

SETS.forEach((s) => s.chapters.forEach((ch, i) => { ch.script = (SCRIPTS[s.id] || [])[i] || []; }));
// новые сюжеты (йога-нидра, киты, ночной лес, жанровые приключения) — со своими текстами внутри
SETS.splice(2, 0, ...STORIES.filter((s) => s.group === 'Медитации'));
SETS.push(...STORIES.filter((s) => s.group !== 'Медитации'));

// Свободная атмосфера: бесконечный поток глав, собранный из зерна вариации
export function makeFreeSet(rng) {
  const spaces = ['temple', 'fog', 'cloud', 'infinity', 'forest', 'grotto'];
  const tunings = ['amara', 'kurd', 'pygmy', 'pentaMaj', 'sabye', 'astra', 'lydian', 'hijaz'];
  const colors = ['#7fc4c0', '#a3c49a', '#c7a6ff', '#f1d48a', '#e6b98a', '#7fb6d9', '#d7a0a0'];
  const names = ['Рассвет', 'Купол', 'Туман над рекой', 'Высота', 'Кедры', 'Пещера', 'Звёзды', 'Тихий берег', 'Ветер', 'Свет'];
  const chapters = []; let at = 0;
  const startTuning = rng.pick(tunings);
  for (let i = 0; i < 24; i++) {
    const space = rng.pick(spaces);
    const outdoor = space === 'forest' || rng.chance(0.4);
    chapters.push({
      at, title: rng.pick(names), color: rng.pick(colors),
      space, spaceMix: rng.range(0.5, 0.75), tuning: i === 0 ? startTuning : rng.chance(0.6) ? chapters[i - 1].tuning : rng.pick(tunings),
      root: rng.pick([0, 0, 0, 5, -2, 3]), chord: rng.pick([[-12, 0, 7, 12], [-12, 0, 7, 12, 16], [-12, 0, 5, 12, 14], [-12, 0, 7, 10, 15]]),
      pad: { timbre: rng.pick(['warm', 'choir', 'glass']), level: rng.range(0.2, 0.32) },
      tanpura: rng.chance(0.3) ? rng.range(0.15, 0.3) : 0,
      wash: rng.range(0.1, 0.5), handpan: rng.range(0.05, 0.45), bells: rng.range(0, 0.3), ocarina: rng.chance(0.4) ? rng.range(0.1, 0.35) : 0,
      kalimba: rng.chance(0.25) ? 0.15 : 0,
      birds: outdoor ? rng.range(0.2, 0.6) : rng.range(0, 0.15), species: rng.pick([['robin', 'thrush', 'distant'], ['tit', 'chaffinch', 'cuckoo'], ['dove', 'nightingale'], ['robin', 'dove', 'distant'], ['blackbird', 'oriole', 'wren'], ['blackbird', 'robin', 'thrush']]),
      nature: { wind: outdoor ? rng.range(0.1, 0.35) : 0, leaves: outdoor ? rng.range(0, 0.25) : 0, stream: rng.chance(0.35) ? rng.range(0.15, 0.4) : 0, waves: rng.chance(0.2) ? 0.35 : 0, rain: rng.chance(0.15) ? 0.15 : 0, crickets: rng.chance(0.15) ? 0.3 : 0, fire: rng.chance(0.1) ? 0.3 : 0, dawn: outdoor && rng.chance(0.35) ? rng.range(0.2, 0.4) : 0, meadow: outdoor && rng.chance(0.2) ? 0.35 : 0, cave: space === 'grotto' ? 0.4 : 0 },
      rhythm: rng.chance(0.3) ? rng.pick(['heartbeat', 'pulse', 'cradle', 'heartwalk']) : null, tempo: rng.int(54, 72), rhythmLevel: 0.4,
      groove: rng.chance(0.12) ? { style: 'ambient', energy: rng.range(0.25, 0.45), lead: 0.3 } : null, grooveLevel: 0.6,
      fauna: rng.pick([{}, {}, {}, { whales: 0.4 }, { owls: 0.4 }, { frogs: 0.35 }, { dolphins: 0.3 }, { woodpecker: 0.3 }, { loon: 0.4 }, { bees: 0.5 }]),
      motion: rng.pick(['still', 'still', 'orbit', 'float']), binaural: rng.pick([6, 8, 10]), breath: rng.chance(0.2) ? 5.5 : 0, transition: 20,
      events: [{ t: 1, type: rng.pick(['bowl', 'koshi', 'tingsha', 'shimmer', 'rainstick', 'crystal', 'monochord', 'chimes']) }, { t: rng.int(90, 180), type: rng.pick(['crystal', 'fork', 'monochord', 'overtone', 'templeBell', 'belltree']) }],
      cue: 'Свободная атмосфера. Ведите голосом, добавляйте звуки вживую — пространство само медленно меняется.',
      script: [[6, rng.pick(FREE_LINES)], [rng.int(70, 110), rng.pick(FREE_LINES)], [rng.int(150, 190), rng.pick(FREE_LINES)]],
    });
    at += rng.int(200, 340);
  }
  return { id: 'free', title: 'Свободная атмосфера', subtitle: 'Бесконечный поток, каждый раз новый', minutes: 0, duration: Infinity, base: 50, transpose: [0, 2, -2, 3], chapters };
}
