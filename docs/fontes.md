# Catálogo de fontes: Lunar Landing Site Navigator

> Os artigos foram lidos e os fatos conferidos em 02/11/2026: ver [artigos.md](artigos.md).

Pesquisado em 2026-11-02. ✅ = link testado (HTTP 200) nesse dia. Os Resources oficiais do desafio saem em 13/11; comparar com isto.

## 1. Relevo (DEMs)

| Fonte | O que é | Uso no projeto |
|---|---|---|
| ✅ [PGDA 90: A New View of the Lunar South Pole from LOLA](https://pgda.gsfc.nasa.gov/products/90) | `LDEM_80S_20MPP_ADJ.TIF` (~2,6 GB), DEM polar ajustado de 20 m/px, com mapas de erro e hillshade | **DEM base do polo** (máscara de horizonte) |
| ✅ [MIT Imbrium: LOLA GDR polo sul](https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE) | `LDEM_80S_20M`: 30.400 × 30.400 px, ±304 km, JP2 (~194 MB) ou IMG (~1,76 GB). Altura = DN × 0,5 + 1737400 m | Alternativa ou espelho do DEM de 20 m |
| ✅ [PGDA 78: High-Res LOLA Topography for South Pole Sites](https://pgda.gsfc.nasa.gov/products/78) | DEMs de **5 m/px** de 16 × 16 km para os sítios 1 (Connecting Ridge), 4 (borda de Shackleton), 7 (pico perto de Shackleton, lado oculto) e 11 (borda de Gerlache). GeoTIFF + nuvem de pontos | Detalhe perto do sítio (multirresolução) |
| ✅ [PGDA 81: South Pole LOLA 5 m Mosaic](https://pgda.gsfc.nasa.gov/products/81) | Mosaico de 5 m com 97 campos de 20 × 20 km | Detalhe de 5 m em mais lugares |
| [PGDA 54: SLDEM2015](https://pgda.gsfc.nasa.gov/products/54) / [dados MIT](https://imbrium.mit.edu/DATA/SLDEM2015/) | LOLA + Kaguya, ±60°, 512 ppd (~59 m), precisão vertical ~3–4 m | **Coordenada livre fora do polo** (Apollo, Chandrayaan…) |
| [ODE: LOLA GDRDEM](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRDEM.htm) | Documentação dos produtos GDR | Entender formatos e labels |
| [PDS Geosciences: LOLA FAQ](https://pds-geosciences.wustl.edu/missions/lro/lola_faq.htm) | Conversão de DN para metros, projeções | Leitura correta dos arquivos |

Artigo: Barker et al. 2021, *PSS* 203, 105119, "Improved LOLA elevation maps for south pole landing sites". O erro RMS é de 0,3–0,5 m na altura e 1,5–2,5° na inclinação. **~90% dos pixels de 5 m são interpolados** (cobertura real de 7–10% a 5 m, 69–78% a 20 m e 96–98% a 40 m). Vale citar como limitação. O artigo traz também a **receita do horizonte** que adotamos; ver [artigos.md](artigos.md).

## 2. Iluminação e Terra visível já calculadas (para validar)

| Fonte | O que é | Uso |
|---|---|---|
| ✅ [PGDA 69: Lunar Polar Illumination](https://pgda.gsfc.nasa.gov/products/69) | **Iluminação média e Visibilidade média da Terra**, produtos com passo de 1 h ao longo de 18,6 anos (metodologia de Mazarico et al. 2011, *Icarus* 211; no artigo, as simulações longas usaram passo de 6 h). 240/120/60 m/px, em IMG/TIF/COG | **Validar o nosso cálculo** e servir de mapa de fundo |
| [ODE: GDRVIS](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRVIS.htm) | O mesmo produto no PDS (LRO-L-LOLA-4-GDR-V1.0) | Idem |
| Gläser et al. 2014, *Icarus* 243, 78 ([ADS](https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G)) | Connecting Ridge: **92,27% de luz a 2 m de altura e 95,65% a 10 m**; maior escuridão contínua de 3–5 dias | Número de referência para conferir o nosso resultado e argumento para o slider de altura do mastro |
| ✅ [JPL IPN 42-176C (Bryant)](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.html) | Máscara de horizonte a partir do DEM de radar de Goldstone. Bryant 2009 (IPN 42-176, fev/2009), DEM de 40 m, torres de 2 m. Melhor sítio: **92% de energia solar e 51% de DTE** (média de 2009 a 2028) | Metodologia de horizonte + DTE muito parecida com a nossa |
| [TUB-Light (Zenodo 5777269)](https://zenodo.org/records/5777269) | Software de iluminação em GPU (Jacobs Univ. Bremen) | Referência de implementação (o link deu 403 no teste) |
| ✅ [Arquivo SPICE do CLPS (NAIF)](https://naif.jpl.nasa.gov/pub/naif/pds/pds4/clps/clps_spice/spice_kernels/spk/) | Trajetórias reconstruídas e pontos de pouso do IM-1, IM-2, Blue Ghost 1 e Peregrine (arquivos `clps_*_ls_*.bsp`, `*_edl_rec_*.bsp`) | **Validar contra o que voou**: o pôr do Sol do Blue Ghost 1 tem que cair na data que a NASA informou (achado em [concorrencia.md](concorrencia.md)) |

## 3. Efemérides (Sol e Terra)

| Fonte | Detalhe |
|---|---|
| ✅ [NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) | Atuais: `lsk/naif0012.tls`, `spk/planets/de440.bsp`, `pck/moon_pa_de440_200625.bpc` + **`fk/satellites/moon_de440_250416.tf`** (frames `MOON_ME` e `MOON_PA`; a diferença entre eles é de ~0,029°) |
| [Leia-me dos PCKs](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/aareadme.txt) | Qual FK combina com qual PCK |
| spiceypy | Biblioteca Python do SPICE. O pacote [spicedmoon](https://pypi.org/project/spicedmoon) serve de exemplo de geometria solar lunar (usa kernels antigos) |
| ✅ [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) | Observador na superfície da Lua (corpo 301 + lon/lat/alt) para **validar** az/el |
| [astroquery.jplhorizons](https://astroquery.readthedocs.io/en/stable/jplhorizons/jplhorizons.html) / [lhorizon](https://github.com/MillionConcepts/lhorizon) | Clientes Python do Horizons. O lhorizon foi feito para sítios arbitrários na superfície lunar |
| [NASA SVS: Moon Phase and Libration](https://svs.gsfc.nasa.gov/5188) | **Tabela horária (JSON/TXT) com pontos sub-Terra e subsolar** por ano. Serve para checar o nosso pré-cálculo e é um ótimo recurso educativo |

## 4. Sítios de pouso

| Grupo | Sítios e fontes |
|---|---|
| **Artemis III** (9 regiões, out/2024) | Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain. [LPSC 2026 abstract 1901](https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf), [NTRS 20250011660](https://ntrs.nasa.gov/citations/20250011660). A NASA publica as regiões como áreas, não pontos. Polígonos oficiais: [grids de navegação do USGS](https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids). Centros aproximados e códigos em [sites/README.md](../sites/README.md) |
| ✅ **Sítios candidatos (130)** | Wueller et al. 2026, *JGR Planets*, [10.1029/2025JE009434](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434). Dados em [Zenodo 17084058](https://doi.org/10.5281/zenodo.17084058) (CC-BY 4.0): **lat/lon dos 130 sítios + dias de Sol e de Sol + Terra por ano, de 2025 a 2032**. Já extraído para [sites/artemis_sitios_wueller2026.csv](../sites/artemis_sitios_wueller2026.csv). Serve de lista curada **e** de gabarito de validação |
| Operação do Artemis III | LPSC 2026: estadia na superfície de **5,75 a 6,25 dias**; a iluminação no polo **se desloca 2 a 3 semanas por ano**; operação a partir de órbita NRHO |
| **CLPS** | [Provedores NASA](https://www.nasa.gov/commercial-lunar-payload-services/clps-providers/), [Planetary Society: CLPS](https://www.planetary.org/space-missions/clps). IM-3 → Reiner Gamma (não polar) |
| **Griffin-1** (Astrobotic, "Moon Base II") | Região de Nobile. Lançamento **NET novembro de 2026** num Falcon Heavy, segundo a NASA em set/2026 ([Wikipedia](https://en.wikipedia.org/wiki/Griffin_Mission_One)). Leva o rover FLEX da Astrolab. A empresa foi renomeada para Voyager Lunar Systems em jul/2026, então pode aparecer com outros nomes |
| **VIPER** | Borda oeste de Nobile / Mons Mouton. Vai no **segundo Blue Moon MK1** da Blue Origin, com pouso previsto para o **fim de 2027**. É uma opção do contrato, que depende do sucesso do primeiro MK1 (Pathfinder 1, NET Q1 2027) ([NASA](https://www.nasa.gov/news-release/nasa-selects-blue-origin-to-deliver-viper-rover-to-moons-south-pole/)) |
| **Chang'e-7** (China) | Alvo: pico perto da crista sudeste de Shackleton, **88,8°S 123,4°E** (não oficializado). O lançamento de 24/08/2026 foi cancelado (tufão) e a janela de 2026 fechou: **adiado para 2027**, sem data ([SpaceNews](https://spacenews.com/china-delays-change-7-lunar-south-pole-landing-mission-launch/), [Scientific American](https://www.scientificamerican.com/article/china-delays-ambitious-change-7-moon-mission-until-2027/)) |
| ✅ **Chandrayaan-3** (Índia) | **Statio Shiv Shakti: 69,373°S 32,319°E** (nome aprovado pela IAU), entre as crateras Manzinus C e Simpelius N ([Wikipedia](https://en.wikipedia.org/wiki/Chandrayaan-3)). Outra fonte dá 69,3676°S 32,3481°E (~0,4 km de diferença) |
| **Apollo** | ✅ [NSSDC: Apollo Landing Site Coordinates](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) (ME/DE421, Wagner et al. 2017). ✅ [LROC 2016: coordenadas de artefatos humanos](https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf) |

## 5. Histórico real (para a história do pitch)

| Missão | O que aconteceu | Lição para o app |
|---|---|---|
| **IM-2 Athena** (mar/2025) | O alvo era um ponto de 50 m em Mons Mouton. Pousou **entre 250 e 400 m fora dele**, dependendo da fonte: a Intuitive Machines diz 250 m; o comunicado da NASA diz "mais de 1.300 pés (400 m)" no texto e "cerca de 820 pés (250 m)" na legenda da foto, sem explicar a diferença. Ficou **tombado** dentro de uma cratera de 20 m, em −84,7906°, 29,1957° (LROC). Os painéis não pegavam o Sol e o frio da cratera impediu recarregar. Durou **~12,75 h** (pouso ~11h30 CST de 06/03, fim 0h15 CST de 07/03), de 10 dias previstos ([NASA 25-025](https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/), [LROC 1408](https://lroc.im-ldi.com/images/1408), [Spaceflight Now](https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/), [SpacePolicyOnline](https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/)) | **Algumas centenas de metros mudam tudo** no polo. É exatamente o "por que pequenas mudanças importam" do desafio. Na apresentação, dizer "a algumas centenas de metros do alvo" ou citar a fonte do número |
| **IM-1 Odysseus** (fev/2024) | Também tombou parcialmente | Idem |
| **Blue Ghost M1** (mar/2025, Mare Crisium) | 14 dias de operação; fotografou um eclipse solar em 14/03 e o pôr do Sol com a Terra no horizonte em 16/03; morreu no anoitecer ([Universe Today](https://www.universetoday.com/articles/blue-ghost-watches-the-lunar-sunset-signalling-the-end-of-its-mission), [Scientific American](https://www.scientificamerican.com/article/blue-ghost-lander-successfully-completes-historic-lunar-mission/)) | Sítio equatorial: a missão acaba no pôr do Sol. Serve de contraste com o polo e de **validação** (a hora do sunset e o eclipse são verificáveis) |

## 6. Comunicação DTE

- **NASA, Lunar Communications and Navigation Architecture** ([PDF](https://www.nasa.gov/wp-content/uploads/2024/01/lunar-communications-and-navigation-architecture.pdf)): do polo sul, a Terra fica visível só **~metade de cada mês sideral**.
- **JPL IPN 42-216C** ([link](https://ipnpr.jpl.nasa.gov/progress_report/42-216/42-216C.html)): antenas no polo apontam para a Terra a **no máximo ~10° de elevação**, num canal com desvanecimento para a DSN de 34 m.
- **NASA Glenn, Lunar Surface Propagation** ([link](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/scan/lunar-surface-propagation/)): modelos de propagação de rádio na superfície.
- **Edwards (NTRS 20240013248)** ([PDF](https://ntrs.nasa.gov/api/citations/20240013248/downloads/Edwards%20Presentation_Ver%202.pdf)): duas semanas com a Terra visível, duas sem; a DSN está sobrecarregada.
- ✅ **Máscaras de horizonte das antenas da DSN** ([DSN 810-005, módulo 301](https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301O.pdf); [planilha](https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/Horizon-Masks-Download-V2-301O.xlsx)): a elevação mínima em que cada antena enxerga a Lua, grau a grau. Permite dizer não só "a Terra está acima do horizonte do sítio", mas também "alguma antena da DSN está vendo a Lua agora".

## 6b. Requisitos e operação reais (achados no bloco 3, ver [artigos.md](artigos.md))

- **NASA, "Artemis HLS Overview", feita para o Space Apps 2025** ([PDF](https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf)). Os 6 requisitos de pouso do Artemis III: até 6° do polo; inclinação < 10° (pouso) e < 20° (EVA); comunicação direta com Terra ≥ 25%; Sol ≥ 5% e a superfície iluminada durante toda a estadia; pouso a até 100 m do alvo.
- **NASA, "Lunar Site Selection" (2023)** ([PDF](https://ntrs.nasa.gov/api/citations/20230016267/downloads/Lunar%20Site%20Selection.pdf)): Sol por ~6–6,5 dias no primeiro pouso; nenhum ponto do polo tem Sol contínuo.
- **Planejamento do VIPER**: Lim 2024 ([PDF](https://ntrs.nasa.gov/api/citations/20240001709/downloads/20240001709-LPSC2024_Lim%20et%20al_vFINAL.pdf)) e Ennico 2023 ([PDF](https://ntrs.nasa.gov/api/citations/20230004239/downloads/SSR2023-VIPER-Planning-Ennico.pdf)). Safe Havens com sombra ≤ 50 h; acompanhamento de "tempo até a sombra do Sol" e "tempo até a sombra da DSN".
- **Peña-Asensio et al. 2024** ([arXiv](https://arxiv.org/abs/2406.19863)): decisão multicritério (TOPSIS) sobre 1.247 locais; melhor local em Nobile Rim 2 (−84,20156°, 60,69989°).
- **Gläser et al. 2018** ([PDF](https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf)): 77,1–88,0% de iluminação a 2 m nos melhores pontos (2017–2037).
- **Mazarico et al. 2018, IllumNG** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6398960/)): a ferramenta de raytracing do Goddard.

## 7. Visualizações e educação

- ✅ [NASA SVS 5228: Lunar South Pole Illumination with Earth and Sun](https://svs.gsfc.nasa.gov/5228): animação do Sol "deslizando" pelo horizonte e da Terra "balançando", vistos do polo, com 6 meses em 2,5 min. **É quase o nosso panorama em vídeo.** Referência visual e para o pitch.
- ✅ [NASA SVS 4930: Illumination at the Moon's South Pole, 2023–2030](https://svs.gsfc.nasa.gov/4930/): luz e sombra a cada 2 h, a partir do LOLA.
- [LPI Lunar South Pole Atlas](https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/) (deu 403 para script; abrir no navegador): 14 mapas topográficos, regiões iluminadas e PSRs.

## 8. Temperatura e sombra (extras)

- **Diviner (LRO):** os [Polar Cumulative Products](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/DIVINER/PCP.htm) têm temperatura de brilho em 240 m/px poleward de 80°. O [Polar Resource Product](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/DIVINER/PRP.htm) tem a temperatura média e a máxima anual e a profundidade do gelo. Serve para uma camada térmica opcional.
- **ShadowCam (KPLO):** imagens dentro das PSRs, com releases trimestrais no PDS ([notícias](https://shadowcam.im-ldi.com/news)).

## 9. 3D e mapas

- [Cesium Moon Terrain](https://cesium.com/platform/cesium-ion/content/cesium-moon-terrain): Lua global em 3D Tiles, chegando a 5 m/px em 87,5°–90°. Precisa de conta no Cesium ion. Há um [relato no fórum](https://community.cesium.com/t/cesium-ion-moon-terrain-appears-2-5-km-higher-than-lola-sldem2015-dem-at-the-same-lon-lat/46282) de que ele fica **~2,5 km acima** do LOLA: não usar para cálculo, só para visual.
- ✅ [LROC Quickmap](https://quickmap.lroc.asu.edu/) e [Moon Trek](https://trek.nasa.gov/moon/): os concorrentes. Servem também para conferir.

## Pendências
- ~~Coordenadas das regiões Artemis III~~: resolvido com o Wueller 2026 (sítios e centros aproximados) + polígonos do USGS. Correspondência entre código e nome e definição de "dias de Sol" confirmadas na leitura completa do artigo ([leituras.md](leituras.md)).
- ~~Chandrayaan-3~~: confirmado (Statio Shiv Shakti).
- Status das missões conferido em 02/11/2026: Griffin NET nov/2026, VIPER fim de 2027, Chang'e-7 em 2027. **Reconferir na semana do evento**, porque o Griffin pode lançar bem perto.
- Comparar tudo com os Resources de 13/11.
