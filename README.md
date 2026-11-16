# Lunar Landing Site Navigator

[Português](README.pt-BR.md)

Our entry for the NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator". Pick a Site near the lunar south pole and a Window, and the app answers one question: will a lander there see the Sun and the Earth, for how long, and when they go away, what hides them?

At the pole the Sun stays within about ±1.5° of the horizon and circles it once a month, so a single ridge decides whether the solar panels work. Terms in this README are the ones in [GLOSSARY.md](GLOSSARY.md).

## Try it

**Open the app: <https://lunar.luizfbm.win>.** No login, and the whole Query lives in the link.

The web interface is under `frontend/` and the backend API under `backend/`. The API is public at:

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

## What the application provides

- **The Occluder of every Sunset, Sunrise, Earthset and Earthrise**, with its azimuth, its distance and the name of the IAU feature it sits on.
- **151 Sites:** the 130 Artemis Sites of Wueller et al. 2026, plus the IM-2 and Blue Ghost 1 landing points, Chandrayaan-3, and 18 landing sites of earlier missions (Apollo, Surveyor, Luna, Chang'e 3) (`/sites`: 130 `wueller2026`, 2 `clps`, 6 `apollo`, 1 `isro`, 12 `lroc2016`).
- **The Resolution ladder:** any Query at three DEM resolutions, with the range between them.
- **A Site's year:** every month of a year, and the Windows with the most time with both the Sun and the Earth.
- **Custom Sites:** a coordinate at or south of 80°S is a Site too (source `custom`), and the whole Query, plan B included, lives in the link.

Each `/visibility` answer also gives the sub-solar and sub-Earth points and the Sun's radius. When the engine's queue is full the API answers 503 `busy` with `Retry-After`. Time coverage runs from 2023-08-01 to 2032-12-31 (`/meta`).

The Uncertainty band from the DEM's known error (ADR 0003) is not built yet.

### In the answer

Under the sentence that answers the Query, the app shows:

- **A knife-edge warning.** If a few metres of miss changes the answer, a sentence says so before anyone has to open anything else. It reads the Landing scatter of the "If the lander misses" panel, and only counts points up to 250 m from the Site, the miss IM-2 Athena made. It speaks when one of those points has the Sun, or the Earth, for at least 10% of the Window (never less than 1 h) more or less than the Site, and it names the distance, the direction and the hours. A link takes you to the panel. A stable Site, or a scatter that is still loading or has failed, shows nothing.
- **The Sun's disc at the Cursor.** Next to the Cursor, on the timeline and in the view from the ground, the Sun fraction reads "Sun: whole disc in view", "Sun: hidden" or "Sun: 63% of the disc". A Sun that is partly in view never rounds to 0% or to 100%.
- **How far the horizon reaches.** One line says our horizon reaches 300 km, the outer edge of the 240 m DEM, and how far away the Occluders of the next Sunset and Earthset are. Below it, the rule: the Sun counts as visible while any part of its disc is in view, and the Earth counts by its centre.
- **Plan A × Plan B.** Plan A is the Query on screen. Plan B changes the Site, the start day, the length in days or the Observer height, and the six numbers (Sun-and-Earth time, sunlit hours, Earth-visible hours, LCIP, LCSP, mean Sun fraction) sit side by side, with a star on the better one. A gap under 0.5 h, or under 0.5 percentage point for a share of the Window, is a tie, and the closing sentence never names a winner when the plans cannot be told apart. When the two Windows differ in length, the totals are compared as a share of each Window.
- **A check in JPL Horizons.** Under "Stats for nerds", the Sun's and the Earth's position at the Cursor come with one link each to JPL Horizons, already filled in with the Site, the Observer height and the instant (to the minute, UT, no atmosphere). It is the same request the validation uses, so Horizons prints azimuth and elevation to compare with ours.

Also in the app, each one answered by a route of the contract: the Windows of a Site by start day, the nearby Sites ranked (`/sites/{site_id}/windows`, `/sites/{site_id}/neighbours`); the Landing scatter, the slope and the nearest permanent shadow (`/visibility/scatter`, `/terrain`); a lander's battery over the Window (`/visibility/energy`); the same Query without terrain, as a flat horizon line (`/visibility/flat`); when a Deep Space Network dish can hear the Site (`/visibility/dsn`); and an assistant that answers questions about a Query with the engine's numbers (`/assistant`; with no model configured it answers in offline mode).

Independent reviews found real defects in the engine and data, each now covered by a regression test: rays that stepped over nearby peaks (Sunsets off by up to 158.9 min, now at most 13.1), the shifted SLDEM2015 crop, only 3 distinct rays at the exact pole, a cache with no memory limit, light routes stuck behind the engine, and a cache-warming thread that never stopped.

## How we know the numbers are right, and where they are not

Every check has a tolerance, and nobody changes a tolerance or a reference to make a check pass. The table is the current content of [`backend/app/data/validations.json`](backend/app/data/validations.json), the file `/validations` serves and the Proof page shows: 32 entries, 29 passed, 2 failed and 1 pending. The pending one is an example, not a check. Failures come first, as on the Proof page. A negative control is a check that must fail on purpose, to show the check can tell a wrong answer from a right one; it says nothing about the engine. The file also holds, for each entry, what it was compared against and what it does not cover, so read those on the Proof page before quoting a row.

| Id | Check | Tolerance | Result | Status | Script |
|---|---|---|---|---|---|
| `wueller2026-sunlit-days` | Consecutive sunlit days at the Artemis Sites vs Wueller et al. 2026 | ≤ 1 day per Site | 75 of 130 Sites within 1 day; largest gap +19.23 d at MMO09. Of the 97 with a published value above 0, 75 within 1 day. 33 Sites are published as 0 days. | **failed** | `validation/live_checks.py` |
| `landing-blue-ghost-1` | Blue Ghost 1 Sunset vs end of the mission | our Sunset 5 to 6 h before the final data | our Sunset 2025-03-16 19:44 UTC, 3.51 h before the final data; Occluder: Mare Crisium, 0.7 km at azimuth 270.0° | **failed** | `validation/live_landings.py` |
| `example-sun-height-apollo11` | Example: how high the Sun gets, Apollo 11 vs the pole | none: an example, not a check | highest Sun: 87.8° at Apollo 11, 2.0° at Site 001 | pending | `validation/live_landings.py` |
| `horizons-sun-azel` | Sun azimuth and elevation vs JPL Horizons | ≤ 0.02° | max error 0.000001° over 300 instants (angular separation 0.000001°) | passed | `validation/test_horizons.py` |
| `horizons-earth-azel` | Earth azimuth and elevation vs JPL Horizons | ≤ 0.02° | max error 0.000312° over 300 instants (angular separation 0.000312°) | passed | `validation/test_horizons.py` |
| `independent-athena-horizon` | Horizon mask at IM-2 Athena, against our group's independent silhouette | per azimuth \|ours − theirs\| ≤ atan(1 m / d) + 0.01°, d their blocking distance; at least 99% of our 720 azimuths within it and RMS ≤ 0.03°. 1 m: the adjusted LOLA maps' 0.3–0.5 m RMS (Barker et al. 2021) and the unadjusted map's ~0.5 m radial orbit error (Mazarico et al. 2018), in quadrature. Fixed before evaluating the comparison | 99.2% of 720 azimuths within; ours − theirs: mean -0.0022°, RMS 0.0197°, P95 0.051°, largest +0.090° at 190° (their Occluder 0.55 km away) | passed | `validation/test_athena.py` |
| `negative-control-independent-horizon-rotated` | Negative control: our group's silhouette turned by 1° | must break both conditions: under 99% of azimuths within and RMS above 0.03° | broke both conditions (37.6% within, RMS 0.079°) | passed | `validation/test_athena.py` |
| `landing-im2-athena` | IM-2 Athena landing point | incidence = 90° − our Sun elevation at the published image centre, within 0.015° at both images (both published to 0.01°). The Earth over the transmission is reported as a fact, not judged | incidence, ours − LROC: M1495922531LE +0.0040°, M1496181900LE -0.0000°. Fact, not judged: over the transmission our mask keeps the Earth's centre at least 12.3° above the horizon (2025-03-06T17:30:00Z). Shown for information: Sun fraction at the resting point 1.00 and 1.00 at the two images; the photos show the site lit. | passed | `validation/test_athena.py` |
| `negative-control-lroc-article-times` | Negative control: the LROC images at the times their articles give | must exceed 0.015° at both images | broke the check at both images (M1495922531LE -0.881°, M1496181900LE -0.358°) | passed | `validation/test_athena.py` |
| `eclipse-2025-local-contacts` | The total lunar eclipse of 14/03/2025, seen from the Moon: when the Earth covers the Sun | each of the four contacts (Sun fraction leaves 1, reaches 0, leaves 0, returns to 1) within 30 s of gfoclt: our Earth is a sphere of the equatorial radius, gfoclt's an ellipsoid 21.4 km shorter at the poles, ~20 s at ~0.55°/h, plus the bisection. And inside NASA's contacts: into the umbra in [U1, U2], out in [U3, U4], all in [P1, P4] | at -89.4°, 90°: ours − gfoclt -6.9 s, -8.0 s, +3.6 s, +4.4 s (contacts 04:22:39.6, 05:32:09.3, 08:17:50.8, 09:27:24.8 UTC); inside NASA's intervals. At Athena, for information: ours − gfoclt -6.8 s, -8.0 s, +3.6 s, +4.4 s. | passed | `validation/test_eclipse.py` |
| `negative-control-eclipse-earth-radius` | Negative control: the eclipse with the Earth 1% larger | must exceed 30 s on some contact | broke the check: ours − gfoclt -77.8 s, -79.3 s, +74.8 s, +75.4 s | passed | `validation/test_eclipse.py` |
| `horizons-flat-sunset` | Flat horizon: the Sun's upper limb at each Sunset vs JPL Horizons | ≤ 0.02° from the dip | max error 0.00014° over 26 Sunsets | passed | `validation/test_flat_horizon.py` |
| `negative-control-flat-sunset-centre` | Negative control: the Sun's centre at each flat Sunset | must exceed 0.02° | failed as expected (0.262°) | passed | `validation/test_flat_horizon.py` |
| `negative-control-time-shift` | Negative control: 10 min shift | must exceed 0.02° | failed as expected (0.085°) | passed | `validation/test_horizons.py` |
| `negative-control-longitude-shift` | Negative control: longitude shift | 0.01° detected (≥ 0.009°), 0.03° exceeds 0.02° | 0.01° shift moved the Sun 0.0100°, 0.03° shift 0.0300° (as expected) | passed | `validation/test_horizons.py` |
| `horizons-dsn-elevation` | Moon elevation at each DSN pass edge vs JPL Horizons | ≤ 0.05° from 6° | max error 0.002126° from 6° over 74 pass edges | passed | `validation/test_horizons_dsn.py` |
| `horizons-dsn-pass-edges` | DSN pass start and end vs JPL Horizons' crossing of 6° | ≤ 2 min | max gap 0.8 s over 74 pass edges | passed | `validation/test_horizons_dsn.py` |
| `negative-control-dsn-edges-shifted` | Negative control: DSN pass edges 10 minutes late | must exceed 0.05° | smallest error 1.283406° over 74 edges moved 10 min | passed | `validation/test_horizons_dsn.py` |
| `group-panel-incidence` | Panel pointing vs our group's panel-geometry model | ≤ 1e-9 on the incidence factor | max error 5.0e-16 over 2,520 Sun directions and 8 instants through the API | passed | `validation/test_panel_incidence.py` |
| `negative-control-panel-azimuth-turned` | Negative control: the panels turned 180° | must exceed 1e-9 | failed as expected (1.00) | passed | `validation/test_panel_incidence.py` |
| `pgda-sun-visibility` | Share of time with the Sun up, against NASA's 18.6-year map | RMSE ≤ 5 percentage points and mean difference ≤ 2 points | RMSE 1.00 points, mean difference -0.44 points over 86 points (largest -3.01); a second cycle moves the mean by -0.14 points; mean Sun fraction, not judged, is off by -1.78 on average. Bright ridges, shown for information (the map cannot place a value inside a 60 m pixel there): RMSE 25.40, mean difference -22.36 points over 18 points | passed | `validation/test_pgda.py` |
| `pgda-earth-visibility` | Share of time with the Earth visible, against NASA's 18.6-year map | RMSE ≤ 5 percentage points and mean difference ≤ 2 points | RMSE 3.01 points, mean difference -0.53 points over 86 points (largest -19.11); a second cycle moves the mean by -0.10 points; by the Earth's centre, as the app counts it, the mean is -5.72 points | passed | `validation/test_pgda.py` |
| `negative-control-pgda-longitude` | Negative control: the same points at longitude + 180° | must break both checks (RMSE above 5 points) | broke both checks (Sun RMSE 22.45, Earth RMSE 47.35 points) | passed | `validation/test_pgda.py` |
| `psr-synthetic-patch` | Nearest permanent shadow on a known map | distance within one cell (60 m); azimuth within the angle one cell subtends there | largest distance error 16.7 m; largest azimuth error 0.39 of a cell's angle | passed | `validation/test_psr.py` |
| `slope-synthetic-plane` | Slope of a known plane | ≤ 0.01°; level plane exactly 0, all of it under 10° | largest gap 0.000002° on the tilted plane; level plane 0 and all under 10° | passed | `validation/test_slope.py` |
| `slope-cell-count` | Cells within 100 m on a 20 m grid | within 12 % | 81 cells, 3.1 % from 78.5 | passed | `validation/test_slope.py` |
| `horizons-sub-sun` | Sub-solar point vs JPL Horizons | ≤ 0.05° per point | max separation 0.0002° over 12 instants | passed | `validation/test_sub_points.py` |
| `horizons-sub-earth` | Sub-Earth point vs JPL Horizons | ≤ 0.05° per point | max separation 0.0058° over 12 instants | passed | `validation/test_sub_points.py` |
| `negative-control-sub-points-time-shift` | Negative control: sub-solar point 2 h later | must exceed 0.05° | failed as expected (1.020°) | passed | `validation/test_sub_points.py` |
| `horizons-sun-distance-factor` | Sun-distance factor of the battery vs JPL Horizons | ≤ 0.1 % of (1 au / d)² | max error 3.4e-09 % over 12 instants | passed | `validation/test_sun_distance.py` |
| `negative-control-sun-distance-ignored` | Negative control: the battery with the Sun always at 1 au | must exceed 0.1 % | failed as expected (3.34 %) | passed | `validation/test_sun_distance.py` |
| `landing-chandrayaan-3` | Chandrayaan-3 Sunset vs ISRO sleep date | our Sunset after 04/09/2023 (ISRO slept them before sunset) | our first Sunset 2023-09-04 07:12 UTC; Occluder: 6.9 km at azimuth 277.5° | passed | `validation/live_landings.py` |

The Proof page opens with two summaries before the checks. "Where a number can be wrong" is a table of nine sources of error (terrain resolution, height error of the map, relief smaller than the finest cell, horizon reach, the time step, the Sun's and the Earth's positions, the Sun as a disc, the Earth by its centre, and where the lander lands), each with its size, its effect on the answer and where the size comes from: a check, a script, a decision record or a paper. A row with no source for its size has no number. "What we have not checked yet" lists eight gaps that belong to the whole page and not to one check, such as the 5 m maps, errors every LOLA map shares, measured instants to compare Sunsets with, the 40 Sites of Wueller et al. 2026 with no known cause, bright ridges, the DSN link, the battery model beyond the Sun's angle and distance, and the Earth's atmosphere in an eclipse. A unit test looks up every figure in those rows in the check, file or decision record they cite.

Why each failure or gap is there:

- **Wueller 2026.** The published value is a 60 m pixel, rounded down, on a map that changes by several days within ±180 m. Our number is within that spread at 90 of the 130 Sites. Four rows of the source are blank and count against us. An independent walk over the DEM agrees with the engine. 40 Sites are still unexplained, almost all with more Sun on our side, and the paper's method is not in any open source we could reach ([docs/validation/sources-wueller-blue-ghost.md](docs/validation/sources-wueller-blue-ghost.md)). The whole investigation is in [docs/validation/wueller-2026.md](docs/validation/wueller-2026.md).
- **Blue Ghost 1.** The SLDEM2015 window has a grid shifted by a fraction of a pixel, which makes a false wall 54 m from the lander. With the corrected crop, the Sunset is 19:44 UTC. It still fails, and the rule is the weak part. Firefly gives the time of the last data, not of the Sunset, so the 17:15 to 18:15 UTC band came from the phrase "just over 5 hours". JPL Horizons puts the Sun's centre on the flat horizon at 20:10:39 UTC, 26 min after our terrain Sunset, and the band sits about 2 h before that. Sources: [docs/validation/sources-wueller-blue-ghost.md](docs/validation/sources-wueller-blue-ghost.md).
- **IM-2.** Two checks pass, and neither is about the Sunset. `landing-im2-athena` confirms the ephemeris: the incidence angle LROC publishes at the resting point matches 90° minus our Sun elevation to within 0.004° at both images. `independent-athena-horizon` compares our Horizon mask there with an independent silhouette (99.2% of 720 azimuths within the tolerance). The lander tipped over inside a crater about 20 m across, smaller than the finest DEM, with its panels facing away, and the engine sees the Sun the whole time (Sun fraction 1.00 at both images). The mission did not end at a terrain Sunset, so there is no time to compare, and the terrain is not what these checks test.
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
             events, periods, metrics  ->  FastAPI  ->  /visibility, /visibility/ladder, /sites/{id}/year
```

Sites outside the polar DEMs (Apollo 11, Blue Ghost 1, Chandrayaan-3) use SLDEM2015 and the PGDA 60°S DEMs instead.

## Run it locally

You need [uv](https://docs.astral.sh/uv/) and the `gh` CLI, logged in. The DEM test windows live in two release assets of this repo: the polar ones (about 59 MB) and the windows of the Sites outside the polar DEMs (about 151 MB).

```bash
fixtures/dem/fetch.sh
cd backend
uv sync --locked
uv run uvicorn app.main:app --port 8000
```

Then `curl "localhost:8000/visibility?site_id=001&start=$(date -u +%F)T00:00:00Z"` (`start` is required). The fixtures cover about ±25 km at 20 m around the pole, plus the windows of Apollo 11, Blue Ghost 1 and Chandrayaan-3, so the other Sites answer only on the server, which has the full DEMs.

The web interface (Node 22) reads the API at `https://lunar-api.luizfbm.win` unless `VITE_API_BASE_URL` says otherwise. To point it at the API above:

```bash
cd frontend
npm ci
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Tests, the same ones CI runs:

```bash
npx --yes @redocly/cli@2.77.0 lint contract/openapi.yaml
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy .
uv run pytest
cd ..
uv run --project backend pytest validation
uvx schemathesis run contract/openapi.yaml --url http://localhost:8000 --checks all
cd frontend
npm run lint && npm run typecheck && npm test -- --run
npm run generate:types && git diff --exit-code -- .
npx playwright install --with-deps chromium && npm run e2e
```

Schemathesis needs the API from the step above running (with `LUNAR_ASSISTANT_IP_LIMIT_PER_MINUTE=0`, as CI sets it, or the assistant's cap of 10 questions a minute turns most of its answers into 503). The end-to-end tests build the app against a Prism mock of the contract, so they need no backend. Mutation testing runs by hand from the Actions tab (the `Mutation` workflow), not on a laptop.

## In production

The stack in `deploy/compose.yaml` runs three containers with Docker Compose on one VPS: the backend, Caddy (which also serves the built frontend) and a Cloudflare Tunnel. `lunar.luizfbm.win` serves the frontend and `lunar-api.luizfbm.win` the backend. The full DEMs and SPICE kernels live on the server, not in the repo, and `deploy/fetch-data.sh` puts them there. Deploys are manual: once every check is green on `main`, we update the server by SSH with the same steps and smoke test as `.github/workflows/deploy.yml`, which only runs by hand.

The backend's limits, set in `deploy/compose.yaml`:

| Limit | Value |
|---|---|
| Engine runs at once (`LUNAR_ENGINE_CONCURRENCY`) | 4 |
| Answer cache (`LUNAR_CACHE_MAX_MB`) | 1.2 GB |
| Container memory (`mem_limit`) | 4.5 GB |
| Engine routes per client address per minute | 600 |

A request that waits more than 25 s for an engine slot, or an address over its cap, gets the 503 `busy` described above. The cache is warmed in the background for every Curated Site over the default Window, after each start and after each UTC midnight (ADR 0004).

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

The research behind the multiresolution hazard model (the LUMEN technique, 240 → 60 → 20 → 5 m) is in our technical report, [docs/LUMEN_NASA_SPACE-APPS_2026_EN.pdf](docs/LUMEN_NASA_SPACE-APPS_2026_EN.pdf): the audit of where LOLA really has laser shots, the Monte Carlo on 26 real sites, the independent check against shape-from-shading and LROC NAC photographs, and the rover traverse simulations.

## Use of AI

We used AI coding agents throughout, mainly Claude (Anthropic) through Claude Code. The work was split into GitHub issues, agents wrote most of the code, tests and documentation on their own branches, and a pull request was merged only after its diff was read and the lint, type, unit, regression and validation checks were green. AI also helped with the research: reading papers and data documentation, and looking at other teams' public entries.

The team chose the question, the data, the models and the tolerances, reviewed what was merged and tested the app by hand. The numbers the app shows come from NASA data run through our code (SPICE ephemerides, LOLA terrain), not from a language model. The validation against JPL Horizons and real landers was not tuned: no tolerance, reference value or test was changed to make a check pass.

Inside the app, the assistant (`/assistant`) uses a language model reached through OpenRouter. The model picks which of our API's routes to read and writes the sentences around the engine's numbers. Without a model configured, it answers in an offline mode with fixed phrasing.

## Licence

Our code and documentation are released under the [Apache License 2.0](LICENSE). The data and images listed under [Data and credits](#data-and-credits) keep their own licences.
