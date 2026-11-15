# Lunar Landing Site Navigator

The language of the app: where a lander could sit on the Moon, when it sees the Sun and the Earth, and for how long. Code, contract, requirements and UI copy use these terms.

## Places

**Site**:
A single coordinate on the lunar surface (latitude, longitude), with an optional name and source. A coordinate typed by the user is also a Site, with source "custom".
_Avoid_: location, spot, point, landing zone, target

**Region**:
A named area that contains Sites, such as one of the Artemis III candidate regions.
_Avoid_: zone, area (as a proper term)

**Curated Site**:
A Site that comes from a cited list (Wueller 2026, CLPS targets, Apollo, the LROC 2016 table of past-mission landing sites), as opposed to a custom one.

**Landing ellipse**:
The area around a Site where a lander may actually touch down, given descent error. 100 m radius by default.

**Best point**:
The spot inside a Site's landing ellipse with the best value of the chosen metric. It belongs to the Site and never replaces its published coordinate.

## Sky

**Horizon mask**:
For each azimuth seen from a Site, the elevation of the highest terrain in that direction.
_Avoid_: skyline, silhouette

**Sun fraction**:
The share of the Sun's disc above the horizon mask at an instant, from 0 to 1.
_Avoid_: illumination (for an instant), sunlight percent

**Sunrise / Sunset**:
Sunrise is the instant the first edge of the Sun's disc rises above the horizon mask; Sunset is the instant the last edge goes below it. Terrain causes most of them at the pole, not the Moon's rotation.

**Short shadow**:
A shadow period short enough to be an outage rather than a night, such as the Sun passing behind a single peak. It still starts with a Sunset.

**Earth visible**:
The Earth's centre is above the horizon mask, so direct-to-Earth communication is geometrically possible. Stats for nerds also gives the hours with any part of the Earth's disc above the horizon mask (the rule the Sun uses), to compare with tools that count the whole disc; every other number keeps the centre.

**DSN link**:
The Earth is visible from the Site and at least one 70 m Deep Space Network antenna (DSS-14, DSS-43 or DSS-63) has the Moon above its minimum elevation, 6° in DSN 810-005. Narrower than Earth visible. Geometry only: no antenna schedule and no link budget.

**Earthrise / Earthset**:
The instants the Earth's centre rises above or drops below the horizon mask.
_Avoid_: Earth sunset, comms loss

**Occluder**:
The terrain feature that sets the horizon mask in a given direction, with its distance and position from the Site. It is what hides the Sun or the Earth at a Sunset or an Earthset.

**Countdown**:
The time from the Cursor to the next Sunset and to the next Earthset, each with the Occluder that causes it.

## Asking a question

**Query**:
A Site, a Window and an Observer height. Every result in the app answers one Query.

**Window**:
The time span a Query covers: a start instant and a duration. One synodic month (about 29.5 days) by default.
_Avoid_: period, range, date

**Cursor**:
The instant selected inside a Window. Instant values and the Countdown are read at the Cursor.

**Observer height**:
How far above the ground the Sun and the Earth are seen from, such as the top of a solar mast. 2 m by default. It belongs to the Query, not to the Site.
_Avoid_: mast height (as a property of the Site), altitude

## Trusting a number

**Resolution ladder**:
The same metric computed for one Site at several terrain resolutions (240, 80, 20 and, where it exists, 5 m). How much it drops from rung to rung shows how much the Site depends on small terrain.

**Uncertainty band**:
The range a metric can take once the known error of the elevation data is accounted for. The nominal value usually sits at its optimistic end.
_Avoid_: error bar, margin (unqualified)

**Confidence level**:
Which edge of the Uncertainty band the user reads: P50, P90 or P99. Stricter missions read the pessimistic edge.

## Fitting a mission

**LCIP / LCSP**:
The longest continuous period with the Sun visible / with no Sun, inside the Window.

