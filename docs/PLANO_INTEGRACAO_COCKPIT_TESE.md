# Plano e Especificação Completa da Integração: Cockpit Lunar 3D + Motor Tático Multirresolução

Este documento registra **exatamente tudo o que foi implementado** na interface unificada centrada em `src/cockpit_missao_lunar.html` (integrando o cockpit de pouso lunar de 3 telas aos dados reais e ao comparador **Navegação Normal (Sem Tese) × Multirresolução (Com Tese)**), incluindo o **Prompt do Plano** completo — com a **Tela 1 (`1. Escolher Rover & Missão`)**, **Tela 2 (Mapa Polar)** e **Tela 3 (Superfície 3D / Caminhar na Lua)** — para ser reutilizado em outro projeto com mapa lunar mais detalhado.

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
- **Cartão ao passar o mouse (`#site-hover-card`) e Inspetor Local `10×10 km` em Cortina (`#tese-inspector-modal`)**:
  - Exibe diretamente no hover de sítios `PGDA 78` a melhoria percentual real de perigo não vetado (`Normal 60m → Multirresolução P90`, ex.: `−79%`).
  - Comparador deslizante (*Antes*: Grade `60 m` / `20 m` vs. *Depois*: Multirresolução `5 m + LDEC + Escudo P50/P90/P99`) com slider de **Falso Alarme (`5%–30%`)** ligado às curvas reais do `monte_carlo_lola` e cálculo ao vivo da porcentagem de redução no risco não vetado e no erro mediano.
  - Renderização com *hillshade* real de `grid.surf`, destaque de perigos ocultos (`> slopeLimitDeg`), densidade real `LDEC`, alvo central `⊕ Pouso <sitio>`, barra de escala `2 km (10×10 km)` e legenda visual.

---

## 4. Tela 3 — Superfície 3D Real, Navegação Normal × Multirresolução, Enxame de 100 Rovers & Coleta Solar (`src/js/`)

Módulos criados/integrados em `src/js/`:
- **`src/js/rover_tese_engine.js`**:
  - Duas variações principais na interface e na simulação: **`Navegação Normal (Sem Tese)`** (`60/20 m`, sem escudo e sem margem) × **`Multirresolução (Com Tese)`** (`5 m + LDEC + Otimização contínua + Escudo Determinístico P50/P90/P99`), sem menção a IA na interface.
  - Planejador A* (`planGridAStar`) comparando **Navegação Normal** na grade LOLA (`60m / 20m / 5m`) contra **Multirresolução** no terreno real `5 m` + margem do Escudo.
  - Simulação de **enxame evolutivo com 100 rovers por geração (`Gen 1..5`)**, testando cada rover contra `slp5 > slopeLimitDeg`: os primeiros morrem nos perigos (`dead: true`), e a otimização converge até `Gen 5` com alta taxa de sobrevivência.
- **`src/js/surface_3d_terrain.js`**:
  - Malha 3D Three.js (`#surface-3d-canvas`, `1200 × 1200 m`) gerada de `grid.surf` com micro-relevo procedural, rochas, iluminação solar direcional SPICE, **Escudo Direcional 3D + círculo de segurança ao redor do rover no solo**, trilha 3D, rotas principais + rotas auxiliares (`auxLines`), baliza de destino e **raios solares amarelos flutuantes (`pickupsGroup`)** nas partes iluminadas.
  - `getOriginScreenPos()` projeta `(0,0,0)` na tela para manter o rover 3D (`#landed-rover-holder`) alinhado exatamente sobre a trilha e o Escudo, sem girar sobre o próprio eixo no pouso ou no modo manual.
- **`src/js/route_sim_v18.js` (`#v18-sim-modal`)**:
  - **Zoom-out LOLA** diretamente sobre o terreno sob o rover (`LOLA 60 m | 20 m | 5 m`).
  - **Visão lado a lado** (`Navegação Normal` à esquerda vs. `Multirresolução + Enxame de 100 Rovers` à direita), mostrando os `100` rovers saindo, morrendo (`X` vermelho) nas primeiras gerações e convergindo até a rota segura, além da `%` calculada de redução de perigos.
  - **Aceite direto pelo quadrado**: o usuário clica diretamente no quadro esquerdo (**Navegação Normal**) ou direito (**Multirresolução**) — sem botão extra — para aceitar o plano e iniciar/seguir a rota no 3D.
