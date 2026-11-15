# Documento Mestre & Plano de Engenharia: Otimização Reversa, Extrapolação Probabilística Multirresolução (240m → 5m) e Decisão Segura para Pouso Lunar

**Autoria Conceitual da Tese de Extrapolação Probabilística de Confiança e Diretrizes de Produto:** **Eduardo**  
**Desafio Oficial:** *2026 NASA International Space Apps Challenge — Lunar Landing Site Navigator*  
**Base Científica de Referência:** *Barker et al. (2021, 2023)* · *Wueller et al. (2026)* · *Peña-Asensio et al. (2024)* · *Rosenburg et al. (2011)* · *Gläser et al. (2014, 2018)* · *Bryant (2009)* · *Mazarico et al. (2011, 2018)* · *Lim et al. (2024)* · *Ennico-Smith et al. (2023)*

---

## 1. Descrição Completa do Desafio Oficial da NASA (`Lunar Landing Site Navigator`)

### 1.1. O Problema Real Apresentado pela NASA
Missões destinadas ao Polo Sul da Lua — tanto humanas (programa **Artemis III** e posteriores) quanto robóticas comerciais (**CLPS — Commercial Lunar Payload Services**, como o rover *VIPER* e os landers *IM-1 Odysseus*, *IM-2 Athena* e *Griffin-1*) — enfrentam um ambiente físico extremo que não existe em nenhum outro lugar explorado:
1. **Iluminação Solar Rasante:** O eixo de rotação da Lua é inclinado em apenas **$1{,}54^\circ$** em relação ao plano da eclíptica. No Polo Sul, o Sol nunca sobe a pino; ele desliza rente ao horizonte (entre $-1{,}54^\circ$ no inverno e $+1{,}54^\circ$ no verão, somado à topografia local). Qualquer crista, parede de cratera ou bloco rochoso projeta sombras quilométricas capazes de cortar a geração de energia fotovoltaica e mergulhar o veículo em temperaturas criogênicas ($-150^\circ\text{C}$ a $-230^\circ\text{C}$).
2. **Visibilidade Restrita da Terra para Comunicação Direta (`DTE`):** Devido à inclinação orbital da Lua ($5{,}14^\circ$) e às oscilações aparentes (libração de $\pm 6{,}87^\circ$ em latitude e $\pm 8{,}16^\circ$ em longitude), a Terra permanece abaixo do horizonte plano do Polo Sul durante cerca de **metade de cada mês sideral (~14 dias)**, e nunca passa de $\sim 7^\circ\text{ a }10^\circ$ de elevação. Montanhas locais frequentemente bloqueiam o sinal de rádio direto com a rede *Deep Space Network (DSN)* da NASA.
3. **O Problema Crítico do Atraso de Lançamento (*Launch Slip / Remarcação*):** Na indústria espacial, foguetes e cargas úteis atrasam por dias, semanas ou meses. Quando uma janela de lançamento escorrega, um sítio de pouso que teria 28 dias de luz contínua pode passar a ter apenas 4 dias ou cair na escuridão total. Hoje, ferramentas profissionais como o **NASA Moon Trek**, **LROC QuickMap** e **JPL Horizons** exigem de 15 a 30 minutos de configuração técnica manual por consulta, tratam Sol e Terra em módulos separados e são inacessíveis para decisões rápidas do tipo *"E se?"* (*What-if analysis*) ou para o público educacional.

### 1.2. O que a NASA Pede como Entregáveis e Funcionalidades
O desafio oficial solicita uma aplicação intuitiva que permita a **planejadores de missão, educadores, estudantes e ao público geral (incluindo crianças)** comparar rapidamente locais e datas de pouso, entregando:
* **Visualização do Sol e da Terra em relação ao horizonte local:** Para avaliar simultaneamente a geração de energia solar e as janelas de comunicação direta com a Terra (`DTE`) ou necessidade de satélite retransmissor (*Relay*).
* **Informação Operacional Crítica (Citada duas vezes no enunciado oficial):** Exibir o **tempo restante até o pôr do Sol (*time to sunset*) e até o "pôr da Terra" (*time to Earthset*)**.
* **Comparação rápida de Sítios e Datas (Modo *"E se?"* / *Go / No-Go Dashboard*):** Lista curada de sítios (Artemis III, CLPS, pousos históricos Apollo, missões internacionais) e suporte a coordenadas livres, avaliando instantaneamente o impacto de mudanças de data ou de hardware.
* **Métricas Físicas Claras:** Elevação solar, duração contínua da luz solar (`LCIP`), maior período de escuridão (`LCSP`), visibilidade da Terra e inclinação do solo.
* **Múltiplas Camadas de Visualização e Acessibilidade:** Mapas 2D com zoom, representação 3D/panorâmica do horizonte polar e linguagem acessível a todos os níveis.

### 1.3. Os 5 Critérios Oficiais de Julgamento da NASA (Mesmo Peso: 20% cada)
1. **Validity (Validade Científica):** A física, a matemática e os dados estão corretos? O modelo funciona no mundo real sem inventar dados falsos?
2. **Relevance (Relevância):** Responde diretamente a todos os pontos do enunciado do desafio? É fácil e rápido de usar?
3. **Creativity (Criatividade):** Traz uma abordagem inovadora em vez de apenas copiar ferramentas existentes?
4. **Impact (Impacto):** Resolve um problema de alto valor para missões reais e para a educação científica?
5. **Presentation (Apresentação):** Conta a história com clareza visual em 30 segundos / 7 slides e documenta tudo com transparência?

---

## 2. Glossário Exaustivo de Definições: O Que é Cada Conceito e o Que Ele Agrega ao Projeto

Para que cada variável e etapa do nosso sistema seja compreendida em profundidade e defendida com autoridade, abaixo estão todas as definições formais e o valor prático que cada uma adiciona:

### 2.1. Conceitos de Topografia e Sensoriamento Remoto Lunar
* **`LOLA` (*Lunar Orbiter Laser Altimeter*):** Altímetro a laser a bordo da sonda *Lunar Reconnaissance Orbiter (LRO)* da NASA, que realizou quase 7 bilhões de medições da superfície lunar disparando 28 pulsos por segundo (cada pulso dividido em 5 feixes de $5\text{ m}$ de diâmetro no solo).
  * **O que agrega:** É a fonte primária mundial de altimetria da Lua, referenciada a uma esfera lunar padrão de raio $R_{\text{Lua}} = 1.737{,}4\text{ km}$ (padrão IAU).
* **`DEM` / `LDEM` (*Digital Elevation Model* / Modelo Digital de Elevação):** Matriz numérica onde cada quadrado (*pixel*) informa a altitude exata do terreno em metros.
  * **O que agrega:** Permite traçar raios geométricos em $360^\circ$ ao redor do ponto de pouso (720 direções, a cada $0{,}5^\circ$) para descobrir a altura angular das montanhas que tapam o Sol e a Terra (**Máscara de Horizonte**).
* **Resolução Espacial (`240 m/px`, `80 m/px`, `60 m/px`, `20 m/px`, `5 m/px`):** É o tamanho físico do lado de cada quadrado do mapa no chão da Lua.
  * **`240 m/px` e `80 m/px` (`PGDA 69` / `PGDA 90`):** Cada pixel tira a média de um quarteirão inteiro. Excelente para enxergar montanhas distantes (a $50\text{–}200\text{ km}$), mas **cega para buracos, cristas estreitas e pedras perto do rover**.
  * **`60 m/px` (*Wueller et al., 2026*):** Resolução intermediária utilizada no catálogo mais recente dos 130 sítios da Artemis III via ferramenta *TerrainShadows*.
  * **`20 m/px` (`PGDA 90` — *Barker et al., 2023*):** Maior resolução com cobertura contínua de $100\%$ da zona polar sul (de $80^\circ\text{S}$ a $90^\circ\text{S}$), onde até $78\%$ dos pixels possuem medição direta de laser.
  * **`5 m/px` (`PGDA 78` — *Barker et al., 2021* e `LDEM_875S_5M`):** Resolução ultrafina disponível em **27 blocos ajustados no `PGDA 78`** (cobrindo **`104` dos `130` sítios candidatos**, `80,0%`) e na calota polar contínua de $87{,}5^\circ\text{S}\text{–}90^\circ\text{S}$ (`42` sítios). Revela micro-sombras críticas, porém na calota $87{,}5^\circ\text{S}\text{–}90^\circ\text{S}$ **`92,71%` dos pixels de $5 \times 5\text{ m}$ são interpolados matematicamente** (`LDEC = 0`, apenas **`7,29%`** com disparo real do LOLA, cuja coleta polar densa encerrou em **setembro de 2013**). Já os **`26` sítios restantes (`20,0%`)** — todos nas regiões `PCB`, `SP` e `MMP` — **não possuem nenhum DEM a $5\text{ m}$**. Além disso, **não existe modelo digital de iluminação solar a $5\text{ m}$ nem a $1\text{ m}$ para o Polo Sul inteiro**.
  * **O que agrega entender as resoluções:** Demonstra que **mapas mais grossos (`240m` ou `60m`) são sistematicamente otimistas**, pois alisam o relevo próximo e escondem sombras reais que só aparecem a `20m` e `5m`.
* **Equilíbrio de Saturação de Crateras (*Crater Saturation Equilibrium*):** Estado físico atingido por superfícies planetárias antigas (como as Terras Altas do Polo Sul Lunar, com $\sim 4$ bilhões de anos) após bombardeio aleatório contínuo de meteoritos. Nesse estado, para escalas abaixo de $\sim 1\text{ km}$, cada novo impacto destrói crateras antigas na mesma taxa em que cria novas, gerando uma **distribuição estatística de rugosidade e blocos rochosos previsível e invariante em escala**.
  * **O que agrega:** É a **base física que valida a ideia de Eduardo**: como o bombardeio meteorítico é aleatório e estatisticamente homogêneo em escala sub-quilométrica, a perda de luz solar observada ao passar de `240m → 60m → 20m → 5m` nos sítios medidos em 5m pode ser extrapolada como uma **distribuição de probabilidade** para sítios que só possuem mapas de 20m ou 60m!
* **Expoente de Hurst ($H$) e Rugosidade Fractal:** Parâmetro adimensional ($0 < H < 1$, sendo $H \approx 0{,}85\text{ a }0{,}95$ nas terras altas lunares segundo *Rosenburg et al., 2011*) que mede como o desvio-padrão da altura do relevo ($\sigma$) cresce conforme aumentamos o tamanho do pixel ($\Delta x$): $\sigma(\Delta x) \propto (\Delta x)^H$.
  * **O que agrega:** Fornece a lei matemática exata para escalar a incerteza topográfica entre diferentes resoluções de mapa.
* **Equação Analítica de Incerteza Topográfica de Barker et al. (2021):** Fórmula calibrada empiricamente pela equipe do LOLA na Tabela 1 de *Barker et al. (2021)*:
  $$\varepsilon(R, S) = 0{,}0210 \cdot R + 0{,}0051 \cdot S + 0{,}022\text{ (metros)}$$
  onde $R$ é a resolução efetiva (distância até o pulso de laser mais próximo, em metros) e $S$ é a inclinação local do terreno (em graus).
  * **O que agrega:** Quantifica instantaneamente o erro vertical médio esperado em cada sítio sem precisar processar gigabytes de nuvens de pontos em tempo real.

