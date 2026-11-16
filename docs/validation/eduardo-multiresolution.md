# Eduardo's multiresolution statistics in the Proof

Eduardo's research (the research repository we cite is https://github.com/Luizfbm/Luna-Investigation; his branch is read here only at commit `2195fcb`) compares two ways of reading the terrain around a landing Site, using the real LOLA laser shots of the PGDA 78 tiles (Barker et al. 2021, Planetary and Space Science 203, 105119). The rule for these pages is that a number of his enters the Proof only if scripts and data in this repository produce it, together with what it proves and what it does not. The rules and tolerances are in `validation/hazard/rules.py`, written before any judgement; the check is `validation/test_hazard_mc.py`; the commands are in `validation/README.md` §12.

## The two variants

- **Normal navigation**: the coarse grid alone (60 m or 20 m, averaged in blocks and interpolated back to 5 m), with no margin.
- **Multiresolution**: the coarse grid plus a local correction only where a laser shot exists, with a slope margin per cell (P50, P90 or P99). Away from shots the correction goes to zero: it never invents relief.

A cell is vetoed when its estimated slope plus its margin is above 15°. **Missed hazard** is the share of cells really above 15° that the method does not veto; **false alarm** is the share of cells really at or below 15° that it vetoes.

## What the truth is

Only about 7 % of the 5 m cells of LOLA have a laser shot; the rest of the 5 m map is interpolated (ADR 0003). So the truth is the product's own slope on the cells that have a shot, and a fifth of those cells at a time is hidden from the method (5-fold cross-validation). On each hidden cell the "true" slope is drawn 100 times from Normal(slp, slperr), `slperr` being the per-cell error the PGDA publishes. The 26 tiles are the PGDA 78 tiles (10 x 10 km each, central window of the 5 m layers), at a 60 m and at a 20 m starting grid: 52 runs, seed 2026.

## What reproduces

All of these were recomputed from `backend/app/data/hazard/tiles.json` and `validation/data/hazard_equal_false_alarm.json`, both copied from his `resumo.json` files at the fixed commit. A printed number reproduces when ours, rounded to the decimals he prints, is his number.

| Where he prints it | He prints | We get |
|---|---|---|
| Plan §5: mean missed hazard, Normal navigation 60 m | 31.48 % | 31.479 % |
| Plan §5: mean missed hazard, Multiresolution P90 | 6.38 % | 6.384 % |
| Plan §5: relative reduction | -79.7 % | -79.72 % |
| Plan §5: median slope error, Normal to Multiresolution | 1.04° to 0.59° | 1.039° to 0.594° |
| Plan §5: relative reduction of the error | -42.9 % | -42.89 % |
| Table 06, 60 m, equal false alarm: grade with margin to P90 | 6.45 % to 3.88 % | 6.453 % to 3.884 % |
| Table 06, 60 m: median reduction (IQR, range) | 38.5 % (32 to 44, 18 to 56) | 38.48 % (32.2 to 43.9, 17.7 to 55.6) |
| Table 06, 60 m: tiles where Multiresolution is better, Wilcoxon p | 26 of 26, 3e-8 | 26 of 26, 2.98e-8 |
| Table 06, 20 m: grade with margin to P90 | 3.57 % to 3.19 % | 3.571 % to 3.188 % |
| Table 06, 20 m: median reduction (IQR), tiles better, p | 12 % (7 to 16), 24 of 26, 7.5e-7 | 12.2 % (7.4 to 16.0), 24 of 26, 7.45e-7 |
| Table 07: medians at 5 / 30 % false alarm, grade to Multiresolution | 23.3 to 16.6 / 3.5 to 2.1 % | 23.3 to 16.6 / 3.5 to 2.1 % |
| Table 07: median reduction, 5 to 30 % false alarm | 29 to 42 % | 29.1 to 42.4 % |
| Table 07: tiles better, p | 26 of 26 (25 at 30 %), 3e-8 (6e-8) | 26 of 26 (25 at 30 %), 3e-8 (6e-8) |

Where each comes from. The first five lines are in his `docs/PLANO_INTEGRACAO_COCKPIT_TESE.md` §5 and nowhere else in his branch: no script of his computes them. We found they are the **mean over the 26 tiles** of each tile's mean missed hazard (and of each tile's median error), which reproduces them. The equal-false-alarm lines are in his `MONTE_CARLO_LOLA_TESE.md` §6.2 and `Relatorio_Consolidado_Tese_2026.md` §5.2, Tables 06 and 07, and are produced by his `rodar_todos.py`.

Two figures of the Plan are not the same thing, and the Proof keeps them apart: "-79.7 %" compares the two methods at different false alarms (about 5 % and 18 %), so it is the effect of a nominal margin, not of multiresolution; the fair comparison is the one at equal false alarm, "-38.5 %" from a 60 m start, "-12 %" from 20 m.

