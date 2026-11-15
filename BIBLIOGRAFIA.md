# Bibliografia — polo sul lunar: iluminação, visibilidade da Terra, seleção de sítio

Metadados verificados via OpenAlex em 2026-10-22 (DOI, volume, páginas, autores).
Status: ✅ arquivo local · ⚠️ parcial · ❌ acesso fechado.

---

## A. Iluminação e sombreamento (o motor do cálculo)

### A1. Mazarico et al. (2011) — método canônico
**Illumination conditions of the lunar polar regions using LOLA topography.**
E. Mazarico, G. A. Neumann, D. E. Smith, M. T. Zuber. *Icarus* **211**(2), 1066–1081.
DOI: https://doi.org/10.1016/j.icarus.2010.10.030 · 376 citações · ❌
→ Deriva máscaras de horizonte de DTM LOLA + efemérides. Identificou áreas restritas com
iluminação média >80%. **É o algoritmo de referência.** Não baixado (Elsevier fechado);
o método está replicado em A2/A3.

### A2. Gläser et al. (2018) — melhor artigo aberto sobre o polo
**Illumination conditions at the lunar poles: Implications for future exploration.**
P. Gläser, J. Oberst, G. A. Neumann, E. Mazarico, E. J. Speyerer, M. S. Robinson.
*Planetary and Space Science* **162**, 170–178.
DOI: https://doi.org/10.1016/j.pss.2017.07.006
✅ `artigos\2018_Glaser_illumination-poles-PSS162.pdf` (manuscrito aceito, via NASA NTRS 20170007365)

Números-âncora verificados no texto:
- DTMs de 400 × 400 km, **20 m/pixel**, com ajuste de offsets entre faixas do LOLA.
- Simulação **hora a hora de 01/01/2017 a 01/01/2037** — cobre a precessão de 18,6 anos.
- Três regiões de alta iluminação por polo. Polo sul: borda de Shackleton + dois pontos na
  crista entre Shackleton e de Gerlache.
- Iluminação média **na superfície: 69,5%–82,9%**.
- A **2 m de altura** (altura do painel solar): **77,1%–88,0%**; máximo na crista
  Shackleton–de Gerlache (polo sul).
- Avalia também distância, tamanho e declividade das PSRs próximas (alvo científico).

### A3. Gläser et al. (2014) — resolução e altura do observador
**Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA.**
P. Gläser, F. Scholten, D. De Rosa, R. Marco Figuera, J. Oberst, E. Mazarico, G. Neumann, M. S. Robinson.
*Icarus* **243**, 78–90. DOI: https://doi.org/10.1016/j.icarus.2014.08.013 · ❌ (resumo em elib.dlr.de/94240)
→ Iluminação na **superfície, a 2 m e a 10 m**; estudo de 19 anos no "Connecting Ridge"
(crista Shackleton–de Gerlache), considerado sítio ideal. Fundamenta o **slider de altura**.

### A4. Speyerer & Robinson (2013) — o número que vende a ideia
**Persistently illuminated regions at the lunar poles: Ideal sites for future exploration.**
E. J. Speyerer, M. S. Robinson. *Icarus* **222**(1), 122–136.
DOI: https://doi.org/10.1016/j.icarus.2012.10.010 · ❌
→ Outposts na borda de **Shackleton permanecem iluminados 94% do tempo** (resumo público).

### A5. Zhang et al. (2023) — validação por imagem orbital
**Analysis of Illumination Conditions in the Lunar South Polar Region Using Multi-Temporal
High-Resolution Orbital Images.** Y. Zhang, B. Liu, K. Di, S. Liu, Z. Yue, S. Han.
*Remote Sensing* **15**(24), 5691. DOI: https://doi.org/10.3390/rs15245691
✅ `artigos\2023_Zhang_illumination-south-pole-multitemporal-RS.pdf`
→ Base de imagens de **0,69–1,97 m/pixel** com hora, elevação e azimute solar associados;
recupera a imagem mais próxima da data planejada. Área de estudo: Chang'E-7.
**Use como verdade-terreno do seu app.**

---

## B. Visibilidade da Terra e comunicação DTE

### B1. Bryant (2009) — iluminação + comunicação no mesmo pipeline
**Lunar pole illumination and communications maps computed from GSSR elevation data.**
S. H. Bryant. *IEEE Aerospace Conference*. DOI: https://doi.org/10.1109/aero.2009.4839375 · ❌
Resumo verificado:
- DEM de radar Goldstone (GSSR), **40 m** horizontal, ~5 m vertical.
- Calcula iluminação solar e visibilidade da Terra em 100 km ao redor do polo sul.
- Melhor sítio: **92% de disponibilidade solar anual** e **~50% de disponibilidade DTE**.
→ **Este é o contraste que o app deve comunicar.** Existe versão SpaceOps 2010
("…Statistics Computed from GSSR Elevation Data", AIAA 2010-1913).

### B2. Peña-Asensio et al. (2024) — critério DTE operacionalizado
**Evaluating potential landing sites for the Artemis III mission using a multi-criteria
decision making approach.** E. Peña-Asensio, Á.-S. Neira-Acosta, J. M. Sánchez-Lozano.
*Acta Astronautica* **226**, 469–478. DOI: https://doi.org/10.1016/j.actaastro.2024.10.049
✅ `artigos\2024_Pena-Asensio_ArtemisIII-MCDM-ActaAstronautica.pdf` (arXiv:2406.19863)
→ 1.247 pontos em 13 regiões candidatas + Site 004. Critérios: iluminação solar, PSRs,
**comunicação direta com a Terra (via earthshine = luz solar refletida pela Terra)**,
linha de visada HLS–astronauta, geologia, abundância de minerais máficos.
Método TOPSIS + análise de sensibilidade. Ótimo: **DM2 (Nobile Rim 2)**, −84,20156°, 60,69989°E.
→ Modelo pronto para o "ranking de sítios".