---

### 2.2. Conceitos de Iluminação, Energia, Comunicação e Recursos Lunares
* **`LCIP` (*Longest Continuous Illumination Period* / Maior Período Contínuo de Sol):** Número máximo de dias (ou horas) ininterruptos em que pelo menos uma fração do disco solar ($0{,}53^\circ$ de diâmetro angular) permanece acima do horizonte topográfico local na altura do painel solar do rover/lander.
  * **O que agrega:** Determina se a missão consegue operar do início ao fim apenas com energia solar direta.
* **`LCSP` (*Longest Continuous Shadow Period* / Maior Período Contínuo de Sombra):** Maior duração ininterrupta de escuridão que o sítio enfrenta dentro da janela analisada.
  * **O que agrega:** Define o requisito mínimo de sobrevivência da bateria ($t_{\text{escuro}}$). Se $\text{LCSP} > \text{Autonomia da Bateria}$, o veículo congela.
* **Diferença entre Visibilidade Solar (*Solar Visibility*) e Iluminação Média (*Average Illumination*):**
  * **Visibilidade Solar:** Percentual do tempo em que *qualquer pedaço* do disco do Sol está visível acima das montanhas (ex.: $92{,}1\%$ no *Connecting Ridge* a 2 m de altura, *Gläser 2018*).
  * **Iluminação Média:** Média da fração visível do disco solar (ex.: $88{,}0\%$ no mesmo ponto, pois muitas vezes o Sol está meio cortado pela borda de uma montanha).
  * **O que agrega:** Evita confundir métricas distintas da literatura e calcula corretamente a potência elétrica gerada pelos painéis.
* **Autonomia de Sobrevivência na Sombra ($t_{\text{escuro}}$):** Tempo máximo (em horas) que o Rover sobrevive sem luz solar usando sua bateria interna:
  $$t_{\text{escuro}} = \frac{M_{\text{bat}} \cdot \rho_{\text{bat}}}{P_{\text{sombra}}}$$
  onde $M_{\text{bat}}$ é a massa da bateria ($\text{kg}$), $\rho_{\text{bat}}$ é a densidade energética ($\text{Wh/kg}$) e $P_{\text{sombra}}$ é o consumo elétrico de aquecedores e aviônica no escuro ($\text{W}$).
  * **O que agrega:** Conecta diretamente a escolha do veículo (hardware) ao mapa da Lua. Um rover com bateria maior consegue "atravessar pontes de escuridão" (como eclipses de $3{,}9\text{ h}$ ou sombras de rochas de $5\text{ m}$) e **desbloquear sítios de pouso** onde um rover menor morreria.
* **`DTE` (*Direct-to-Earth*) vs. *Relay Orbital*:**
  * **`DTE`:** Comunicação de rádio direta entre a antena do rover na Lua e as antenas da Terra (*DSN*). Exige que a Terra esteja acima do horizonte topográfico local.
  * **Relay Orbital:** Uso de um satélite retransmissor em órbita lunar (como a órbita *NRHO* da estação *Gateway* ou constelação *LunaNet*).
  * **O que agrega:** Permite simular o ganho imediato de locais de pouso quando a missão dispõe de um satélite retransmissor.
* **`PSR` (*Permanently Shadowed Region* / Região Permanentemente Sombreada) e `ISRU` (*In-Situ Resource Utilization*):** Crateras polares profundas cujo fundo nunca recebe luz solar direta, mantendo temperaturas abaixo de $110\text{ K}$ ($-163^\circ\text{C}$) onde o gelo de água permanece estável por bilhões de anos. `ISRU` é o uso desse gelo local para produzir água potável, oxigênio respirável e combustível de foguete ($\text{H}_2 / \text{O}_2$).
  * **O que agrega:** Mede o **retorno científico e econômico** do sítio de pouso. Pousar num pico iluminado ao lado de uma grande área de `PSR` (até $2\text{ km}$ de distância) é o objetivo central da exploração polar.

---

### 2.3. Conceitos de Otimização Matemática e Teoria da Decisão
* **Otimização Reversa de Missão (*Constraint-Based Reverse Mission Design*):** Em vez de escolher um ponto cego no mapa e perguntar se ele é bom, o fluxo parte das capacidades reais da missão (Rover escolhido, bateria, consumo, ano e duração) e varre os 130 sítios para encontrar todos os locais compatíveis.
* **Restrições Rígidas (*Hard Constraints* — Camada 1: "Vida ou Morte"):** Filtros binários eliminatórios baseados em limites físicos inegociáveis (se falhar em um, o sítio é reprovado, não importa quão bom seja nos outros).
* **Dominância e Fronteira de Pareto (*Pareto Optimality* — Trava 2):** Um sítio $A$ **domina** um sítio $B$ se $A$ for melhor ou igual a $B$ em **todos** os objetivos (mais Sol, mais Gelo e terreno mais plano) e estritamente melhor em pelo menos um. A **Fronteira de Pareto** é o conjunto de sítios campeões que não são dominados por nenhum outro.
  * **O que agrega:** Elimina escolhas subótimas ("escolhas bobas") sem precisar de nenhum peso subjetivo.
* **`TOPSIS` (*Technique for Order Preference by Similarity to Ideal Solution*):** Algoritmo matemático de Decisão Multicritério (usado por *Peña-Asensio et al., 2024* para a Artemis III) que normaliza todas as métricas de $0$ a $1$, aplica pesos de importância e classifica os sítios pela menor distância geométrica até a "Solução Ideal" (o melhor valor possível em cada critério) e maior distância até a "Solução Anti-Ideal" (o pior valor em cada critério).
* **Análise de Sensibilidade estocástica de Monte Carlo (*Trava 3*):** Técnica que roda automaticamente **1.000 simulações** variando os pesos dos critérios e as perturbações de resolução para calcular a **Taxa de Vitória (%)** de cada sítio.
  * **O que agrega:** Impede que o usuário erre mesmo que não saiba qual peso atribuir a cada critério.

