# Eduardo's shadow engine against LROC NAC photos, and his battery of simulated traverses

Issue #92. Two sets of Eduardo's results enter the Proof, under the rule Luiz set for all of his statistics: a number is in only if it can be recomputed from scripts and data in this repository, and the entry says what it proves and what it does not. Both are Eduardo's work, not ours: the shadow engine is his horizon code (a C ray-marcher on the stereographic plane), and the simulation of traverses plans with it. Neither has been run through our engine. His workspace is the branch `eduardo/cockpit-multirresolucao` (commit `2195fcb`), which has no common history with `main`; nothing was merged from it, files were read with `git show` and copied byte for byte (hashes in `validation/data/*.json` and `validation/sfs/group/SOURCE.json`).

## 1. What is in the repository

| What | Where | Made by |
|---|---|---|
| Per-photo counts, 486 rows | `validation/data/sfs_fotos_todas.csv` (his `sfs_comparacao/fotos_todas.csv`) | `validation/sfs/group/photo2.py`, `photo3.py`, with `ray.c`, `lib.py`, `load.py`, `eph.py` |
| Outcome of every simulated traverse, 64 files folded into one | `validation/data/traverse_outcomes.json` | `validation/sfs/extract_battery.py` from his raw files (it lists their SHA-256); his generators `exp_dif.js`, `rodar_dif_multi.js` are in `validation/sfs/group/` |
| His paired-statistics CSV, 64 rows | `validation/data/traverse_paired_stats_pop100.csv` | his `gerar_figs_estatisticas_pop100.py` and `analisa_dif_multi.py` (cited, not copied: they need scipy, pandas and seaborn) |
| His POP = 30 difficulty ladder, aggregates only | `validation/data/traverse_ladder_pop30.csv` | his ladder run; its per-traverse files are not on the branch |
| Rules, tolerances, arithmetic | `validation/sfs/photos.py`, `validation/sfs/battery.py` | written before any result |
| Checks | `validation/test_sfs_photos.py`, `validation/test_traverse_battery.py` | entries in `backend/app/data/validations.json` |

Not copied: the photos, the SfS elevation products, the full LOLA maps, the DE440 kernels, the raw battery files (about 20 MB), the xlsx, PDF and docx files, the papers.

## 2. The 486 photos

His report (`sfs_comparacao/entrega_relatorio/RESULTADOS-SFS.md`, "Resultado 2") says his horizon engine, run on five terrains, predicts which pixels of 486 real LROC NAC photos are lit and which are dark with the accuracy, false light and false shadow of a table. A pixel is lit when its brightness is above 0.001; the prediction is "lit" when the Sun's centre is above the horizon in its azimuth.

Definitions (his report does not spell them out; these are the ones under which his table follows from his counts, and `fig4.py` writes the first two the same way): accuracy = (tp + tn) / all sampled pixels; false light = fp / (fp + tn), the share of the photo's dark pixels the model lights (the dangerous error); false shadow = fn / (fn + tp), the share of the lit pixels it darkens. Counts are summed over the photos of a group. The pixels are every 8th row and column of each photo, 8,873,452 in all (his "8,87 milhões").

Tolerance, fixed before computing: within 0.05 percentage points of the printed number (half of his last digit). Result, all 60 numbers within it (largest difference 0.048):

| Terrain | Leibnitz Beta (120 photos) | de Gerlache Rim (194) | Peak Near Shackleton (172) | Polar together (366) |
|---|---|---|---|---|
| SfS 5 m | 94.3 / 7.7 / 3.8 → 94.33 / 7.73 / 3.81 | 95.8 / 2.1 / 5.9 → 95.77 / 2.11 / 5.87 | 95.7 / 2.2 / 6.1 → 95.71 / 2.17 / 6.10 | 95.7 / 2.1 / 6.0 → 95.74 / 2.14 / 5.98 |
| LOLA 5 m | 93.8 / 8.8 / 3.8 → 93.81 / 8.78 / 3.84 | 95.3 / 3.0 / 6.0 → 95.32 / 2.97 / 6.02 | 94.9 / 4.1 / 5.9 → 94.94 / 4.09 / 5.89 | 95.1 / 3.6 / 6.0 → 95.13 / 3.55 / 5.95 |
| LOLA 20 m | 93.8 / 9.5 / 3.3 → 93.78 / 9.46 / 3.28 | 94.7 / 2.9 / 7.1 → 94.74 / 2.86 / 7.12 | 93.7 / 4.0 / 8.3 → 93.72 / 3.98 / 8.26 | 94.2 / 3.4 / 7.7 → 94.22 / 3.44 / 7.69 |
| LOLA 60 m | 92.8 / 11.0 / 3.8 → 92.76 / 11.00 / 3.83 | 95.3 / 4.2 / 5.1 → 95.30 / 4.25 / 5.06 | 94.0 / 7.0 / 5.1 → 94.03 / 7.00 / 5.08 | 94.7 / 5.7 / 5.1 → 94.66 / 5.68 / 5.07 |
| LOLA 240 m | 90.2 / 13.8 / 6.1 → 90.24 / 13.79 / 6.11 | 94.8 / 6.5 / 4.2 → 94.76 / 6.55 / 4.21 | 92.5 / 11.5 / 4.1 → 92.48 / 11.46 / 4.13 | 93.6 / 9.1 / 4.2 → 93.61 / 9.10 / 4.17 |

