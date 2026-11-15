# Relatório Técnico-Científico Consolidado da Tese

**Tema:** Navegação, Segurança Geotécnica e Seleção Multirresolução de Sítios no Polo Sul Lunar ($60\text{ m} \to 20\text{ m} \to 5\text{ m}$) sob Incerteza Topográfica e Restrições de Missão  
**Status do Documento:** Redação estrutural e consolidação dos resultados validados (*Nota: a Seção 5.6 aguarda o término da bateria multirresolução `POP = 100` com e sem teto temporal em execução no cluster local*).

---

## 1. Introdução

O planejamento de missões lunares polares tripuladas e robóticas — com destaque para o programa **Artemis** e os módulos robóticos comerciais (*CLPS*) — concentra-se na faixa de alta latitude sul ($80^\circ\text{S}$ a $90^\circ\text{S}$), onde a baixa obliquidade axial lunar ($\approx 1{,}54^\circ$) produz extremos simultâneos de interesse científico e operacional: picos de iluminação quase contínua adjacentes a Regiões Permanentemente Sombreadas (*PSRs*) capazes de preservar voláteis e gelo de água.

Apesar desse protagonismo estratégico, a cartografia polar operacional convive com uma assimetria crítica de escala:

1. **Inexistência de iluminação global a $5\text{ m/px}$:** Os catálogos plurianuais de visibilidade solar e comunicação direta com a Terra (*DTE*, produto `PGDA 69` e estudos de referência como *Wueller et al., 2026*) são simulados em grades macroscópicas de $60\text{ m/px}$, $120\text{ m/px}$ ou $240\text{ m/px}$. Calcular mapas polares globais de iluminação em $5\text{ m/px}$ exige traçado de raios em escala cúbica $O(N^3)$, elevando o custo computacional em $12^3 = 1.728\times$ na passagem de $60\text{ m}$ para $5\text{ m}$.
2. **Esparsidade real dos levantamentos de $5\text{ m}$:** Embora o altímetro a laser `LOLA` (*Lunar Orbiter Laser Altimeter*) e o reajuste gravimétrico pós-`GRAIL` (`PGDA 78` e `PGDA 90`) forneçam grades nominais de $5\text{ m/px}$ em áreas selecionadas, a inspeção direta das contagens de disparo (`LDEC`) mostra que apenas **$7{,}29\%$** das células da calota polar ($87{,}5^\circ\text{S}\text{–}90^\circ\text{S}$) possuem disparo direto do laser a $5\text{ m}$ — os restantes **$92{,}71\%$** são interpolação matemática. Em termos da área esférica polar completa ($80^\circ\text{S}\text{–}90^\circ\text{S}$, $288.139\text{ km}^2$), somente **$0{,}70\%$** conta com tiro direto a $5\text{ m}$.
3. **Cegueira fotométrica no escuro:** Técnicas ópticas de *Shape-from-Shading* (`SfS` sobre imagens `LROC NAC`) recuperam micro-rugosidade em regiões iluminadas, mas não operam no interior de sombras projetadas e *PSRs*, enquanto a câmera `ShadowCam` (`KPLO/Danuri`) fornece imageamento de obstáculos por luz espalhada secundária ($\sim 1{,}7\text{–}2\text{ m/px}$) sem medir fluxo fotovoltaico nem substituir o referencial geodésico absoluto `Z`.
4. **Risco operacional oculto pela suavização:** Grades médias de $60\text{ m}$ ou $20\text{ m}$ filtram microcrateras decamétricas, escarpas afiladas e micro-taludes que derrubam landers e rovers (como exemplificado pelo tombamento do módulo *Athena IM-2* em março de 2025 e pelos desvios de emergência do rover *Pragyan / Chandrayaan-3* em agosto de 2023) e criam falsos positivos energéticos sob Sol rasante a $1{,}54^\circ$.

Diante desse quadro, esta tese propõe, implementa e audita um arcabouço integrado de **fusão topográfica multirresolução ($240 \to 60 \to 20 \to 5\text{ m}$)** com **escudo probabilístico conservador (`P50/P90/P99` e regra *No False Relief*)**, acoplado a **técnicas formais de otimização** (Programação Linear, Otimização Não-Linear com Restrições KKT, Planejamento por Custo Mínimo em Grade e Análise Multicritério `TOPSIS`) e **validação estocástica por Monte Carlo** em dados reais `LOLA/GRAIL`, `LROC NAC/SfS` e trajetórias reais de rover.

---

## 2. Objetivos

### 2.1 Objetivo Geral
Desenvolver e validar estatisticamente uma metodologia multirresolução e probabilística para seleção de sítios, avaliação de risco geotécnico-energético e planejamento de travessia de rovers no Polo Sul lunar, capaz de converter grades macroscópicas ($60\text{ m}$ e $20\text{ m}$) em estimativas seguras na escala de engenharia de $5\text{ m}$ sem inventar topografia onde o altímetro a laser não amostrou.

### 2.2 Objetivos Específicos
1. **Quantificar a lacuna observacional** dos $130$ sítios candidatos do catálogo *Wueller et al. (2026)* cruzando a cobertura real por disparo direto `LOLA` (`LDEC > 0`), tiles ajustados pós-`GRAIL` (`PGDA 78`) e grades contínuas (`PGDA 90` / `GDR`).
2. **Formular e calibrar a reconstrução multirresolução ($60/20\text{ m} \to 5\text{ m}$)** combinando convolução normalizada gaussiana dos resíduos locais do laser com atenuação de confiança em zonas interpoladas (*No False Relief*) e quantis de erro `P50/P90/P99`.
3. **Mensurar por Monte Carlo em dados reais** (*cross-validation* espacial sobre $26$ sítios `PGDA 78`, com controle justo de **mesmo falso alarme**) o ganho líquido da multirresolução versus o mero aumento uniforme da margem de segurança.
4. **Verificar de forma independente a modelagem de sombras e relevo** contra produtos `SfS 5 m` e `486` fotografias ortorretificadas da câmera `LROC NAC` usando geometria estereográfica esférica exata e efemérides `DE440`.
5. **Isolar por estudo de ablação e escada de dificuldade** a contribuição real de cada componente do pipeline — mapa multirresolução, escudo determinístico, Programação Linear (`Simplex`), Otimização Não-Linear (`Barreira Logarítmica / Pontos Interiores + Newton/KKT`), ajuste de pesos por Monte Carlo e Aprendizado de Máquina (`MLP` / `Rank-ES`) — definindo rigorosamente onde cada técnica agrega valor e **onde o uso de ML não é indicado**.
6. **Validar externamente o algoritmo em caso real documentado** (*Pragyan / Chandrayaan-3*, agosto de 2023) e em travessias reais `LOLA` sob múltiplos degraus de severidade de terreno e com remoção de teto temporal.

