# Ephemeris Validation: Sun & Earth Positions vs. JPL Horizons

This directory contains the independent scientific validation suite for the Lunar Landing Site Navigator backend ephemeris engine, comparing Sun and Earth horizontal coordinates against reference data from NASA JPL Horizons.

---

## 1. What Is Checked

- **Target bodies**:
  - **Sun** (NAIF ID `10`): Apparent azimuth and elevation.
  - **Earth** (NAIF ID `399`): Apparent azimuth and elevation.
- **Seam**: The public backend HTTP API (`GET /visibility`) driven via `fastapi.testclient.TestClient` running against the committed SPICE kernel fixtures (`fixtures/kernels/meta.tm`).
- **Scope**: 6 lunar surface sites located south of 80°S, evaluated across 300 discrete instants spanning 2025-01-01 to 2032-12-31.

---

## 2. Reference Data & Methodology

### Source
- Reference values were queried directly from the **JPL Horizons On-Line Ephemeris System API** (`https://ssd.jpl.nasa.gov/api/horizons.api`).
- Horizons observer configuration:
  - Center: `coord@301` (Moon surface geodetic observer).
  - Radii: 1737.4 km reference sphere.
  - Altitude: 0.002 km (2 m observer height above the lunar sphere).
  - Apparent mode: `AIRLESS` (no atmospheric refraction).
  - Output quantity: Code `4` (Apparent Azimuth and Elevation).
  - Time scale: Universal Time (UT / UTC).

### Sites (South of 80°S, Distributed in Longitude)
1. **Connecting Ridge (Curated Site 001)**: Lat `-89.4661°`, Lon `-136.9490°`, Alt `2.0 m` (Lon ~223.05°E)
2. **Shackleton Rim / South Pole**: Lat `-89.9000°`, Lon `0.0000°`, Alt `2.0 m` (Lon 0.0°E)
3. **Mons Mouton (Curated Site MMO01)**: Lat `-85.4160°`, Lon `31.8506°`, Alt `2.0 m` (Lon ~31.85°E)
4. **Amundsen Rim**: Lat `-84.5000°`, Lon `90.0000°`, Alt `2.0 m` (Lon 90.0°E)
5. **Malapert Plateau**: Lat `-86.0000°`, Lon `165.0000°`, Alt `2.0 m` (Lon 165.0°E)
6. **Nobile Rim**: Lat `-85.2000°`, Lon `-75.0000°`, Alt `2.0 m` (Lon 285.0°E)

