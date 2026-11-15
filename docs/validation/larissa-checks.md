# Checks from Larissa's independent work (the requirement)

Larissa built a prototype of her own and shared it as the independent work, which is not merged. Three Proof checks come from it. Her code stays on the prototype source; only the reference data comes in, under `validation/data/`, with its source and SHA-256. Tolerances and rules are in `validation/athena.py`, the scripts and how to run them in `validation/README.md` §10.

| Proof entry | What it compares | Where it runs |
|---|---|---|
| `larissa-athena-horizon` (+ negative control) | Our Horizon mask at the IM-2 Athena point against her terrain-only silhouette | Engine output from the server (`run_athena_engine.py`) |
| `landing-im2-athena` (+ negative control) | Our Sun at the two LROC NAC image centres against the incidence angle in the LROC PDS index; the Earth over the transmission as a fact | LROC part in CI; transmission from the server |
| `eclipse-2025-local-contacts` (+ negative control) | The 14/03/2025 eclipse's local contacts against SPICE `gfoclt`, and inside NASA's whole-Moon contacts | CI, at the `ECLIPSE_2025` fixture point; Athena on the server, for information |

Credits: Larissa (independent prototype, the independent work); LROC images and index, NASA/GSFC/Arizona State University; "Eclipse Predictions by Fred Espenak, NASA's GSFC".

Her headline Earth numbers at Athena come from a horizon floor rule that is wrong for an Observer 5.3 km above the sphere, so they are not used or quoted. Only her terrain-only column is.

**A figure for the presentation, not a check.** Her comparison of predicted shadows with the real LROC photo (`building/visao_pouso/comparacao_lroc/` on her branch, 90 to 95% agreement after a ~100 m shift) uses her DEM and her renderer, not our engine. Credit it as "an independent study by Larissa", image credit NASA/GSFC/Arizona State University, with her caveat on the ISIS constants. It is not on the Proof page.

**DSMAP_POLAR.CAT.** In the south, the forward formula in the LOLA PDS catalog (`R = … * SIGN(LAT)`) flips both X and Y, against the catalog's own text (longitude 0 up, 90°E to the right); Larissa checked the text against the global LDEM_16 (correlation 0.998 against 0.42), and our `horizon._stereographic` follows the text.
