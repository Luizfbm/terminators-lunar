#!/usr/bin/env bash
# Builds the DEM test fixtures from the full PGDA 90 products (Barker et al. 2023) on the
# VPS: windows centred on the south pole, keeping the products' file names so the engine
# reads fixtures and full data the same way (point LUNAR_DEM_DIR at the folder).
#
# Windows, in polar stereographic metres around the pole:
#   20 m  ±25 km   near field of Curated Site 001 (16 km from the pole) and the pole
#   80 m  ±125 km  5 to 100 km rays from those Sites
#   240 m ±330 km  rays up to 300 km
#
# The result is published as the GitHub release asset `fixtures-dem-v1` (too big for git);
# CI fetches it with fetch.sh. Rebuild only when the windows change, then bump the tag.
set -euo pipefail
SRC="${LUNAR_DATA_DIR:-/opt/lunar-data}/dem"
OUT="${1:-.}"
O=(-q -of GTiff -co COMPRESS=DEFLATE -co PREDICTOR=3 -co TILED=YES)
crop() { gdal_translate "${O[@]}" -projwin "-$2" "$2" "$2" "-$2" "$SRC/$1" "$OUT/$1"; }
crop LDEM_80S_20MPP_ADJ.TIF 25000
crop LDEM_80S_80MPP_ADJ.TIF 125000
crop LDEM_60S_240MPP_ADJ.TIF 330000
(cd "$OUT" && shasum -a 256 LDEM_*.TIF)
