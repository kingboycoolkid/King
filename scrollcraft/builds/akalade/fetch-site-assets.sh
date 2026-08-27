#!/usr/bin/env bash
# Re-download Akalade's own photographs from the live site, then cut them to
# the crops the page uses.
#
# The originals (assets/site/) are NOT committed: they are ~86MB, two of them
# are 26MB and 36MB PNGs, and they are one curl away from the live site. What
# is committed is assets/img/, the ~1MB of crops the page actually loads.
#
# Needs static.wixstatic.com reachable. Run from this directory.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p assets/site assets/img

BASE=https://static.wixstatic.com/media
declare -A SRC=(
  [site-01.jpg]=76d6db_03265a3868a6414a862f001b6ad50d68~mv2.jpg
  [site-02.jpg]=76d6db_212604e97d7d4c6dbab4c8f3bc07aa1a~mv2.jpg
  [site-03.jpg]=76d6db_35cdb114573b4da4a525577ddb2de414~mv2.jpg
  [site-04.jpg]=76d6db_4b06f2768cd54ba3b826d9cf70ea8478~mv2.jpg
  [site-13.png]=76d6db_b91fedf9ae084fc3b0686edcc7b3d932~mv2.png
  [site-14.jpg]=76d6db_c3fed9aaa5be4c07ad753e1bba972d14~mv2.jpg
  [site-15.jpg]=76d6db_c70aa3fdf4b04cb7a0c5ae7582eea7fd~mv2.jpg
  [site-19.png]=76d6db_eb25077822ee493c9cd2b04604a2bc4d~mv2.png
  [site-20.jpg]=76d6db_f2ab088cf9a14496b44ce3df4ad767ea~mv2.jpg
)
for out in "${!SRC[@]}"; do
  [ -s "assets/site/$out" ] || curl -fsS -m 120 -o "assets/site/$out" "$BASE/${SRC[$out]}"
  printf '  fetched %s\n' "$out"
done

# cover-crop to the frame the layout declares, then webp.
crop () { ffmpeg -loglevel error -i "assets/site/$1" \
  -vf "scale=$3:$4:force_original_aspect_ratio=increase,crop=$3:$4" -q:v 82 -y "assets/img/$2"; }

crop site-13.png room.webp       1600 1067
crop site-15.jpg training.webp    900 1125
crop site-19.png culture-01.webp  900 1125
crop site-01.jpg culture-02.webp  900 1125
crop site-14.jpg culture-03.webp  900 1125
crop site-20.jpg culture-04.webp  900 1125
crop site-04.jpg culture-05.webp  900 1125
crop site-02.jpg culture-06.webp  900 1125
crop site-03.jpg crowd.webp       900 1125
echo "assets/img rebuilt:"; du -sh assets/img
