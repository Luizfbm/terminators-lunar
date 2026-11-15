# Mission landing sites (Level 1 catalogue)

Landing sites of past lunar missions, to sit beside the 134 Sites the app already serves
(`backend/app/data/sites.csv`). Nothing here is wired into the backend yet: it is the data, with its
source, ready to be reviewed and merged.

## `missions.csv`

17 landing sites: Apollo 12, 14, 15, 16 and 17; Surveyor 1, 3, 5, 6 and 7; Luna 16, 17, 20, 21, 23
and 24; Chang'e 3. Apollo 11 is left out because `sites.csv` already has it, from the same source
and with the same numbers.

Every row carries its own source. All 17 come from one table:

> LROC Science Operations Team, *Coordinates of Lunar Anthropogenic Targets*, 28 July 2016
> (Wagner et al. 2017, Icarus 283, 92-103).
> <https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf>
> Downloaded 2026-11-15, 84,848 bytes, sha256 `e6aa32a5baedb59864cf141026d2a7966ae1ce60ad0723ab3586fbe671d04827`.

The table gives the mean Earth/polar axis (ME) frame, the same as the app, measured in LRO NAC
images, so the coordinates are directly comparable with `sites.csv`. Each row keeps the position
uncertainty of the source (0.3 m to 13.4 m) and the elevation, and names the object it was taken
from (`Apollo 12 LM`, `Luna 17`, …): for a crewed mission that is the Lunar Module, not the ALSEP or
the rover. Longitudes are converted to -180..180 east, as `sites.csv` has them.

## What is NOT here

- **Luna 9 and Luna 13.** The LROC table does not locate them.
- **Everything after July 2016:** Chang'e 4, 5 and 6, SLIM, IM-1 Odysseus, Hakuto-R. They need their
  own sources, one per mission. The NSSDCA master catalogue answers for some ids and not for others.
  The app already has the three recent ones that matter to it: IM-2, Blue Ghost 1 and Chandrayaan-3.
- **Rovers** (Lunokhod 1 and 2, Yutu): their last position is not a landing site.
- **Landing times.** Only the place is here. `moon/building/coordenadas_teste.geojson` shows the
  shape a landing instant with its source should take.

## What the engine needs before these Sites can answer

Every Site here is outside the polar DEMs, so each needs its own terrain window, as issue #26 did
for Apollo 11 and Blue Ghost 1: `deploy/crop_offpole.py` cuts `offpole/<site id>/SLDEM2015_512.TIF`
and `_128.TIF` from the SLDEM2015 tiles.

`sldem2015_tiles_needed.txt` lists the 10 tiles these 17 Sites fall in, with the ±105 km margin of
the crop. `deploy/fetch-data.sh` downloads 2 of them today (`00N_30N_000_045` and `00N_30N_045_090`,
which cover Apollo 11 and Blue Ghost 1), so 8 more are needed. The tiles and the crops live on the
VPS; the test fixtures go in a release asset, as `fixtures/README.md` describes.

Until that is done, a query for these Sites answers 422 `outside-coverage`.