**Sun-and-Earth time**:
The hours inside the Window when the Sun and the Earth are visible at the same time.
_Avoid_: golden hours

**Darkness tolerance**:
How many hours of continuous shadow a lander survives: stored energy divided by its power draw in shadow.

**Mission fit**:
Checking which Curated Sites a given lander can use in a Window, by comparing its Darkness tolerance with each Site's LCSP.

## Driving a Rover

**Rover**:
A vehicle from the catalogue the app serves, with mass, battery, solar panels, RTG power, power draw in shadow, mast height and slope limit. Four were built for the Moon and four for Mars, which the app shows as "What if it went to the Moon?" (E se fosse à Lua?). Its Darkness tolerance is its battery divided by its shadow draw net of the RTG, and it has none when the RTG covers the draw. A number the source does not give is marked as estimated.
_Avoid_: robot, vehicle, lander (a lander does not drive)

**Hazard**:
A 5 m cell steeper than the Rover's slope limit, 15° unless the Rover's own limit is asked for. On the Hazard grid, whose cells are 50 m, a block is a hazard when the 90th percentile of the 5 m slopes inside it is over the limit.
_Avoid_: obstacle, danger, slope (unqualified)

**Normal navigation**:
Navigating from a coarse terrain grid alone, 60 m or 20 m, with no margin, so it sees the ground as the grid smooths it. Shown as Navegação Normal.
_Avoid_: "Sem Tese", baseline, naive

**Multiresolution**:
Navigating from the coarse grid corrected by the 5 m terrain only where the laser really measured it (Measured fraction), with a Shield on every cell. Where nothing was measured it adds no relief. Shown as Multirresolução. It is one of the two navigations the app compares, never a step between them.
_Avoid_: "Com Tese", "IA", AI, Marcato

**Unvetoed hazard**:
The share of the truly steep ground that a navigation calls safe and so lets the Rover cross, with its 95% interval. Shown as perigo não vetado. Always read with the False alarm it was bought with.
_Avoid_: miss rate, false negative, escaped hazard

**False alarm**:
The share of the truly safe ground that a navigation blocks. Shown as falso alarme. Any navigation lowers its Unvetoed hazard by blocking more, so two navigations are compared at the same False alarm.
_Avoid_: false positive

**Shield**:
The margin added to the slope of each cell before it is compared with the Rover's slope limit: 1° plus z times 0.8° near laser measurements or times 2.0° far from them, with z of 0, 1.282 or 2.326 at the Confidence level P50, P90 or P99. Shown as Escudo. The rule is Eduardo's (ADR 0008). It takes the Confidence level names but is not an edge of the Uncertainty band, and the label is not a promise: the share of cells it really covered is reported in the answer.
_Avoid_: margin (unqualified), buffer, safety factor

**Measured fraction**:
The share of the 5 m cells that hold a real laser shot (LDEC > 0); the rest of the 5 m product is interpolated from them. It is given inside a Site's Landing ellipse and over the Hazard grid. Only measured cells are used as truth when a navigation is checked.
_Avoid_: coverage, resolution (a 5 m cell is not necessarily measured at 5 m)

**Hazard grid**:
The central 10 × 10 km of the PGDA 78 tile nearest a Site, as 200 × 200 cells of 50 m, with elevation, slope at 5, 20 and 60 m, slope error and laser density. The hazard numbers of a Site belong to its Hazard grid, not to the Site's own point, and a Site with no grid within 15 km has none.
_Avoid_: tile, DEM, map

**Route**:
A drive of a Rover from a start to a goal across a Hazard grid, planned once by Normal navigation and once by Multiresolution, then driven in 50 m steps and scored against the 5 m slope. Its costs, speed and battery model are assumptions of Eduardo's planner, listed with the answer, not measurements. The swarm of search agents drawn on it is an illustration.
_Avoid_: plan (that is Plan A and Plan B of Compare), trajectory
