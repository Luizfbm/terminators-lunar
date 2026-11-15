# Test fixtures

Small copies of the engine's data, so every test and the validation suite run in CI without the VPS. The full data lives on the VPS in `/opt/lunar-data` (see `deploy/fetch-data.sh`).

## kernels/

| File | What | Source |
|---|---|---|
| `naif0012.tls` | Leap seconds | NAIF generic_kernels/lsk |
| `pck00011.tpc` | Body radii and constants | NAIF generic_kernels/pck |
| `de440_2023_2032.bsp` | DE440 cut to the Sun, Earth–Moon barycentre, Earth and Moon, 2023-07-01 to 2033-01-31 TDB (713 KB) | NAIF generic_kernels/spk/planets/de440.bsp, cut with `cut_spk.py` (SPICE `spksub`, what `spkmerge.cmd` describes) |
| `moon_pa_de440_200625.bpc` | Moon orientation (MOON_PA) | NAIF generic_kernels/pck |
| `moon_de440_250416.tf` | MOON_ME and MOON_PA frames for DE440 | NAIF generic_kernels/fk/satellites |

`meta.tm` loads them all. Paths inside it are relative, so furnish it from inside `fixtures/kernels/`.

### The DSN link (the requirement)

`dsn.tm` loads three more, only for `/visibility/dsn` and after `meta.tm`. They add the ITRF93 frame, the DSN stations and their topocentric frames, and nothing `/visibility` uses, so its answers and its `provenance.kernels` stay as they were. About 2.2 MB in all.

| File | What | Size | sha256 | Source |
|---|---|---|---|---|
| `earth_itrf93_2023_2032.bpc` | Earth orientation (ITRF93), 2022-04-14 to 2033-03-27 TDB | 2,083,840 B | `860bb4c7c684d6ea966ff892d87a769c3db821348506852a630b4b4471ed0f7b` | NAIF generic_kernels/pck/earth_1962_260806_2126_combined.bpc (31,318,016 B, sha256 `cc87ad1a495cf598800ba403763d350f087ac0b97da9fec603278a3864c6a53e`), cut with `cut_pck.py` |
| `earthstns_itrf93_260814.bsp` | DSN station positions, ITRF93, 1950 to 2150 | 26,624 B | `007eb0aad5dd022c6d61bdbfb2395680bd1eb31c49a8637d0b0a1cfbea737c6b` | NAIF generic_kernels/spk/stations |
| `earth_topo_260814.tf` | Topocentric frames of the DSN stations (z to the zenith of the WGS-84 spheroid, x north) | 69,400 B | `4f40cd1e86718047bc8ea6ff6bd063c9fbf36102b63f0dca370c8e94fd282490` | NAIF generic_kernels/fk/stations |

Why the combined Earth kernel. The high-precision `earth_latest_high_prec.bpc` (`earth_000101_270208_261113.bpc` today) stops at 2027-02-08, and the app's Windows go to 2032-12-31. NAIF's combined file joins the measured Earth orientation (from JPL's EOP file, last datum 2026-08-06) with its low-accuracy long-term predict up to 2126. Its comments state the accuracy: below 3 microradians for the measured part and about 10 weeks after the last datum; for the predict, "low accuracy, estimated to be at the 5-6 milliradian level", which is the drift of UT1 over the 100 years it covers. Over the 6 years we use, the Moon's elevation from the stations still matches JPL Horizons within 0.0021° (validation `horizons-dsn-elevation`). The predict file alone (`earth_2026_260806_2126_predict.bpc`, 18 MB) starts in 2026, and the whole combined file is 31 MB, so the fixture keeps the four segments that cover the coverage, whole.

`cut_pck.py` copies those segments' Chebyshev coefficients with `pckw02`, which recomputes each record's midpoint and radius: over 40,011 epochs in the cut, the rotation differs from the full file's by at most 8.7e-12 per matrix element (about 2 micro-arcseconds). The VPS loads the full combined file (`deploy/fetch-data.sh` writes its `dsn.tm`).

The station positions are those of DSN 810-005 module 301 Rev. P (22 May 2026), ±3 cm per coordinate (1σ), as the SPK's comments say.

Queries outside 2023-08-01 to 2032-12-31 are outside the app's coverage anyway; the cut leaves a month of margin on each side. It starts in 2023 for the Chandrayaan-3 landing (23/08/2023). `spksub` copies DE440's records as they are, so from 2025 on the cut gives the same numbers, bit for bit, as the old 2025–2032 cut and as the full `de440.bsp` the VPS loads. sha256 `def453abd974a5812a309e7563e3fde8b00bf7adf26b0ec7a8f3d773e214c49b`.

## dem/

Windows of the PGDA 90 polar DEMs (Barker et al. 2023) centred on the south pole, with the products' own file names, so `LUNAR_DEM_DIR` points either here or at the full data.

| File | Window | Covers |
|---|---|---|
| `LDEM_80S_20MPP_ADJ.TIF` | ±25 km | Near field of Curated Site 001 and the pole |
| `LDEM_80S_80MPP_ADJ.TIF` | ±125 km | Rays from 5 to 100 km |
| `LDEM_60S_240MPP_ADJ.TIF` | ±330 km | Rays up to 300 km |

At about 58 MB they are too big for git: they live in the release asset `fixtures-dem-v1`. Run `fixtures/dem/fetch.sh` (needs `gh` logged in) to download and check them; CI does it and caches them. `make.sh` rebuilds them from the full products on the VPS. Tests that need terrain must stay inside these windows.

### dem/offpole/

Windows around the Curated Sites outside the polar DEMs (the requirement), the same files `deploy/crop_offpole.py` cuts on the VPS into `<LUNAR_DEM_DIR>/offpole/<site id>/`:

| File | Window | Source |
|---|---|---|
| `APOLLO11/SLDEM2015_512.TIF`, `BG1/SLDEM2015_512.TIF` | ±105 km, 59 m | SLDEM2015 512 ppd tiles |
| `APOLLO11/SLDEM2015_128.TIF`, `BG1/SLDEM2015_128.TIF` | ±310 km, 237 m | SLDEM2015 128 ppd global |
| `CH3/LDEM_60S_60MPP_ADJ.TIF` | ±105 km (±112 km on the map), 60 m | PGDA 60°S |
| `CH3/LDEM_60S_240MPP_ADJ.TIF` | ±310 km (±335 km on the map), 240 m | PGDA 60°S |

About 151 MB, in the release asset `fixtures-dem-offpole-v3` (one tar), fetched and checked by `fetch.sh` with the polar ones.