### B3. Israel et al. (2020) + NASA/TP-20210021073 — arquitetura de comunicação
**LunaNet: a Flexible and Extensible Lunar Exploration Communications and Navigation Infrastructure.**
D. J. Israel et al. *IEEE Aerospace*. DOI: https://doi.org/10.1109/aero47225.2020.9172509 · ❌
✅ Suprido por: **Draft LunaNet Interoperability Specification**, NASA/TP-20210021073 Rev.2 (mar/2022),
52 p — `artigos\2022_LunaNet_interoperability-specification-draft.pdf`
→ Define serviços de comunicação (tempo real e tolerante a atraso), navegação e *user services*.
Contexto para o modo "engenharia": DTE ~50% não inviabiliza a missão — justifica relay.

---

## C. Seleção de sítio (os critérios que a UI precisa expor)

### C1. Flahaut et al. (2019) — critérios LEAG formalizados
**Regions of interest (ROI) for future exploration missions to the lunar South Pole.**
J. Flahaut, J. Carpenter, J. P. Williams, M. Anand, I. A. Crawford, W. van Westrenen.
*Planetary and Space Science* **180**, 104750. DOI: https://doi.org/10.1016/j.pss.2019.104750
✅ `artigos\2019_Flahaut_ROI-lunar-south-pole-PSS180.pdf` (repositório Birkbeck)
Critérios explicitados no texto (citando o time LEAG):
- *"The mean illumination within the landing area must be maximal"*
- *"Earth visibility (for radio communication) within the landing area must be maximal"*
- Exclusão de encostas >7° e iluminação <40%.
→ **Isto é a especificação da sua tela de comparação.** 12 elipses de pouso analisadas.

### C2. Leone et al. (2023) — comparação multi-critério de base
**Sverdrup-Henson crater: A candidate location for the first lunar South Pole settlement.**
G. Leone, C. Ahrens, J. Korteniemi, D. Gasparri, Á. Keresztúri, A. Martynov.
*iScience* **26**(10), 107853. DOI: https://doi.org/10.1016/j.isci.2023.107853
⚠️ `artigos\2023_Leone_Sverdrup-Henson-iScience_fulltext.xml` (PDF bloqueado; full text XML via Europe PMC PMC10518707)
→ Critérios: gelo, declividade, energia, **comunicações**, expansibilidade. Sverdrup-Henson
supera de Gerlache e Shackleton por abundância de gelo, com locais próximos adequados para
comunicações e geração solar.

### C3. Miao & Wei (2026) — trajetos com restrição de iluminação
**A Dynamic Illumination-Constrained Spatio-Temporal A\* Algorithm for Path Planning in
Lunar South Pole Exploration.** Q. Miao, G. Wei. *Remote Sensing* **18**(2), 310.
DOI: https://doi.org/10.3390/rs18020310
✅ `artigos\2026_Miao_illumination-constrained-Astar-path-planning-RS.pdf`
→ DEM LOLA de **5 m/pixel** em área de 1300 × 1300 m; visibilidade solar **hora a hora**
(Nov–Dez 2026) por efemérides; custo = declividade + distância + iluminação em espaço
temporal 3D (DIC3D-A*). **Feature diferencial: trajeto que só passa onde há luz na hora certa.**

---

## D. Ferramentas e visualização (precedentes e referência de UX)

### D1. Moon Trek — precedente de portal público
**Moon Trek: An Interactive Web Portal for Current and Future Lunar Missions** (2017), NASA NTRS 20170008884.
✅ `artigos\2017_MoonTrek_interactive-web-portal-NTRS.pdf` · https://trek.nasa.gov/moon/
→ Portal de mapeamento e modelagem lunar. Estude para saber **o que não repetir**: é
poderoso, mas é exatamente o tipo de interface densa que o enunciado critica.

### D2. Solar System Treks — mesma família
✅ `artigos\2018_SolarSystemTreks_online-portals-NTRS.pdf` (pôster AGU 2017)

### D3. NASA SVS 5228 — referência visual do fenômeno
**Lunar South Pole Illumination with Earth and Sun** (2024), visualização de Ernie Wright.
https://svs.gsfc.nasa.gov/5228
✅ `referencias-visual\southpole_earth_sun.1858_print.jpg` + `svs5228_api.json`
Descrição oficial (verificada): o Sol desliza ao redor do horizonte **sem nunca passar de
alguns graus acima ou abaixo dele**, enquanto a Terra sobe e desce **sem se afastar muito
da longitude 0°**. A animação comprime seis meses em 2,5 minutos.
→ Copie a gramática visual: Sol rasante, Terra oscilando, sombras longuíssimas.

---

## E. Contexto de exploração

### E1. Future Exploration of the South Pole as Enabled by the Lunar Reconnaissance Orbiter (2016)
NASA NTRS 20160012274 · ✅ `artigos\2016_LRO_future-exploration-south-pole-NTRS.pdf` (resumo 1 p)
→ Panorama de dados LRO que sustentam o polo sul: LOLA, LROC, Diviner, LAMP.

---

## Nota de método

Buscadores genéricos (SearXNG local) retornaram resultados degradados nesta consulta.
A descoberta foi feita via **OpenAlex** (metadados + locais de acesso aberto), complementada por
**NASA NTRS API**, **arXiv**, **Europe PMC** e repositórios institucionais (Birkbeck, DLR).
Um fallback pago foi usado uma única vez, para confirmar o valor de 94% de Speyerer & Robinson.
Nenhum paywall foi contornado; artigos fechados estão identificados como tal.
