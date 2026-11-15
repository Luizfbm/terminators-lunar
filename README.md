# Lunar Landing Site Navigator

[Português](README.pt-BR.md)

Our entry for the NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator". Pick a Site near the lunar south pole and a Window, and the app answers one question: will a lander there see the Sun and the Earth, for how long, and when they go away, what hides them?

At the pole the Sun stays within about ±1.5° of the horizon and circles it once a month, so a single ridge decides whether the solar panels work. Terms in this README are the ones in [GLOSSARY.md](GLOSSARY.md).

## Try it

**The screen is not built yet.** Nothing on `main` serves a user interface, and there is no web page to open. What is live is the backend API:

`https://lunar-api.luizfbm.win` (the contract is [contract/openapi.yaml](contract/openapi.yaml), and a guide to it is in [docs/frontend-api-guide.md](docs/frontend-api-guide.md)).

The examples below use a representative API response.

**The default Query:** Connecting Ridge (Site 001), a Window of 708.73 h starting at the current UTC day, Observer height 2 m.

```bash
curl "https://lunar-api.luizfbm.win/visibility?site_id=001&start=$(date -u +%F)T00:00:00Z"
```

```json
{
  "type": "earthset",
  "t": "2026-11-30T06:08:29Z",
  "azimuth_deg": 143.2227386354377,
  "occluder": {
    "azimuth_deg": 143.0,
    "distance_m": 134330.3143310547,
    "terrain_height_m": 5060.123343871767,
    "feature": { "name": "Mons Malapert", "type": "mons", "relation": "inside" }
  }
}
```

That is the second item of `events`, shortened. The Earth sets on 30 November behind Mons Malapert, 134 km away. In the same answer, `metrics` gives 708.73 sunlit hours (the Sun never sets in this Window) and 329.06 hours with both the Sun and the Earth.

**A Site's year, month by month, with its best Windows:**

```bash
curl "https://lunar-api.luizfbm.win/sites/001/year?year=2027"
```

```json
{"start": "2027-09-12T06:00:00Z", "end": "2027-10-11T18:43:48Z", "duration_hours": 708.73, "sun_and_earth_hours": 403.22333333333336}
```

That is the first of `best_windows`. Over 2027, `totals` gives Site 001 6846.7 sunlit hours and 3209.0 hours of Sun and Earth together.

**The Resolution ladder:** the same Query on terrain at 240, 80 and 20 m.

```bash
curl "https://lunar-api.luizfbm.win/visibility/ladder?site_id=CR05&start=$(date -u +%F)T00:00:00Z"
```

| `resolution_m` | `next_sunset.t` | `sunlit_hours` |
|---|---|---|
| 240 | 2026-11-21T06:39:40Z | 442.2 |
| 80 | 2026-11-21T02:47:20Z | 438.2 |
| 20 | 2026-11-21T00:55:26Z | 436.1 |

At Site CR05, the 240 m terrain puts the Sunset 5.7 h later than the 20 m terrain does.

## What is live

- **The Occluder of every Sunset, Sunrise, Earthset and Earthrise**, with its azimuth, its distance and the name of the IAU feature it sits on.
- **134 Sites:** the 130 Artemis Sites of Wueller et al. 2026, plus the IM-2 and Blue Ghost 1 landing points, Apollo 11 and Chandrayaan-3 (`/sites`: 130 `wueller2026`, 2 `clps`, 1 `apollo`, 1 `isro`).
- **The Resolution ladder:** any Query at three DEM resolutions, with the range between them.
- **A Site's year:** every month of a year, and the Windows with the most time with both the Sun and the Earth.

Each `/visibility` answer also gives the sub-solar and sub-Earth points and the Sun's radius. When the engine's queue is full the API answers 503 `busy` with `Retry-After`. Time coverage runs from 2023-08-01 to 2032-12-31 (`/meta`).

The Uncertainty band from the DEM's known error (ADR 0003) is not built yet.