### Reproducibility & CI Isolation
- Fetching was performed in batches of 25 instants per request with a 1.0 s inter-request delay to comply with Horizons API rate and URL length constraints.
- Horizons echoes (`Center geodetic`, `Center pole/equ`, `Center radii`, `Atmos refraction`) were verified programmatically during ingestion.
- The reference dataset is committed at [`validation/data/horizons_reference.json`](file:///validation/data/horizons_reference.json).
- The exact query parameters and URLs are committed at [`validation/data/horizons_queries.json`](file:///validation/data/horizons_queries.json).
- The ingestion script is committed at [`validation/fetch_horizons.py`](file:///validation/fetch_horizons.py).
- **CI never calls Horizons**: all tests execute offline using the committed reference data and SPICE kernel fixtures.

---

## 3. Tolerance & Precision Targets

- **Pre-fixed scientific tolerance**: **`0.02°`** (72 arcseconds) for both Sun and Earth. This tolerance was fixed in the specification before running validation.
- **Azimuth metric definition**:
  - *Raw azimuth difference*: $\Delta \text{Az}_{\text{raw}} = |(\text{Az}_{\text{pred}} - \text{Az}_{\text{ref}} + 180^\circ) \bmod 360^\circ - 180^\circ|$
  - *Sky angular difference*: $\Delta \text{Az}_{\text{sky}} = \Delta \text{Az}_{\text{raw}} \cdot \cos(\text{El}_{\text{ref}})$
  - *Elevation difference*: $\Delta \text{El} = |\text{El}_{\text{pred}} - \text{El}_{\text{ref}}|$
  - Near the lunar south pole, solar elevation is within $\pm 1.8^\circ$ and Earth elevation is within $\pm 8^\circ$, so $\cos(\text{El}) \ge 0.99$. Both raw azimuth and sky azimuth are evaluated; the test asserts that both remain well within the $0.02^\circ$ tolerance.
- **Negative Controls**:
  - *10-minute time shift*: Advancing time by 10 minutes shifts the apparent solar azimuth by $\approx 0.085^\circ$ due to lunar rotation ($\approx 360^\circ / 29.53\text{ d}$). The test asserts that the error strictly exceeds $0.02^\circ$.
  - *Longitude shift*: Injecting a $0.01^\circ$ longitude perturbation rotates the topocentric horizontal frame meridian by $0.010^\circ$, which is asserted to be detected with $\ge 0.009^\circ$ sensitivity, and a $0.03^\circ$ coordinate shift strictly breaks the $0.02^\circ$ tolerance.

---

## 4. Coordinate & Frame Conventions

- **Body Reference Frame**: `MOON_ME` (Mean Earth / Polar Axis frame), matching Horizons' high-precision `MEAN_ME`.
- **Observer Location**: Topocentric lunar surface observer at $(R_{\text{Moon}} + h_{\text{obs}}) \cdot \hat{\mathbf{u}}_{\text{normal}}$, where $R_{\text{Moon}} = 1737.4\text{ km}$ and $h_{\text{obs}} = 0.002\text{ km}$ (2 m).
- **Horizontal Plane**: Defined by the local radial normal (zenith). Local East is $-\sin(\lambda)\hat{\mathbf{i}} + \cos(\lambda)\hat{\mathbf{j}}$; local North is $-\sin(\phi)\cos(\lambda)\hat{\mathbf{i}} - \sin(\phi)\sin(\lambda)\hat{\mathbf{j}} + \cos(\phi)\hat{\mathbf{k}}$.
- **Azimuth Origin**: Measured clockwise from local north ($0^\circ = \text{North}$, $90^\circ = \text{East}$, $180^\circ = \text{South}$, $270^\circ = \text{West}$).
- **Elevation Origin**: Measured positive upwards from the local horizontal plane perpendicular to the zenith vector (not relative to local topography).
- **Aberration**: Light-time plus stellar aberration (`LT+S` in SPICE; `AIRLESS` in Horizons).

---

## 5. What This Check Does NOT Cover

1. **Topography and Terrain Horizon**: This suite tests ephemeris math against the smooth $1737.4\text{ km}$ sphere. Real crater rims, peaks, and ridges from LOLA DEM data (LDEM products) are tested separately in terrain validation requirements (LUI-11).
2. **Sunrise / Sunset Timing**: Physical sunrise and sunset at the lunar poles are dominated by terrain occlusions rather than the spherical horizon.
3. **Solar Disc Fraction & Limb Darkening**: This suite validates celestial centre positions. Limb fractions during sunrise/sunset and partial solar eclipses are validated in eclipse and disc-fraction suites.
4. **Earth Libration Topographic Masking**: Real direct-to-Earth line-of-sight occultation by intervening mountains is validated in horizon mask tests.

---

## 6. How to Run the Suite

From the repository root:
```bash
uv run --project backend pytest validation -v -s
```

---

## 7. Live checks against the public API (the requirement)

The DEM fixtures here cover only ~20 km around the pole, and the full DEMs live on the VPS. So the
checks against real references run against the public API (`https://lunar-api.luizfbm.win`), by hand,
never in CI. Each run records the date, the API URL and the `engine_version` from `/meta`.

| id | Reference | Tolerance (fixed for validation) |
|---|---|---|
| `wueller2026-sunlit-days` | Wueller et al. 2026 (JGR Planets, data Zenodo 17084058, CC-BY 4.0): longest run of sunlit days in the 2026 southern mid-summer, 06/11–27/11, 2 m. Copied in `data/wueller2026_sites.csv` from the cited source dataset. Ours: LCIP over that Window, in days. | ≤ 1 day per Site, all 130 Sites |
| `landing-im2-athena` | moved to `test_athena.py` by the requirement (§10); `live_checks.py` keeps the raw engine numbers only | — |
| `landing-blue-ghost-1`, `landing-chandrayaan-3` | — | `pending` until the requirement (Sites outside the polar DEM) |

Run it (about 135 requests, one at a time, 1 s apart, ~5 min):

```bash
uv run --project backend python validation/live_checks.py
```

It writes `validation/data/live_results.json` (entries plus the per-Site table) and refreshes those
entries in `backend/app/data/validations.json`. Every pytest run of the suite merges the same file,
so offline runs keep the last live result. Commit both files.

### Landings outside the polar DEM (`live_landings.py`)

| id | Reference | Rule (fixed before the first query) |
|---|---|---|
| `landing-blue-ghost-1` | Firefly press release 17/03/2025: final data ~6:15 pm CDT (23:15 UTC) 16/03/2025, "just over 5 hours into the lunar night". Landing point from the CLPS SPICE archive. | our Sunset 5 to 6 h before the final data |
| `landing-chandrayaan-3` | ISRO Chandrayaan-3 updates: lander and rover in sleep mode on 04/09/2023, awakening expected ~22/09/2023 | our Sunset on or after 04/09/2023. Pending while `/sites/CH3` is 404 or the engine's Window coverage does not reach 2023 |
| `example-sun-height-apollo11` | engine only | none, an example: highest Sun at Apollo 11 next to Site 001 |

```bash
uv run --project backend python validation/live_landings.py
```

Five requests or so. It writes `validation/data/live_landings.json`, whose entries replace the pending
landing entries from `live_checks.py`. Commit it with `backend/app/data/validations.json`.

---

## 8. Flat horizon Sunsets (the requirement)

`/visibility/flat` answers the Query on the bare 1737.4 km sphere, with the horizon at minus the
dip, acos(R / (R + h)). At each Sunset it reports, the Sun's upper limb must be on that horizon.

| id | Reference | Tolerance (fixed in the requirement for validation) |
|---|---|---|
| `horizons-flat-sunset` | JPL Horizons, Sun from `coord@301` at the Observer height, airless: elevation (quantity 4) plus half the angular diameter (quantity 13), at every flat Sunset of 5 Queries (Site 001 and custom Sites from 84.5°S to 89.9°S, at 0, 2 and 10 m), 26 Sunsets in 2025-2032, one of them 165 days past its Window | ≤ 0.02° from the dip |
| `negative-control-flat-sunset-centre` | the same with the Sun's centre instead of its upper limb | must exceed 0.02° |

The instants come from the engine and are saved with the reference, so if the engine moves a
Sunset the check fails until the data is fetched again:

```bash
uv run --project backend python validation/fetch_flat_sunsets.py
```

It writes `validation/data/horizons_flat_sunsets.json`. The check itself is
`validation/test_flat_horizon.py` and needs no network.

---

## 9. DSN pass edges against JPL Horizons (the requirement)

`test_horizons_dsn.py` checks `/visibility/dsn` against JPL Horizons. The tolerances come from the spec (the requirement) and were fixed before the first comparison.

| id | What | Tolerance |
|---|---|---|
| `horizons-dsn-elevation` | Horizons' elevation of the Moon's centre from the antenna, at each pass edge we report | ≤ 0.05° from 6° |
| `horizons-dsn-pass-edges` | Horizons' own crossing of 6°, against our pass start or end | ≤ 2 min |
| `negative-control-dsn-edges-shifted` | The elevation check with every edge 10 minutes late | must exceed 0.05° |

- The minimum elevation, 6°, comes from DSN 810-005, module 302 Rev. E (1 July 2024), Table 1 "DSN Antenna Mechanical Characteristics", page 8: elevation motion limits of the 70-m antennas, 6° to 89.5°.
- Horizons setup: target `301`, center `coord@399` at the geodetic coordinates of DSS-14, DSS-43 and DSS-63 printed in `earth_topo_260814.tf` (DSN 810-005 module 301, WGS-84), quantity 4, `AIRLESS`, UT, one row per minute from 12 minutes before each edge to 12 minutes after. The script checks Horizons' site echo (coordinates and `ITRF93`).
- Edges: every pass start and end inside ten 30 h Windows at Site 001, from 2023-08-15 to 2032-10-01. That gives 74 edges. Edges cut by the Window are not crossings and are skipped.
- Between Horizons rows the elevation is interpolated linearly.

Refresh the data (about 75 requests, 1 s apart, needs the network):

```bash
uv run --project backend python validation/fetch_dsn_horizons.py
```

Not covered: an antenna schedule, a link budget, the terrain around the stations, refraction, and any antenna other than the three 70 m ones. The Moon's centre stands for the Site.

---

## 10. Independent reference checks

Three checks use independently produced reference data; the rules and tolerances are in `athena.py`,
written before judging, and the explanation is in `docs/validation/independent-reference-checks.md`.

| id | Reference | Tolerance | Runs |
|---|---|---|---|
| `larissa-athena-horizon` | Independent terrain-only silhouette at the IM-2 Athena point (-84.7906°, 29.1957°, 2 m), `data/larissa_athena_horizon.csv`, with a recorded source commit and SHA-256 | per azimuth ≤ atan(1 m / d) + 0.01°, d her blocking distance; ≥ 99% of 720 azimuths within and RMS ≤ 0.03°. Set after a first look at the numbers | server output |
| `negative-control-larissa-horizon-rotated` | The same silhouette turned by 1° | must break both conditions | server output |
| `landing-im2-athena` | LROC NAC M1495922531LE and M1496181900LE: incidence and image centre from the PDS index of volume LROLRC_0062C (`INDEX.TAB`, MD5 checked against `INDEX.LBL`), mid-exposure from the image labels | ≤ 0.015° at both images. The Earth over the transmission (17:30 06/03 to 06:15 07/03/2025 UTC) is reported, not judged | CI (LROC) + server output (transmission) |
| `negative-control-lroc-article-times` | The same at the times printed in LROC articles 1408 and 1409 | must exceed 0.015° at both | CI |
| `eclipse-2025-local-contacts` | SPICE `gfoclt` (pck00011 ellipsoids, LT) at -89.4°, 90°, 2 m; NASA's contacts (Espenak, `data/espenak_2025mar14.json`) as intervals | each contact ≤ 30 s from gfoclt; into the umbra in [U1, U2], out in [U3, U4], all in [P1, P4] | CI; Athena on the server, for information |
| `negative-control-eclipse-earth-radius` | The same with our Earth 1% larger | must exceed 30 s | CI |

Refresh the reference data from its recorded source (needs the network):

```bash
uv run --project backend python validation/fetch_athena_refs.py
```

The Athena point is 580 km from the pole, past the DEM fixtures, so its engine side runs in
the backend container on the server, from the deploy folder (about a minute), and its output
is committed:

```bash
docker compose cp ../validation/athena.py backend:/tmp/athena.py
docker compose cp ../validation/eclipse.py backend:/tmp/eclipse.py
docker compose cp ../validation/run_athena_engine.py backend:/tmp/run_athena_engine.py
docker compose exec -T -w /app backend python /tmp/run_athena_engine.py /tmp/athena_engine.json
docker compose cp backend:/tmp/athena_engine.json ../validation/data/athena_engine.json
```

Until `data/athena_engine.json` exists, the horizon entries and the transmission part of
`landing-im2-athena` show as pending.

---

## 11. Gläser et al. 2018 at the Connecting Ridge (the requirement)

`test_glaser.py` checks the Sun against the one published value for the Connecting Ridge that
we could read in full: Gläser et al. 2018, Planetary and Space Science 162, 170-178, Table 2 (p. 12
of the NASA NTRS preprint 20170007365), point C1 at 2 m, (-89.4398°, 222.83°E), 2017-01-01 to
2037-01-01 hourly, on the authors' own 20 m DTM. The rule, the reference and the tolerance are in
`glaser.py` and were committed before any result. The 92.27 % of the 2014 Icarus abstract is the
same quantity on the authors' earlier DTM; it is context in the result text and is never judged.

| id | Reference | Tolerance (fixed before the first run) |
|---|---|---|
| `glaser-sun-visibility` | solar visibility 92.1 %, the share of the period with any part of the Sun's disc visible. Ours: the maximum, over the 317 points within 250 m of C1 (25 m spacing), of the share of hourly steps with any part of the Sun above the Horizon mask | \|difference\| ≤ 5 percentage points, either way |
| `glaser-mean-sun-fraction` | maximum average illumination 88.0 %. Ours: the maximum over the same points of the mean Sun fraction, terrain only | \|difference\| ≤ 5 percentage points, either way |
| `negative-control-glaser-longitude` | the same grid at longitude + 180° | must break both checks |

- Each quantity is judged on its own maximum, as the paper does: it says the two maxima do not always fall on the same pixel.
- The maximum is over a neighbourhood, not the value at Site 001: the paper's point is about 800 m from Site 001, and the coordinate is given to about 3 m on a DTM that is not ours. Site 001's own values (and the best point of its 100 m Landing ellipse), the value at C1 itself, the Sun fraction with the Earth's eclipse, each calendar year, the 9-year span the app can answer (2023-08-01 to 2033-01-01), a 15 min step and a series shifted by 30 min are shown in the result text and never judged.
- The comparison is terrain only: the Earth's eclipse of the Sun is not in the judged value, as the GLOSSARY defines the Sun fraction.
- If a check fails, it stays failed and is reported with its numbers. Nothing is tuned: not the tolerance, the neighbourhood, the period or the reference.

The 20 years run past the app's coverage, so the engine side runs offline on the server, in the
backend image with the full DE440 and the full DEMs, like the PGDA one. The scan is vectorised
(one Sun vector per step for the whole neighbourhood, one Horizon mask per point) and
`test_glaser.py` checks it against `engine.Look` to 1e-5. From the repo root on the server
(`deploy/compose.yaml` already mounts the data volume read-only at `/data` and sets
`LUNAR_META_KERNEL` and `LUNAR_DEM_DIR`, as `deploy/fetch-data.sh` relies on for `crop_offpole.py`;
`/tmp/glaser` is the writable output folder):

```bash
mkdir -p /tmp/glaser
docker compose -f deploy/compose.yaml --env-file .env run --rm --no-deps -T \
  -v "$PWD/validation:/validation:ro" -v /tmp/glaser:/out \
  --entrypoint python backend /validation/run_glaser_engine.py \
  /out/glaser_engine.json --processes 3 --nice 10 </dev/null
cp /tmp/glaser/glaser_engine.json validation/data/glaser_engine.json
```

- It computes 683 points: the 317 of the neighbourhood, the same 317 at longitude + 180°, and the 49 of Site 001's Landing ellipse. At most 3 worker processes (the script refuses more), one thread of arithmetic each, and `--nice` (default 10) lowers their priority below the engine's. Memory: one process peaked at about 0.7 GB on a Mac (a Horizon mask reads the 80 m and 240 m windows whole), so budget about 3 GB for three workers and the parent; the compose service's limit is 4.5 GB.
- It is resumable: every finished point is appended to `/tmp/glaser/glaser_engine.json.partial.jsonl`, and the Sun vectors are kept in `/tmp/glaser/glaser_engine.json.work/`. After a stop, run the same command again; it carries on, and refuses if the rule, the period or the kernels changed (`--fresh` starts over).
- `--days`, `--start` and `--limit` shorten it for smoke runs. The output then says `"smoke": true`, and `test_glaser.py` refuses it.
- Commit `validation/data/glaser_engine.json` with the refreshed `backend/app/data/validations.json`.

Until `data/glaser_engine.json` exists, the three entries stay `pending`, and the tests that need it
are skipped. When it exists, `pytest validation` also recomputes five points (C1 and 100 m east,
west, north and south of it) over the span the committed SPICE fixture covers and compares them
with the committed file to 1e-6, so the file cannot drift away from the code.

Not covered: the surface level (0 m; the paper's Table 1 point is 325 m from C1), the Earth, the
Sun at another Observer height, and any elevation product other than `LDEM_80S_20MPP_ADJ`.

---

## 12. Eduardo's multiresolution Monte Carlo and the laser coverage (the requirement)

`test_hazard_mc.py` checks the aggregate statistics that Eduardo publishes for his Monte Carlo
on 26 PGDA 78 tiles (`hazard/mc_lola.py`, his `mc_lola.py` ported) against what the data in this
repository gives. His numbers enter the Proof only if scripts and data here produce them. The
rule and the tolerance of every number are in `hazard/rules.py`, committed before the first
judgement; the long explanation, with what each number proves and what it does not, is in
`docs/validation/eduardo-multiresolution.md`. The research repository we cite is
https://github.com/Luizfbm/Luna-Investigation; his branch is read only at commit `2195fcb`.

The two variants are **Normal navigation** (the coarse grid alone, 60 m or 20 m, no margin) and
**Multiresolution** (the coarse grid plus the correction where the laser shot, with a slope
margin P50, P90 or P99). The truth is the product's own slope on the cells that have a laser
shot (about 7 % of the 5 m cells; the rest of LOLA 5 m is interpolated, ADR 0003), hidden from
the method by 5-fold cross-validation. It is slope, not Sun or Earth.

| id | What | Tolerance (fixed before the first run) | Runs |
|---|---|---|---|
| `eduardo-mc-missed-hazard-nominal` | mean over 26 tiles of missed hazard, 60 m: Normal navigation 31.48 %, Multiresolution P90 6.38 %, -79.7 % | each number as he prints it, to half a unit of his last digit | CI (`tiles.json`) |
| `eduardo-mc-median-error` | mean over tiles of the median slope error: 1.04° to 0.59°, -42.9 % | the same | CI |
| `eduardo-equal-false-alarm-60`, `-20` | Normal grid with a uniform margin chosen per tile to have Multiresolution P90's false alarm, against P90: 6.45 % to 3.88 %, -38.5 %, 26 of 26 tiles, Wilcoxon p = 3e-8 (60 m); 3.57 % to 3.19 %, -12 %, 24 of 26, p = 7.5e-7 (20 m) | the same; counts exact; p at the figures he prints | CI (`tiles.json` and `data/hazard_equal_false_alarm.json`) |
| `eduardo-tradeoff-curves` | missed hazard at a fixed false alarm of 5 to 30 % (his Table 07): medians, median reduction 29 to 42 %, 26 of 26 (25 at 30 %), p = 3e-8 (6e-8) | the same | CI |
| `negative-control-eduardo-equal-false-alarm` | the 60 m comparison with the grade allowed a 30 % false alarm | Multiresolution P90 must no longer win in 26 of 26 tiles, and the median reduction must not be positive | CI |
| `eduardo-mc-rerun-pgda78` | `hazard/mc_lola.py` on the PGDA 78 layers (same seed 2026), against the 52 runs in `tiles.json` | every method's mean missed hazard and false alarm within 0.5 percentage points, the median error within 0.02°, on every run | **server**, `pending` until then |
| `eduardo-ldec-coverage` | share of cells with a laser shot at 5, 10, 20, 40, 60 m inside 87.5°S, from `LDEC_875S_5M.IMG` (`hazard/coverage.py`): 7.29, 25.90, 67.97, 95.93, 99.40 % | each within 0.005 points (the two decimals he prints) | **server**, `pending` until then |

The test used by every "equal false alarm" and "curve" claim is the **paired two-sided Wilcoxon
signed-rank test across the 26 tiles** (the tile is the unit, N = 26), as his `rodar_todos.py`
does with `scipy.stats.wilcoxon`; `rules.py` has an exact implementation that does not need scipy
and the test checks it against a brute-force enumeration and against the textbook example. With
26 of 26 tiles in the same direction the p-value is 2/2^26 = 3e-8, the smallest an N = 26 test
can give: it says the direction is the same in every tile, not how large the effect is. "Equal
false alarm" is his bisection: the grade's uniform margin is searched, per tile, on 20 calibration
draws, until the grade vetoes as much safe terrain as Multiresolution P90 does.

If a number does not reproduce, its entry is `failed` and says what we got. Nothing is tuned.

Run only this file (about 2 s):

```bash
uv run --project backend pytest validation/test_hazard_mc.py
```

With scipy, matplotlib and tifffile the file also runs his own `mc_lola.py` (read from his commit)
and the port on the same synthetic tile, at 60 m and 20 m, and requires every mean, interval,
statistic, margin and curve point to be identical:

```bash
uv run --project backend --with scipy --with matplotlib --with tifffile \
  pytest validation/test_hazard_mc.py
```

Data scripts. `data/hazard_equal_false_alarm.json` holds the control arm that `tiles.json`
does not, copied from his `resumo.json` files by `hazard/extract_equal_false_alarm.py` (needs his
branch fetched; the test that compares the file with his commit is skipped without it).
`backend/app/data/hazard/tiles.json` comes from `hazard/import_eduardo_bundle.py`.

### On the server: the rerun and the coverage

Both need gigabytes (the PGDA 78 layers of 26 tiles, and `LDEC_875S_5M.IMG`, 920,272,896 bytes),
so, like the Gläser check, they run on the server and nowhere else: never in CI, never on a
laptop. From the repo root, with the data folder outside the repo (`/opt/lunar-data/pgda78` here):

```bash
# 1. the layers, with their sha256 recorded in validation/data/hazard_pgda78_sha256.json
uv run --project backend python validation/hazard/fetch_pgda78.py /opt/lunar-data/pgda78 --with-ldec
# 2. the Monte Carlo, 26 tiles x 60 m and 20 m (resumable; scipy comes with --with)
mkdir -p /tmp/hazard
nice -n 10 uv run --project backend --with scipy python validation/hazard/mc_lola.py \
  --pgda-dir /opt/lunar-data/pgda78 --out /tmp/hazard/hazard_mc_rerun.json
# 3. the coverage (reads the raster in strips of 96 rows)
nice -n 10 uv run --project backend python validation/hazard/coverage.py \
  --raster /opt/lunar-data/pgda78/LDEC_875S_5M.IMG --out /tmp/hazard/hazard_coverage.json
cp /tmp/hazard/hazard_mc_rerun.json /tmp/hazard/hazard_coverage.json validation/data/
```

- `mc_lola.py` runs one tile at a time. It reads the four layers whole (float32) and works on
  the central 2000 x 2000 cells (about 16 MB per layer) plus temporaries; memory was not measured
  here, so watch the first tile. It appends each finished (tile, grid) to
  `/tmp/hazard/hazard_mc_rerun.json.partial.jsonl`, so after a stop the same command carries on
  (`--fresh` starts over, and it refuses a partial file made under another rule).
- `--sorteios`, `--tiles` and `--limit` shorten it for a smoke run; the output then says
  `"smoke": true` and the test refuses it.
- Commit `validation/data/hazard_mc_rerun.json`, `validation/data/hazard_coverage.json` and
  `validation/data/hazard_pgda78_sha256.json`, then refresh `backend/app/data/validations.json`
  with the usual full run (`pytest validation`), which replaces the two `pending` entries.

Not covered: Sun and Earth visibility (this is slope), the PGDA's correlated error clones, the
15° limit and the margins (0.8° near data, 2.0° far), which are Eduardo's rules and not
measurements, the 5 m cells with no laser shot, and any tile outside the 26.
