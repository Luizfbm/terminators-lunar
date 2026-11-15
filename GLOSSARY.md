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
