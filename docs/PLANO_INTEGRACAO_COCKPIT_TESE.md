# Plano e Especificação Completa da Integração: Cockpit Lunar 3D + Motor Tático da Tese

Este documento registra **exatamente tudo o que foi implementado** na interface unificada centrada em `src/cockpit_missao_lunar.html` (integrando o cockpit de pouso lunar de 3 telas aos dados reais e ao motor de 5 degraus + neuroevolução da tese), incluindo o **Prompt do Plano** completo — com a **Tela 1 (`1. Escolher Rover & Missão`)**, **Tela 2 (Mapa Polar)** e **Tela 3 (Superfície 3D / Caminhar na Lua)** — para ser reutilizado em outro projeto com mapa lunar mais detalhado.

---

## 1. Arquitetura Geral (100% Estática + Pré-processamento Python)

### Fase 1 — Pacote Web Pré-processado (`src/build_map_bundle.py` → `src/assets/tese_bundle/`)
O navegador não lê GeoTIFFs brutos diretamente. O script Python `src/build_map_bundle.py` lê os CSVs e recortes `PGDA 78` (`5 m/px`) e gera:
- `src/assets/tese_bundle/sites_master.json` (`130` sítios candidatos de `sites/artemis_sitios_wueller2026.csv`, cruzados com `lroc_nac/pgda78_26/lroc_nac_sitios_resumo.csv` e `simulacao_rover/monte_carlo_lola/resultados/resumo_sitios.csv` + `resultados_20m/resumo_sitios.csv`), contendo:
  - `lat`, `lon`, `regiao`, série temporal `2025–2032`, disponibilidade de grade (`5 m / 10 m / 20 m`), cobertura `LROC NAC` (`n_cobrindo`, `melhor_res_m_px`), métricas reais do Monte Carlo (`60 m` e `20 m`, curvas `curva_grade_FA5..30` e `curva_tese_FA5..30`, erro mediano) e flags de aprovação (`pass_60m`, `pass_p50`, `pass_p90`, `pass_p99`).
- `src/assets/tese_bundle/pgda78/<sitio>.json` (`26` sítios `PGDA 78`, recorte central `10 × 10 km` reamostrado para `200 × 200` células de `50 m/px`), contendo matrizes quantizadas de:
  - `surf` (elevação), `slp5` (declive real `5 m`), `slp60` (`60 m`), `slp20` (`20 m`), `ldecDen` e `ldecAny` (densidade e presença de disparos reais LOLA `LDEC > 0`), e `slperr` (incerteza de declive).

---

## 2. Tela 1 — `1. Escolher Rover & Missão` (Hangar 3D & Acoplamento Físico)

A Tela 1 (`#screen-1`) apresenta o seletor de missão e um **carrossel 3D interativo (Three.js)** com **8 rovers** (4 lunares + 4 marcianos comparativos "E se fosse à Lua?"), onde o usuário configura:
- **Ano da missão** (`2025–2032`), **duração** (dias lunares) e exigência de **link direto Terra–Lua (DTE)**.
- **Parâmetros físicos do rover selecionado** conectados diretamente às restrições das Telas 2 e 3:
  1. `LRV · APOLLO 15–17` (`massKg: 210`, `batteryWh: 8712`, `solarW: 0`, `rtgW: 0`, `powerShadowW: 350`, `mastHeightM: 1.14`, `slopeLimitDeg: 15`)
  2. `VIPER (NASA)` (`massKg: 430`, `batteryWh: 5420`, `solarW: 450`, `rtgW: 0`, `powerShadowW: 95`, `mastHeightM: 2.45`, `slopeLimitDeg: 15`)
  3. `LTV · ARTEMIS` (`massKg: 500`, `batteryWh: 6650`, `solarW: 650`, `rtgW: 0`, `powerShadowW: 110`, `mastHeightM: 2.0`, `slopeLimitDeg: 18`)
  4. `MAPP · LUNAR OUTPOST` (`massKg: 10`, `batteryWh: 420`, `solarW: 180`, `rtgW: 0`, `powerShadowW: 120`, `mastHeightM: 0.6`, `slopeLimitDeg: 14`)
  5. `SOJOURNER · 1997` (`massKg: 10.6`, `batteryWh: 150`, `solarW: 16`, `rtgW: 0`, `powerShadowW: 10`, `mastHeightM: 0.30`, `slopeLimitDeg: 12`)
  6. `SPIRIT / OPPORTUNITY (MER)` (`massKg: 180`, `batteryWh: 450`, `solarW: 140`, `rtgW: 0`, `powerShadowW: 100`, `mastHeightM: 1.4`, `slopeLimitDeg: 15`)
  7. `CURIOSITY · MSL` (`massKg: 899`, `batteryWh: 2350`, `solarW: 0`, `rtgW: 110`, `powerShadowW: 100`, `mastHeightM: 2.2`, `slopeLimitDeg: 20`)
  8. `PERSEVERANCE · M2020` (`massKg: 1025`, `batteryWh: 2400`, `solarW: 0`, `rtgW: 110`, `powerShadowW: 100`, `mastHeightM: 2.2`, `slopeLimitDeg: 20`)
