#!/usr/bin/env bash
# Re-encode videos to stay under GitHub's 100 MiB blob limit (104857600 bytes).
set -uo pipefail

TARGET_BYTES="${TARGET_BYTES:-104857600}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

compress_to_mp4() {
  local input="$1"
  local output="$2"
  local tmp
  tmp="$(mktemp -t fscompressXXXXXX.mp4)"

  cleanup() { rm -f "$tmp"; }
  trap cleanup EXIT

  if [[ ! -f "$input" ]]; then
    echo "skip missing: $input" >&2
    return 1
  fi

  local before
  before=$(stat -f%z "$input")
  echo "→ $(basename "$input") ($(awk "BEGIN{printf \"%.1f\", $before/1024/1024}") MB)"

  local maxw crf
  for maxw in 1920 1280 960; do
    for crf in 22 24 26 28 30 32 34 36; do
      if ffmpeg -y -hide_banner -loglevel error -i "$input" \
        -c:v libx264 -profile:v high -pix_fmt yuv420p -crf "$crf" -preset medium \
        -vf "scale='min(${maxw},iw)':-2:flags=lanczos" \
        -c:a aac -b:a 128k -ac 2 -movflags +faststart \
        "$tmp" 2>/dev/null; then
        local sz
        sz=$(stat -f%z "$tmp")
        if (( sz < TARGET_BYTES )); then
          mv "$tmp" "$output"
          trap - EXIT
          local after
          after=$(stat -f%z "$output")
          echo "  ✓ $(basename "$output") ($(awk "BEGIN{printf \"%.1f\", $after/1024/1024}") MB) maxw=${maxw} crf=${crf}"
          return 0
        fi
      fi
    done
  done

  echo "  ✗ could not get under 100 MiB: $input" >&2
  return 1
}

# Hero duplicate: same file in two places — compress once then copy.
HERO_SRC="$ROOT/videos/film-stop-hero-cut-2.mp4"
HERO_OUT="$ROOT/videos/film-stop-hero-cut-2.compressing.mp4"
if [[ -f "$HERO_SRC" ]] && (( $(stat -f%z "$HERO_SRC") >= TARGET_BYTES )); then
  compress_to_mp4 "$HERO_SRC" "$HERO_OUT" && mv "$HERO_OUT" "$HERO_SRC"
  cp "$HERO_SRC" "$ROOT/public/videos/film-stop-hero-cut-2.mp4"
fi

# Assets: oversized mp4 → replace in place via temp
for f in \
  "$ROOT/assets/videos/wedding.mp4" \
  "$ROOT/assets/videos/star-girl.mp4" \
  "$ROOT/assets/videos/sunshine.mp4" \
  "$ROOT/assets/videos/timeline-1.mp4"
do
  [[ -f "$f" ]] || continue
  (( $(stat -f%z "$f") >= TARGET_BYTES )) || continue
  out="${f%.mp4}.compressing.mp4"
  compress_to_mp4 "$f" "$out" && mv "$out" "$f"
done

# Remaining .mov files (e.g. dear-future-me fallback) should stay under 100 MiB in repo.

echo "Done."
