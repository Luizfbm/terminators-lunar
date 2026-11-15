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

## 10. Checks from Larissa's independent work (the requirement)

Larissa's prototype (the independent work, not merged) computed some things on her own. Three checks come
from it; the rules and tolerances are in `athena.py`, written before judging, and the story
is in `docs/validation/larissa-checks.md`.

| id | Reference | Tolerance | Runs |
|---|---|---|---|
| `larissa-athena-horizon` | Her terrain-only silhouette at the IM-2 Athena point (-84.7906°, 29.1957°, 2 m), `data/larissa_athena_horizon.csv`, byte for byte from commit 5766403 of her branch | per azimuth ≤ atan(1 m / d) + 0.01°, d her blocking distance; ≥ 99% of 720 azimuths within and RMS ≤ 0.03°. Set after a first look at the numbers | server output |
| `negative-control-larissa-horizon-rotated` | The same with her silhouette turned by 1° | must break both conditions | server output |
| `landing-im2-athena` | LROC NAC M1495922531LE and M1496181900LE: incidence and image centre from the PDS index of volume LROLRC_0062C (`INDEX.TAB`, MD5 checked against `INDEX.LBL`), mid-exposure from the image labels | ≤ 0.015° at both images. The Earth over the transmission (17:30 06/03 to 06:15 07/03/2025 UTC) is reported, not judged | CI (LROC) + server output (transmission) |
| `negative-control-lroc-article-times` | The same at the times printed in LROC articles 1408 and 1409 | must exceed 0.015° at both | CI |
| `eclipse-2025-local-contacts` | SPICE `gfoclt` (pck00011 ellipsoids, LT) at -89.4°, 90°, 2 m; NASA's contacts (Espenak, `data/espenak_2025mar14.json`) as intervals | each contact ≤ 30 s from gfoclt; into the umbra in [U1, U2], out in [U3, U4], all in [P1, P4] | CI; Athena on the server, for information |
| `negative-control-eclipse-earth-radius` | The same with our Earth 1% larger | must exceed 30 s | CI |

Refresh the reference data (needs the network and `git fetch origin 227-moon-prototype`):

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