---

## 3. A Grande Ideia e Tese Autoral de Eduardo: Extrapolação Probabilística Multirresolução (`240m → 60m → 20m → 5m`) para Missões Críticas

### 3.1. Como Nasceu a Ideia de Eduardo (E Por Que Ela Supera o Senso Comum)
Durante a concepção do projeto, **Eduardo** estabeleceu uma premissa de rigor científico inegociável: **jamais aplicar inteligência artificial ou técnicas da moda onde elas violam a causalidade física**.

1. **O descarte lúcido da IA determinística:**
   * Inicialmente, discutiu-se se uma rede neural (Machine Learning) poderia ser treinada nos recortes disponíveis com mapas de $5\text{ m/px}$ (`PGDA 78` / `LDEM_875S_5M`) para "desenhar" pedras e crateras de $5\text{ m}$ nos sítios e rotas que só possuem mapas de $10\text{ m}$, $20\text{ m}$ ou $60\text{ m}$ (como os $26$ sítios sem $5\text{ m}$ em `PCB`, `SP` e `MMP`).
   * **Eduardo** questionou e rejeitou essa abordagem porque crateras de impacto em regiões distantes não possuem conexão causal determinística: saber que caiu um meteorito na coordenada $(x_1, y_1)$ de *Shackleton* não permite adivinhar em qual metro exato $(x_2, y_2)$ caiu uma pedra em *Mons Mouton*. Forçar uma IA a "inventar" pedras produziria um mapa fictício e perigoso.
2. **A virada conceitual de Eduardo (Da Certeza Falsa para a Probabilidade Conservadora):**
   * **Eduardo** formulou então uma hipótese fisicamente brilhante:
     > *"Mesmo não havendo dados de 5m em todos os sítios, sabemos que a superfície da Lua foi atingida aleatoriamente por meteoritos ao longo do tempo, tendo uma probabilidade de uniformidade quanto à ocorrência de rochas e sombras. Se rodarmos sucessivos testes para diferentes resoluções (`240m → 60m → 20m → 5m`) e usarmos o comportamento real observado em 5m para extrapolar uma **probabilidade conservadora** de o sítio ter sombras semelhantes — não para garantir que há ou não uma pedra lá, mas para **aumentar o nível de confiança** —, teremos um filtro decisivo para missões com cargas muito valiosas ou seres humanos, onde não há margem para erros."*

### 3.2. Os 4 Pontos Fortes da Ideia de Eduardo

| Ponto Forte da Proposta de Eduardo | Fundamento Físico / Matemático | O que Agrega na Prática para o Usuário |
| :--- | :--- | :--- |
| **1. Honestidade Científica (Probabilidade em vez de Adivinhação)** | Em vez de inventar coordenadas falsas de rochas, modela a perda de iluminação a $5\text{ m}$ como uma variável aleatória $\Delta D_{5\text{m}} \sim \mathcal{N}(\mu_{5\text{m}}, \sigma_{5\text{m}}^2)$ calibrada nos dados reais do `PGDA 78` (*Barker et al., 2021*). | O planejador vê claramente o **número nominal (60m)** ao lado da **Probabilidade de Sobrevivência a 5m (%)**, sabendo exatamente qual é o risco assumido. |
| **2. Escada de Testes Multirresolução (`240m → 60m → 20m → 5m`)** | Mede a **Taxa de Erosão Solar por Resolução**. Sítios em platôs amplos perdem pouca luz quando a resolução afina; sítios em cristas estreitas e íngremes sofrem colapso de iluminação a $5\text{ m}$. | Permite enxergar quais sítios têm "iluminação ilusória de mapa grosso" e quais são estruturalmente sólidos em qualquer escala. |
| **3. Filtros de Confiança por Valor da Missão (`P50`, `P90`, `P99`)** | Alinha o software à classificação oficial de risco da NASA (*NPR 8705.4*: *Class D* vs. *Class B/C* vs. *Class A Human-Rated*). | Adapta o rigor do filtro ao que está em jogo: sondas baratas aceitam `50%` de confiança; o rover *VIPER* exige `90%`; astronautas da *Artemis III* exigem **`99%` (Margem Zero de Erro)**. |
| **4. Sinergia Física com a Altura do Mastro Solar e Bateria do Rover** | *Barker et al. (2021)* provaram que sombras de micro-relevo de $5\text{ m}$ atingem duramente painéis baixos ($1\text{–}2\text{ m}$), mas quase desaparecem a $5\text{ m}$ de altura. | Mostra ao usuário que ele pode vencer o risco de $5\text{ m}$ de duas formas: trocando de cratera **ou** escolhendo um Rover com mastro mais alto e bateria maior! |

---

## 4. Formulação Matemática Exata do Modelo de Eduardo (Otimização + Probabilidade 5m + TOPSIS)

### Passo 1: Cálculo da Ponte Energética do Rover Escolhido
Dado o Rover selecionado pelo usuário com massa de bateria $M_{\text{bat}}\text{ (kg)}$, densidade energética $\rho_{\text{bat}}\text{ (Wh/kg)}$, consumo na sombra $P_{\text{sombra}}\text{ (W)}$ e altura do mastro solar $h_{\text{mastro}}\text{ (m)}$:
1. **Energia Total Armazenada ($E_{\text{bat}}$) e Horas de Sobrevivência no Escuro ($t_{\text{escuro}}$):**
   $$E_{\text{bat}} = M_{\text{bat}} \cdot \rho_{\text{bat}}\text{ (Wh)}, \qquad t_{\text{escuro}} = \frac{E_{\text{bat}}}{P_{\text{sombra}}}\text{ (horas)}$$
