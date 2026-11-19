#!/usr/bin/env node
// Озвучка реплик ведущего натуральным голосом ElevenLabs (официальный API, ваш ключ).
// После запуска файлы лягут в voice/, а в приложении в панели «Ведущий» появится этот голос.
//
// Пример (голос «Мария — спокойный, для медитаций»):
//   ELEVENLABS_API_KEY=ваш_ключ node tools/make-voice.mjs --voice EDpEYNf6XIeKYRzYcx4I --id mariia --name "Мария"
// Только один сет:  ... --set love45
// Другие русские голоса: Marina ymDCYd8puC7gYjxIamPt (мягкий, тёплый), Prince Nur gJEfHTTiifXEDmO687lC (глубокий мужской).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const key = process.env.ELEVENLABS_API_KEY;
if (!key || !args.voice || !args.id) {
  console.error('Нужно: ELEVENLABS_API_KEY=... node tools/make-voice.mjs --voice <voice_id> --id <короткое_имя> [--name "Имя"] [--set walk30|love45]');
  process.exit(1);
}
const { SCRIPTS } = await import(path.join(root, 'js/scripts.js'));
const manifestPath = path.join(root, 'voice/manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { voices: [] };
let pack = manifest.voices.find((v) => v.id === args.id);
if (!pack) { pack = { id: args.id, name: args.name || args.id, files: {} }; manifest.voices.push(pack); }

for (const [setId, chapters] of Object.entries(SCRIPTS)) {
  if (args.set && args.set !== setId) continue;
  const flat = [];
  chapters.forEach((lines, ci) => lines.forEach(([, text], li) => flat.push({ key: `c${ci}l${li}`, text })));
  const dir = path.join(root, 'voice', setId, args.id);
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < flat.length; i++) {
    const ln = flat[i], rel = `${setId}/${args.id}/${ln.key}.mp3`, out = path.join(root, 'voice', rel);
    if (existsSync(out) && !args.force) { pack.files[`${setId}:${ln.key}`] = rel; continue; }
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${args.voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: ln.text,
        model_id: 'eleven_multilingual_v2',
        previous_text: flat[i - 1] ? flat[i - 1].text : undefined,
        next_text: flat[i + 1] ? flat[i + 1].text : undefined,
        voice_settings: { stability: 0.62, similarity_boost: 0.78, style: 0.12, use_speaker_boost: true, speed: 0.9 },
      }),
    });
    if (!res.ok) { console.error(`Ошибка на «${ln.text.slice(0, 40)}…»: ${res.status} ${await res.text()}`); process.exit(1); }
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    pack.files[`${setId}:${ln.key}`] = rel;
    console.log(`${setId} ${ln.key} готово`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Готово. Откройте приложение: панель «Ведущий» → «Файлы озвучки».');