(accuracy / false light / false shadow, %; his printed value → recomputed.) The photo counts, 120, 194, 172 and 366, are exact.

Photo by photo (a photo is better when it gets strictly more pixels right, the same pixels for every terrain): SfS 5 m beats LOLA 20 m in 346 of 366 polar photos and 98 of 120 in Leibnitz Beta; LOLA 5 m beats LOLA 20 m in 349 and 54. That is how his sentence ("o SfS acerta mais que o LOLA 20 m em 346 de 366 fotos, e o LOLA 5 m em 349. Em Leibnitz, 98 e 54 de 120") has to be read for it to be true; read as SfS against LOLA 5 m it gives 312 of 366 and 104 of 120. The gains his text states reproduce: 20 m to 5 m +0.90 point in the polar regions and +0.03 in Leibnitz Beta, SfS over LOLA 5 m +0.62, and the polar LOLA 60 m grid at least as accurate as LOLA 20 m (his text says the cause was not investigated, and it was not here either).

Two things of his that do not reproduce from the counts and are not judged: the example photo of his figure 4 (M115416165LE) gives 5.4 / 7.9 / 24.4 % false light here for SfS 5 m, LOLA 20 m and LOLA 240 m, against his 5.2 / 8.7 / 24.7, because the figure is a re-run of that one photo at every second pixel and the counts are every eighth; and his 0.006° agreement of the Sun's direction with 33 camera files, whose camera files are not on his branch.

Negative control: the same table from the columns where the prediction uses the Sun's upper limb (+0.267°) instead of its centre breaks every one of the five terrain rows (all 60 numbers off).

### Was the engine fixed before the file was made?

