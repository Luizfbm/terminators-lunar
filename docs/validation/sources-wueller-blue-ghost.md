# Sources for the two failing Proof checks

This is a research note. No tolerance, rule or validation data changed with it.

## 1. Wueller et al. 2026: what the method says

### What we found

- The Zenodo record [17084058](https://zenodo.org/records/17084058) is open (CC-BY-4.0). It has the rasters, the Sites and the PSR estimates. It describes the rasters as covering "the midsummers from 2025 to 2032". The page does not define midsummer and gives no method details.
- The abstract is public at [doi 10.1029/2025JE009434](https://doi.org/10.1029/2025JE009434) and confirms the 130 Sites, with PSRs within 2 km. It has no method parameters.
- NASA's [LPSC 2026 abstract 1901](https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf) on the Artemis III down-selection is not by these authors. Its only relevant point is that illumination shifts about 2 to 3 weeks per year, which is consistent with a per-year "midsummer".

### What we did not find

None of these sources opened the methods:

- Wiley: the article and Supporting Information (`/action/downloadSupplement`) return HTTP 403.
- ESSOAr: search returns HTTP 403.
- University of Münster CRIS (`cris-portal.uni-muenster.de/.../192924693`): redirects to the portal root.
- USRA LPSC abstracts by Wueller: none found by search.
- NTRS: nothing by these authors on this paper.

So the following are still unknown from a primary text:

- the disc rule;
- the Observer height;
- the time step;
- the ray range;
- the DEM and its resolution;
- the definitions of "midsummer" and "consecutive days".

The values in `wueller-2026.md` (60 m, 12 h, 2 m, 150 km) still come from the Zenodo README and the research notes only.

### What changes in the reading

Nothing changes. NR204 (2.0 days published against our 12.9) stays unexplained. One open source is still worth a look: the `Illumination_Modeling.zip` archive on Zenodo may carry processing notes or metadata (a `.xml` or `.aux` next to the rasters) naming the DEM and the step. Opening it is the next cheap move. After that, the paper's text, which Luiz has to open, or an email to the author.

## 2. Blue Ghost 1: the Sunset instant on 16/03/2025

### What we found

- Firefly's [live updates page](https://fireflyspace.com/news/blue-ghost-mission-1-live-updates/), entry of 17/03/2025: "final data received around 6:15 pm CDT on March 16". That is about 23:15 UTC. The entries of 16/03 and 18/03 describe the sunset and the HD sunset imagery, with no clock time.
- JPL Horizons, an independent geometric reference with no terrain:
  - Query: Sun (10); centre `coord@301`, geodetic `61.81, 18.56, 0`; 1 min steps on 16/03/2025 from 19:00 to 20:30 UTC; quantity 4 (apparent azimuth/elevation, airless); DE441.
  - Result: the Sun's centre crosses elevation 0° between 20:10 (+0.0052°) and 20:11 (−0.0028°). Linear interpolation gives 20:10:39 UTC.
  - The Sun sinks about 0.008° per minute, and its radius is about 0.27°. So on a flat horizon, first contact is near 19:37 and the last limb disappears near 20:44 UTC. These are estimates from the sampled rate, not separate queries.

| Instant (UTC, 16/03/2025) | Source |
|---|---|
| 20:10:39 | Horizons, Sun centre on the geometric horizon, no terrain |
| 19:44:27 | Ours, with relief, Observer at 686 m (as given in the task) |
| ~23:15 | Firefly, final data received |
| 17:15–18:15 | Current rule band, inferred from "just over 5 hours into the lunar night" |

### What we did not find

- A NASA or Firefly text with the clock time of the sunset itself. The NASA blog index has no matching post, and only the 04/03 surface-operations post is linked.
- Wikipedia gives last contact as 23:25 UTC, but that is a secondary source and not used.

### What changes in the reading

- The current band (17:15–18:15) is about 2 h before the geometric Sunset. A horizon of a few tenths of a degree can't move the Sunset that far, so the band can't be right as a Sunset time. Counting "just over 5 hours" back from the final data at 23:15 most likely starts from something other than the Sun crossing the horizon: power loss on the panels, the terminator, or a loose figure. Our 19:44:27 is 26 min before the flat-horizon Sunset, which is consistent with the relief cutting off the Sun early.
- A suggested second check, for the validation session to decide and implement:
  - It would compare our Blue Ghost 1 Sunset with the Horizons geometric value.
  - Pass if ours is no later than the flat-horizon last-limb instant (about 20:44), and within the time a horizon of at most 1° can take off it (about 2 h at 0.008° per minute).
  - The exact bounds should come from fresh Horizons queries saved under `validation/data/`, not from this note.

## Summary (PT)

- **Wueller:** nenhuma fonte aberta traz o método. Wiley, ESSOAr e o material suplementar dão 403, e não existe resumo da LPSC dos autores. A divergência do NR204 continua sem explicação. O próximo passo barato é abrir o `Illumination_Modeling.zip` do Zenodo atrás de metadados.
- **Blue Ghost:**
  - O Horizons dá o pôr do Sol geométrico (centro do disco, sem relevo) às 20:10:39 UTC. O nosso, com relevo, é 19:44:27.
  - A Firefly só informa os últimos dados, por volta das 23:15 UTC.
  - A faixa atual (17:15–18:15) fica umas 2 h antes do pôr geométrico, então não serve como instante de pôr do Sol. Sugiro uma segunda checagem contra o Horizons, para a sessão de validação.