- **`src/js/tese_ui.js`**:
  - Painel `#tese-walk-panel` com seletor de **apenas duas variações** (`Navegação Normal · Sem Tese` × `Multirresolução · Com Tese`), modos **`🎮 Manual (Teclado)`** (WASD / Setas + botões táteis + tecla `F` / `☀️ Sol` para apontar frente e painel solar ao Sol) e **`🤖 Autônoma (Rota)`** (segue os waypoints da rota escolhida), botão **`⚖️ Comparar`** e **`🛰️ Visão Multirresolução`**.
  - **Selo de risco no círculo verde ao redor do rover (`#rover-shield-danger-pill`)**: ancora ao círculo de segurança ao redor do rover a medição real calculada da `%` de perigo não vetado retirada dos resultados Monte Carlo do sítio (`mc60` / `mc20`, ex.: `12,86% → 2,70% · −79%`) e a incidência local `> slopeLimitDeg` em `5 m`.
  - Ambos os modos mantêm a rota principal, rotas auxiliares e **raios solares amarelos flutuantes (`⚡`, `+180 Wh`)** posicionados apenas fora das sombras ao longo do trajeto para coleta educativa e recarga da bateria.

---

## 5. Estatísticas e Melhorias Percentuais da Multirresolução na Interface (Evidência Empírica)

Para evidenciar o ganho real da multirresolução na interface (no hover da Tela 2, no Inspetor `10×10 km`, no círculo verde ao redor do rover, no comparador **`⚖️ Comparar`** `#compare-panel` e no rodapé de **`#v18-sim-modal`**), exibem-se os ganhos percentuais reais calculados a partir dos resultados consolidados (`16` faixas reais LOLA, `POP = 100`, `1.600` travessias/célula e `26` sítios `PGDA 78`):
- **Redução média de perigos nos `26` sítios `PGDA 78` (`sites_master.json`, `60 m`):** perigo não vetado médio cai de `31,48%` (**Navegação Normal**) para `6,38%` (**Multirresolução `P90`**) → **`−79,7%`** de melhoria relativa; erro mediano cai de `1,04°` para `0,59°` (**`−42,9%`**).
- **`N0` (Base):** chegada `78,06%` (Multirresolução `60→5 m`) vs. `67,31%` (Normal `60 m`) → **`+16,0%` relativo** (`+10,75 pp`, McNemar `p = 3,3×10⁻³¹`, `OR = 5,99`, `r = 0,714`).
- **`N1` (Terreno perigoso `20,1% >15°`):** `48,62%` vs. `35,44%` → **`+37,2%` relativo** (`+13,19 pp`, Wilcoxon `p = 0,046`, McNemar `p = 3,3×10⁻⁴⁷`, `OR = 11,82`, `r = 0,905`; tombamento `-2,44 pp`).
- **`N2` (Incerteza + câmera reduzida):** `47,75%` vs. `35,44%` → **`+34,7%` relativo** (`+12,31 pp`, tombamento `-2,81 pp`, Wilcoxon `p = 0,012`).
- **`N3` (Degradação severa, escada `POP = 30`):** `40,0%` vs. `30,8%` → **`+30,0%` relativo** (Wilcoxon `p = 0,043`), frente a `21,7%` de chegada e `45,4%` de tombamento no modo normal sem escudo.
- **Cobertura real LOLA (`LDEC`):** apenas `7,29%` das células de `5 m` (`87,5°S–90°S`) possuem disparo real, fundamentando a regra *No False Relief* e o Escudo `P50/P90/P99`.

---

## 6. Prompt do Plano (Para Replicar em Outro Projeto com Mapa Lunar Mais Detalhado)

