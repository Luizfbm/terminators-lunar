# Gläser et al. 2014 as a reference for the Connecting Ridge

Question (issue #37): can Gläser et al. 2014 (Icarus 243, 78–90, DOI 10.1016/j.icarus.2014.08.013) be an independent reference for our Site 001 (Connecting Ridge 001, 89.4661°S 136.949°W, Observer height 2 m)? Other teams quote "92.27 % of sunlight at 2 m" for it. This page records what the sources say, what we could and could not read, and whether the number is comparable to what our engine computes. No check, tolerance, reference value or `validations.json` entry is added or changed here, and the engine was not run.

Short answer: the number exists and is real, but it is not a value at Site 001. It is the best pixel of the whole area, about 800 m from our Site, over 19 to 20 years, and it counts the share of time with any part of the Sun visible. As a two-sided pass/fail reference at Site 001 it is not comparable. Details and options below.

## 1. What we could read, and what we could not

Could not read: the Icarus 2014 paper itself. ScienceDirect refuses automated access (HTTP 403), the Elsevier text API needs a key, ADS refuses (HTTP 405), and there is no open copy in the DLR or ASU repositories (the DLR record says the full text is not available). So there are no page, table or figure numbers for the 2014 paper in this page, and its methods section (horizon range, time step, exact period, DEM version) is unread. From the Icarus abstract we only have what the DLR record (https://elib.dlr.de/94240) and search snippets show.

Could read in full:

- **Gläser et al. 2014, EPSC abstract** "Connecting Ridge - A landing site at the lunar south pole with extended illumination", EPSC Abstracts 9, EPSC2014-136-1. Same authors, same study, two pages, with the point coordinates and the definitions. https://elib.dlr.de/94242/1/EPSC2014-136-1.pdf (also http://meetingorganizer.copernicus.org/EPSC2014/EPSC2014-136-1.pdf). Not peer reviewed; its numbers are rounded differently from the Icarus abstract (92.3 and 95.66 against 92.27 and 95.65).
- **Gläser et al. 2018**, "Illumination conditions at the lunar poles: Implications for future exploration", Planetary and Space Science 162, 170–178 (ScienceDirect PII S0032063317300478). We read the submitted preprint (21 pages, dated 29 June 2017) from NASA NTRS: https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf. Page numbers below are the preprint's, not the journal's, and the journal version may have small changes. This paper says it "complements and also updates" the 2014 one and studies the same Connecting Ridge location ("C1"), so it is the most directly usable source we could open.
- **Gläser et al. 2017, EPSC abstract** EPSC2017-693-3 (thermal model on the same DTMs): only used for one sentence about the horizon (section 4 below).

## 2. The point, the height, the period, the DEM

Longitudes in the papers are degrees east; Site 001 at 136.949°W is 223.051°E. Distances are great-circle on a 1737.4 km sphere (our computation, from the coordinates printed in the papers).

| Source | Where in the source | Latitude, longitude (°E) | Height | Value | Distance to Site 001 |
|---|---|---|---|---|---|
| 2014 EPSC abstract, "spot 1" | section 3 and Fig. 2a, table next to it | −89.4395, 222.8066 | 2 m | average 88.1 %, longest dark 4.58 d, longest light 233.87 d | about 810 m |
| 2014 EPSC abstract, "spot 2" | same | −89.4399, 222.8524 | 2 m | in light 92.3 % (7.7 % in darkness), average 87.9 %, longest dark 4.62 d, longest light 233.87 d | about 800 m |
| 2014 EPSC abstract, "spot 3" | same | −89.4516, 222.7581 | 10 m | highest average 92.5 %, in light 95.6 % | about 450 m |
| 2014 EPSC abstract, "spot 4" | same | −89.4544, 222.8445 | 10 m | in light 95.66 %, average 91.9 % | about 360 m |
| 2018 preprint, "Connecting Ridge C1", surface | Table 1, p. 10 | −89.4505, 222.84 | 0 m | maximum average 76.0 %, solar visibility 81.3 %, longest shadow 268 h | about 480 m |
| 2018 preprint, "Connecting Ridge C1", 2 m | Table 2, p. 12; text p. 11 | −89.4398, 222.83 | 2 m | maximum average 88.0 %, solar visibility 92.1 %, longest shadow 112 h | about 800 m |
| 2018 preprint, cluster "C1-0" | Table 3, p. 17; text p. 14; Fig. 6a, p. 16 | cluster, no coordinates | 2 m | 135,200 m² of connected high-average spots, maximum 88.0 % and 92.1 %; second cluster C1-1 (26,800 m²) 81.3 % and 86.0 % | not given |

- **No source evaluates Site 001's own coordinates.** The papers report the best location found in a region (2014: a 20 × 20 km study area, 2018: the 50 × 50 km area around the pole). Site 001 is 800 m from the 2 m maximum. The 2018 paper says high-average spots at surface level are only 20 to 40 m wide (p. 7) and grow to several hundred metres when the Observer is raised to 2 m (p. 9–10). Whether Site 001 falls inside cluster C1-0 cannot be told from the tables; Fig. 6a (p. 16) draws it in gnomonic kilometres without a marker for our Site.
- **Height above ground:** 2 m and 10 m (2014: abstract and Fig. 2a/2b), surface and 2 m (2018, p. 9).
- **Period:** 2014 EPSC abstract: 19 years in its abstract, "20 years" in section 3 (the text and the Fig. 1 and Fig. 2 captions), exceeding the 18.6-year precession cycle; hourly time steps ("evaluated in 1 h time steps", section 3). The Icarus abstract, as summarised by a tool reading the ASU Pure record (not verbatim, unverified), also has a one-year study of the 20 × 20 km area (October 2018 to October 2019) and the 19-year study at the Connecting Ridge. The exact start and end dates of the 19 years are not in anything we read. 2018 preprint: 1 January 2017 to 1 January 2037, hourly (abstract, p. 6).
- **DEM:** 2014: a 20 m/pixel DTM made from LOLA laser tracks, geometrically adjusted (track-to-track offsets removed, tracks first co-registered to a Narrow Angle Camera DTM) and cross-checked against NAC images (EPSC abstract, introduction; method in Gläser et al. 2013, PSS 89). 2018: 400 × 400 km polar DTMs at 20 m/pixel from LOLA data up to LRO extended-science 48 (July 2016), the south pole co-registered to a NAC DTM; about 9 % more pixels carry a LOLA spot than in the 2014 version, 23 % of the south pixels in the 50 × 50 km area are interpolated (p. 3–5). This is not the PDS product `LDEM_80S_20MPP_ADJ` that our engine reads; it is the authors' own DTM.
- **Horizon method:** the horizon method of Mazarico et al. 2011: horizon elevation per azimuth in 0.5° steps (the Sun's angular size), the Sun treated as a disc so partial illumination counts (2014 EPSC abstract, section 2; 2018 p. 5). Horizon range: not stated in the 2014 abstract. For the 2018 work the horizon map is derived for the 50 × 50 km area from the 400 × 400 km DTM, "taking into account the far-field topography" (EPSC2017-693-3, section 2). We read this as horizons up to roughly 200 km from the centre of the study area, which is our inference, not a stated range.

## 3. The 92.27 %: what it is

- It exists, in the Icarus 2014 abstract: locations were identified "receiving sunlight for 92.27% of the time at 2 m above ground" (DLR repository record), and 95.65 % at 10 m. The EPSC abstract has 92.3 % and 95.66 %.
- It is the "in light" share of the 19 to 20 years: the fraction of hourly steps with any part of the Sun's disc visible. The 2014 abstracts do not define it in words; we read it as "any part" because the 2018 paper's "solar visibility" gives 92.1 % at the same place, with that definition. The EPSC abstract keeps this apart from the "average illumination" of the same spot (87.9 %). The 2018 paper names the two quantities and defines them:
  - "average illumination" is the mean of the visible fractions of the Sun's disc, 0 to 1 (p. 6): 88.0 % at C1, 2 m;
  - "solar visibility" is the percentage of the period in which any portion of the Sun is visible (p. 7): 92.1 % at C1, 2 m, the same location (−89.4398, 222.83 against the 2014 spot 2 at −89.4399, 222.8524).
  So 92.27 % (2014) and 92.1 % (2018) are the same quantity at the same place after a DTM update; the 2018 value is 0.17 percentage points lower.
- It is the best value found, not a value at a Site. At 2 m the paper says average and visibility maxima do not always fall on the same pixel (2018 p. 11, for Peary and Shackleton); the 2014 EPSC abstract says the same for spots 1 and 2, and for 3 and 4. 92.27 % is the maximum over the area, so any other pixel, Site 001 included, is expected to be lower.
- In our words: the 92.27 % matches our sunlit hours divided by the Window hours (the Sun counts while any part of its disc clears the terrain), and the 87.9 to 88.1 % matches our mean Sun fraction. It does not match the Sun-and-Earth time. "Illumination" and "sunlight percent" are not used in our code or UI (GLOSSARY).
- One more number tells how much the best pixel depends on the DTM: in the 2018 paper's Table 1 (surface level, C1) Mazarico et al. 2011 on a 240 m DTM report a solar visibility of 92.7 % against 81.3 % on this 20 m DTM, 11.4 points, and the paper blames the smoothing of the close-range topography (p. 8). Shackleton's best spot moved by about 3 km and about 5 points between the 2014 and the 2018 DTM (p. 8).

## 4. Is it comparable to what our engine computes?

What our engine does (`backend/app/engine.py`, `backend/app/horizon.py`, `backend/app/constants.py`): Observer on the DEM at the given height; the Sun counts while any part of its disc clears the Horizon mask; the mask in 0.5° steps (720 samples) from three DEMs, 20 m out to 5 km, 80 m out to 100 km and 240 m out to 300 km; SPICE ephemeris every 15 minutes; one Query covers at most 1440 h (60 days) and starts between 2023-08-01 and 2032-12-31.

| | Gläser et al. | Our engine |
|---|---|---|
| Place | best pixel of the area, 800 m from Site 001 | Site 001 |
| Height | 2 m | 2 m (default) |
| Period | 19–20 years (2018: 2017–2037) | at most 60 days per Query, inside 2023–2032 (9.4 years in all, less than the 18.6-year cycle) |
| Time step | 1 h | 15 min |
| DEM | authors' 20 m LOLA DTM, co-registered to a NAC DTM, data to 2016 | `LDEM_80S_20MPP_ADJ` to 5 km, then 80 m and 240 m |
| Horizon range | not read (2018: 400 × 400 km DTM) | 300 km |
| Definition of 92.27 % | share of time with any part of the Sun visible | sunlit hours / Window hours: the same rule |

Verdict:

- **The definition is not the obstacle.** The disc rule matches, and the 2018 paper gives both the "any part" and the "mean disc fraction" numbers, which are our sunlit hours and mean Sun fraction.
- **The place is.** Gläser's number is a maximum over the region, 800 m from Site 001 on terrain whose lit strips are tens to a few hundred metres wide. Site 001's own value is unknown to the paper, and by construction it is not above the maximum.
- **The period is.** One Query is at most 60 days and the Sun's path at the pole repeats on a year, so a 60-day mean can sit far from a 19-year mean. A fair comparison needs at least one year (about 7 chained Queries) and, to match the paper, the 18.6-year cycle, which the engine's date range does not allow. Whether the period changes the percentage by little or by several points we cannot say without running the engine, and we did not.
- **The DEM is.** Not the same product and not the same version; the paper shows its own maximum moving 0.17 points at C1 and 5 points at Shackleton between two versions of its own DTM.

So 92.27 % cannot be used as an equality reference at Site 001. It can be used as a published bound for the area.

## 5. What tolerance would be honest

The paper gives no uncertainty, so any tolerance here is our judgement and would have to be fixed by Luiz before any run. What the sources let us say:

- Tolerances at or below about 2 percentage points on the best pixel are not defensible: it is already 0.17 points between two versions of the authors' own DTM, and 11.4 points between the 240 m and the 20 m DEM at surface level. With a different DEM product, a different period and a pixel-sized location uncertainty, something near 5 points on the best value in the neighbourhood is closer to honest than 1 or 2.
- At Site 001 itself, an equality check (even at 5 points) is not honest, because the 800 m offset is not bounded by anything in the papers.
- Two forms could be defended, both one-sided or neighbourhood-based, never "ours = 92.27 ± x at Site 001":
  - **Bound at the Site:** our sunlit-hours share at Site 001, 2 m, over at least one year, is not above 92.27 % (2018: 92.1 %) plus the slack above. A pass would only mean "no contradiction", and any value below is consistent; this says little.
  - **Neighbourhood maximum at the published place:** our maximum of the same share over the pixels around (−89.4398°, 222.83°E) at 2 m (the coordinates are given to about 3 to 10 m, the DEM pixel is 20 m, so a neighbourhood of a few hundred metres, as in the Wueller check) against 92.1 % and 92.27 %, and the mean Sun fraction against 88.0 %. This tests the engine against the same quantity at the same place and is the closest to a real comparison. It still has the period and DEM differences, and needs a one-year or longer run, which the API does not offer in one Query.
- A negative control would be the same share at a point that the paper itself shows is shadowed, for example a Permanently Shadowed Region pixel from Fig. 6a (0 % by their definition). This page does not select one, because the figure has no printed coordinates.

## 6. What is left, and for Luiz

- Open the Icarus 2014 paper (Luiz or anyone with Elsevier access) and read: the study area and spot coordinates behind the 92.27 %, the exact 19 years, the time step, the horizon range, and the table or figure the number comes from. Only then can page and table numbers be written here. If it turns out to differ from the EPSC spot 2, this page must be redone.
- Decide whether Gläser 2014/2018 becomes a Proof entry at all, and in which form (information entry with the source and its limits, or a neighbourhood-maximum check with a tolerance written first). This needs a change to `validation/` and probably to `validations.json` and the contract, which are for Luiz.
- If it becomes a check, it needs a run over at least a year, outside the 60-day Query, and the result goes into the Proof whatever it is.
