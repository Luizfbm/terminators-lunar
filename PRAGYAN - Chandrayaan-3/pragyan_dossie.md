# PRAGYAN (Chandrayaan-3) — Dossiê de Trajeto, Desvios e Dados

Extraído e verificado em **2026-11-14**. Fontes primárias: LPSC 2025 #1025 (P. J. Stooke, *Chandrayaan 3 and Pragyan Rover: Traverse Analysis*), press release ISRO/PRL do APXS (21/08/2024), Nature 633 (Vadawale et al. 2024), Nature Comm. Earth & Env. (2025), declarações oficiais da ISRO.

Regra aplicada: texto extraído **e** cada página inspecionada visualmente. Números de figura/página citados.

---

## 1. Identificação

| Campo | Valor |
|---|---|
| Missão | Chandrayaan-3 (ISRO) |
| Pouso (Vikram) | 23/08/2023, 12:32 UTC |
| Local | **Statio Shiv Shakti / Shiv Shakti Point** |
| Coordenadas | **69,373°S 32,319°E** (ISRO também usa 69,37°S 32,35°E) |
| Contexto geológico | Terras altas do hemisfério sul, entre as crateras **Manzinus C** e **Simpelius N** |
| Distância do polo sul | ~2.100 km (NÃO é região polar; região polar começa ~88,5°S) |
| Distância da borda externa da bacia SPA | ~350 km |
| Nome oficial | "Statio Shiv Shakti" (designação IAU para o ponto de pouso) |

## 2. Especificações do rover

| Item | Valor |
|---|---|
| Massa | 26 kg (algumas fontes: 27 kg) |
| Dimensões | 0,9 × 0,75 × 0,85 m |
| Rodas | 6, suspensão **rocker-bogie**, motor BLDC independente por roda |
| Direção | Diferencial de velocidade / skid steering |
| Potência | 50 W (solar) |
| Velocidade de projeto | 1 cm/s |
| Alcance de projeto | 500 m |
| **Distância real** | **101,4 m** (Wikipedia) / **~103 m** (ISRO/PRL) / "100+ m" (ISRO) |
| Duração | 12 dias (≈10 dias de deslocamento), 1 dia lunar |
| Instrumentos | **LIBS** (laser) + **APXS** (Alpha Particle X-Ray Spectrometer, 700 g) |
| Navegação | 2 × NavCam estéreo mono 1 MP, gerando DEM local |
| Fim | Sleep mode em 02/09/2023 com bateria cheia; nunca acordou (previsto 22/09) |

## 3. Cronologia sol a sol (com os desvios)

Fonte das datas de parada: Fig. 2 e Fig. 3 do LPSC 2025 #1025; texto da p. 1; comunicados ISRO.

| Data (2023) | Evento | Direção / desvio |
|---|---|---|
| 23–24 ago | Desce a rampa do Vikram, segue ao sul, **para para carregar bateria** perto da South Crater | S |
| 25 ago | Move mais ao sul; tira imagens para S e E | S |
| 25–27 ago | Ponto de bifurcação; ramo central ao sul | S |
| **27 ago** | **Encontra cratera de 4 m de diâmetro a 3 m à frente** | **DESVIO 1: comandado a refazer o caminho ("retrace the path") e seguir por rota nova** |
| 28 ago | Novo caminho; dois stops no ramo leste e um no ramo oeste | E / O |
| 29 ago | Dois stops no ramo sudoeste | SO |
| 30 ago | Inicia deslocamento para oeste, rumo à West Crater. 07:35: foto do Vikram mostrando ChaSTE e ILSA já desdobrados; 11:04: outra foto a 15 m | O |
| **31 ago** | 5 stops: oeste → noroeste → nordeste → oeste → ponto mais a oeste. Contorna a borda oeste da West Crater | **DESVIO 2: loop ~4 m a oeste da crater B (o mapa da ISRO mostra o rover quase na borda)** |
| **1 set** | Afasta-se da borda ao sul/SE, contorna pequeno obstáculo, vai a leste e NE; depois da crater B segue NW (trecho tracejado = incerto) até o 3º stop; **rodeia a crater B** para abordar a borda da cratera maior sobreposta pela West Crater e observa o interior | **DESVIO 3: contorno da cratera maior** |
| 2 set | Rumo N/NE em dois stops, **pequeno desvio** e chega à **posição final**; entra em sleep mode | **DESVIO 4** |
| 3 set | **Vikram executa um hop** (~40 cm); o mapa marca "pre-hop" e "post-hop" | — |
| 22 set | Janela prevista de reativação; rover não respondeu | — |

### Desvio deliberado (não é obstáculo)
Perto da South Crater, o rover **retornou por um caminho deslocado (offset path) de propósito, para testar tração**, e fotografou as próprias marcas. Isso está explícito no LPSC p. 1 — é um desvio por experimento de engenharia, não por obstáculo.

