#!/usr/bin/env bash
# Downloads the engine data for the lunar app and writes the meta-kernel the
# backend loads. Safe to rerun: files already in place are skipped,
# and every file is written to a temp name first, so a cut download never
# leaves a half file in place.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "${LUNAR_DATA_DIR:-/opt/lunar-data}"
mkdir -p kernels dem sldem

get() { # get <dir> <url>
  local dir=$1 url=$2 name
  name=$(basename "$url")
  [ -s "$dir/$name" ] && return 0
  wget -q -O "$dir/.$name.part" "$url"
  mv "$dir/.$name.part" "$dir/$name"
}

N=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
KERNELS=(lsk/naif0012.tls pck/pck00011.tpc spk/planets/de440.bsp pck/moon_pa_de440_200625.bpc fk/satellites/moon_de440_250416.tf)
for k in "${KERNELS[@]}"; do get kernels "$N/$k"; done

# Same kernel set as fixtures/kernels/meta.tm, with the full DE440. Names are
# relative: the backend furnishes it from inside kernels/.
{
  printf 'KPL/MK\n\nWritten by deploy/fetch-data.sh.\n\n\\begindata\nKERNELS_TO_LOAD = (\n'
  for k in "${KERNELS[@]}"; do printf "  '%s'\n" "$(basename "$k")"; done
  printf ')\n\\begintext\n'
} > kernels/.meta.tm.part
mv kernels/.meta.tm.part kernels/meta.tm

# The DSN link (/visibility/dsn, the requirement): the Earth's orientation (historical, then
# NAIF's long-term predict, 1962 to 2126), the DSN stations and their topocentric frames.
# Their own meta-kernel, next to meta.tm, so /visibility keeps loading the same kernels.
# NAIF moves a file to a_old_versions/ when a newer one comes out, so look there too.
get_naif() { # get_naif <path under generic_kernels>
  local path=$1 name
  name=$(basename "$path")
  [ -s "kernels/$name" ] && return 0
  wget -q -O "kernels/.$name.part" "$N/$path" ||
    wget -q -O "kernels/.$name.part" "$N/$(dirname "$path")/a_old_versions/$name"
  mv "kernels/.$name.part" "kernels/$name"
}
DSN_KERNELS=(pck/earth_1962_260806_2126_combined.bpc spk/stations/earthstns_itrf93_260814.bsp fk/stations/earth_topo_260814.tf)
for k in "${DSN_KERNELS[@]}"; do get_naif "$k"; done
{
  printf 'KPL/MK\n\nWritten by deploy/fetch-data.sh for the DSN link.\n\n\\begindata\nKERNELS_TO_LOAD = (\n'
  for k in "${DSN_KERNELS[@]}"; do printf "  '%s'\n" "$(basename "$k")"; done
  printf ')\n\\begintext\n'
} > kernels/.dsn.tm.part
mv kernels/.dsn.tm.part kernels/dsn.tm

P=https://pgda.gsfc.nasa.gov/data/LOLA_20mpp
for f in LDEM_80S_20MPP_ADJ LDEM_80S_80MPP_ADJ LDEM_60S_60MPP_ADJ LDEM_60S_240MPP_ADJ LDEM_80S_20MPP_ADJ_ERR LDEM_80S_80MPP_ADJ_ERR LDEM_60S_240MPP_ADJ_ERR; do get dem "$P/$f.TIF"; done
# The per-pixel surface height error of the three polar DEMs (PGDA product 90, "LDEM surface
# height error (in meters)", Barker et al. 2023), on the DEMs' own grids: what the Uncertainty
# band perturbs them by (ADR 0006). PGDA also publishes LDEM_60S_60MPP_ADJ_ERR (4.2 GB), but
# only an off-pole crop would read it and deploy/crop_offpole.py does not cut it, so it is
# not fetched and Chandrayaan-3's band is `uncovered`; SLDEM2015 has no error product.
# Sizes are the server's Content-Length of 2026-11-15; a download that stopped short fails here.
err_size() { # err_size <name> <bytes>
  [ "$(stat -c %s "dem/$1.TIF")" = "$2" ] || { echo "$1 is not the $2 bytes the server announced" >&2; exit 1; }
}
err_size LDEM_80S_20MPP_ADJ_ERR 3954709201
err_size LDEM_80S_80MPP_ADJ_ERR 254808965
err_size LDEM_60S_240MPP_ADJ_ERR 267005175
# Permanently shadowed regions down to 85°S (the requirement): PGDA product 69, LOLA team,
# Mazarico et al. 2011 (Icarus 211, doi:10.1016/j.icarus.2010.10.030). GeoTIFF of the PDS
# IMG, 5058 x 5058 cells of 60 m in south polar stereographic on the 1737.4 km sphere,
# true scale at the pole (±151.7 km), int16 DN +20000 = permanent shadow, -20000 = not
# (scaling 0.000025, offset 0.5, unitless flag), per the label next to it. The server
# says 656183 bytes, last modified 2025-03-20; its sha256 is in deploy/psr.sha256
# and is checked on every fetch.
mkdir -p psr
get psr https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_85S_060M_201608.TIF
get psr https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/LPSR_85S_060M_201608.LBL
[ "$(stat -c %s psr/LPSR_85S_060M_201608.TIF)" = 656183 ] || { echo "PSR map is not the 656183 bytes the server announced" >&2; exit 1; }
if [ -s "$REPO/deploy/psr.sha256" ]; then (cd psr && sha256sum -c "$REPO/deploy/psr.sha256"); fi

S=https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG
for t in 000_045 045_090; do for e in IMG LBL; do get sldem "$S/SLDEM2015_512_00N_30N_${t}_FLOAT.$e"; done; done

# Windows around the Curated Sites outside the polar DEMs (the requirement), cut by the
# backend image itself (it has rasterio) from the PGDA 60°S files above and from
# SLDEM2015 (the tiles below when they are here, else over HTTP), so the global
# mosaics never have to sit here whole. Skips the windows
# already cut, then checks every one against deploy/offpole.sha256 and fails if not.
# stdin is /dev/null: the deploy feeds this script to `ssh ... bash -s`, and a
# `compose run` left reading stdin swallows the rest of the deploy script.
docker compose -f "$REPO/deploy/compose.yaml" --env-file "$REPO/.env" run --rm --no-deps -T \
  -v "$PWD/dem:/out" -v "$PWD/sldem:/sldem:ro" -v "$REPO/deploy:/deploy:ro" \
  --entrypoint python backend /deploy/crop_offpole.py /out /out /sldem </dev/null

# Images of the 3D globe (the requirement), from the NASA SVS Moon Kit and the polar DEM
# above, served by Caddy at lunar.luizfbm.win/moon/. Rebuilt only when an input or
# the script changes.
mkdir -p moon moon-src
docker compose -f "$REPO/deploy/compose.yaml" --env-file "$REPO/.env" run --rm --no-deps -T \
  -v "$PWD/moon:/moon" -v "$PWD/moon-src:/moon-src" -v "$PWD/dem:/dem:ro" \
  -v "$REPO/deploy:/deploy:ro" \
  --entrypoint python backend /deploy/globe_assets.py /moon /dem /moon-src </dev/null

sha256sum kernels/* dem/*.TIF dem/offpole/*/*.TIF sldem/* psr/* > MANIFEST.sha256
date -u +%FT%TZ > FETCHED_AT
