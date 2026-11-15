# Sítios de pouso

## `artemis_sitios_wueller2026.csv`

São 130 sítios candidatos de pouso dentro das regiões candidatas do Artemis III. A tabela foi extraída do shapefile `LandingSites.shp` dos dados complementares do artigo:

> Wueller, L., Berger, L. M., Christopher, H., Sugimoto, K., Thaker, A., Carton, L., et al. (2026). *Assessing Potential Landing Sites With Favorable Illumination and Accessible, Potentially Volatile-Rich Permanently Shadowed Regions Within Artemis Candidate Landing Regions.* JGR Planets 131(3), e2025JE009434. https://doi.org/10.1029/2025JE009434
>
> Dados: https://doi.org/10.5281/zenodo.17084058 (licença **CC-BY 4.0**, por isso é obrigatório citar).

**Colunas:**
- `regiao`, `sitio`, `lat`, `lon` (graus; a longitude vai de −180 a 180, positiva para leste).
- `dias_sol_AAAA` e `dias_sol_terra_AAAA` (2025–2032): **número máximo de dias SEGUIDOS** com Sol (e com Sol + Terra ao mesmo tempo) durante o **meio do verão lunar do sul** de cada ano (latitude subsolar ≤ −1,5°). O artigo calculou isso com o Lunar QuickMap TerrainShadows, em mapa de 60 m/px, passos de 12 h, painel a 2 m de altura e sombras até 150 km. Critério do artigo: ≥ 10 dias é favorável para os 6,5 dias do Artemis III; > 16 é ideal. Datas do meio do verão: 2025 = 20/11–21/12; 2026 = 06/11–27/11; 2027 = 15/10–14/11; 2028 = 27/09–14/10; 2029 = 15/09–02/10; 2030 = 19/08–19/09; 2031 = 05/08–26/08; 2032 = 13/07–12/08.
- `area_psr_m2`: área de sombra permanente acessível perto do sítio.

**Para que serve no projeto:**
- dar a lista curada de sítios reais do Artemis;
- servir de **gabarito de validação**: comparar os dias de Sol e de Sol + Terra que calcularmos com os deles.

### Códigos das regiões

O artigo cobre 16 regiões: as 13 originais de 2022 mais extensões. Em outubro de 2024 a NASA reduziu a lista para **9**.

| Código | Região | Lista atual (9)? | Centro aprox. (lat, lon) | Nº de sítios |
|---|---|---|---|---|
| PCB | Peak near Cabeus B | ✅ | −83,58°, −69,08° | 5 |
| HW | Haworth | ✅ | −86,80°, −22,90° | 11 |
| MMA | Mons Malapert (ex-Malapert Massif) | ✅ | −86,05°, 0,15° | 5 |
| MMP | Mons Mouton Plateau | ✅ | −84,53°, 30,66° | 11 |
| MMO | Mons Mouton (ex-Leibnitz Beta Plateau) | ✅ | −85,40°, 31,18° | 10 |
| NR1 | Nobile Rim 1 | ✅ | −85,19°, 37,24° | 9 |
| NR2 | Nobile Rim 2 | ✅ | −83,89°, 58,40° | 9 |
| dGR2 | de Gerlache Rim 2 | ✅ | −88,17°, −68,79° | 7 |
| SP | Slater Plain | ✅ | −87,21°, 126,61° | 11 |
| CR | Connecting Ridge | ❌ (saiu) | −89,49°, −135,39° | 9 |
| CRE | Connecting Ridge Extension | ❌ | −88,94°, −106,10° | 6 |
| PNS | Peak near Shackleton | ❌ | −88,89°, 127,43° | 6 |
| FRA | Faustini Rim A | ❌ | −87,93°, 90,95° | 8 |
| AR | Amundsen Rim | ❌ | −84,25°, 68,69° | 10 |
| dGR1 | de Gerlache Rim 1 | ❌ | −88,61°, −65,43° | 6 |
| dGKM | de Gerlache-Kocher Massif | ❌ | −85,70°, −115,36° | 7 |

O "centro aproximado" é a média dos sítios de cada região, calculada em projeção estereográfica polar. **Não é uma coordenada oficial da NASA.** A NASA publica as regiões como áreas, não como pontos. Os polígonos oficiais estão nos grids de navegação do USGS: https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids

A correspondência entre código e nome foi **confirmada na Tabela 1 do artigo**. Entre os 130 estão também os sítios de referência da NASA **001** (Connecting Ridge), **007** (Peak Near Shackleton) e **011** (de Gerlache Rim 1), e sítios de Kring et al. 2023 (sufixo `_K2023`). Os mais estáveis de ano a ano (≥ 16–17 dias seguidos em todos os verões até 2032) são **CR06, CR07, 001, MMA_K2023, MMO01, MMO02, NR101, NR103, 007 e 011**, todos em pontos altos.

## Outros sítios

| Sítio | Lat, Lon | Fonte | Observação |
|---|---|---|---|
| Chandrayaan-3 (Statio Shiv Shakti) | −69,373°, 32,319° | Wikipedia / IAU | Outra fonte dá −69,3676°, 32,3481°, a ~0,03° de longitude (~0,4 km) |
| Nobile Rim 2, melhor local do TOPSIS | −84,20156°, 60,69989° | Peña-Asensio et al. 2024 (arXiv 2406.19863) | Escolhido por decisão multicritério entre 1.247 locais |
| Chang'e-7 (alvo) | −88,8°, 123,4° | Wikipedia | Pico perto da crista sudeste de Shackleton. A China não oficializou o local |
| Apollo 11–17 | ver NSSDC | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html | Referencial ME/DE421 (Wagner et al. 2017) |