2. **Ganho de Dias Efetivos pela Bateria e Mastro ($\Delta D_{\text{rover}}$):**
   $$\Delta D_{\text{rover}} = \left(\frac{t_{\text{escuro}}}{12{,}0}\right) \cdot 1{,}5 + 0{,}85 \cdot (h_{\text{mastro}} - 2{,}0)$$

---

### Passo 2: Simulação Sucessiva de Resoluções (`240m → 60m → 20m → 5m`) e Probabilidade de Sombra
Para cada sítio $i \in \{1, \dots, 130\}$ no ano $A \in \{2025, \dots, 2032\}$, partimos do valor medido a $60\text{ m/px}$ por *Wueller et al. (2026)* ($D_{60\text{m}, i}$, usando a série `dias_sol_terra` se $\text{DTE} = \text{SIM}$, ou `dias_sol` se via Satélite):

1. **Incerteza Vertical Sub-Grade de Barker ($\varepsilon_i$, em metros):**
   $$\varepsilon_i(R, S_i) = 0{,}0210 \cdot R + 0{,}0051 \cdot S_i + 0{,}022$$
2. **Fator de Proteção da Altura do Mastro Solar ($f_{\text{mastro}}$):**
   Calibrado pelos dados do *Site 1* de *Barker et al. (2021)* (onde a subida do mastro de $1\text{ m}$ para $5\text{ m}$ reduz em $\sim 82\%$ a perda de luz causada pelas micro-sombras de $5\text{ m}$):
   $$f_{\text{mastro}}(h_{\text{mastro}}) = \exp\!\left(-0{,}42 \cdot (h_{\text{mastro}} - 1{,}0)\right)$$
3. **Os 4 Degraus da Escada de Resolução (em Dias Contínuos Efetivos):**
   * **Degrau 1 — `240 m/px` (Visão Macroscópica / *Mazarico 2011*):** Como o pixel de $240\text{ m}$ alisa cristas locais (superestimando a luz em $\sim 12\%\text{ a }15\%$ segundo *Gläser 2018*), a estimativa aparente a $240\text{ m}$ é:
     $$D_{240\text{m}, i} = \text{round}\!\left(D_{60\text{m}, i} \cdot \left(1 + 0{,}012 \cdot S_i\right) + \Delta D_{\text{rover}}\right)$$
   * **Degrau 2 — `60 m/px` (Base Nominal Oficial / *Wueller 2026*):**
     $$D_{\text{ef}, 60\text{m}, i} = D_{60\text{m}, i} + \Delta D_{\text{rover}}$$
   * **Degrau 3 — `20 m/px` (Escala *PGDA 90* / *Barker 2023*):** Desconta a erosão determinística de primeira ordem ao refinar a grade de $60\text{ m}$ para $20\text{ m}$:
     $$D_{\text{ef}, 20\text{m}, i} = \max\!\left(0,\; D_{\text{ef}, 60\text{m}, i} - 0{,}65 \cdot \varepsilon_i(60, S_i) \cdot f_{\text{mastro}}(h_{\text{mastro}})\right)$$
   * **Degrau 4 — `5 m/px Extrapolado` (Distribuição Probabilística de Sombra / Tese de Eduardo):**
     Modelamos a perda adicional de dias entre $60\text{ m}$ e a realidade micro-topográfica de $5\text{ m}$ como uma distribuição normal truncada com desvio-padrão $\sigma_{5\text{m}, i}$ proporcional à rugosidade fractal e à inclinação local $S_i$:
     $$\sigma_{5\text{m}, i} = \varepsilon_i(60, S_i) \cdot \left(1 + \frac{S_i}{12^\circ}\right) \cdot f_{\text{mastro}}(h_{\text{mastro}})$$
     Para um nível de confiança escolhido $C \in \{50\%, 90\%, 99\%\}$ com quantil normal padrão $z_C \in \{0{,}00;\; 1{,}28;\; 2{,}33\}$:
     $$D_{\text{conf}, 5\text{m}, i}(C) = \max\!\left(0,\; D_{\text{ef}, 20\text{m}, i} - z_C \cdot \sigma_{5\text{m}, i}\right)$$
4. **Cálculo da Probabilidade de Sucesso contra Sombras Ocultas de 5m ($P_{\text{sucesso, 5m}}$):**
   A probabilidade exata de o sítio $i$ manter pelo menos $D_{\text{missão}}$ dias contínuos de operação mesmo diante de rochas e micro-crateras de $5\text{ m/px}$ é:
   $$P_{\text{sucesso, 5m}}(i) = \Phi\!\left(\frac{D_{\text{ef}, 20\text{m}, i} - D_{\text{missão}}}{\sigma_{5\text{m}, i}}\right) \times 100\%$$
   onde $\Phi(z) = \frac{1}{2}\left[1 + \text{erf}\!\left(\frac{z}{\sqrt{2}}\right)\right]$ é a função de distribuição acumulada normal padrão.

---

### Passo 3: O Funil de 7 Filtros em Cascata (*Trava 1 — Eliminação de Erros Fatais*)
Um sítio só avança se passar sequencialmente pelas 7 barreiras:
1. **E1 — Balanço de Energia e Comunicação Nominal (`60m`):** $D_{\text{ef}, 60\text{m}, i} \ge D_{\text{missão}}$.
2. **E2 — Sobrevivência a Eclipse Lunar Total (`+3,9 h`):** $t_{\text{escuro}} \ge 3{,}9\text{ h}$ (ou folga solar $\ge D_{\text{missão}} + 2\text{ dias}$).
3. **E3 — Filtro Probabilístico de Microtopografia `5m` (Ideia de Eduardo) + Limite de Tombamento:**
   Exige $P_{\text{sucesso, 5m}}(i) \ge C_{\text{mín}}$ (onde $C_{\text{mín}} = 50\%$ para sonda simples, $90\%$ para carga valiosa e **$99\%$ para missão humana**) e inclinação $S_i \le 15^\circ$.