Independent reviews found real defects in the engine and data, each now covered by a regression test: rays that stepped over nearby peaks (Sunsets off by up to 158.9 min, now at most 13.1), the shifted SLDEM2015 crop, only 3 distinct rays at the exact pole, a cache with no memory limit, light routes stuck behind the engine, and a cache-warming thread that never stopped.

## How we know the numbers are right, and where they are not

Every check has a tolerance written before its first run. Nobody changes a tolerance or a reference to make a check pass. This is the current `/validations` data:

| Check | Against | Tolerance | Result | Status |
|---|---|---|---|---|
| Sun azimuth and elevation | JPL Horizons, 6 Sites south of 80°S, 300 instants from 2025 to 2032 | ≤ 0.02° | max error 0.000001° | passed |
| Earth azimuth and elevation | the same | ≤ 0.02° | max error 0.000312° | passed |
| Negative control, clock 10 min off | the Sun check with the time shifted | must exceed 0.02° | 0.085° | passed |
| Negative control, Site moved | the Sun check with longitude shifted 0.01° and 0.03° | 0.01° detected, 0.03° exceeds 0.02° | 0.0100° and 0.0300° | passed |
| Sub-solar point | JPL Horizons, 12 instants | ≤ 0.05° per point | max separation 0.0002° | passed |
| Sub-Earth point | JPL Horizons, 12 instants | ≤ 0.05° per point | max separation 0.0058° | passed |
| Negative control, sub-points with the clock off | the sub-point check with the time shifted | must exceed 0.05° | 1.020° | passed |
| Sunlit days | Wueller et al. 2026, all 130 Sites, 06/11 to 27/11/2026 | ≤ 1 day per Site | 75 of 130 within 1 day, 55 outside | **failed** |
| Blue Ghost 1 | Firefly's end of mission: last data 23:15 UTC on 16/03/2025, "just over 5 hours" after nightfall | our Sunset 5 to 6 h before the last data | our Sunset 19:44 UTC, 3.51 h before | **failed** |
| IM-2 Athena | LROC resting point, 12.75 h of mission | none, there is no comparable number | the engine sees the Sun the whole time | pending |
| Chandrayaan-3 | ISRO, sleep mode on 04/09/2023 | our first Sunset not before 04/09/2023 | first Sunset 2023-09-04 07:12 UTC, Occluder 6.9 km away | passed |

Why each failure or gap is there:

- **Wueller 2026.** The published value is a 60 m pixel, rounded down, on a map that changes by several days within ±180 m. Our number is within that spread at 90 of the 130 Sites. Four rows of the source are blank and count against us. An independent walk over the DEM agrees with the engine. 40 Sites are still unexplained, almost all with more Sun on our side, and the paper's method is not in any open source we could reach ([docs/validation/sources-wueller-blue-ghost.md](docs/validation/sources-wueller-blue-ghost.md)). The whole investigation is in [docs/validation/wueller-2026.md](docs/validation/wueller-2026.md).
- **Blue Ghost 1.** The SLDEM2015 window has a grid shifted by a fraction of a pixel, which makes a false wall 54 m from the lander. With the corrected crop, the Sunset is 19:44 UTC. It still fails, and the rule is the weak part. Firefly gives the time of the last data, not of the Sunset, so the 17:15 to 18:15 UTC band came from the phrase "just over 5 hours". JPL Horizons puts the Sun's centre on the flat horizon at 20:10:39 UTC, 26 min after our terrain Sunset, and the band sits about 2 h before that. Sources: [docs/validation/sources-wueller-blue-ghost.md](docs/validation/sources-wueller-blue-ghost.md).
- **IM-2.** The lander tipped over inside a crater about 20 m across, smaller than the finest DEM, with its panels facing away. Its mission did not end at a terrain Sunset, so there is nothing to compare.
- **Chandrayaan-3.** ISRO gives the day it put the lander to sleep (04/09/2023) but no time. So this only checks the order: our first Sunset does not come before that day. It is not a comparison with a measured instant.

How to run the checks: [validation/README.md](validation/README.md).

## How it works