---

## 3. Dados e Estatística Descritiva

O acervo empírico reunido no projeto combina dados orbitais oficiais da NASA/GSFC, catálogos de sítios candidatos e produtos de missão publicados, organizados em cinco blocos auditáveis.

### 3.1 Catálogo Polar de Referência ($130$ Sítios — *Wueller et al., 2026*)
O arquivo `sites/artemis_sitios_wueller2026.csv` contém $130$ sítios candidatos distribuídos por $16$ regiões polares (de `Nº 1 PCB04` a $-83{,}3691^\circ$ até `Nº 130 CR08` a $-89{,}6319^\circ$), simulados originalmente em grade de $60\text{ m/px}$ e mastro de $2\text{ m}$ para o horizonte `2025–2032`.

| Variável (`N = 130`) | Média $\pm s$ | Mediana | $Q_1\text{–}Q_3$ ($\text{IQR}$) | Mín. – Máx. |
|---|---:|---:|---:|---:|
| Latitude planetocêntrica ($^\circ$) | $-86{,}42 \pm 1{,}87$ | $-86{,}16$ | $-88{,}07\text{ a }-84{,}85$ ($3{,}23$) | $-89{,}6319\text{ a }-83{,}3691$ |
| Sol contínuo `2025` (dias) | $12{,}77 \pm 9{,}34$ | $13{,}00$ | $4{,}25\text{–}17{,}00$ ($12{,}75$) | $0{,}00\text{–}32{,}00$ |
| Sol contínuo `2026` (dias) | $8{,}92 \pm 7{,}82$ | $8{,}00$ | $0{,}25\text{–}16{,}75$ ($16{,}50$) | $0{,}00\text{–}21{,}00$ |
| Sol contínuo `2028` (dias) | $8{,}29 \pm 6{,}01$ | $9{,}00$ | $2{,}25\text{–}13{,}00$ ($10{,}75$) | $0{,}00\text{–}20{,}00$ |
| Sol contínuo `2032` (dias) | $13{,}94 \pm 8{,}00$ | $12{,}00$ | $10{,}00\text{–}17{,}00$ ($7{,}00$) | $0{,}00\text{–}30{,}00$ |
| Sol + Terra (`DTE`) `2025` (dias) | $11{,}61 \pm 8{,}70$ | $11{,}50$ | $4{,}00\text{–}16{,}75$ ($12{,}75$) | $0{,}00\text{–}32{,}00$ |
| Sol + Terra (`DTE`) `2026` (dias) | $8{,}09 \pm 7{,}57$ | $7{,}00$ | $0{,}00\text{–}15{,}00$ ($15{,}00$) | $0{,}00\text{–}21{,}00$ |
| Sol + Terra (`DTE`) `2028` (dias) | $7{,}88 \pm 5{,}85$ | $9{,}00$ | $2{,}00\text{–}12{,}75$ ($10{,}75$) | $0{,}00\text{–}17{,}00$ |
| Área de *PSR* acessível até $2\text{ km}$ ($\text{m}^2$) | $177.202{,}7 \pm 417.145{,}2$ | $30.750{,}0$ | $0{,}0\text{–}145.200{,}0$ ($145.200{,}0$) | $0{,}0\text{–}3.322.004{,}0$ |

Nota-se elevada assimetria na disponibilidade de *PSRs* (mediana $30.750\text{ m}^2$, IQR $145.200\text{ m}^2$, máximo $3{,}32\text{ km}^2$) e forte variabilidade interanual das janelas contínuas de luz (`2026` mediana $8{,}00\text{ d}$ contra `2025` mediana $13{,}00\text{ d}$).

### 3.2 Cobertura Real de Tiros LOLA (`LDEC`) e Estratos de Resolução
A auditoria pixel a pixel de `LDEC_875S_5M` sobre a calota $87{,}5^\circ\text{S}\text{–}90^\circ\text{S}$ ($30.336 \times 30.336\text{ px}$) e o cruzamento espacial com os $130$ sítios (`resumo.json`) revelam:

- **Fração com pelo menos 1 tiro real LOLA por escala de agregação:** $5\text{ m}$ = **$7{,}29\%$** (`7,287%`); $10\text{ m}$ = **$25{,}90\%$** (`25,903%`); $20\text{ m}$ = **$67{,}97\%$** (`67,968%`); $40\text{ m}$ = **$95{,}93\%$** (`95,928%`); $60\text{ m}$ = **$99{,}40\%$** (`99,404%`).
- **Estratificação da melhor grade disponível entre os $130$ sítios:**
  - **$104$ sítios ($80{,}0\%$):** cobertos por blocos ajustados `PGDA 78` de $5\text{ m/px}$ (distribuídos em $14$ recortes; mediana de apenas **$7{,}6\%$** de pixels com tiro real `LDEC > 0` dentro da elipse de pouso de $100\text{ m}$, variando de $0{,}08\%$ a $21{,}24\%$); destes, $42$ estão acima de $87{,}5^\circ\text{S}$.
  - **$12$ sítios ($9{,}2\%$):** melhor grade disponível de $10\text{ m/px}$ (`GDR 85°S–90°S`), concentrados em `SP` ($11$) e `MMP01` ($1$).
  - **$14$ sítios ($10{,}8\%$):** melhor grade disponível de $20\text{ m/px}$ (`GDR 80°S–90°S`), concentrados em `PCB` ($5$) e `MMP` ($9$).
  - Todos os **$26$ sítios sem cobertura de $5\text{ m}$** pertencem às três regiões incorporadas/revisadas em outubro de 2024 (`PCB`, `SP`, `MMP`).