## 4. Erros do mapa oficial da ISRO (correção de Stooke, LPSC 2025 p. 1)

1. A ISRO **rotacionou as duas excursões da South Crater no sentido anti-horário**.
2. A ISRO **representou as trilhas novas como se fossem o primeiro conjunto de trilhas**.
3. A ISRO **colocou o rover a leste da cratera A** (~1 m), mas uma imagem voltada a leste só pode conter essa cratera se o rover estiver **a oeste** dela.
4. A ISRO mostra o rover **quase sobre a borda da cratera B**; as imagens de superfície mostram um **loop ~4 m mais a oeste**.
5. O mapa de Ghosh et al. [5] é **"muito distorcido"**.
6. Os **mapas da equipe APXS [2,3] são mais acurados** que o mapa inicial da ISRO.
7. O trecho entre o lander e a West Crater **permanece incerto** (imagens difíceis de correlacionar com OHRC).

Base de dados usada: imagens do rover, câmera do lander e **OHRC do Chandrayaan-2** (~20–25 cm/pixel), com dados do ISSDC.

## 5. Os 23 pontos do APXS (dados por waypoint)

- **23 observações** ao longo do trajeto, **todas dentro de ~50 m** do ponto de pouso.
- Tempo por observação: **~20 min a 3 h**; total **~31 h** em 10 dias.
- Sobreposição em imagem OHRC, com escala de **10 m** e eixos 32,316°E–32,32°E / 69,373°S (Figura 3 do release ISRO/PRL; Fig. 2a do artigo da Nature CEE, com os 23 círculos brancos).
- IDs das observações (23): 1, 2, 3, 4, 5, 6, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29.
- Tabela completa com incertezas: `pragyan_waypoints_apxs.csv` e aba **Waypoints_APXS** da planilha.

### Valores por observação (Al2O3 / Na / K / S, com 1σ)

| ID | Al2O3 (wt%) | Na (ppm) | K (ppm) | S (ppm) |
|---|---|---|---|---|
| 1 | 26,2 ±1,84 | 2800 ±460 | 400 ±70 | 1100 ±220 |
| 2 | 26,2 ±1,34 | 2600 ±410 | 400 ±50 | 1200 ±200 |
| 3 | 26,3 ±1,81 | 2000 ±490 | 400 ±80 | 1200 ±230 |
| 4 | 26,3 ±1,61 | 2000 ±480 | 400 ±80 | 1200 ±230 |
| 5 | 26,4 ±1,33 | 800 ±320 | 300 ±60 | 1200 ±200 |
| 6 | 26,1 ±1,42 | 1900 ±350 | 400 ±50 | 1200 ±200 |
| 11 | 26,1 ±1,91 | 1700 ±550 | 400 ±90 | 1200 ±240 |
| 12 | 25,9 ±1,24 | 2100 ±340 | 400 ±50 | 1200 ±200 |
| 13 | 26,0 ±1,36 | 1700 ±350 | 400 ±60 | 1200 ±200 |
| 15 | 25,3 ±0,91 | 2400 ±200 | 300 ±30 | **1400 ±180** |
| 16 | 25,9 ±1,47 | 2600 ±390 | 400 ±60 | 1300 ±220 |
| 17 | 25,8 ±1,08 | 2400 ±260 | 400 ±40 | 1200 ±180 |
| 18 | 26,1 ±1,07 | 2100 ±230 | 400 ±40 | 1200 ±160 |
| 19 | 25,9 ±1,10 | 2200 ±250 | 400 ±40 | 1100 ±160 |
| 20 | 25,9 ±1,01 | 2500 ±240 | 400 ±40 | 1200 ±170 |
| 21 | 26,5 ±1,71 | **700 ±540** | 400 ±90 | **900 ±200** |
| 22 | 26,3 ±0,89 | 2200 ±210 | 400 ±30 | 1200 ±160 |
| 23 | 26,3 ±1,08 | 1600 ±330 | 400 ±50 | 1100 ±190 |
| 24 | 26,6 ±2,30 | 2700 ±1010 | 300 ±120 | 1000 ±280 |
| 25 | 26,6 ±1,27 | 1500 ±360 | 400 ±60 | 1200 ±190 |
| 26 | 26,3 ±1,27 | 1000 ±290 | 400 ±60 | 1100 ±190 |
| 28 | 26,1 ±1,12 | 2100 ±300 | 400 ±50 | 1200 ±180 |
| 29 | 25,5 ±1,36 | 1400 ±390 | 300 ±70 | 1400 ±240 |

**Estatística das 23 observações:** Na 700–2.800 ppm (média 1.957) · K 300–400 ppm (média 383) · S 900–1.400 ppm (média 1.183) · Al2O3 25,3–26,6 wt% (faixa muito estreita).

