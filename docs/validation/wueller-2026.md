# Why the live Wueller 2026 check fails

The check (`validation/live_checks.py`, the implementation) compares our LCIP / 24 at 2 m in the Window 06/11 to 27/11/2026 (504 h) with the published "maximum consecutive days of Sun" of Wueller et al. 2026 (Zenodo 17084058) for the 130 Artemis Sites. Tolerance: 1 day per Site. Result: 75 of 130. The tolerance and the reference stay as they are; this page explains the gap.

## 1. The reference: right as published, with 4 blank rows

- `validation/data/wueller2026_sites.csv` matches `LandingSites.dbf` from Zenodo on all 130 rows (coordinates and days). The catalog's coordinates are the same to the last digit, and they land within 1.6 m of the shapefile's own projected points, so the longitude sign and convention are right.
- In the shapefile itself, MMO07, MMO08, MMO09 and MMO10 have `SunDays25` to `SunDays28` = 0 with `ID` = 0 and empty PSR fields: blank fields, not measurements. The paper's own illumination rasters give 2026 values of 0, 3.5, 19.5 and 0 days. With those, MMO09 (ours 19.23) falls within 1 day and MMO08 (ours 5.16) does not. The published source remains unchanged here.
- Published values are the raster value halved and **truncated**: at 113 of 130 Sites the 2026 value is exactly floor(raster / 2) at the Site's pixel. That is up to 0.5 day low by construction.
- Explains: 1 Site (MMO09).

## 2. Not the same quantity: a 60 m pixel against a point

- What we could not read: the paper's text (Wiley and ADS refuse automated access). So the disc rule is not fixed from the text, and none is chosen here. From the Zenodo README and the research notes: LROC QuickMap TerrainShadows, 60 m map, 12 h steps (the raster counts lit 12 h steps), Observer at 2 m, shadows to 150 km.
- The paper's own map changes by many days within a few pixels. At CR01 the Site's pixel is 3.5 days, and the 7 × 7 pixels around it (±180 m) go from 1.5 to 15. Our 14.68 is inside that range. For 19 of the 130 Sites the 3 × 3 pixels around the Site spread more than 3 days.
- Ours against the paper's map: 69 of 130 within 1 day of the Site's pixel, 80 within the 3 × 3 range (±60 m, ±1 day), 90 within the 7 × 7 range (±180 m, ±1 day).
- Disc rule and time step barely move it. Shown for transparency, not chosen (days: any part / centre / whole disc, then the paper-like 12 h sampling):
  - CR01: 14.69 / 14.54 / 14.24; 12 h steps 15.0 / 15.0 / 14.5
  - HW01: 9.11 / 8.64 / 7.81; 12 h steps 9.0 / 9.0 / 8.0
  - NR204: 12.93 / 12.41 / 11.93; 12 h steps 13.0 / 12.0 / 12.0
- Explains: about 15 Sites, the ones within the paper's own ±180 m spread but not within 1 day of its pixel.

## 3. Our engine: checked independently, not the cause

- Independent walk (own projection, scipy bilinear, 2 m steps near the Site, the repo's DEM fixtures, rays to 150 km as in the paper), using the API's own Sun positions: CR01 LCIP 14.69 d (API 14.68), mask within −0.018° to +0.055°; NR204 12.91 d (API 12.93), mask within −0.064° to +0.092°. HW01 gives 11.66 d against the API's 9.11: the API has more shade, because terrain past 150 km is in its mask (mask down to −1.03° lower in the 150 km walk) and the 20 m DEM isn't in the fixtures there. Cutting at 150 km gives more Sun, not less.
- `/visibility/ladder` at NR204: LCIP 309.8 / 310.2 / 310.3 h at 240 / 80 / 20 m. DEM resolution doesn't move it.
- NR204 is the clearest disagreement: the paper's map is 2.0 days on all 7 × 7 pixels around it, and both our engine and the independent walk give about 12.9. We can't explain it from our side. Since everything else agrees, that points at the reference's DEM or definition, which we can't see.
- Explains: 0 Sites. No engine defect found, so no fix and no regression test.

## What is left

40 Sites are off by more than 1 day even against the paper's ±180 m spread, almost all with more Sun on our side (NR204, NR1 and MMP regions). Without the paper's text we can't say whether its "illuminated" is stricter than any part of the disc, or which DEM QuickMap used. Next step: read the methods section (Luiz has to open it) and ask the author (lwueller@uni-muenster.de, from the Zenodo record).
