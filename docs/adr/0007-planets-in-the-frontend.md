# The planets behind the Moon are computed in the frontend, as illustration only

Status: proposed

The orbit view draws the Sun and the Earth in the sky behind the Moon, from the directions the answer carries. Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune are drawn there too, as points of light with a small name, only for the beauty of the sky. Their direction at the Cursor is computed in the browser with `astronomy-engine` 2.1.19 (MIT, pinned to that exact version). This is the second exception to ADR 0002, after ADR 0005, and it has two conditions: the planets are not in any number of an answer and not in the Proof, and nothing the Query asks depends on them.

## Why in the frontend

Luiz's rule is that light work runs in the browser and heavy work in the engine. Seven directions at one instant are light: a few milliseconds, once when the Cursor moves. The backend alternative is a contract change (a new field with seven directions at every sample of the Window) and a new engine output with its tests, for something that no answer reads. Keeping it in the frontend leaves the contract, the backend and the fixtures as they are.

It does not weaken ADR 0002's reason, which was to avoid splitting the science across two languages and two test suites. There is no science here to split: the planets answer nothing, they are not compared with anything in the Proof, and the Sun and the Earth on the same stage still come only from the engine.

## The library and its accuracy

`astronomy-engine` is MIT-licensed, about 116 KB minified (47 KB gzipped, loaded with the globe, which is already a separate chunk), with no dependencies. Its planets are VSOP87 series and its Moon is a truncated lunar series; the authors state a tolerance of about 1 arcminute. At the camera's closest the stage shows about 19 pixels per degree (600 px tall, 32° of view), so an arcminute is a third of a pixel.

The direction is the planet's direction from the centre of the Moon, not from the centre of the Earth: the planet's geometric direction from the Earth (corrected for the light's travel time, no aberration) minus the Moon's position. For Venus, that is 0.46° different on 15 Nov 2026, and for Mercury 0.18°.

A unit test compares it with JPL Horizons (centre `500@301`, astrometric RA and DEC) at one instant for all seven planets. The largest difference on 15 Nov 2026 12:00 UTC is 0.004° (Neptune); Jupiter is 0.0008°. The tolerance in the test is 0.1°.

## How the frame is fixed

The library gives the directions in an inertial frame (EQJ, the J2000 mean equator) and the globe uses MOON_ME (mean Earth / polar axis, the frame of the engine's sub-solar and sub-Earth points; JPL Horizons names it the same for the Moon). The library has no Moon orientation in that frame: its IAU model is an approximation of it.

The answer already has two directions in MOON_ME that the library also gives in its own frame: the Earth and the Sun seen from the Moon. Two known directions define a rotation (the TRIAD method), so the planets are rotated by the rotation that puts the library's Earth and Sun on the answer's. That ties the planets to the same frame as the Sun and the Earth on the screen: the Earth is exactly where it is drawn, the Sun within 0.01°.

Near new and full Moon the Sun and the Earth are almost the same line seen from the Moon, and the Sun would fix the turn about that line badly: an error of a tenth of a degree would turn the planets by several degrees. When the sine of the angle between them is below 0.25 (about 14.5° from aligned), the Moon's north pole from the library stands in for the Sun: its direction in MOON_ME is the Y axis by definition and it is about 90° from the Earth. The two choices agree to 0.01° (checked against Horizons at an ordinary instant and at the partial lunar eclipse of 28 Aug 2026), so nothing jumps when the choice changes.

## Considered Options

- **A backend route or a field in the contract for the planets:** rejected. A contract change and an engine output for an illustration, against Luiz's rule that light work stays in the frontend.
- **A hand-written series (as `earthFace.ts` does for the Earth's face):** rejected. Seven planets with an accuracy of an arcminute need hundreds of terms; a maintained and tested library is smaller to own.
- **The library's own Moon orientation (the IAU model) for the frame:** rejected as the first choice, because it is a different realisation of the frame from the engine's and would leave the planets tied to a frame the Sun and the Earth on screen are not in. It is used only as the stand-in for the pole when the Sun cannot fix the frame.

## Consequences

- The planets are drawn as points of light whose colour and strength come from the visual magnitude the library gives. Their true size is below a pixel, so it is the glow of a point and not a size. Mars and Jupiter being 1.2° apart on 15 Nov 2026, their names can overlap; the fainter one is named on its other side, or goes without a name.
- The labels hide when they would cover the Site or its name, the Sun, the Earth, the caption's strip, the view buttons' strip or another planet. Uranus and Neptune are named only where no other planet is within 48 pixels.
- The Moon covers the planets where it is in front, as it covers the Sun and the Earth, because they share the backdrop scene.
- Any later use of the planets that reads a Query (for example "Venus is up from the Site") goes through the backend, as ADR 0002 says.
