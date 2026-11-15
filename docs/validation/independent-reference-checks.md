# Independent reference checks

Three Proof checks use independently produced reference data. The reference data is stored under `validation/data/` with its source and SHA-256; the implementation runs the checks through the repository's own validation scripts. Tolerances and rules are in `validation/athena.py`, and the scripts and instructions are in `validation/README.md` §10.

| Proof entry | What it compares | Where it runs |
|---|---|---|
| `larissa-athena-horizon` (+ negative control) | Our Horizon mask at the IM-2 Athena point against the independent terrain-only silhouette | Engine output from the server (`run_athena_engine.py`) |
| `landing-im2-athena` (+ negative control) | Our Sun at the two LROC NAC image centres against the incidence angle in the LROC PDS index; the Earth over the transmission as a fact | LROC part in CI; transmission from the server |
| `eclipse-2025-local-contacts` (+ negative control) | The 14/03/2025 eclipse's local contacts against SPICE `gfoclt`, and inside NASA's whole-Moon contacts | CI, at the `ECLIPSE_2025` fixture point; Athena on the server, for information |

Credits: LROC images and index, NASA/GSFC/Arizona State University; "Eclipse Predictions by Fred Espenak, NASA's GSFC".

The Earth values for Athena are not used because the source calculation applies a horizon-floor rule that is not valid for an Observer 5.3 km above the sphere. Only the terrain-only reference column is used.

**A presentation figure, not a check.** The comparison of predicted shadows with the real LROC photo uses an independent DEM and renderer rather than the production engine. It reports 90 to 95% agreement after an approximately 100 m shift, with the ISIS-constant caveat. It is not part of the Proof page.

**DSMAP_POLAR.CAT.** In the south, the forward formula in the LOLA PDS catalog (`R = … * SIGN(LAT)`) flips both X and Y, against the catalog's own text (longitude 0 up, 90°E to the right); the independent reference check compared the text against the global LDEM_16 (correlation 0.998 against 0.42), and our `horizon._stereographic` follows the text.