All computation happens in the backend (ADR 0002). For a Site, the engine casts a ray every 0.5° of azimuth (720 rays) over nested LOLA DEMs: 20 m out to 5 km, 80 m out to 100 km, then 240 m out to 300 km. Along each ray it allows for the Moon's curvature and keeps the highest angle, which gives the Horizon mask. The Sun's and the Earth's positions come from NASA's SPICE toolkit (spiceypy) with the DE440 ephemeris, every 15 min of the Window. The Sun is treated as a disc, not a point: its Sun fraction is the share of the disc above the mask, and Sunset is when the last edge goes. The Earth counts as visible while its centre is above the mask. Each event takes as its Occluder the terrain sample that sets the mask in that direction.

```
SPICE kernels (DE440, Moon frames)       LOLA DEMs: 20 m to 5 km, 80 m to 100 km, 240 m to 300 km
             |                                           |
   Sun and Earth az/el, every 15 min           720 rays -> Horizon mask + Occluder
             \___________________   _____________________/
                                 \ /
                compare (Sun as a disc, Earth by its centre)
                                  |
             events, periods, metrics  ->  FastAPI  ->  /visibility, /ladder, /year
```

Sites outside the polar DEMs (Apollo 11, Blue Ghost 1, Chandrayaan-3) use SLDEM2015 and the PGDA 60°S DEMs instead.

## Run it locally

You need [uv](https://docs.astral.sh/uv/) and the `gh` CLI, logged in. The DEM test windows (about 58 MB) live in a release asset of this repo.

```bash
fixtures/dem/fetch.sh
cd backend
uv sync --locked
uv run uvicorn app.main:app --port 8000
```

Then `curl "localhost:8000/visibility?site_id=001&start=$(date -u +%F)T00:00:00Z"` (`start` is required). The fixtures cover about ±25 km at 20 m around the pole, so Sites further out answer only on the server, which has the full DEMs.

Tests, the same ones CI runs:

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy .
uv run pytest
cd ..
uv run --project backend pytest validation
uvx schemathesis run contract/openapi.yaml --url http://localhost:8000 --checks all
```

Schemathesis needs the API from the step above running. Mutation testing runs by hand from the Actions tab (the `Mutation` workflow), not on a laptop.

## Data and credits

| Data | Source | Licence |
|---|---|---|
| SPICE kernels: `naif0012.tls`, `pck00011.tpc`, `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` | NASA NAIF generic kernels | NASA data, released without copyright restrictions |
| Polar DEMs `LDEM_80S_20MPP_ADJ`, `LDEM_80S_80MPP_ADJ`, `LDEM_60S_240MPP_ADJ`, `LDEM_60S_60MPP_ADJ` | NASA PGDA product 90, Barker et al. 2023 (LOLA) | NASA data, released without copyright restrictions |
| `SLDEM2015_512`, `SLDEM2015_128` | NASA PGDA product 54, SLDEM2015 (LOLA and Kaguya), tiles from imbrium.mit.edu | NASA data, released without copyright restrictions |
| The 130 Artemis Sites | Wueller et al. 2026, JGR Planets 131(3), e2025JE009434, doi:10.1029/2025JE009434; data Zenodo 17084058 | CC-BY 4.0 |
| Feature names | Gazetteer of Planetary Nomenclature, IAU WGPSN and USGS Astrogeology | public domain |
| Landing points of IM-2 and Blue Ghost 1 | CLPS SPICE archive, NASA NAIF | NASA data, released without copyright restrictions |
| Map of the Earth in the view from the ground, `frontend/public/earth_2k.jpg` | NASA/Goddard Space Flight Center Scientific Visualization Studio, SVS 3615, `earth_noClouds.0330.tif`; the Blue Marble Next Generation data is courtesy of Reto Stöckli (NASA/GSFC) and NASA's Earth Observatory | NASA imagery, released without copyright restrictions |

## How it was built

The project is implemented with Python, FastAPI, React, TypeScript and the NASA SPICE and LOLA data products described above.