## The test and the false alarm he used

The test, in his `rodar_todos.py`, is `scipy.stats.wilcoxon(grade_with_margin, multiresolution_p90)`: a paired two-sided Wilcoxon signed-rank test across the tiles, the tile being the unit (N = 26), on each tile's mean missed hazard. For the curves of Table 07 it is the same test on the value of each curve at a fixed false alarm.

"Equal false alarm" in Table 06 is not a fixed percentage: `mc_lola.py` searches, per tile, by bisection on 20 calibration draws, the uniform margin that makes the grade veto as much safe terrain as Multiresolution P90 does (his statement: at most 0.02 points of difference; we measure 0.021 at 60 m and 0.016 at 20 m). The median false alarm of the two arms is 17.9 %. In Table 07 the false alarm is fixed at 5, 10, 15, 20, 25 and 30 % and the margin size is swept on 20 draws apart from the evaluation ones.

## What these numbers prove, and what they do not

- **They prove** that, on those cells and those 26 tiles, with the same amount of safe terrain vetoed, Multiresolution lets less real hazard through than a uniform margin on the grade, in every tile (60 m) or in 24 of 26 (20 m), and that the margin placed by data density is better placed than a uniform one at every false alarm from 5 to 30 %.
- **p = 3e-8 is the smallest p-value an N = 26 test can give.** With 26 of 26 tiles in the same direction, the exact two-sided Wilcoxon p-value is 2/2^26. It says the direction is the same in every tile; it says nothing about the size of the effect, and it is not a statement about tiles outside the 26. Likewise 7.5e-7 for 24 of 26 and 6e-8 for 25 of 26 are fixed by the pattern of signs and ranks.
- **They do not say anything about the Sun or the Earth.** This is slope. Nothing here changes a sunlit-hours number or an Earth-visible one.
- **The truth is not the surface.** It is the PGDA's own slope on cells with a laser shot (about 7 %), hidden by cross-validation: it measures how well the method predicts held-out shot cells. Shots cluster where orbit tracks cross, on rougher ground. The rest of LOLA 5 m is interpolated (ADR 0003), so the method is not validated where there is no shot. Eduardo's own negative result on shot-less cells is in his report §5.3.4.
- **The margins and the limit are his rules.** The 15° limit, and sigma 0.8° near data and 2.0° far from it (so 2.03° and 3.56° at P90), are choices; they are not measured. The calibrated margins he also reports are another point of the same trade between missed hazard and false alarm.
- **The error model is simple.** The "true" slope of each cell is drawn independently from Normal(slp, slperr); the PGDA's 100 correlated error clones are not used.
- **The 26 tiles are the PGDA's, not a sample of the pole**, and the 100 draws of a tile are not 100 tiles.
- **The gain shrinks as the starting map improves.** Starting from 20 m (the map that actually exists south of 80°S), the grade with a margin is already about as good as Multiresolution from 60 m; his own correction in `MONTE_CARLO_LOLA_TESE.md` says not to claim that 60 m with Multiresolution equals a map three times finer.
- **Nominal margin trades hazard for false alarm.** A method that vetoes more will miss less; the equal-false-alarm comparison is the fair one.

The negative control, `negative-control-group-equal-false-alarm`, repeats the 60 m comparison with the grade allowed a 30 % false alarm. There Multiresolution P90 is better in 8 of 26 tiles and the median reduction is negative (-79 %): the check can come out the other way.

## What is pending

The rerun from the PGDA 78 layers and the laser coverage need gigabytes and run on the server; until then the entries `group-mc-rerun-pgda78` and `group-ldec-coverage` are `pending`.

- `validation/hazard/mc_lola.py` is a port of his `mc_lola.py` without figures and HTML. With scipy it gives, on a synthetic tile at 60 m and 20 m, exactly the same means, intervals, statistics, calibrated margins and curve points as his script run from his commit (the check is in `test_hazard_mc.py`). The rerun on the real layers must give his 52 runs within 0.5 points (and 0.02° of median error).
- `validation/hazard/coverage.py` is a port of the coverage part of his `analise_cobertura_lola.py`. His `cobertura_multiescala.csv` gives 7.29, 25.90, 67.97, 95.93 and 99.40 % of the cells with a shot at 5, 10, 20, 40 and 60 m inside 87.5°S. These are cells with a shot, not cells with a good measurement: one shot inside a 60 m cell counts it as measured.
- `validation/hazard/fetch_pgda78.py` downloads the layers and records their sha256 on first use.

Credits: PGDA product 78 (Barker et al. 2021) and LDEC_875S_5M, NASA, public domain.
