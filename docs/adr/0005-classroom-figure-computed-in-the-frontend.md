# A Classroom figure may be computed in the frontend

ADR 0002 keeps every Sun, Earth and horizon computation in the backend, and that still holds for anything that answers a Query. The classroom figure of the implementation is different: it shows why one small hill matters near the pole, on a smooth Moon with a single 300 m hill 10 km away and a closed-form Sun path for any latitude. Asking the backend for it would add a route, a contract change and a wait for a drawing whose numbers come from three lines of trigonometry. So a Classroom figure may compute in the browser, on three conditions: the screen labels it as a classroom model, it never reads or answers the Query on screen (no Site, no Window, no DEM, no ephemeris), and its formulas have unit tests in the frontend. It is the one exception to ADR 0002.

## Considered Options

- **A backend route for the figure:** rejected. It would be a contract change and an engine run for a toy model the engine has no use for, and it would make the figure look like an answer.
- **A static image:** rejected, because the latitude control is the point of the figure: it shows the Sun's path flattening onto the horizon as the reader moves to the pole.

## Consequences

- The model uses its own constants (lunar radius 1,737.4 km, tilt 1.54°), so its numbers differ slightly from the engine's. The engine's largest sub-solar latitude over 2024 to 2032 is 1.588°, which is why the sentence on screen says "about 1.5°".
- Any new figure that wants the same exception has to meet the same three conditions. A figure that reads the Query on screen goes through the backend.