His report says the project's horizon engine used 111,320 m per degree (the Earth's) instead of 30,323 (the Moon's) and that he fixed it in commit `8dea6de` (2026-11-15 10:37 -0300). `fotos_todas.csv` was added in `23a477f` (08:40 the same day) and no commit touched it afterwards, so by commit time it **predates** the fix. It was not affected: the constant lived in `precalc/horizon.py` and `precalc/engine.py`, and the scripts that made the counts never import them. They use `ray.c`, which marches rays in the stereographic plane in metres with the Moon's radius (1,737,400 m) and its curvature. `test_sfs_photos.py` checks the ported sources for the constant and for that geometry. Which of the 486 rows came from `photo2.py` and which from `photo3.py` (which resumes from an earlier 183-photo file) is not recorded on his branch.

## 3. The battery of simulated traverses, N0 to N3

His simulation sends rovers across 16 test lanes of real LOLA strips (8 Sites, 2 strips each), 100 traverses per lane, the same seeds for every configuration, so two configurations are paired lane by lane. A traverse reaches the goal, runs out of time, leaves the map, tumbles or gets stuck. N0 is the strips as measured (4.9 % of cells above 15°); N1 multiplies the relief by 1.3 (20.1 %); N2 adds a slope error 1.5 times the published one and a camera range 0.75 times as long; N3 adds a slope error twice the published one, a half-range camera that loses 35 % of its readings, and no replanning. Two variants are compared: **Normal navigation** (the planner reads a 60 m grid, no margin) and **Multiresolution** (it reads the 60 m grid and the 5 m terrain where it matters, with the P90 margin). There are two batteries, with a time cap of 800 s and of 4,000 s; his plan quotes the first.

The statistics are his, written out in `validation/sfs/battery.py` because scipy is not a dependency: arrival per lane, the difference averaged over the 16 lanes, the Wilcoxon signed-rank test on the 16 lane values (the normal approximation with the tie correction, zero differences dropped: what his scipy returned, confirmed on all 64 rows), the rank-biserial r, the exact McNemar test on the 1,600 pairs and the odds ratio (a + 0.5) / (b + 0.5), and the same difference and Wilcoxon for tumbling. Tolerances, fixed before computing: arrival and tumbling 0.005 points, r 0.0005, the odds ratio 0.005, p-values a relative 1e-6, counts of traverses and lanes exact.

**All 64 rows of his CSV reproduce** (two batteries, four levels, eight pairs, 16 columns each; his bootstrap intervals, which depend on the random generator and are not judged, also came out the same in all 64). The numbers his plan quotes (section 5, 800 s battery), recomputed:

| Level | Multiresolution | Normal navigation | Difference | Relative | Other numbers he quotes | Recomputed |
|---|---|---|---|---|---|---|
| N0 | 78.06 % | 67.31 % | +10.75 points | +16.0 % | McNemar p 3.3e-31, odds ratio 5.99, r 0.714 | 3.3e-31, 5.99, 0.714; Wilcoxon over lanes p = 0.115 |
| N1 | 48.62 % | 35.44 % | +13.19 points | +37.2 % | Wilcoxon p 0.046, McNemar p 3.3e-47, odds ratio 11.82, r 0.905, tumbling -2.44 points | 0.046, 3.3e-47, 11.82, 0.905, -2.44 |
| N2 | 47.75 % | 35.44 % | +12.31 points | +34.7 % | tumbling -2.81 points, "Wilcoxon p = 0,012" | -2.81; 0.012 is the tumbling test, the arrival test is p = 0.091 |
| N3 | 40.0 % | 30.8 % | +9.2 points | +30.0 % | Wilcoxon p 0.043 | **does not reproduce**, below |

(Recomputed values for N0 to N2 equal the printed ones to the digits the plan prints; the exact arrivals are 78.0625, 67.3125, 48.625, 35.4375 and 47.75.)

**N3 does not reproduce on the POP = 100 battery.** There, N3 gives Multiresolution 34.88 % against Normal navigation 29.62 % (+5.25 points, +17.7 %; Wilcoxon over the lanes p = 0.271, not significant; McNemar p = 1e-10), and with the 4,000 s cap 41.25 % against 38.19 % (+3.06 points, p = 0.307). The plan's 40.0 % and 30.8 % are the values of his POP = 30 difficulty ladder (`dados_escada.csv` has exactly these two), whose per-traverse files are not on the branch, so that run cannot be recomputed. The plan's own bullet says "POP = 30", but its summary and the reusable prompt (sections 6 and 7) list the +30.0 % among the POP = 100 figures. The entry `group-traverse-n3-quote` is `failed` for that reason, with the numbers above; nothing was adjusted to pass. The suite stays green: the test pins the numbers behind the verdict instead of asserting a pass, so the finding is on the Proof page without blocking the gates. If Luiz would rather not show it, the entry and its test are self-contained and can be dropped.

Negative control: pairing Multiresolution's outcomes with Normal navigation's from the wrong lane (shifted by one) changes the McNemar counts at every level (N0 499 / 327 instead of 206 / 34, and so on).

## 4. What this proves, and what it does not

Proves: the tables and statistics in his report and plan follow from his per-photo counts and his per-traverse outcomes, with the exceptions named above; the definitions behind them; that his quoted N3 gain is not a POP = 100 result.

Does not prove:

- That his shadow engine is right. The counts come from his own code on photos and elevation products that are not here, so the check is arithmetic on his numbers. The SfS terrain was fitted to these same photos, so only the LOLA rows are an independent test. One brightness threshold for every photo; every 8th pixel; the 60 m and 240 m grids are block means of LOLA 20 m (polar) or LOLA 5 m (Leibnitz Beta), not official products; Leibnitz Beta (85.4°S) is outside the polar LOLA 20 m map, so its absolute numbers are optimistic.
- That the simulated rover resembles a real one. The traverses are a simulation on 16 strips from 8 Sites; N1 to N3 are synthetic (the relief times 1.3, larger errors); about a fifth of all traverses end by time or off the map in every configuration, which hides part of the difference.
- That the Multiresolution gain is significant at every level. McNemar counts 1,600 traverses as independent although 100 share each lane, so its p-values (1e-31, 1e-47) overstate the evidence. The test over the 16 lanes is the one to read: of the quoted levels only N1 is below 0.05, and the CSV holds 64 tests with no correction.
- Anything about our engine: it has not been run against these photos or this battery. That comparison is not done.

## 5. Not done

- Our own engine against the 486 photos (needs the photos, which are not downloaded here).
- Regenerating the photo counts and the 64 battery files: they need the photos, the SfS products, LDEM_875S_20M and the DE440 kernels, and Node.js with hours of compute. His scripts are kept for that.
- The POP = 30 ladder from per-traverse data (not on his branch).
- Recomputing the figures of his other plan sections (the Monte Carlo over 26 PGDA 78 Sites, the LDEC coverage, the P50 / P90 / P99 margins against SfS): they are other issues.

## 6. Reproducing

```bash
uv run --project backend pytest validation/test_sfs_photos.py validation/test_traverse_battery.py
```

To rebuild the outcomes file from his branch (needs `git fetch origin eduardo/cockpit-multirresolucao`; the output is byte-identical):

```bash
uv run --project backend python validation/sfs/extract_battery.py
```
