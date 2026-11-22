#!/bin/bash
# Скачивает библиотеку живых звуков природы для «Звукового пути».
# Список — tools/nature-library.tsv. Каждый звук перед загрузкой проверяется:
# скачивается только то, что на странице Freesound помечено CC0 (общественное достояние).
# Формат — HQ-превью Freesound (MP3 ~190 кбит/с, стерео), без входа в аккаунт.
# Повторный запуск докачивает только недостающее.

cd "$(dirname "$0")/.." || exit 1
LIST="tools/nature-library.tsv"
OUT="samples/nature-library"
CREDITS="$OUT/CREDITS.tsv"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
mkdir -p "$OUT"
[ -s "$CREDITS" ] || printf "file\tfreesound_id\tauthor\ttitle\tlicense\turl\n" > "$CREDITS"

ok=0; skip=0; fail=0
while IFS=$'\t' read -r world id slug desc; do
  case "$world" in ''|\#*) continue;; esac
  mkdir -p "$OUT/$world"
  f="$OUT/$world/${slug}__fs${id}.mp3"
  if [ -s "$f" ]; then echo "✓ уже есть  $world/${slug}"; ok=$((ok+1)); continue; fi

  page=$(curl -sL -A "$UA" --max-time 30 "https://freesound.org/s/$id/")
  url=$(curl -sL -A "$UA" --max-time 30 -o /dev/null -w '%{url_effective}' "https://freesound.org/s/$id/")
  if ! printf '%s' "$page" | grep -q 'creativecommons.org/publicdomain/zero/1.0'; then
    echo "✗ НЕ CC0 или страница недоступна — пропуск: $id ($slug)"; skip=$((skip+1)); continue
  fi
  mp3=$(printf '%s' "$page" | grep -o "https://cdn.freesound.org/previews/[0-9]*/${id}_[0-9]*-lq.mp3" | head -1 | sed 's/-lq\.mp3$/-hq.mp3/')
  if [ -z "$mp3" ]; then echo "✗ не найден файл: $id"; fail=$((fail+1)); continue; fi

  if curl -sL -A "$UA" --fail --max-time 600 -e "$url" -o "$f.part" "$mp3" && [ -s "$f.part" ]; then
    mv "$f.part" "$f"
    author=$(printf '%s' "$url" | sed -n 's#.*/people/\([^/]*\)/sounds/.*#\1#p')
    title=$(printf '%s' "$page" | grep -o 'data-title="[^"]*"' | head -1 | sed 's/^data-title="//; s/"$//')
    printf "%s\t%s\t%s\t%s\tCC0 1.0\t%s\n" "$world/${slug}__fs${id}.mp3" "$id" "$author" "$title" "$url" >> "$CREDITS"
    echo "↓ $world/${slug}  ($(du -h "$f" | cut -f1))"; ok=$((ok+1))
  else
    rm -f "$f.part"; echo "✗ ошибка загрузки: $id ($slug)"; fail=$((fail+1))
  fi
  sleep 1
done < "$LIST"

echo
echo "Готово: $ok файлов, пропущено (не CC0): $skip, ошибок: $fail"
echo "Папка: $OUT   ·   всего: $(du -sh "$OUT" | cut -f1)"