### 3.3 Base do Monte Carlo em Dados Reais (`PGDA 78`)
Dos $27$ blocos `PGDA 78` ($5\text{ m/px}$ pós-`GRAIL`, contendo camadas `surf`, `slp`, `ldec`, `toterr`, `slperr` em `float32`), excluiu-se `Site20` por sobreposição central exata com `Site20v2`, resultando em **$26$ sítios independentes**: `DM1`, `DM2`, `Haworth`, `LM1`–`LM8`, `NPA`–`NPD`, `SL2`, `SL3`, `Shoemaker`, `Site01`, `Site04`, `Site06`, `Site07`, `Site11`, `Site20v2`, `Site23`, `Site42`. Em cada sítio avaliou-se o recorte central de $2.000 \times 2.000$ células ($10 \times 10\text{ km}$).

### 3.4 Base Óptica Independente (`SfS 5 m` + `LROC NAC`)
Utilizaram-se os três blocos `SfS ELEV 5 m/px` ($16 \times 16\text{ km}$, produtos `A3CLR22` #10, #9 e #8 de *Bertone et al., 2026*) sobre **Leibnitz Beta** ($85{,}4^\circ\text{S}$), **de Gerlache Rim** e **Peak Near Shackleton**, avaliados em grade de $2.523$ observadores ($841$ por região) e confrontados contra todas as **$486$ fotografias ortorretificadas `LROC NAC`** ($120$ em Leibnitz, $194$ em de Gerlache, $172$ em Peak Near Shackleton).

### 3.5 Base de Travessia em Relevo Real (`LOLA`) e Terrenos Sintéticos
- **Treino/Validação/Teste em Relevo Real (`animacao_tese_rover_neuroevolucao_v18.html`):** $52$ faixas de $3\text{ km} \times 550\text{ m}$ ($600 \times 110$ células de $5\text{ m}$), $2$ por sítio `PGDA 78`, selecionadas com $\approx 4{,}9\%$ de células acima de $15^\circ$: $34$ faixas de treino ($17$ sítios), $2$ de validação (`Site04`) e **$16$ faixas inéditas de teste** ($8$ sítios estratificados em aspereza: `Site23`, `Site42`, `Site11`, `LM8`, `Site20v2`, `LM3`, `NPB`, `Shoemaker`).
- **Ablação Pareada Controlada:** $30$ terrenos sintéticos inéditos calibrados (sementes `7101–7130`, $60$ rovers pareados por terreno = $1.800$ pares por transição).
- **Validação Externa (*Pragyan / Chandrayaan-3*):** Trilha real e crateras em *South Crater* ($69{,}37^\circ\text{S}$, $23\text{–}27/08/2023$, digitalizada de *Stooke, LPSC 2025 #1025*) escalonada em $12:1$ ($3\text{ m} \to 25\text{ cm}$, $7{,}29\%$ de células medidas) com $500$ realizações Monte Carlo.

---

## 4. Metodologia

Para assegurar clareza metodológica e rastreabilidade científica perante banca avaliadora, o método é estruturado em cinco frentes independentes e auditáveis.

### 4.1 Modelagem Física Polar e Geodésica
1. **Projeção Estereográfica Polar Sul:** Coordenadas planetocêntricas $(\varphi, \lambda)$ em radianos no referencial `MOON_ME` são projetadas no plano tangente sul ($\varphi_0 = -\pi/2$, raio lunar médio $R_{\text{Lua}} = 1.737.400\text{ m}$):
   $$r(\varphi) = 2\,R_{\text{Lua}} \tan\!\left(\frac{\frac{\pi}{2} + \varphi}{2}\right), \qquad x = r(\varphi)\,\sin\lambda, \qquad y = r(\varphi)\,\cos\lambda$$
2. **Máscara de Horizonte com Curvatura Esférica:** Para um observador $P_0 = (x_0, y_0, Z_0 + h_{\text{mastro}})$ e um pixel a distância planar $d_k$ na direção azimutal $\phi$, o ângulo de elevação do horizonte incorpora o abatimento esférico $d_k^2 / (2 R_{\text{Lua}})$:
   $$\alpha(\phi) = \max_{d_k \le d_{\text{máx}}} \arctan\!\left(\frac{(Z_k - Z_0 - h_{\text{mastro}}) - \dfrac{d_k^2}{2 R_{\text{Lua}}}}{d_k}\right)$$
3. **Efemérides `DE440` e Correção Escalar Crítica:** As posições horárias de Sol e Terra são calculadas diretamente a partir de `de440s.bsp` e `moon_pa_de440_200625.bpc`. Durante a auditoria do repositório, identificou-se e isolou-se um erro de escala legado nos scripts originais de pré-cálculo (`111.320 m/grau` terrestre no lugar de `30.323 m/grau` lunar), que encurtava raios de horizonte em $\sim 3{,}7\times$; todas as verificações físicas recentes (`sfs_comparacao` e simulação de rover) operam em geometria estereográfica lunar exata.

### 4.2 Extrapolação e Fusão Multirresolução ($240 \to 60 \to 20 \to 5\text{ m}$)
1. **Atenuação Log-Linear de Iluminação e Incerteza Analítica:** A degradação sistemática de visibilidade solar ao passar de $A_{\text{macro}}$ para $A = 25\text{ m}^2$ ($5\text{ m}$) é expressa por $L(A) = L(A_{\text{macro}}) - k_{\text{sombra}}(S)\ln(A_{\text{macro}}/A)$, combinada à equação de incerteza vertical de *Barker et al. (2021)* ($\varepsilon(R, S) = 0{,}0210\,R + 0{,}0051\,S + 0{,}022$) e à atenuação pela altura do mastro $f_{\text{mastro}}(h) = e^{-0{,}42(h - 1{,}0)}$.
2. **Reconstrução Local por Convolução Normalizada Gaussiana e Regra *No False Relief*:** Dada uma grade grossa (média em blocos $12\times 12$ para $60\text{ m}$ ou $4\times 4$ para $20\text{ m}$, reamostrada bilinearmente para $5\text{ m}$):
   - Calcula-se o resíduo altimétrico $r_i = Z_{\text{LOLA}} - Z_{\text{grade}}$ **exclusivamente** nas células medidas por disparo direto (`LDEC > 0`);
   - Espalha-se o resíduo por convolução gaussiana normalizada com $\sigma$ igual à metade do espaçamento médio entre disparos;
   - Multiplica-se o campo espalhado pelo peso de confiança local $w_c = \rho / (\rho + 0{,}02)$, impondo que, longe de medições diretas ($\rho \to 0$), o resíduo tenda a zero (*No False Relief*: o algoritmo não fabrica relevo sintético onde o laser não passou);
   - Nas células com tiro direto (`LDEC > 0`), preserva-se o valor medido, e calcula-se o declive pelo mesmo gradiente central do produto oficial `PGDA 78` (diferença média verificada contra `slp.tif` de $\approx 0{,}001^\circ$).
3. **Escudo Probabilístico (`P50 / P90 / P99`):** Cada célula estimada recebe uma margem assimétrica $\Delta S$ — menor perto de disparos diretos e maior em zonas interpoladas (ex.: nominal `P90`: $+2{,}03^\circ$ perto / $+3{,}56^\circ$ longe; calibrada `P90` em `PGDA 78`: $+2{,}99^\circ$ perto / $+2{,}78^\circ$ longe) — sendo vetada no planejamento quando $\hat{S} + \Delta S > S_{\text{lim}}$ ($15^\circ$ no rover; $8^\circ$ no pouso), mantendo margem zero apenas onde câmera ou `IMU` a bordo já mediram diretamente o terreno.

### 4.3 Técnicas de Otimização e Calibração por Monte Carlo
Em vez de heurísticas ad hoc, o pipeline emprega cinco famílias clássicas de otimização matemática, cada qual em sua camada apropriada:

| Camada do Problema | Técnica Matemática Empregada | Formulação e Papel no Pipeline |
|---|---|---|
| **Despacho energético solar / sombra (solo)** | **Programação Linear — Método Simplex de Duas Fases + Dualidade (Preço-Sombra)** | `simplexDuasFases`: maximiza $c^\top x$ sujeito a restrições lineares ($\le, \ge, =$) de carga/descarga de bateria, horizonte solar e meta operacional em segmentos da travessia; extrai os preços-sombra duais $\pi_{\text{bat}}$ da restrição energética para modular a cautela nas decisões subsequentes. |
| **Controle contínuo a bordo e sintonia de pesos** | **Otimização Não-Linear com Restrições — Método de Pontos Interiores (Barreira Logarítmica) + Newton Multivariado com Regularização SPD e *Backtracking* + Condições KKT** | Em tempo de decisão (`2×2` para velocidade e ângulo de esterçamento) e na calibração de $7$ pesos (`7×7`), resolve $\min \Phi(x) - \mu \sum \ln(-g_k(x))$ sob restrições de obstáculo, bateria e inclinação limite, extraindo multiplicadores duais KKT ($\lambda_{\text{obst}}, \lambda_{\text{bat}}, \lambda_{\text{lim}}$) e folgas complementares para impor recarga ou desvio suave. |
| **Planejamento de rota em grade** | **Otimização em Grafos — Algoritmo de Dijkstra (8-vizinhos) com Barreira Contínua** | Planeja rotas globais em solo (e replaneja a bordo após panorâmica de $360^\circ$ caso o avanço seja $< 10\text{ m}$ em $40\text{ s}$) minimizando custo composto de distância, declive esperado + margem e penalização contínua por zona interpolada, substituindo o bloqueio binário que antes falhava em encontrar corredor passável. |
| **Ranqueamento multicritério de sítios** | **Otimização Multicritério `TOPSIS`** | Ordena os sítios viáveis de *Wueller et al. (2026)* após filtros rígidos (*Hard Constraints*) usando normalização vetorial $r_{ik} = x_{ik}/\sqrt{\sum_j x_{jk}^2}$, ponderação $v_{ik} = w_k r_{ik}$ e índice de proximidade relativa $R_i = d_i^- / (d_i^+ + d_i^-)$ às soluções ideal e anti-ideal sobre Sol em $5\text{ m}$, segurança na elipse de pouso, área de *PSR* e estabilidade interanual. |
| **Calibração e controle de incerteza** | **Monte Carlo em Dados Reais + Bisseção de Mesmo Falso Alarme** | `5-fold cross-validation` sobre células `LDEC > 0` com $100$ sorteios $\mathcal{N}(\text{slp}, \text{slperr})$ por sítio; no simulador dinâmico, gera realizações espaciais correlacionadas por suavização gaussiana de $20\text{ m}$ vezes `slperr` (evitando degraus falsos entre pixels vizinhos). Na comparação justa `grade × tese`, calibra a margem uniforme da grade por **bisseção** até igualar exatamente a fração de falso alarme da tese (diferença máxima obtida de $0{,}02\text{ pp}$). |

### 4.4 Aprendizado de Máquina (`MLP`, `IA Híbrida`, `Rank-ES`) e Onde ML **NÃO** é Indicado
Uma contribuição metodológica central deste trabalho é delimitar **com evidência experimental negativa e positiva** onde técnicas de Aprendizado de Máquina (`ML`) fazem sentido e onde **não devem ser usadas**:

1. **Onde ML NÃO é indicado na cadeia topográfica e decisória:**
   - **Nos coeficientes ou na interpolação `60 m → 5 m` / `20 m → 5 m`:** O micro-relevo de crateras de um sítio não guarda relação causal aprendível por caixa-preta com crateras de outro quadrante distante a partir de grades de $60\text{–}240\text{ m}$. Usar ML para "prever" pixels de $5\text{ m}$ violaria a regra *No False Relief* e introduziria alucinações topográficas sem garantia geodésica. Por isso, a tese **não usa ML** nos coeficientes de fusão (apenas convolução geométrica dos tiros reais `LOLA` e erro publicado `slperr`/`Barker 2021`).
   - **Em mapas estáticos e determinísticos:** Quando o ambiente e o horizonte são conhecidos e determinísticos, algoritmos exatos de busca/otimização (`Dijkstra`, `A*`, Programação Linear) já encontram o ótimo global; ML nesse contexto produz apenas *overfitting* de rota.
   - **Como piloto soberano autônomo ou aprendizado online a bordo:** Deixar uma rede neural dirigir sem escudo determinístico ou aprender em voo é física e operacionalmente indefensável perante o *Sim-to-Real Gap*, risco de *Reward Hacking* (ex.: estacionar indefinidamente ao Sol para evitar tombamento) e limitações de processadores espaciais endurecidos à radiação.
   - **Para substituir a lógica energética determinística em ambientes com teto de sombra (`Ablação D3 → D4a/D4b`):** Nos testes controlados em $30$ terrenos inéditos, substituir o controlador baseado em regras + escudo completo por uma rede **`MLP 8→7→4`** sob escudo (`D4a`) reduziu a chegada à PSR em **$-5{,}1\text{ pp}$** (`95,9% → 90,9%`, McNemar por rover $p = 5{,}2 \times 10^{-10}$), elevando os congelamentos acima de $50\text{ h}$ de $54$ (`D2`) para $123$. Da mesma forma, a **`IA Híbrida 14→8→3`** sob escudo apenas direcional (`D4b`) derrubou a chegada em **$-13{,}9\text{ pp}$** (`95,9% → 82,1%`, McNemar $p = 9 \times 10^{-42}$): embora tenha reduzido quedas por relevo para apenas $0{,}4\%$ ($8$ em $1.800$ rovers), multiplicou os congelamentos no escuro para $231$ rovers ($12{,}8\%$) e desvios para fora do corredor ($53$ rovers) por não internalizar o horizonte energético.
   - **Para treinar políticas passo a passo sobre poucas faixas reais por geração (`Rank-ES` no relevo real):** Na evolução online geracional (`H_lola` em $8$ e $30$ gerações no relevo real LOLA, com ou sem Monte Carlo), o treino não superou o pré-treino sintético nem a regra determinística (`78,4%` vs `78,8%` com $p = 0{,}65$; e `44,8%` vs `44,2%` com $p = 0,75$ na rodada pré-correção), pois cada geração avalia uma faixa cuja aspereza intrínseca oscila de $0\%$ a $100\%$ e mascara o gradiente da Estratégia Evolutiva.
2. **Papel legítimo e restrito para ML neste domínio:**
   - **Ajuste secundário *offline* de pesos ou apoio/alerta subordinado a um *Safety Shield* soberano (`P90/P99` completo):** Quando usada *offline* para sintonizar os $7$ pesos da função objetivo não-linear (`D3`, ou `MT_ia_nom_P90`: $79{,}1\%$ chegada e $0{,}6\%$ tombamento no relevo real sintético→real) ou para atuar apenas sob escudo completo energético + geotécnico (`H_sint10_nom`: $79{,}7\%$ chegada no teste base), a IA mantém ou iguala o piso da regra determinística, sem contudo gerar salto transformador sobre ela — confirmando que **a contribuição estrutural vencedora reside na informação multirresolução do mapa e no escudo determinístico**, não na complexidade neural.

### 4.5 Simulações Dinâmicas de Rover e Validação Externa
1. **Escala Realista e Regras Físicas (`animacao_tese_rover_neuroevolucao_v18.html`):** Velocidade em escala realista ($1\text{ cm/s}$ físicos escalonados ao corredor), hibernação em sombra $\le 50\text{ h}$ (critério tipo *VIPER*), reflexo de `IMU` calibrado para $14{,}5^\circ$ (corrigido do limiar original de $13{,}0^\circ$ que disparava falsos alarmes em terreno legal de $13^\circ\text{–}15^\circ$), tombamento incondicional acima de $25^\circ$, fuga inteligente simétrica nos dois times e replanejamento a bordo por panorâmica $360^\circ$.
2. **Escada de Dificuldade ($N0 \to N3$) e Remoção de Teto:** Para evitar que o teto temporal (`T_MAX = 800 s`, que iguala ~15–20% de falhas por "tempo esgotado" em qualquer mapa) mascare a diferença entre resoluções (`60 m` vs `20 m` vs `5 m`), a bateria definitiva compara `8` configurações pareadas (`R60`, `RT_nom`, `R20`, `R20_marg`, `RT20`, `RLOLA5`, `RLOLA5_marg`, `R_oraculo`) em `POP = 100` por faixa ($1.600$ travessias por célula) em quatro níveis progressivos (`N0` base $4{,}9\% > 15^\circ$; `N1` relevo $\times 1{,}3 \Rightarrow 20{,}1\% > 15^\circ$; `N2` `N1` + erro real $\times 1{,}5$ + câmera $\times 0{,}75$; `N3` `N1` + erro real $\times 2{,}0$ + câmera $\times 0{,}5$ e $35\%$ de perda + sem replanejamento) em **duas baterias completas**: **com teto (`800 s`)** e **sem teto (`4.000 s`)**, registrando também fração de **perigo real atravessado** ($> 15^\circ$).

### 4.6 Técnicas e Ferramentas Expressamente Descartadas (Auditoria Metodológica)
Além das restrições ao uso de ML listadas na Seção 4.4, o projeto auditou e descartou explicitamente todas as ferramentas ou abordagens tecnicamente contraindicadas para o domínio lunar polar:
- **GMAT (NASA):** descartado para análise de risco superficial por simular órbitas e manobras espaciais, não topografia local nem mobilidade de rover (`slperr` do `PGDA 78` cumpre esse papel diretamente).
- **Cesium Moon Terrain para cálculos físicos:** restrito exclusivamente à visualização, por apresentar relato de deslocamento altimétrico de $\sim 2{,}5\text{ km}$ acima do referencial geodésico `LOLA`.
- **Carregamento integral do DEM polar em RAM e ray-tracing global a $5\text{ m}$:** inviáveis operacionalmente ($O(N^3)$, $1.728\times$ mais custoso que $60\text{ m}$), substituídos por leitura em janela espacial e calibração multirresolução.
- **Simplex ou Algoritmo Genético para escolher janela de pouso estática:** substituídos por enumeração direta em milissegundos; o `Simplex de Duas Fases` é reservado ao problema contínuo de despacho energético solar ao longo da travessia.
- **`Branch & Bound` e `A*/PD` como módulos separados no simulador dinâmico:** ausentes do controlador final; o roteamento em grade utiliza `Dijkstra` 8-vizinhos com barreira contínua.
- **Margem proporcional apenas ao declive da própria grade grossa:** descartada nas curvas de troca porque, sobre um único mapa, apenas reordena exatamente as mesmas células sem introduzir informação espacial dos disparos LOLA.
- **Fator plano terrestre (`111.320 m/grau`) legado:** corrigido nos scripts físicos para projeção estereográfica exata com raio lunar ($30.323\text{ m/grau}$).

---

## 5. Resultados Consolidados

### 5.1 Cobertura Observacional LOLA (`LDEC` e `PGDA 78`)
Os resultados da Seção 3.2 demonstram quantitativamente o paradoxo do mapa de $5\text{ m}$: enquanto `99,40%` da calota polar recebe ao menos um tiro dentro de uma célula de $60\text{ m}$ e `67,97%` em $20\text{ m}$, apenas **`7,29%`** das células de $5\text{ m}$ são medidas diretamente (`7,6%` em mediana na elipse de pouso dos `104` sítios `PGDA 78`). Nos cinco marcos históricos (`2007–2023`), mesmo após o ajuste gravimétrico pós-`GRAIL`, o avanço real em $5\text{ m}$ medido diretamente é de apenas `6,14%` sobre os `130` sítios (`73,86%` interpolado; `9,23%` em $10\text{ m}$; `10,77%` em $20\text{ m}$).

### 5.2 Monte Carlo em Dados Reais (`26` Sítios `PGDA 78`, `100` Sorteios/Sítio)

| Partida e Método | Perigo real não vetado (mediana entre $26$ sítios) | Falso alarme (mediana) | Erro mediano do declive | Tese melhor em | Wilcoxon pareado ($N = 26$) |
|---|---:|---:|---:|:---:|---|
| Grade $60\text{ m}$ (sem margem) | $28{,}7\%$ | $4{,}7\%$ | $1{,}08^\circ$ | — | — |
| Grade $60\text{ m}$ + margem (mesmo alarme da Tese `P90`) | $6{,}45\%$ | $\approx 17{,}9\%$ | — | — | — |
| **Tese `P90` ($60 \to 5\text{ m}$, nominal)** | **$3{,}88\%$** (`3,9%`) | $17{,}9\%$ | $0{,}61^\circ$ | **$26 / 26$ sítios** | $p = 3 \times 10^{-8}$ (redução **$38{,}5\%$** [IQR $32\text{–}44\%$]) |
| Tese `P90` ($60 \to 5\text{ m}$, calibrada) | $3{,}44\%$ | $19{,}2\%$ | — | $22/26$ vs nominal | $p = 1{,}6 \times 10^{-5}$ (mas veta mais que $17{,}9\%$) |
| Grade $20\text{ m}$ (sem margem) | $23{,}6\%$ | — | $0{,}55^\circ$ | — | — |
| Grade $20\text{ m}$ + margem (mesmo alarme da Tese `20→5 m`) | $3{,}57\%$ | — | — | — | — |
| **Tese `P90` ($20 \to 5\text{ m}$)** | **$3{,}19\%$** (`3,2%`) | — | $0{,}47^\circ$ | **$24 / 26$ sítios** | $p = 7{,}5 \times 10^{-7}$ (redução **$12\%$** [IQR $7\text{–}16\%$]) |

**Achados estatísticos centrais do Monte Carlo real:**
1. **A maior parte do ganho absoluto vem da margem de incerteza** (`28,7% → 6,45%` ao pôr margem ajustada na grade de $60\text{ m}$).
2. **A multirresolução agrega ganho próprio, consistente e crescente com a aspereza:** Mantendo rigorosamente o mesmo falso alarme, a fusão $60 \to 5\text{ m}$ reduz o perigo não vetado em **$38{,}5\%$** em mediana (`6,45% → 3,88%`, $26/26$ sítios, $p = 3 \times 10^{-8}$), com forte correlação de Spearman entre o ganho obtido e o perigo ocultado pela grade ($\rho = 0{,}91$, $p \approx 8 \times 10^{-11}$).
3. **Efeito do degrau de $20\text{ m}$:** Partindo de $20\text{ m}$, o ganho relativo cai para $12\%$ ($24/26$ sítios, $p = 7{,}5 \times 10^{-7}$). Comparando Tese $60 \to 5\text{ m}$ ($3{,}88\%$) contra Grade $20\text{ m}$ com margem no mesmo falso alarme ($3{,}57\%$), a grade de $20\text{ m}$ com margem ainda leva pequena vantagem ($3/26$, $p = 1{,}7 \times 10^{-4}$), mas a Tese $60 \to 5\text{ m}$ supera amplamente a Grade $20\text{ m}$ sem margem ($26/26$).
4. **Dominância completa nas curvas de troca (`FA 5% → 30%` em $60\text{ m}$):** Varrendo a margem de zero ao máximo sobre $20$ sorteios independentes, a Tese reduz o perigo não vetado em **toda a faixa de falso alarme**, de **$29\%$ a $42\%$ menos perigo** ($26/26$ sítios de $5\%$ a $25\%$, $p = 3 \times 10^{-8}$; $25/26$ em $30\%$, $p = 6 \times 10^{-8}$):

| Falso Alarme Fixado (`60 m`) | $5\%$ | $10\%$ | $15\%$ | $20\%$ | $25\%$ | $30\%$ |
|---|---:|---:|---:|---:|---:|---:|
| Grade $60\text{ m}$ (margem uniforme) | $23{,}3\%$ | $14{,}3\%$ | $10{,}1\%$ | $6{,}9\%$ | $4{,}7\%$ | $3{,}5\%$ |
| **Tese $60 \to 5\text{ m}$ (margem por densidade)** | **$16{,}6\%$** | **$9{,}5\%$** | **$6{,}0\%$** | **$4{,}1\%$** | **$3{,}1\%$** | **$2{,}1\%$** |
| Redução mediana do perigo (Tese vs Grade) | **$29\%$** | **$35\%$** | **$38\%$** | **$40\%$** | **$41\%$** | **$42\%$** |

### 5.3 Validação Independente por `SfS 5 m` e `486` Fotos Reais `LROC NAC`
1. **Calibração das margens usando `SfS 5 m` como referência externa:** As taxas empíricas de excedência sobre as $3$ regiões (`Leibnitz Beta`, `de Gerlache Rim`, `Peak Near Shackleton`) confirmaram que a margem nominal `P99` ($5{,}65^\circ$) atinge excedência de $0{,}7\%\text{–}1{,}5\%$ (aderente ao nominal $1\%$) e a `P90` ($3{,}56^\circ$) opera conservadora em $3{,}3\%\text{–}6{,}0\%$ (abaixo do nominal $10\%$), derrubando perigos não vistos da grade $60\text{ m}$ ($12{,}2\%\text{–}41{,}0\%$) para $0{,}7\%\text{–}2{,}2\%$.
2. **Conferência pixel a pixel contra todas as `486` fotos `LROC NAC` (geometria lunar + `DE440`):** O cálculo de sombra confere com as imagens reais em **$94\%\text{ a }96\%$** dos pixels; nas duas regiões polares completas ($366$ fotos), a taxa de **luz falsa** (erro perigoso de prever luz onde a foto mostra sombra) cai continuamente com o refinamento da grade: `9,1%` em LOLA `240 m` $\to$ `5,7%` em `60 m` $\to$ `3,4%` em `20 m` $\to$ `3,6%` em `LOLA 5 m` $\to$ **`2,1%`** em `SfS 5 m`.

### 5.4 Ablação Pareada (`D0 → D4b`, `30` Terrenos) e Validação Externa (*Pragyan*)

| Degrau | Descrição | Chegada à PSR (% média $\pm$ dp · med [IQR]) | $\Delta$ PSR vs Anterior (Holm $p$ / McNemar $p$) | Leitura Científica |
|---|---|---:|---|---|
| `D0` | Base ingênua $60\text{ m}$ + câmera + reflexo | $0{,}4 \pm 1{,}6\%$ · $0\%$ [$0\text{–}0$] | — | Colapso quase total sem escudo nem horizonte |
| `D1a` | + Escudo `P90` / portos $\le 50\text{ h}$ em $60\text{ m}$ | $53{,}0 \pm 22{,}1\%$ · $56{,}7\%$ [$32{,}9\text{–}69{,}2$] | $+52{,}6\text{ pp}$ ($p = 1{,}6 \times 10^{-5}$ / $3{,}6 \times 10^{-282}$) | Salto fundamental das travas físicas de segurança |
| `D1b` | + Programação Linear (`Simplex` + preço-sombra) em $60\text{ m}$ | $53{,}0 \pm 22{,}1\%$ (idêntico) | $0{,}0\text{ pp}$ ($p = 1$ / $1$) | `Simplex` sozinho não altera rota em mapa cego a $60\text{ m}$ |
| `D1c` | + Otimização Não-Linear (`Barreira Log. + Newton/KKT`) em $60\text{ m}$ | $56{,}3 \pm 21{,}5\%$ · $57{,}5\%$ [$43{,}8\text{–}70{,}0$] | $+3{,}3\text{ pp}$ ($p = 0{,}34$ / $0{,}096$) | Ganho pequeno em $60\text{ m}$, não significativo após Holm |
| **`D2`** | **+ Multirresolução $60 \to 5\text{ m}$ (`P90`, *No False Relief*)** | **$95{,}2 \pm 7{,}7\%$ · $98{,}3\%$ [$93{,}3\text{–}100$]** | **$+38{,}9\text{ pp}$ ($p = 1{,}6 \times 10^{-5}$ / $1{,}4 \times 10^{-162}$)** | **Principal contribuição da tese** (e `C2r` sem KKT já salta $+42{,}2\text{ pp}$) |
| `D3` | + Pesos da função objetivo evoluídos *offline* ($10$ ger.) | $95{,}9 \pm 5{,}6\%$ · $98{,}3\%$ [$96{,}7\text{–}100$] | $+0{,}7\text{ pp}$ ($p = 1$ / $0{,}85$) | Sem ganho adicional estatisticamente significativo (efeito teto) |
| `D4a` | + Rede Neural `MLP 8→7→4` sob escudo | $90{,}9 \pm 19{,}7\%$ · $98{,}3\%$ [$95{,}4\text{–}100$] | **$-5{,}1\text{ pp}$** ($p = 1$ / **$5{,}2 \times 10^{-10}$**) | **Piora por rover** (`123` congelamentos $> 50\text{ h}$ vs `54` em `D2`) |
| `D4b` | + `IA Híbrida 14→8→3` sob escudo direcional | $82{,}1 \pm 29{,}7\%$ · $96{,}7\%$ [$87{,}5\text{–}98{,}3$] | **$-13{,}9\text{ pp}$** ($p = 0{,}15$ / **$9 \times 10^{-42}$**) | **Piora severa**: menos tombamento ($0{,}4\%$), mas `231` congelamentos |

Adicionalmente, a concordância ordinal de custo das $4$ rotas contra o relevo real medida por $\tau$ de Kendall sobe de **$+0{,}18$** na grade $60\text{ m}$ (`5/30` terrenos escolhem a rota ótima real) para **$+0{,}69$** com a tese (`20/30` terrenos).

**Validação Externa — Trajetória Real do *Pragyan / Chandrayaan-3* (`500` sorteios MC, escala $12:1$):**
- **Grade grossa de $3\text{ m}$ (equivalente a $60\text{ m}$):** entra em perigo real (cratera de $4\text{ m}$ a $\approx 11\text{ m}$ do início) em **`99,4%`** dos sorteios (comprimento mediano $18{,}8\text{ m}$, repetindo o erro real da missão que perdeu $12{,}3\text{ m}$ em ida e volta);
- **Tese $3\text{ m} \to 25\text{ cm}$ (`P90`, $7{,}29\%$ medidos):** falha em apenas **`6,0%`** dos sorteios (comprimento mediano $21{,}9\text{ m}$, idêntico à referência do relevo real de $0\%$ e $21{,}9\text{ m}$, McNemar $b/c = 467/0$, $p \approx 5 \times 10^{-141}$).

### 5.5 Escada de Dificuldade em Relevo Real (`60 m`, `POP = 30`, `N0–N3`)
Na primeira rodada da escada de dificuldade (`exp_dif.js`, $16$ faixas reais LOLA, `POP = 30`, `480` travessias/célula):

| Nível | Cenário | Rover A (`D0`) | Grade $60\text{ m}$ (`R60`) | **Tese `60→5 m` (`RT_nom`)** | Otimizador KKT Fixo (`M_fixo`) | IA Híbrida (`H_sint`) | Wilcoxon Tese × `R60` (chegada) |
|---|---|---:|---:|---:|---:|---:|---|
| `N0` | Base ($4{,}9\% > 15^\circ$) | $71{,}7\%$ / $2{,}3\%$ | $66{,}5\%$ / $3{,}1\%$ | **$77{,}3\%$ / $1{,}2\%$** | $78{,}1\%$ / $1{,}2\%$ | $77{,}7\%$ / $2{,}3\%$ | $+10{,}8\text{ pp}$ ($p = 0{,}12$) |
| `N1` | Relevo $\times 1{,}3$ ($20{,}1\% > 15^\circ$) | $33{,}3\%$ / $10{,}0\%$ | $34{,}2\%$ / $8{,}5\%$ | **$47{,}5\%$ / $8{,}3\%$** | $48{,}1\%$ / $8{,}3\%$ | $46{,}2\%$ / $13{,}3\%$ | $+13{,}3\text{ pp}$ ($p = 0{,}068$) |
| `N2` | `N1` + erro $\times 1{,}5$ + câm. $\times 0{,}75$ | $27{,}9\%$ / $13{,}3\%$ | $33{,}1\%$ / $15{,}4\%$ | **$44{,}2\%$ / $12{,}7\%$** | $43{,}8\%$ / $10{,}4\%$ | $42{,}9\%$ / $12{,}5\%$ | **$+11{,}0\text{ pp}$ ($p = 0{,}018$)** |
| `N3` | `N1` + erro $\times 2$ + câm. degrad. + s/ replan. | $21{,}7\%$ / $45{,}4\%$ | $30{,}8\%$ / $18{,}3\%$ | **$40{,}0\%$ / $16{,}5\%$** | $38{,}3\%$ / $15{,}0\%$ | $32{,}5\%$ / $11{,}5\%$ | **$+9{,}2\text{ pp}$ ($p = 0{,}043$)** |

*(Valores reportados como `Chegada à meta / Tombamento`. Observação técnica: as rodadas preliminares com `20 m`, `RT20` e `Oráculo 5 m` da bateria `lola_sint` foram descontinuadas para fins comparativos após a identificação e correção de falha de cache de rotas/declive de `20 m` em `v18.html`, sendo substituídas pela bateria definitiva abaixo).*

### 5.6 Bateria Multirresolução Definitiva `60 / 20 / 5 m` (`POP = 100`, Com e Sem Teto Temporal)
> **[EM EXECUÇÃO — `task-296`]**  
> Esta subseção receberá integralmente as matrizes de `POP = 100` ($1.600$ travessias por célula) comparando as **`8` configurações** já corrigidas em `v18.html` (`R60`, `RT_nom` $60\to 5\text{ m}$, `R20` sem margem, `R20_marg` com margem P90 calibrada, `RT20` $20\to 5\text{ m}$, `RLOLA5` $5\text{ m}$ oficial pré-MC sem margem, `RLOLA5_marg` $5\text{ m}$ oficial com margem diferenciada tiro/interpolado, e `R_oraculo` $5\text{ m}$ real pós-MC) nos `4` níveis (`N0–N3`), separadas nas **duas baterias** solicitadas:
> - **Bateria 1 — Com Teto Temporal (`T_MAX = 800 s`, `lola_dif_teto/`)**
> - **Bateria 2 — Sem Teto Temporal (`T_MAX = 4.000 s`, `lola_dif_semteto/`)**
>
> Incluindo chegada à meta, tombamento, tempo esgotado, fora do mapa, **perigo atravessado ($> 15^\circ$)** e testes pareados de Wilcoxon e McNemar via `simulacao_rover/testes/analisa_dif_multi.py`.
