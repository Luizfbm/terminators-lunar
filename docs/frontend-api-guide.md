# Frontend API guide

How each piece of the screen gets its data. `contract/openapi.yaml` is still the source of truth; this page says which call to make, which fields to read and what the frontend works out itself. Terms are the ones in `GLOSSARY.md`.

Base URL: `https://lunar-api.luizfbm.win`. Locally, the Prism mock: `npx @stoplight/prism-cli mock contract/openapi.yaml` (port 4010).

## Ground rules

- All computation is in the backend (ADR 0002). The frontend picks the next event after the Cursor, composes the plain sentence from templates, formats numbers and draws.
- Instants are UTC with `Z`. Azimuth is clockwise from local north, 0 to 360. Elevation is above the local horizontal plane, not above the terrain.
- A Query is either `site_id` or `latitude_deg` + `longitude_deg`, never both, plus `start`, `duration_hours` (default 708.73) and `observer_height_m` (default 2). It all goes in the URL, along with the Cursor and the language.
- Errors are RFC 9457 `application/problem+json` with a stable `code`: `outside_coverage`, `dem_too_coarse` (only `/terrain`: a DEM covers the point but is too coarse for the radius), `window_out_of_range`, `ambiguous_site`, `missing_site`, `invalid_parameter`. Translate the `code`. Don't show `detail`, which is English only.
- `Cache-Status: lunar-api; hit` means the answer came from the cache (Curated Sites). `fwd=miss` means it was computed now. A cold Curated Site or a custom Site takes from about 1 s up to 20 s on the VPS, so show a loading state.
- The mock always returns the contract's example, whatever you ask for (`/visibility?site_id=001` returns the CR01 example). To get an error from the mock, send `Prefer: code=404` or `Prefer: code=422`.

## Start-up

`GET /meta` once. Read:

- `defaults.site_id`, `defaults.duration_hours` and `defaults.observer_height_m` for the opening Query. Its `start` is 00:00 UTC today (ADR 0004).
- `coverage` for control limits and the "outside 2025-2032" message.
- `short_shadow_max_hours` for the legend.
- `engine_version`, `kernels` and `dems` for the footer and the Proof page.
- Every `/visibility` answer has `provenance.synthetic`: `false` from the backend, `true` only from a mock. Show a "demo data" banner when it is `true`.

## The question and the plain sentence

`GET /visibility` with the Query. The frontend writes the sentence from `query.site.name`, `metrics.sun_and_earth_hours`, `metrics.sunlit_hours`, `metrics.lcsp_hours` and the next Sunset and Earthset after the Cursor (below). It's a template per language, with no logic beyond picking the template: for example "never sets" when there is no `sunset` in `events`.

## Metrics