- Ao confirmar o rover (`state.roverConfirmed = true; goToScreen(2)`), `slopeLimitDeg`, `batteryWh`, `powerShadowW`, `solarW`, `rtgW` e `mastHeightM` alimentam automaticamente o Escudo `P50/P90/P99`, o Inspetor `10×10 km` e a simulação de consumo na Tela 3.

---

## 3. Tela 2 — Mapa Polar 3D, Filtros Multirresolução & Inspetor `10×10 km`

- **Mapa Polar 3D (`#lunar-map-canvas`, `#map-overlay`)** com topografia lunar natural (tons reais em escala de cinza por padrão) e novas camadas no `#layer-list`:
  - `Medição LOLA (LDEC > 0 vs. Interpolado)` (`~7%` real vs. `~93%` interpolado);
  - `Escudo Tese (60 m / 20 m → 5 m P50/P90/P99)` destacando **falsos positivos** (`FP 60m✖`);
  - `Auditado PGDA 78 / LROC NAC / SfS`.
- **Nova etapa no `#cascade-buttons-list` e `#funnel-hud`**: `Filtro Multirresolução P90/P99`, recalculando em tempo real `#score-viable` e `#score-blocked`.
- **Inspetor Local `10×10 km` em Cortina (`#tese-inspector-modal`)**:
  - Comparador deslizante (*Antes*: Grade `60 m` / `20 m` vs. *Depois*: Tese `5 m + LDEC + P50/P90/P99`) com slider de **Falso Alarme (`5%–30%`)** ligado às curvas reais do `monte_carlo_lola`.
  - Renderização com *hillshade* real de `grid.surf`, destaque de perigos ocultos (`> slopeLimitDeg`), densidade real `LDEC`, alvo central `⊕ Pouso <sitio>`, barra de escala `2 km (10×10 km)` e legenda visual.

---

## 4. Tela 3 — Superfície 3D Real, 5 Degraus, Enxame de 100 Rovers & Coleta Solar (`src/js/`)

Módulos criados/integrados em `src/js/`:
- **`src/js/rover_tese_engine.js`**:
  - 5 Degraus: `0: Base 60/20m`, `1: + Marcato (KKT/Barreira Logarítmica)`, `2: + Multirresolução 5m (No False Relief)`, `3: + Monte Carlo Robusto (P90)`, `4: + IA (MLP) sob Escudo P50/P90/P99`.
  - Planejador A* (`planGridAStar`) comparando **Sem Tese (`Degrau 0`)** na grade LOLA (`60m / 20m / 5m`) contra **Com Tese (`Degrau 4`)** no terreno real `5 m` + margem do Escudo.
  - Simulação de **enxame evolutivo com 100 rovers por geração (`Gen 1..5`)**, testando cada rover contra `slp5 > slopeLimitDeg`: os primeiros morrem nos perigos (`dead: true`), e a rede converge até `Gen 5` com alta taxa de sobrevivência.