4. **E4 — Envelope Orbital Polar (`HLS`):** $\text{Latitude}_i \le -84{,}0^\circ$.
5. **E5 — Alinhamento Programático NASA (`Outubro/2024`):** Pertencer às 9 regiões mantidas para a Artemis III.
6. **E6 — Robustez contra Atraso de Foguete (`+1 Ano`):** O sítio também deve ser viável no verão do ano seguinte ($A + 1$).
7. **E7 — Proximidade de Gelo (`PSR / ISRU`):** Área de sombra permanente com gelo a até $2\text{ km} \ge 50.000\text{ m}^2$.

---

### Passo 4: Dominância de Pareto (*Trava 2*) e Estabilidade `TOPSIS` em 1.000 Cenários (*Trava 3*)
Para todos os sítios que sobreviveram à Trava 1:
1. **Selo de Fronteira de Pareto (*Trava 2*):** Identificamos os sítios não-dominados no espaço 4D:
   $$\max D_{\text{conf}, 5\text{m}, i}, \quad \max P_{\text{sucesso, 5m}}(i), \quad \max A_{\text{PSR}, i}, \quad \min S_i$$
2. **Algoritmo `TOPSIS` Normalizado (*Peña-Asensio et al., 2024*):**
   * Normaliza cada coluna $k \in \{\text{Sol}_{5\text{m}}, \text{Gelo}_{\text{PSR}}, \text{Terreno Plano}, \text{Estabilidade +1 Ano}\}$ pela norma euclidiana:
     $$r_{ik} = \frac{x_{ik}}{\sqrt{\sum_{j} x_{jk}^2}}$$
   * Multiplica pelos pesos $w_k$ ($\sum w_k = 1$): $v_{ik} = w_k \cdot r_{ik}$.
   * Calcula a distância até a Solução Ideal ($v_k^+$) e Anti-Ideal ($v_k^-$):
     $$d_i^+ = \sqrt{\sum_k (v_{ik} - v_k^+)^2}, \qquad d_i^- = \sqrt{\sum_k (v_{ik} - v_k^-)^2}$$
   * Obtém o **Índice de Proximidade `TOPSIS` ($R_i \in [0, 100\%]$):**
     $$R_i = \frac{d_i^-}{d_i^+ + d_i^-} \times 100\%$$
3. **Simulação de Estabilidade de Monte Carlo (*Trava 3 — 1.000 Cenários*):**
   * Sorteamos **1.000 vetores de pesos aleatórios** $(w_1, w_2, w_3, w_4)$ no simplex unitário e perturbamos a resolução entre `240m`, `60m`, `20m` e `5m`.
   * Contamos em quantos dos 1.000 cenários cada sítio termina em **1º lugar absoluto** (**Taxa de Vitória / Confiança de Escolha Ótima**).

---

## 5. O Que a Proposta de Eduardo Acrescenta aos Artigos Científicos Existentes e Como Nos Diferencia no Desafio

