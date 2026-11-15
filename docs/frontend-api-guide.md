# Frontend API guide

How each piece of the screen gets its data. `contract/openapi.yaml` is still the source of truth; this page says which call to make, which fields to read and what the frontend works out itself. Terms are the ones in `GLOSSARY.md`.

Base URL: `https://lunar-api.luizfbm.win`. Locally, the Prism mock: `npx @stoplight/prism-cli mock contract/openapi.yaml` (port 4010).

## Ground rules

- All computation is in the backend (ADR 0002). The frontend picks the next event after the Cursor, composes the plain sentence from templates, formats numbers and draws.
- Instants are UTC with `Z`. Azimuth is clockwise from local north, 0 to 360. Elevation is above the local horizontal plane, not above the terrain.
- A Query is either `site_id` or `latitude_deg` + `longitude_deg`, never both, plus `start`, `duration_hours` (default 708.73) and `observer_height_m` (default 2). It all goes in the URL, along with the Cursor and the language.
- Errors are RFC 9457 `application/problem+json` with a stable `code`: `outside_coverage`, `window_out_of_range`, `ambiguous_site`, `missing_site`, `invalid_parameter`. Translate the `code`. Don't show `detail`, which is English only.
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