## 6. Composição medida (APXS / LIBS)

| Elemento | Faixa medida | Observação |
|---|---|---|
| **S** (enxofre) | **900–1.400 ppm** (média **1.183 ppm**) | 300–500 ppm acima de Apollo 16 e Luna 20 |
| **Na** (sódio) | **700–2.800 ppm** | anomalamente **depletado** vs. terras altas de Apollo 16 / Luna 20 |
| **K** (potássio) | **300–400 ppm** | idem, depletado |

### Comparação entre sítios (Table 2 do artigo)

| Sítio | Na (ppm) | K (ppm) | S (ppm) |
|---|---|---|---|
| **Chandrayaan-3** | 700–2.800 | 300–400 | 900–1.400 |
| Apollo 16 | 3190–3991 | 457–1187 | 290–900 |
| Luna 20 | 2967 | 573 | 800 |
| Apollo 15 | 2537–3724 | 880–2574 | 500–865 |
| Apollo 17 | 2604–3539 | 614–1495 | 600–1400 |
| Chang'e-5 | 3421 | 1728 | 360 |

Interpretação publicada: mistura de **Ferroan Anorthosite (FAN)** + **Mg-suite**; plagioclásio dominante, mas olivina e piroxênio acima do esperado → material de crosta inferior/manto superior escavado pela bacia **SPA há ~4,3 Ga**. Sódio e potássio baixos sugerem cristalização incompleta na região-fonte.

Outros dados do sítio (fontes secundárias, **não confirmadas nas primárias**): ChaSTE mediu ~50 °C na superfície e −10 °C a 8 cm; ILSA registrou 250+ sinais sísmicos, ~50 não explicados.

## 7. Figuras extraídas

| Arquivo | Conteúdo |
|---|---|
| `img/p2_1.jpeg` | Página 2 do LPSC 2025 (Fig. 1, 2 e 3) |
| `img/crops/fig1_full.png` | Fig. 1 — comparação dos 5 mapas de trajeto (ISRO, APXS, Vijayan, Ghosh) |
| `img/crops/fig2_west.png` | Fig. 2 — atividades na West Crater (30 ago – 2 set) |
| `img/crops/fig3_south.png` | Fig. 3 — atividades na South Crater (23–29 ago) + hop do Vikram |
| `pages/isro_p3.png` | Figura 3 do release ISRO — 23 pontos APXS sobre OHRC |

### Legenda da Fig. 1 (LPSC 2025)
- **linha cinza + pontos**: rota e paradas de [1] (mapa ISRO)
- **círculos brancos + linha branca**: sítios APXS e rota de [2]
- **quadrados**: sítios APXS de [3]
- **linha cinza fraca**: parte da rota de [4] (Vijayan)
- **linha branca fina**: caminho de [5] (Ghosh)
- **quadrados pretos**: posição do rover nas imagens LRO/OHRC

## 8. Limitações desta extração

- O PDF do LPSC é um **resumo de 2 páginas com pôster comprimido**; as figuras são JPEG de página inteira, então rótulos pequenos foram lidos por ampliação — alguns números ficaram ilegíveis.
- ~~Tabela 2 não obtida~~ → **RESOLVIDO em 14/11/2026**: o PDF de acesso aberto foi baixado via navegador gerenciado e o Table 2 completo (23 waypoints com incertezas 1σ) foi extraído para `pragyan_waypoints_apxs.csv` e para a aba `Waypoints_APXS`.
- A rota entre o lander e a West Crater continua **não resolvida** na literatura.

---

## Referências

1. Stooke, P. J. (2025). *Chandrayaan 3 and Pragyan Rover: Traverse Analysis*. 56th LPSC, abstract 1025. https://www.hou.usra.edu/meetings/lpsc2025/pdf/1025.pdf
2. ISRO/PRL (21/08/2024). *PRL-built APXS on Pragyan Rover...* https://www.isro.gov.in/media_isro/pdf/APXS_CH3.pdf
3. Vadawale, S. V. et al. (2024). *Chandrayaan-3 APXS elemental abundance measurements at lunar high latitude*. Nature 633, 327–331. https://doi.org/10.1038/s41586-024-07870-7
4. Nature Communications Earth & Environment (2025). *Primitive lunar mantle materials at the Chandrayaan-3 landing site*. https://www.nature.com/articles/s43247-025-02305-1 — **PDF completo no pacote:** `pdf/s43247-025-02305-1.pdf`
5. ISRO (28/08/2023). Post oficial sobre a cratera de 4 m. https://x.com/isro/status/1697881823391711684
6. ISRO (mapa do trajeto). https://x.com/isro/status/1697881823391711684
7. Vijayan, S. et al. (2024). Icarus. https://doi.org/10.1016/j.icarus.2024.116329
8. Ghosh, R. et al. (2024). Int. Conf. Space Robotics.