| Artigo Científico / Concorrente | O que o Artigo Fez | O Que Faltava Nele | O Que a Proposta de **Eduardo** Acrescenta (Inovação do Nosso Projeto) |
| :--- | :--- | :--- | :--- |
| **Mazarico et al. (2011)** & **Gläser et al. (2014, 2018)** | Criaram o método de máscara de horizonte (`240m` e `20m`) e mediram médias plurianuais de luz no Polo Sul. | Não separavam os dias contínuos ano a ano (`2025–2032`), não acoplavam bateria de rovers e não faziam otimização multicritério. | Transforma a diferença entre `240m` e `20m` numa **Escada Multirresolução interativa**, mostrando ao vivo a erosão de luz conforme o mapa fica mais fino. |
| **Barker et al. (2021, 2023)** | Pós-GRAIL, geraram os DEMs ajustados de `5 m/px` (`PGDA 78`, $27$ recortes $\to 104/130$ sítios) e `20 m/px` (`PGDA 90`), criaram $\varepsilon(R,S)$ e rodaram 100 clones de 5m em alvos locais. | Deixaram $26$ sítios das 3 novas regiões (`PCB`, `SP`, `MMP`) sem $5\text{ m}$ e não produziram iluminação polar contínua a $5\text{ m}$ para todo o Polo Sul. | **Calibração nos $104$ sítios + Extrapolação para os $26$ sem `5 m` e Rotas (`60/20 → 5 m`):** Calibra a erosão solar nos blocos reais de $5\text{ m}$ e propaga `P50/P90/P99` para todos os $130$ sítios e suas rotas de até $2\text{ km}$. |
| **Peña-Asensio et al. (2024)** (*Acta Astronautica*) | Aplicaram `TOPSIS` e análise de sensibilidade de pesos para ranquear locais da Artemis III. | Usaram mapas estáticos de `240 m/px` (sem calendário anual `2025–2032`, sem bateria de rovers e sem o risco de micro-sombras de `5 m/px`). | Aplica o `TOPSIS` + **1.000 simulações de Monte Carlo** sobre os dados temporais de `2025–2032` **já descontando as sombras probabilísticas de 5m e a bateria do Rover**. |
| **Wueller et al. (2026)** (*JGR Planets*) | Publicaram os dias seguidos de Sol e Terra de `2025` a `2032` para os **130 sítios da Artemis** a `60 m/px` e mastro fixo de `2 m`. | Tabela puramente descritiva a `60 m/px` (ignora sombras de `5m`, ignora eclipses de `3,9h`, fixa mastro em `2m` e não tem motor de decisão reversa). | Corrige o otimismo de `60 m/px` de Wueller injetando a **probabilidade de sombra de 5m**, o **efeito do mastro (`1,5m` a `5m`)**, a **bateria do Rover** e os **filtros de missão humana (`99%`)**. |
| **Os 27 Repositórios Concorrentes do Space Apps 2026** ([`docs/concorrencia.md`](file:///c:/NASA%20PROJETO%202026/docs/concorrencia.md)) | Alguns têm cálculo SPICE e horizonte a `20m/80m`, mas são painéis complexos de engenheiro para engenheiro. | **Nenhum** usa os 130 sítios de *Wueller 2026*, **nenhum** modela a probabilidade de sombra sub-pixel a `5m` por criticidade da missão, e **nenhum** tem jornada visual gamificada em 3 telas acessível até para crianças. | Entrega **Rigor Científico Inédito** (Otimização Reversa + Probabilidade 5m + TOPSIS + Contagem Regressiva de Pôr do Sol/Terra) dentro de um **Cockpit Visual em 3 Telas** (Hangar 3D $\to$ Mapa Lunar Real $\to$ Pouso no Horizonte). |

---

## 6. Atualização Empírica de Dados (Acervo `12,288 GB`), Restrições de Sensores e Plano de Execução Revisado

Com o download integral do acervo oficial (`161` arquivos em `dados/acervo_tese/`) e a auditoria espacial completa dos **130 sítios** ordenados de norte (`Nº 1 PCB04`, $-83{,}3691^\circ$) a sul (`Nº 130 CR08`, $-89{,}6319^\circ$) (ver documento completo em [`Tese_Apresentacao_Dados_e_Variaveis.docx`](file:///c:/NASA%20PROJETO%202026/docs/Tese_Apresentacao_Dados_e_Variaveis.docx)), o plano experimental passa a incorporar os seguintes fatos verificados:

1. **Situação Artemis atualizada (2022–2028):** *Artemis I* (nov/2022, não tripulada), *Artemis II* (abr/2026, sobrevoo lunar tripulado), *Artemis III* (reestruturada para 2027 como teste tripulado em órbita terrestre baixa com acoplamento ao HLS) e *Artemis IV* (meta inicial de 2028 para o 1º pouso tripulado no Polo Sul), com $9$ regiões priorizadas pela NASA em out/2024 (`PCB`, `HW`, `MMA`, `MMP`, `MMO`, `NR1`, `NR2`, `dGR2`, `SP`).
2. **Restrições físicas de sensores consolidadas:**
   * **LOLA (`LRO`):** Coleta polar densa encerrou em **setembro de 2013**. Na grade `5 × 5 m` (`LDEM_875S_5M`), **$7{,}29\%$** dos pixels têm tiro direto e **$92{,}71\%$** são interpolados matematicamente (`25{,}90\%` a `10 m`; `67{,}97\%` a `20 m`; `95{,}93\%` a `40 m`; `99{,}40\%` a `60 m`).
   * **GRAIL:** Reajuste orbital dos dados 2009–2013 gerando os **27 blocos `5 m` (`PGDA 78`, `104/130` sítios)** e o DEM contínuo `20 m` (`PGDA 90`). **Todos os `26` sítios sem `5 m` (`20,0%`) pertencem a três regiões atuais da NASA (`PCB`, `SP`, `MMP`).**
   * **`LROC NAC SfS` (`1–2 m` e `5 m/px`):** Melhora micro-relevo onde há Sol, mas **não funciona no escuro / PSR**. **Regra permanente: NÃO existe DEM de iluminação a `5 m` nem a `1 m` para o Polo Sul inteiro.**
   * **`ShadowCam` (`KPLO/Danuri`, `~1,7–2 m/px`):** Não gera mapa de radiação solar direta; funciona como camada ótica de verificação de **obstáculos (matacões/rampas) e voláteis dentro de crateras escuras (PSRs)** nas rotas até `2 km`.
3. **Plano de Execução Revisado (4 Etapas + Ganho Operacional):**
   * **Etapa 1 — Simulação *Ceteris Paribus* nos `104` sítios (`PGDA 78` + `LDEM_875S_5M`):** Calcular perda de iluminação e dispersão de inclinação $\sigma_S$ entre `240 / 120 / 60 / 20 / 5 m` sob os mesmos Kernels `DE440` (substituindo a antiga premissa de apenas 4 sítios de calibração).
   * **Etapa 2 — Estratificação `LDEC > 0` vs. `LDEC = 0` e Validação `toterr.tif`:** Testar se a parcela interpolada (`92,71%`) altera o erro residual $\Delta D$ e $\sigma_S$, usando validação cruzada *leave-one-region-out* entre os $104$ sítios.
   * **Etapa 3 — Correção dos `26` Sítios sem `5 m` (`PCB`, `SP`, `MMP`) e Rotas Inter-Sítios (`60/20 → 5 m`):** Aplicar o modelo substituto calibrado aos sítios sem `5 m` e às travessias rumo a `PSR` (`<= 15°` VIPER / `<= 20°` EVA + checagem `ShadowCam`), medindo quantos falsos positivos de `60 m` caem nos filtros `P90/P99`.
   * **Etapa 4 — Medição de Ganho no Motor `TOPSIS + Monte Carlo`:** Quantificar $\Delta \text{Rank}$ ($\rho_s$ de Spearman) e elevação na taxa de conformidade segura $P(S \le 8^\circ)$ em todo o catálogo de 130 pontos.

---

## 7. Extensão Operacional: Replanejamento de Turno/Dia, Coleta pelo Rover e Regra Assimétrica contra "Falso Alívio"

Como extensão da tese para operações de superfície sem exigir computação pesada a bordo, o modelo opera em **três horizontes temporais** submetidos a uma trava rigorosa de não relaxamento automático:

1. **Camada 1 — Núcleo Pré-Pouso (Tese Base `P90/P99`):** Calcula a máscara de horizonte distante ($d > 500\text{ m}$ até $200\text{ km}$) e as margens conservadoras `P90/P99` contra os `~92,71%` de interpolação em $5\text{ m}$ e os $26$ sítios sem $5\text{ m}$ (`PCB`, `SP`, `MMP`).
2. **Camada 2 — Replanejamento de Turno / Dia (Ciclo Lento: Satélite $\to$ Terra $\to$ Rover):** Entre turnos ou paradas de recarga, a equipe em solo processa e co-registra novos produtos orbitais e envia pacotes leves ao rover:
   * Pacote compacto de **elevação local ajustada $\Delta Z(x,y)$** (recortes `LROC NAC SfS` $1\text{–}5\text{ m}$ em áreas iluminadas, já amarrados ao `MOON_ME`);
   * **Polígonos/máscaras de veto de obstáculo** extraídos em Terra de imagens **`ShadowCam` ($\sim 1{,}7\text{–}2\text{ m/px}$)** dentro de PSRs (matacões, escarpas, taludes instáveis).
3. **Camada 3 — Coleta do Próprio Rover em Movimento (Ciclo Curto Local, $5\text{–}50\text{ m}$):** Atualiza apenas $\alpha_{\text{local}}(\phi)$ via $\alpha_{\text{total}}(\phi) = \max(\alpha_{\text{distante}}(\phi), \alpha_{\text{rover}}(\phi))$ usando cinco conjuntos de telemetria nativa:
   * **Micro-topografia relativa (`LiDAR` / câmeras estéreo `NavCam/HazCam`):** elevação local $z_{\text{loc}}$ em grade curta ($\text{m}$), detectando pedras e microcrateras;
   * **Inclinação real sob as rodas (`IMU` — *roll/pitch* em $^\circ$):** compara o terreno real com a inclinação média esperada e sinaliza risco de tombamento;
   * **Posição relativa corrigida (odometria visual + registro de marcos, não apenas giro de roda):** mitiga deriva por patinação (*wheel slip*) no regolito antes de gravar qualquer atualização;
   * **Telemetria fotovoltaica real (`W` / corrente/tensão dos painéis + sombra detectada no mastro):** verifica se a entrada/saída de sombra ocorreu antes ou depois do previsto naquele azimute $\phi(t)$;
   * **Metadado de incerteza do próprio sensor (`SNR` e alcance útil em $\text{m}$):** impede atualizar ângulos além de $\sim 20\text{–}50\text{ m}$ onde a precisão degrada.

### Regra Assimétrica de Segurança (*No False Relief*)
Para proteger o núcleo probabilístico da tese contra **falso alívio**:
* **Endurecimento imediato (*Fail-Safe*):** qualquer obstáculo, rampa acima do limite ou sombra antecipada detectada no turno/percurso **aumenta imediatamente o bloqueio ou veta o trecho**;
* **Proibição de relaxamento automático:** encontrar terreno momentaneamente plano ou iluminado **não reduz** a margem conservadora `P90/P99` nos metros seguintes ainda não medidos (pois a alta taxa de interpolação a $5\text{ m}$ mantém o risco de microcrateras ocultas logo adiante).

### Limites Céticos que Permanecem (Físicos, Sensoriais e de IA/ML)
Para evitar conclusões otimistas ou perda de rigor metodológico na tese, permanecem inegociáveis os seguintes limites:
1. **Alcance curto do rover (`20–50 m`) frente ao Sol rasante (`1,54°`):** a $1{,}54^\circ$ de elevação solar, uma crista de apenas $3\text{ m}$ a $120\text{ m}$ de distância já projeta sombra antes que `LiDAR`/`NavCam` a resolvam. Portanto, a telemetria local **complementa** a segurança de curto alcance, mas **nunca substitui** a máscara pré-calculada de horizonte distante ($d > 500\text{ m}$ até $200\text{ km}$) nem o replanejamento em solo.
2. **Patinação (*wheel slip*) e desalinhamento espacial:** contagem de giro de roda isolada deriva no regolito lunar; toda atualização local exige odometria visual ancorada em marcos e todo pacote orbital ($\Delta Z$ / polígonos de veto) deve chegar pré-amarrado em Terra ao referencial `MOON_ME`.
3. **Sem processamento orbital bruto a bordo:** restrições de banda, CPU espacial e risco de erro de registro impedem enviar fotos brutas de `LROC NAC`/`ShadowCam` para o rover processar em tempo real; o ciclo lento opera apenas por deltas e máscaras de veto pré-validados em Terra.
4. **Restrições estritas para uso de Machine Learning (ML / Políticas Neurais):**
   * **Proibido aprendizado *online* por tentativa e erro em voo:** diferentemente de simuladores ou jogos, o custo de falha na Lua é terminal. Modelos neurais leves (ex.: MLP compacta treinada por estratégias evolutivas ou RL) só podem aprender **100% *offline* em Terra** sobre realizações sintéticas da incerteza de $5\text{ m}$ (`~92,71%` interpolado), embarcando com **pesos congelados**.
   * **Caixa-preta não substitui certificação (`Safety Shield`):** por baixa explicabilidade e risco de falha fora da distribuição de treino, a IA não decide segurança nem calcula horizonte; atua apenas como **proponente de eficiência** ou **detector/estimador de risco local** (matacões, bordas, *wheel slip*, erro residual $\sigma$), sempre subordinada a um filtro determinístico rígido (`P90/P99` + regra *No False Relief*).