```text
Integre em uma única aplicação web estática de 3 telas um Cockpit de Missão Lunar conectado a dados reais de terreno em alta resolução comparando apenas duas variações — Navegação Normal (Sem Tese) × Multirresolução (Com Tese · Otimização + Escudo P50/P90/P99) — sem utilizar termos como "Marcato" ou referências a "IA" na interface:

1. TELA 1 — ESCOLHER ROVER & MISSÃO (HANGAR 3D):
   - Exiba um carrossel/lineup 3D (Three.js) com os 8 rovers (LRV Apollo, VIPER, LTV Artemis, MAPP, Sojourner, MER Spirit/Opportunity, Curiosity, Perseverance) e controles de ano (2025–2032), duração da missão e link direto Terra (DTE).
   - Conecte os parâmetros físicos do rover escolhido (bateria em Wh, geração solar em W, RTG, consumo no escuro, altura do mastro e limite de inclinação `slopeLimitDeg`) diretamente às equações de filtro da Tela 2, ao Escudo P50/P90/P99 e ao consumo/trajeto na Tela 3.

2. PRÉ-PROCESSAMENTO LEVE (PYTHON → JSON/BINÁRIO ESTÁTICO):
   - Gere um bundle estático leve (`sites_master.json` + recortes locais `10×10 km` em `200×200` células com `surf`, `slp5`, `slp20`, `slp60`, `ldecDen/ldecAny`, `slperr` e resultados reais Monte Carlo `mc60/mc20`) para que o navegador nunca leia GeoTIFFs brutos.

3. TELA 2 — MAPA LUNAR DETALHADO + FILTRO P90/P99 + INSPETOR 10×10 km:
   - Mantenha aparência natural lunar (sem cores artificiais fortes por padrão) com camadas alternáveis: Medição LOLA (`LDEC > 0`), Falsos Positivos do Escudo (`60m → 5m P90/P99`) e cobertura PGDA/LROC NAC.
   - Exiba no hover dos sítios auditados e no Inspetor `10×10 km` em cortina os percentuais reais de perigo não vetado e a redução percentual obtida pela Multirresolução (além do erro mediano e slider de Falso Alarme `5–30%`).

4. TELA 3 — SUPERFÍCIE 3D REAL + CÍRCULO DE SEGURANÇA COM % DE PERIGO + ZOOM-OUT LOLA:
   - Renderize o terreno 3D real sob o rover (`surf` + micro-relevo + luz solar SPICE + Escudo Direcional 3D e círculo verde de segurança ao redor do rover) mantendo o rover travado sem girar sozinho e alinhado à origem da trilha/escudo.
   - No círculo verde no entorno do rover, exiba a medição real calculada de `% de perigo não vetado` retirada dos resultados Monte Carlo do sítio (e o ganho percentual frente à Navegação Normal) junto da incidência local `> slopeLimitDeg` em `5 m`.
   - Utilize em toda a interface e simulação apenas duas variações: `Navegação Normal (Sem Tese)` e `Multirresolução (Com Tese)`.
   - Ao definir um destino no mini-mapa ou entrar no modo `🤖 Autônoma (Rota)`:
     * Abra uma simulação com zoom-out sobre o mapa atual sob o rover e seletor de grade LOLA (`60 m | 20 m | 5 m`), lado a lado (`Navegação Normal` × `Multirresolução`).
     * Anime enxames de 100 rovers por geração (`Gen 1..5`) convergindo para a rota segura e permita aceitar o plano clicando diretamente em um dos quadros.
   - Tanto no modo `🎮 Manual (Teclado)` quanto no `🤖 Autônoma (Rota)`, exiba a rota traçada, rotas auxiliares e raios amarelos flutuantes (`⚡`) apenas nas áreas iluminadas, além do botão/tecla `F` (`☀️ Sol`) e das melhorias percentuais consolidadas em todos os painéis comparativos (`+16,0%` N0, `+37,2%` N1, `+34,7%` N2, `+30,0%` N3 e `−79,7%` de perigos nos sítios PGDA 78).
```