`metrics`: `sun_and_earth_hours`, `lcip_hours`, `lcsp_hours`, `sunlit_hours`, `earth_visible_hours` (Earth's centre above the Horizon mask), `earth_visible_hours_any_part` (any part of the Earth's disc above it, never less than the centre's; Stats for nerds shows both), `mean_sun_fraction` (0 to 1). They cover the Window only. A period that started before the Window counts from `query.start`.

## Countdown with Occluder

From `events` (sorted by `t`), the frontend takes the first `sunset` and the first `earthset` with `t` after the Cursor. For each one:

- Time left: `t` minus the Cursor.
- Occluder: `event.occluder`. Distance is `distance_m`. Direction is `occluder.azimuth_deg` as a compass point: N is 0, E is 90, then SE, S, SW, W, NW. Name is `occluder.feature.name`, with `feature.relation` (`rim`, `inside`, `near`) and `feature.type`. `feature` can be `null` (no named feature fits): then say "a ridge 14 km to the south-west". Treat a missing `feature` key the same as `null`.
- No such event after the Cursor: the body stays up until the end of the Window. Say that; don't invent an instant.
- Clicking it highlights the Occluder on the panorama (`occluder.azimuth_deg`, and the mask elevation there) and on the map (`occluder.latitude_deg`, `occluder.longitude_deg`).

Sunrise and Earthrise events carry an Occluder too: it's the terrain the body clears.

## Timeline

- Bands come from `periods`: `body` is `sun` or `earth`, `state` is `visible` or `hidden`, with `start`, `end` and `duration_hours`. Each body's periods tile the Window with no gaps.
- Short shadows: Sun `hidden` periods with `short_shadow: true`. The key only exists on Sun hidden periods.
- Sun-and-Earth highlight: intersect the Sun `visible` periods with the Earth `visible` periods. Its total is `metrics.sun_and_earth_hours`.
- Fine detail under the Cursor: `timeline.samples`, every `timeline.step_minutes` (15). Each sample has `sun.azimuth_deg`, `sun.elevation_deg`, `sun.fraction`, `earth.azimuth_deg`, `earth.elevation_deg` and `earth.visible`. Between samples, interpolate linearly for drawing. For the state, take the periods, not the samples.

## Horizon panorama

- `horizon.samples`: 720 entries at `horizon.azimuth_step_deg` (0.5°), each with `elevation_deg` and an `occluder`. Draw the silhouette as elevation against azimuth and wrap at north.
- The Sun's and the Earth's paths: the timeline samples' `azimuth_deg` and `elevation_deg`.
- The Sun as a disc partly hidden: centre at the Sun's azimuth and elevation, radius `timeline.sun_radius_deg` (one value per answer, because it moves by at most 0.005° in 60 days). Show `sun.fraction` as the number, and never work it out from the drawing.
- At the pole everything happens within about ±2° of the horizon. Give the elevation axis a range fitted to the data, not 0 to 90°.
- Earth visible is a geometric possibility (Earth's centre above the mask), not a promise of a link.

## Site list and map

- `GET /regions`: `id`, `name`, `site_count` and `artemis_iii_current` (in NASA's October 2024 list of nine).
- `GET /sites?region_id=&q=`: `q` matches id or name, case insensitive, up to 100 characters (longer gives `invalid_parameter`). Each Site has `latitude_deg`, `longitude_deg`, `source` and `source_reference` (the citation), `region_id` (`null` outside Regions) and `has_5m_dem`.
- `GET /sites/{site_id}` for one Site when the link names it.
- Typed coordinate: send `latitude_deg` + `longitude_deg`. North of `coverage.custom_max_latitude_deg` (-80) you get `outside_coverage`. A coordinate whose rays have no DEM under them also gets `outside_coverage`. The answer's `query.site` has `id: "custom"`.
- Map: the API gives positions only. A polar base image or tiles have to come from elsewhere (a static asset from a public product such as the LOLA hillshade), and that's frontend work.

## Window and Observer height controls

- `start` is any instant inside `coverage`. `duration_hours` is above 0 and at most `coverage.max_duration_hours` (1440). `observer_height_m` goes from 0 to 50. Any change is a new `/visibility` request.
- `window_out_of_range` covers a Window that crosses 2025-01-01 or 2032-12-31.

## Proof page

`GET /validations`: one entry per check with `title`, `tolerance`, `result` and `not_covered` (each `{en, pt}`), plus `reference`, `status` (`passed`, `failed` or `pending`), `script_path` (a repo path you link to on GitHub) and `run_at`. Show failed and pending entries too. Add `GET /meta` for the engine, kernel and DEM products.

## Additions since the spec

### Occluder feature name

`occluder.feature`, on events and on horizon samples, is either `{name, type, relation}` from the IAU Gazetteer or `null`. Use it in the Countdown and in the panorama tooltip.

### The year at a Site

`GET /sites/{site_id}/year?year=2027&observer_height_m=2`, for Curated Sites only.

- `months[12]`: `sunlit_hours`, `earth_visible_hours`, `sun_and_earth_hours`, `longest_sunlit_period_hours` and `longest_shadow_hours`. The last two count the full length of a period that starts in that month.
- `totals`: includes `sunlit_days`.
- `best_windows`: up to 3 non-overlapping synodic-month Windows, most Sun-and-Earth hours first. A click puts that Window's `start` and `duration_hours` into the Query.
- A cold year can take tens of seconds. Load it after the main answer.

### Resolution ladder

`GET /visibility/ladder` with the same Query parameters. `rungs` is ordered 240, 80, 20 m. Each rung has `resolution_m`, `dems`, `metrics`, `next_sunset` and `next_earthset` (the first in the Window, or `null`). `band` gives `{min, max}` per metric across the rungs, and that is all it is: a measured spread, not a confidence level. The 20 m rung equals `/visibility`. A cold ladder is three runs (about 20 s on the VPS for a month), so load it lazily.

## The 3D globe: where the Sun and the Earth are overhead

Read `sub_points`. It is hourly from the Window start, plus the Window end. Each sample has `t`, `sun` and `earth`, each with `latitude_deg` and `longitude_deg` in MOON_ME (planetocentric, longitude east-positive). The backend computes them with SPICE from the Moon's centre, with light time and aberration corrected. On the Proof page they are checked against JPL Horizons: 0.0002° for the Sun and 0.006° for the Earth, against a tolerance of 0.05°.

- At the Cursor, interpolate between the two hourly samples around it. Unwrap the longitude at ±180° first. Linear interpolation stays within 0.0002°.
- Light the globe from the sub-solar point: the Sun's direction is the unit vector at that latitude and longitude. Put the Earth over the sub-Earth point.
- Don't derive the Earth from the Site's azimuth and elevation: seen from the Site it is off by up to 0.26° (parallax). For the Sun that error is 0.0007°, but `sub_points` gives both anyway.

## What the API doesn't give yet

- The Earth's angular radius (0.9° to 1.0° over a month) for drawing it on the panorama.
- Labels for which DEM covers a Site that isn't polar. `/meta` lists every product, polar and SLDEM, with no hint of which applies where. `provenance.dems` on each answer is the reliable one.
- A base map for the polar map.
- Busy state: `/visibility`, `/visibility/ladder` and `/sites/{site_id}/year` answer `503` with code `busy` and a `Retry-After` header (seconds, 10 today) when every engine slot stayed taken for 25 s. The Query is fine. Keep the loading state, wait `Retry-After` seconds and ask again, once or twice; after that, say the server is busy and offer a retry button. Don't retry at once in a loop: that keeps the queue full. Curated Sites over the default Window come from the cache and never get it. The mock gives you one with `Prefer: code=503`.
- The Uncertainty band, Confidence level and Best point (phase 3, the implementation), and anything for Compare (phase 2).

## Rovers, hazard and routes (Eduardo's multiresolution work)

Tag `hazard` in the contract. Terms are the ones in `GLOSSARY.md` (Rover, Hazard, Normal navigation, Multiresolution, Unvetoed hazard, False alarm, Shield, Measured fraction, Hazard grid, Route). Where the numbers come from, what is assumed and what is only an illustration is ADR 0008 (proposed). None of these calls answers the Query: they take no Window and no Observer height, and the hazard numbers do not depend on the Cursor. The frontend draws what comes back. Reading a value off a curve that was already computed is drawing too; working out a new hazard in the browser is not.

- Two navigations only, on screen: Navegação Normal and Multirresolução (Normal navigation and Multiresolution). No intermediate steps and no mention of artificial intelligence.
- `no_hazard_grid` (422) is a new error `code`. Translate it like the others and treat it as "no 5 m data near this Site". The `/sites/{site_id}/...` calls here take a Curated Site's id; a typed coordinate has no hazard answer.
- The mock returns the contract's example whatever you ask for (AR06, grid DM1, VIPER). `Prefer: code=422` gives `no_hazard_grid` and `Prefer: code=404` an unknown Site.

### The Rovers

`GET /rovers`: eight Rovers, the four for the Moon first and then four from Mars (`body: "mars"`), which the screen asks as "What if it went to the Moon?" (E se fosse à Lua?).

- `name` is a proper name: do not translate it. `description` is `{en, pt}`.
- Show `source_reference` with each Rover. Mark every field named in `estimated` (`mass_kg`, `battery_wh`, `solar_w`, `power_shadow_w`, `mast_height_m`) as estimated: it is the catalogue's guess, not the source's number. `slope_limit_deg` is never in `estimated`, but no source text gives it either.
- `darkness_tolerance_hours` is the GLOSSARY's Darkness tolerance, worked out by the backend. `null` means the RTG covers the draw: say the battery does not limit the shadow, not "infinite" and not "0". For Mission fit, the frontend compares it with `metrics.lcsp_hours` of the Query.
- `mast_height_m` is a natural Observer height for that Rover. Offering it is fine; it changes the Query, not the Rover.
- `slope_limit_deg` is the limit `/route` uses by default. The `/hazard` numbers are for 15° only (`slope_limit_deg` in its answer): never show them as the figures of a Rover with another limit.

### Hazard numbers for a Site

`GET /sites/{site_id}/hazard`.

- `grid` is `null` and `runs` empty when no Hazard grid lies within 15 km: say there is no 5 m data near and show no number. This call still answers 200; `/hazard/grid`, `/hazard/around` and `/route` answer 422 `no_hazard_grid`.
- The numbers belong to the grid, not to the Site's point. Say so on screen, with `grid.id` and `grid.distance_km`. `grid.site_inside` is false when the Site is outside the 10 × 10 km.
- `measured` is the Measured fraction, 0 to 1, `null` without 5 m data. `ellipse_fraction` is inside the Site's 100 m Landing ellipse: "only X% of the ground in the ellipse was measured by the laser; the rest is interpolated". `grid_fraction` is over the grid.
- `runs` has one entry per coarse grid, 60 m then 20 m: pick by `coarse_m`. In each, `methods` holds Normal navigation (`navigation: "normal"`, `confidence_level: null`) and Multiresolution at P50, P90 and P99. Pick by `navigation` and `confidence_level`.
- `missed_hazard` (the Unvetoed hazard), `false_alarm`, `coverage` and `mean_abs_error_deg` are each `{mean, low, high}`: the mean of the Monte Carlo draws and their 95% interval. The first two are fractions from 0 to 1, shown as percentages with the rounding of the rest of the app. A reduction is `(normal - multiresolution) / normal`, worked out from the two means.
- Never show the Unvetoed hazard without its `false_alarm`. At AR06 on 60 m, Normal navigation is 12.86% with 5.9% False alarm and Multiresolution at P90 is 2.70% with 18.0%: the 79% drop is mostly the margin, because the second blocks three times as much of the safe ground. The fair comparison is `trade_off`.
- `trade_off.normal` and `trade_off.multiresolution` have six points each, `false_alarm` from 0.05 to 0.30 in steps of 0.05, with the Unvetoed hazard (`missed_hazard`) each navigation has at that False alarm. For a slider, interpolate in a straight line between the two points around it and never extrapolate: below 5% and above 30% there is no value. At AR06 on 60 m at 15%: 4.4% against 3.6%. (The contract calls Multiresolution's curve a uniform margin; it is the margin by density of shots, scaled. ADR 0008.)
- `median_error_deg` is the median error of the slope each navigation reads. `mean_abs_error_deg` is the same at P50, P90 and P99, because the margin does not move the estimate.
- The numbers do not favour Multiresolution everywhere: at AR06 on 20 m its median error is higher than Normal navigation's. Show what comes back.
- `coverage` is the share of the checked cells whose true slope is at or under the estimate plus the margin, which says how well the margin lived up to its label: 85.4% at P90 and 92.6% at P99 at AR06 on 60 m. The contract's description ("share of the truly steep cells this navigation blocks") is not that. Until it is changed, do not label it that way. `paired_tests.mcnemar_*` compares Normal navigation without a margin against Multiresolution at P90 with one, so it is not a clean test of the data; `wilcoxon_p` compares the errors and is. Show both in Stats for nerds, with `cells_checked`, `draws`, `folds` and `seed`, not in the headline.
- `stats` is the terrain of the grid at 5 m before resampling, for a caption. `grid.lroc` says which LROC NAC images cover it, with `viewer_url`.
- Cite `source_reference`. The Shield is Eduardo's rule (1° plus z times 0.8° or 2.0°), partly checked against SfS in three regions: ADR 0008 has the limits.

### The Hazard grid

`GET /sites/{site_id}/hazard/grid`, 422 `no_hazard_grid` without a grid. It is static data of the Site, about 370 KB of text, so cache it per Site.

- `n` × `n` cells (200) of `cell_m` (50 m), `span_m` across (10,000 m). Each array is base64 of bytes, little-endian, row-major: row `r`, column `c` is element `r * n + c`. Row 0 is the +y edge and column 0 the -x edge of the tile's polar stereographic plane, centred on the grid's centre. Do not label the edges N, E, S or W.
- Cell centre: `x_m = -span_m / 2 + (c + 0.5) * cell_m` and `y_m = span_m / 2 - (r + 0.5) * cell_m`. The Site is at `grid.site_offset_m`, in the same plane; the ⊕ goes there.
- How to turn the integers into values (`encoding` says it too):
  - `elevation_i16`: int16, `z_mid_m + value * 0.1` metres.
  - `slope_5m_u8`: uint8, `value / 2` degrees. It is the 90th percentile of the 5 m slopes inside the 50 m block, not the slope of one 5 m cell.
  - `slope_20m_u8` and `slope_60m_u8`: uint8, `value / 2` degrees, the mean slope of that grid in the block.
  - `slope_error_u8`: uint8, `value / 4` degrees.
  - `ldec_u8`: bit 7 (`value & 128`) is set when the block holds a real laser shot; `(value & 127) / 127` is the local density of shots.

```ts
const bytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const elev = new DataView(bytes(g.elevation_i16).buffer);
const slope5 = bytes(g.slope_5m_u8); // decode each array once, not per cell
const ldec = bytes(g.ldec_u8);
const elevationM = (i: number) => g.z_mid_m + elev.getInt16(2 * i, true) * 0.1;
const slope5Deg = (i: number) => slope5[i] / 2;
const hasShot = (i: number) => (ldec[i] & 128) !== 0;
```

- A block is a Hazard when its `slope_5m_u8 / 2` is over the limit. That is a different count from the share of steep 5 m cells in `/hazard`, so a map of blocks and a percentage from `/hazard` can differ: say what each one counts.
- Decoding is drawing. `backend/tests/test_hazard_data.py` checks the values against Eduardo's own decoder; do the same in the frontend tests, against the example.

### Steep ground around a point

`GET /sites/{site_id}/hazard/around`, 422 `no_hazard_grid` without a grid. `x_m` and `y_m` are metres in the grid's plane (the Site's offset when left out), `radius_m` is 50 to 2000 (250 by default) and `slope_limit_deg` is the Rover's, or 15° when left out. A point outside the grid is 422 `invalid_parameter`.

- `cells` is the number of 50 m cells counted. `over_limit_5m`, `over_limit_20m` and `over_limit_60m` are how many of them are over the limit read at 5 m (the block's 90th percentile), on the 20 m grid and on the 60 m grid. The gap between the 5 m and the 60 m count is what the coarse grid hides near the Rover.
- Zero is an answer: at AR06, 250 m around the Site, 81 cells and none over the limit at any scale. Say there is no steep ground there instead of drawing a pill of 0%.

### A Route across the grid

`GET /sites/{site_id}/route`, 422 `no_hazard_grid` without a grid and 422 `invalid_parameter` for a start or goal outside it.

- The Rover is `rover_id` (VIPER when left out), and `slope_limit_deg`, `battery_wh`, `power_shadow_w`, `solar_w` and `rtg_w` override its numbers one by one. The answer's `rover` says what was used. `coarse_m` is 60 or 20, the grid Normal navigation reads. `confidence_level` is the Shield's level, P90 when left out.
- Start is the Site's offset and goal is 1,400 m east and 1,100 m north of it when left out, both in the grid's plane. `start_x_m`, `start_y_m`, `goal_x_m` and `goal_y_m` let the user move them.
- `sun_fraction` (0 to 1, 0.5 when left out) is the Sun fraction the panels get during the drive: take it from the `timeline.samples` entry at the Cursor, `sun.fraction`. `sun_azimuth_deg` is that sample's `sun.azimuth_deg`; without it `solar_points` is empty.
- `plans` has two entries, Normal navigation first and Multiresolution second (also in `navigation`). Each has `reached` (the path ends within 120 m of the goal; when false, say the plan did not get there), `distance_m`, `duration_hours`, `hazards_hit`, `vetoes`, `battery_min_fraction` and `path`: waypoints every 50 m with `x_m`, `y_m`, `slope_5m_deg`, `hazard` (over the Rover's limit at 5 m), `veto` (the Shield blocked the straight line to the goal there; Multiresolution only) and `battery_fraction`. `hazards_avoided` is Normal's `hazards_hit` minus Multiresolution's, never below 0.
- `hazards_hit` counts waypoints on the same 5 m slope that Multiresolution plans on, so it shows what the finer map lets a planner avoid and is not a forecast of a real drive. Say so beside the number. At AR06 with VIPER, Normal navigation crosses 11 steep waypoints and Multiresolution 7.
- `assumptions` maps a name to a number for every planner and battery number that is Eduardo's choice (speed, solar efficiency, step costs, margin weight, veto look-ahead and so on). Show them as assumptions (suposições) beside the plans, with their names. The battery fractions come from them and from the catalogue's estimates: they are a model, not a measurement.
- `swarm` is `null` unless you ask with `swarm=true`. It is 100 agents for 5 generations (`generations[].agents[]`, each with `dead` and a `path` of `[x_m, y_m]` pairs) and an illustration: `illustration` is always `true`, and the screen says "illustration of the search, not a result" (ilustração da busca, não é resultado). Never use its `survivors` as evidence for either navigation. In the AR06 example every generation has 0.
- `solar_points` are spots facing the Sun along the path, for the animation only. They carry no energy: do not turn them into watt-hours or add them to the battery.