- **`src/js/surface_3d_terrain.js`**:
  - Malha 3D Three.js (`#surface-3d-canvas`, `1200 × 1200 m`) gerada de `grid.surf` com micro-relevo procedural, rochas, iluminação solar direcional SPICE, **Escudo Direcional 3D no solo**, trilha 3D, rotas principais + rotas auxiliares (`auxLines`), baliza de destino e **raios solares amarelos flutuantes (`pickupsGroup`)** nas partes iluminadas.
  - `getOriginScreenPos()` projeta `(0,0,0)` na tela para manter o rover 3D (`#landed-rover-holder`) alinhado exatamente sobre a trilha e o Escudo, sem girar sobre o próprio eixo no pouso ou no modo manual.
- **`src/js/route_sim_v18.js` (`#v18-sim-modal`)**:
  - **Zoom-out LOLA** diretamente sobre o terreno sob o rover (`LOLA 60 m | 20 m | 5 m`).
  - **Visão lado a lado** (`Sem Tese` à esquerda vs. `Com Tese + Enxame de 100 Rovers` à direita), mostrando os `100` rovers saindo, morrendo (`X` vermelho) nas primeiras gerações e evoluindo até a rota ótima.
  - **Aceite direto pelo quadrado**: o usuário clica diretamente no quadro esquerdo (**Sem Tese**) ou direito (**Com Tese**) — sem botão extra — para aceitar o plano e iniciar/seguir a rota no 3D.
- **`src/js/tese_ui.js`**:
  - Painel `#tese-walk-panel` com modos **`🎮 Manual (Teclado)`** (WASD / Setas + botões táteis + tecla `F` / `☀️ Sol` para apontar frente e painel solar ao Sol) e **`🤖 Autônoma (Rota)`** (segue os waypoints da rota escolhida).
  - Ambos os modos mantêm a rota principal, rotas auxiliares e **raios solares amarelos flutuantes (`⚡`, `+180 Wh`)** posicionados apenas fora das sombras ao longo do trajeto para coleta educativa e recarga da bateria.

---

## 5. Estatísticas da Bateria Multirresolução na Interface (Evidência Empírica)

Para dar lastro científico visível na interface (no comparador **`⚖️ Comparar`** `#compare-panel` e no rodapé de **`#v18-sim-modal`**), exibir os resultados consolidados da bateria em `16` faixas reais LOLA (`POP = 100`, `1.600` travessias por célula, `dados_estatisticos_pareados_pop100.csv` e `RESULTADOS-ESCADA-DIFICULDADE.md`):
- **`N0` (Base):** chegada `78,06%` (Tese `60→5 m`) vs. `67,31%` (Grade `60 m`), **`+10,75 pp`** (`IC 95%: +0,06 a +23,81 pp`; McNemar `p = 3,3×10⁻³¹`, `OR = 5,99`, `r = 0,714`).
- **`N1` (Terreno perigoso `20,1% >15°`):** `48,62%` vs. `35,44%`, **`+13,19 pp`** (Wilcoxon `p = 0,046`, McNemar `p = 3,3×10⁻⁴⁷`, `OR = 11,82`, `r = 0,905`; tombamento `-2,44 pp`).
- **`N2` (Incerteza + câmera reduzida):** `47,75%` vs. `35,44%`, **`+12,31 pp`** (tombamento `-2,81 pp`, Wilcoxon `p = 0,012`).
- **`N3` (Degradação severa, escada `POP = 30`):** `40,0%` vs. `30,8%` (**`+30%` relativos**, Wilcoxon `p = 0,043`), frente a `21,7%` de chegada e `45,4%` de tombamento no Rover A sem escudo.
- **Cobertura real LOLA (`LDEC`):** apenas `7,29%` das células de `5 m` (`87,5°S–90°S`) possuem disparo real, fundamentando a regra *No False Relief* e o Escudo `P50/P90/P99`.

---

## 6. Prompt do Plano (Para Replicar em Outro Projeto com Mapa Lunar Mais Detalhado)

```text
Integre em uma única aplicação web estática de 3 telas um Cockpit de Missão Lunar conectado a dados reais de terreno em alta resolução e ao motor tático de 5 degraus + neuroevolução:

1. TELA 1 — ESCOLHER ROVER & MISSÃO (HANGAR 3D):
   - Exiba um carrossel/lineup 3D (Three.js) com os 8 rovers (LRV Apollo, VIPER, LTV Artemis, MAPP, Sojourner, MER Spirit/Opportunity, Curiosity, Perseverance) e controles de ano (2025–2032), duração da missão e link direto Terra (DTE).
   - Conecte os parâmetros físicos do rover escolhido (bateria em Wh, geração solar em W, RTG, consumo no escuro, altura do mastro e limite de inclinação `slopeLimitDeg`) diretamente às equações de filtro da Tela 2, ao Escudo P50/P90/P99 e ao consumo/trajeto na Tela 3.

2. PRÉ-PROCESSAMENTO LEVE (PYTHON → JSON/BINÁRIO ESTÁTICO):
   - Gere um bundle estático leve (`sites_master.json` + recortes locais `10×10 km` em `200×200` células com `surf`, `slp5`, `slp20`, `slp60`, `ldecDen/ldecAny` e `slperr`) para que o navegador nunca leia GeoTIFFs brutos.

3. TELA 2 — MAPA LUNAR DETALHADO + FILTRO P90/P99 + INSPETOR 10×10 km:
   - Mantenha aparência natural lunar (sem cores artificiais fortes por padrão) com camadas alternáveis: Medição LOLA (`LDEC > 0`), Falsos Positivos do Escudo (`60m → 5m P90/P99`) e cobertura PGDA/LROC NAC.
   - Adicione etapa "Filtro Multirresolução P90/P99" no funil de filtros.
   - Ao clicar em um sítio auditado, abra o Inspetor `10×10 km` em cortina (Antes: grade 60/20 m vs. Depois: 5 m + LDEC + Escudo P50/P90/P99) com hillshade real do relevo, alvo central de pouso, barra de escala 2 km, legenda e slider de Falso Alarme (5–30%).

4. TELA 3 — SUPERFÍCIE 3D REAL + ZOOM-OUT LOLA + ENXAME 100 ROVERS + COLETA SOLAR:
   - Renderize o terreno 3D real sob o rover (`surf` + micro-relevo + luz solar SPICE + Escudo Direcional 3D no solo) mantendo o rover travado sem girar sozinho e exatamente alinhado sobre a origem da trilha/escudo.
   - Ao definir um destino no mini-mapa ou entrar no modo `🤖 Autônoma (Rota)`:
     * Abra uma simulação com zoom-out sobre o mapa atual sob o rover e seletor de grade LOLA (`60 m | 20 m | 5 m`), lado a lado (`Sem Tese` vs. `Com Tese`).
     * Anime enxames de 100 rovers por geração (`Gen 1..5`) saindo da origem, morrendo (`X` vermelho) nos perigos `> slopeLimitDeg` nas primeiras gerações e convergindo até a rota ótima na Gen 5.
     * Permita aceitar o plano clicando diretamente no quadrado esquerdo (`Sem Tese`) ou direito (`Com Tese`), sem botão extra.
   - Tanto no modo `🎮 Manual (Teclado)` quanto no `🤖 Autônoma (Rota)`, exiba a rota traçada, rotas auxiliares e pequenos raios amarelos flutuantes (`⚡`) apenas nas áreas iluminadas (fora das sombras) ao longo do trajeto para coleta e recarga de bateria, além do botão/tecla `F` (`☀️ Sol`) para alinhar frente e painel solar ao Sol.
   - Inclua no comparador (`⚖️ Comparar`) e no rodapé da simulação (`#v18-sim-modal`) os números reais da bateria multirresolução (`POP=100` em `16` faixas LOLA): ganho de chegada `+10,75 pp` (`N0`), `+13,19 pp` (`N1`, `p=0,046`, `OR=11,82`), `+12,31 pp` (`N2`, tomb. `-2,81 pp`, `p=0,012`), `+30%` relativos (`N3`, `p=0,043`) e `7,29%` de cobertura real `LDEC` em `5 m`.
```
