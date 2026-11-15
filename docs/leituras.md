# Notas de leitura completa (linha a linha)

Feita em 02/11/2026, a pedido do Luiz, depois da primeira revisão ([artigos.md](artigos.md)), que tinha sido só uma leitura dirigida. Aqui fica **o que a leitura completa acrescentou ou corrigiu**. Os fatos já confirmados em artigos.md não são repetidos.

## Resumo do que a leitura completa mudou

**Status:** 16 de 18 textos lidos inteiros. Faltam o Mazarico 2011 e o Gläser 2014, que estão atrás de paywall.

**Correções:**
1. **"dias de Sol" do nosso CSV** = máximo de **dias seguidos** com Sol no meio do verão lunar (Wueller 2026). A dúvida está resolvida.
2. **Iluminação média ≠ visibilidade solar.** O "92,27%" do Gläser 2014 é % do tempo com algum Sol; a média no mesmo lugar é de ~88% (Gläser 2018).
3. **Bryant:** os 92% / 51% usam uma simplificação; com efemérides reais, a Terra inteira fica visível ~54%. O "melhor sítio" B1 dele é praticamente o Connecting Ridge.
4. **O "256 kbps" do VIPER não estava nos textos.** Foi removido.
5. **Limite do horizonte:** ~200 km bastam no polo; o máximo possível na Lua é ~300 km (Mazarico 2018).
6. **Inclinação do HLS:** < 8° no requisito de 2019 (meta < 5°) contra < 10° na palestra de 2025. No app, fica como parâmetro.

**Novidades que entram no projeto:**
- **O hackathon (14 e 15/11/2026) cai dentro do meio do verão lunar de 2026 (06/11–27/11).** É um gancho para o pitch.
- **Malapert α e Leibnitz β veem a Terra 100% do tempo** (Bryant). Mastro alto melhora o Sol, quase nada a Terra.
- **Valor nominal é otimista:** o erro do DEM quase sempre piora a iluminação (Barker 2021). Há uma fórmula pronta para estimar esse erro.
- **DEM mais fino → menos iluminação e mais sombra** (Smith 2016, Gläser 2018). O nosso cálculo a 20 m deve dar números menores que os mapas de 240 m.
- **Truque do "melhor verão possível"** com kernel SPICE falso (Barker 2023): saber se um ponto chega a ver o Sol em 720 passos.
- **TOPSIS** em 7 passos, fácil de rodar no navegador (Peña-Asensio 2024).
- **O VIPER testava "e se?"** injetando atrasos e falhas, e acompanhava "tempo até a sombra do Sol / da DSN" (Ennico 2023). É o que o nosso app faz.
- Dados novos: mapas de iluminação e Terra a 240 m em imbrium.mit.edu/BROWSE/EXTRAS/ILLUMINATION/ (Peña-Asensio).

## Bloco A: textos curtos (todos lidos inteiros)

### LPSC 2026 #1901 (George, Rubio, Lawrence, Curell), 2 páginas
Nada novo além do que já estava em artigos.md. Um detalhe: a estadia na superfície varia **5,75–6,25 dias "conforme a época da missão"**, mais as revoluções em órbita baixa. As regiões que mudam pouco com a época e com as estações foram as preferidas.

### Barker et al., LEAG 2021 (slides)
- As **"figuras de mérito"** da NASA para sítios são três: **iluminação média, dia mais longo e noite mais longa**. São a mesma coisa que LCIP e LCSP, com nomes simples. Bons rótulos para a interface.
- Exemplo de critério que eles calculam: "fração mínima de pixels **num raio de 100 m** com inclinação < 8°" e "com **noite mais longa < 14 dias** em 2024–2025". Isso confirma a ideia de mostrar métricas na elipse de 100 m.
- Recomendação: para estudos de detalhe, usar **todos os dados juntos** (LOLA + imagens + DEMs de imagem).

### Ennico-Smith et al. 2023 (VIPER, planejamento de rota)
- O VIPER tem ~450 kg, é solar e é comandado da Terra por rádio em linha de visada.
- Anda até 20 cm/s, mas a **velocidade efetiva é ~1 cm/s** ("Speed Made Good"). As sombras no polo mudam mais ou menos nessa mesma velocidade. Por isso planejar a rota é "trocar tempo por posição".
- Mais de 90 dias terrestres e até 20 km. Cada "perna" = 1 dia lunar. Os **Safe Havens** têm Sol prolongado e **sombra < 50 h**.
- Métricas acompanhadas pelo planejamento: estações visitadas, entradas em PSR, distância, **"time to Sun Shadow"**, **"time to DSN shadow"**, ISR.
- Mapas: estratégico sobre DEM LOLA de **20 m/px** + mapas térmicos de 4 m/px; tático sobre DEM de **1 m/px** por shape-from-shading (Ames Stereo Pipeline).
- **Teste de robustez:** eles injetam incertezas (horário do pouso, carga da bateria, consumo, velocidade, duração das atividades, falhas da DSN, tempestades solares). Os atrasos se acumulam por causa das janelas apertadas de Sol e comunicação. **É o "e se?" que o desafio pede, e a NASA faz isso na prática.**
- O plano tático cobre o dia lunar atual (**~10–14 dias terrestres**).

### Lim et al. 2024 (VIPER, operação científica)
- Restrições de rota: dinâmica do Sol e da comunicação, Safe Havens (a Terra fica abaixo do horizonte local **~metade de cada mês**), **inclinação transitável ≤ 15°**.
- A operação roda 24/7 na janela de **~14 dias** com Sol + DTE, em 3 turnos por dia terrestre.
- A NASA usou o **Open MCT** (Open Mission Control Technologies), uma plataforma web de visualização feita pela própria NASA, e um "leaderboard" para ranquear rotas. **Ideia:** o Open MCT é código aberto; dá para citar no pitch como inspiração ou referência de interface de operação.
- ⚠️ **Correção:** o "DTE de 256 kbps" que estava em artigos.md e fontes.md **não está nem no Lim nem no Ennico**. Ele veio de um resumo de busca sobre outro conjunto de slides, que não li. Removido.

### Palestra do Artemis para o Space Apps 2025 (Ortiz)
- O resto dos slides (Artemis IV e V, com Gateway, I-HAB e transportador de propelente) não acrescenta nada ao nosso projeto.
- Os mapas dos requisitos usam o **PGDA 78** (os DEMs de 5 m) e marcam com contorno as regiões de **inclinação contínua de 8°**.

### NASA, "Lunar Site Selection" (white paper, 2023)
- **"A Lua tem ~11 ciclos de estação a cada 10 anos terrestres."** Por isso a melhor época de luz anda pelo calendário. Conta: ano das estações lunares ≈ 346,6 dias, 365,25 − 346,6 ≈ 18,6 dias por ano, ou seja, as **2–3 semanas por ano** da palestra do Artemis.
- O HLS fica viável em órbita (NRHO) por **~90 dias**. A tripulação precisa chegar dentro dessa janela, por isso manter **várias opções de sítio**.
- Com o SLS Block 1, a Orion só alcança a órbita lunar em **~metade de cada órbita da Lua**, centrada na declinação lunar mínima. Isso é mais uma restrição de calendário.
- As imagens de maior resolução têm ~1 m, mas essa resolução não existe no polo inteiro.
- Para lá do polo, rumo ao lado oculto, a Terra é cada vez menos visível (às vezes só de pontos altos). E mesmo **terreno baixo do lado próximo** pode perder a Terra.
- Não existe ponto com Sol contínuo. Terreno mais alto e equipamento mais alto têm mais Sol.
- No futuro, equipamento deixado na superfície pode **fazer sombra** em outros equipamentos e virar obstáculo para pousos.
- Referências úteis: o vídeo da NASA SVS "Earth and Sun from the Moon's South Pole" e o white paper "Why Artemis Will Focus on the Lunar South Polar Region".

### NASA, "Lunar Communications and Navigation Architecture" (white paper)
- Terra visível do polo sul em ~metade de cada mês sideral (**~14 dias**), por causa da inclinação da órbita e do eixo. Quando visível, ela fica **sempre perto do horizonte**, e o terreno degrada o sinal.
- Cita uma medição real de multipercurso no polo: Rodriguez-Alvarez et al., **IPN Progress Report 42-226 (2021)**. É um candidato a leitura futura.
- Shackleton tem mais de **2 vezes a profundidade do Grand Canyon**. Bom dado para o modo educativo.
- Requisitos de navegação: pouso do HLS a até **100 m**, posição na superfície a até **50 m**, marcação de amostras a até **10 m**.
- DTE via DSN, Lunar Exploration Ground Systems (NSN), ESTRACK (ESA) e estações comerciais. Relays: LCRNS; padrão LunaNet. No futuro, comunicação óptica (laser).
- Autores: Zemba, Vaden, Reinhart (Glenn), Gramling (Goddard), Heckler (HQ).

## Bloco B: Barker 2021 e Barker 2023

### Barker et al. 2021 (lido inteiro, menos a lista de referências)
**Acrescenta:**
- **Os dados do LOLA no polo sul param em setembro de 2013.** A inclinação da órbita da LRO derivou e as latitudes perto do polo ficaram inacessíveis. Não existe LOLA mais novo para o polo.
- Geometria do LOLA a 50 km de altitude: traços a **12 m** um do outro na transversal e **57 m** entre medidas ao longo do traço; pontos de **5 m** de diâmetro; precisão de alcance de ~10 cm. Por isso o pixel mínimo natural é de 5 m. No DEM de 5 m original, só **~10% dos pixels** têm dado.
- Correspondência de nomes entre artigos: os Sites 1, 4, 7 e 11 do Barker/Mazarico = CR1, SR1, SV1 e GR1 do De Rosa 2012; Sites 1 e 4 = **C1 e S do Gläser 2018**. O Site 4 contém também o Site 8 do Mazarico 2011.
- Erro médio do DEM: **0,37 m** de altura e **1,9°** de inclinação. A parede de Shackleton tem **~36°** de inclinação.
- **Fórmula rápida do erro de interpolação:** ε = a·R + b·S + c, em que R é a resolução efetiva (m) e S a inclinação (°). Para o Site 1, a = 0,0210, b = 0,0051 e c = 0,022 m (Tabela 1). **Dá para usar no app para mostrar a incerteza do relevo sem rodar os 100 clones.**
- **Resultado importante:** considerar o erro do DEM quase sempre **piora** a iluminação em relação ao valor nominal. Basta uma única elevação errada no caminho para levantar o horizonte, enquanto abaixá-lo exigiria várias coincidências. **Ou seja, o valor calculado sem incerteza é otimista.** O app deve deixar isso claro.
- Números do Site 1 (Connecting Ridge), 2024–2026, nas regiões com média > 70% e área > 2.500 m²:
  - a **1 m de altura**: iluminação média (1º percentil) de **67–71%**, LCIP de **63–142 dias**, LCSP (99º percentil) de **13–22 dias**;
  - a **5 m de altura**: **83–89%**, LCIP de **119–231 dias**, LCSP de **4–8 dias**. A 5 m, o erro do DEM quase não importa mais;
  - poder **andar dentro da região** (um rover) a 1 m leva a 77–87%. Com painel a 5 m, a mobilidade acrescenta só 2–5%.
- A iluminação é maior no **verão lunar do sul**, e há ciclos maiores (18,6 anos) além do período simulado.
- Os DEMs, os clones e os mapas de incerteza estão no PGDA e no Imbrium (MIT).
- **Confirmado:** a receita do horizonte (720 direções; 5/80/240 m; 1 h; disco do Sol cortado na horizontal), o campo próximo (~100 m) e o distante (50–200 km), a elipse do HLS de 100 m de raio e o referencial MOON_ME do DE421.

### Barker et al. 2023, A New View of the Lunar South Pole from LOLA (lido inteiro, menos as referências; publicado no *Planetary Science Journal* 4, 183)
**Acrescenta:**
- **Por que 20 m é o DEM certo para o Artemis:** quase toda a zona do Artemis (abaixo de 84°S) tem resolução efetiva de **~20 m**. Por isso o DEM de referência deles é o de 20 m/px. A cobertura real dos pixels de 20 m varia de **15% a 75%** conforme o bloco.
- Os DEMs de 40, 60, 80, 120 e 240 m são **médias do de 20 m** (com os mesmos traços ajustados). Então eles são consistentes entre si, o que é ótimo para a grade aninhada.
- Interpolação por *natural neighbor* (triangulação de Delaunay). O erro final de posição dos traços é de ~1,00 / 1,00 / 0,15 m (estimativa conservadora).
- Existem **mapas de incerteza** de altura e de inclinação em função da resolução efetiva. Dá para mostrar a incerteza no app sem calcular nada.
- ⚠️ **Outra receita de horizonte**, para o mapa de PSRs: grades aninhadas começando em **20 m até 7 km** e terminando em **480 m até 310 km**. É diferente do Barker 2021 (5/80/240 m, cortes em 5 e 100 km). **Para o nosso projeto:** usar raio de até ~300 km é mais seguro que 200 km. Os dois artigos trabalham entre 200 e 310 km.
- **Truque bom de SPICE:** para achar PSRs, eles criaram um *kernel falso* que põe o Sol na **declinação mínima que ele atinge em 18,6 anos**. Assim simulam o "melhor verão possível" em **720 passos em vez de 165.000**. Para nós: dá para saber rapidamente **se um ponto chega a receber Sol** sem simular décadas.
- Área total de PSR abaixo de 80°S: **~20.800 km²**, que bate com outro estudo (20.900 km²). O Mazarico 2011 deu 16.055 km² com o DEM de 240 m. **A diferença vem da resolução:** o mapa mais fino acha muitas PSRs pequenas.
- PSRs pequenas no mapa são incertas: em pixels isolados longe do polo, até **~50% são falsos positivos**. As áreas medidas tendem a ser **subestimadas**.
- Mapas de rugosidade em escalas de 100 a 1.600 m. Há faixas lineares de rugosidade, provavelmente raios de ejecta (um deles do Tycho), que passam por regiões do Artemis. É bom para o modo educativo; para o nosso cálculo, não muda nada.
- O trabalho foi financiado pelo projeto **LuNaMaps** (Lunar DEM, Mapping, Modeling, and Validation) da NASA. Ele também cita um estudo de rotas (Mazarico et al. 2023) que pode valer uma leitura futura.

## Bloco C: Bryant 2009 e Smith 2016

### Bryant 2009, JPL IPN 42-176 (lido inteiro, 43 páginas)
**Corrige ou detalha o que tínhamos:**
- ⚠️ O "92% de energia e 51% de DTE" vale para **o sítio B1** (−89,388°, −137,81°, 1.261 m, na crista **a oeste de Shackleton**) e usa uma **simplificação**: Sol e Terra distribuídos por igual dentro de um "retângulo" de posições possíveis, sem efemérides reais. Com efemérides reais de 2009–2028 (do JPL Horizons, a cada 24 h), o mesmo sítio dá **~92% de Sol inteiro e ~54% de Terra inteira**. As duas versões batem dentro de 5%.
- Há **três níveis** de métrica: qualquer pedaço visível, metade visível e disco inteiro visível. Para o B1:
  - Sol: 97,0% / 94,8% / 91,7%;
  - Terra: 65,2% / 58,2% / 51,3%.

  **Para o app:** deixar claro se a métrica é "algum Sol" ou "Sol inteiro".
- **Não é LOLA:** o DEM é o do **radar de Goldstone (2006)**, com 40 m e ~5 m de precisão vertical. Dentro do quadrado de 100 × 100 km, **~40% da área estava em sombra de radar** e foi preenchida com um limite superior "conservador". Os números são bons como ordem de grandeza, mas o DEM é mais antigo e pior que o LOLA.

**Acrescenta:**
- **Malapert α (−86,037°, 1,705°, 4.207 m) e Leibnitz β (−84,723°, 39,471°, 6.055 m) veem a Terra 100% do tempo** (algum pedaço; disco inteiro em 94,7% e 100%). Eles têm visada direta para a borda de Shackleton. O artigo propõe usá-los como **relay**, um refletor que liga a Terra aos sítios em Shackleton.
- **A Terra quase não melhora com um mastro alto.** Subir de 2 m para 3.000 m leva o DTE do B1 só de 65% a 75%. O que manda na Terra é **a distância do polo na direção do lado visível**. Já o Sol melhora com a altura (97% → 100%, mas só com torres de mais de 2.500 m, por causa de Malapert e Leibnitz). **Insight para o app:** o slider de altura do mastro afeta o Sol, quase nada a Terra.
- No polo, **nenhum lugar tem 100% de Sol e 100% de Terra** com torre menor que 1.500 m.
- O B1 tem **8 meses sinódicos seguidos** com algum Sol. A borda de Shackleton e a crista oeste ficam com 90–97% de Sol em média, com "energia solar plena" em 85–91% do ano.
- **Métricas para a bateria:** "dias escuros no mês de inverno" e "maior período contínuo no escuro". Definem o mínimo e o máximo de armazenamento. **Eclipses** (parciais, até **3,9 h**) não estão incluídos nessas contas.
- **Fórmulas fechadas** (equações 8 e 10) para estimar iluminação média e DTE em função da distância do polo e da altura, considerando a Lua uma esfera. Elas erram até **20%** porque ignoram picos específicos, mas servem para um "modo rápido" ou educativo. A equação 11 dá a altura necessária para ver o Sol de inverno por cima de um pico.
- O Sol passa **mais tempo perto dos limites de latitude** (±1,54°) que no meio; não é uniforme. A Terra tem 4 picos de permanência perto de ±5–7°.
- A região em volta do polo sul fica, em média, **1.880 m abaixo** da esfera de referência (é a bacia de Aitken).
- **Projeto do painel:** um eixo vertical girando com o Sol, uma volta por mês sinódico. Isso cria o problema do cabo enrolando, resolvido com anéis deslizantes, com um "desenrolar" mensal ou com um **heliostato** (espelho que gira e reflete a luz para um painel fixo, e que poderia iluminar até o fundo de crateras). Bom conteúdo para o modo educativo.
- A Tabela 1 traz coordenadas de feições do polo: Malapert, Leibnitz, Amundsen, Cabeus, de Gerlache, Faustini, Nobile, Shackleton (centro GSSR −89,639°, 137,825°; centro IAU −89,9°, 0°), Shoemaker, Sverdrup. Serve para a lista curada.

### Smith et al. 2016, LOLA após 7 anos (*Icarus* 283, 70–91; lido inteiro)
É um artigo de revisão, quase todo sobre geologia. O que interessa ao projeto:
- **Os DEMs polares de 5 m cobrem de 87,5° até o polo.** O requisito da missão era de 30 m para sítios de pouso. Abaixo de 80°, os DEMs polares vão de 5 a 80 m; abaixo de 75°, de 30 a 120 m; abaixo de 60°, de 60 a 240 m.
- A posição dos dados LOLA tem precisão de **menos de 10 m** no total e de menos de 1 m na vertical, depois do GRAIL.
- **Quanto mais fino o DEM, mais sombra permanente aparece** (~25% a mais de área de PSR a 20 m do que a 60 m) **e menores ficam as médias dos pontos mais iluminados.** Com o mesmo DEM, a 240 m, 60 m e 20 m: 10,19%, 11,41% e mais área sombreada abaixo de 85°S. **Para o app:** a resolução do DEM muda o resultado. Nossa iluminação a 20 m será um pouco **menor** que a de mapas de 240 m, e isso é esperado.
- **"Não existe pico de luz eterna na Lua"** (Noda 2008, Mazarico 2011, Gläser 2014). Confirmado.
- Existem PSRs até **58°S**, longe do polo.
- Mazarico 2011 usou o "método do horizonte" e não raytracing, por ser mais eficiente para muitos passos de tempo. Há também uma simulação mais nova a **60 m entre 82,5° e 90°S**, com média de Sol e de Terra em 18,6 anos. É o produto do PGDA 69.
- Comparação de DEMs: **SLDEM2015** (~60 m, 3–4 m de precisão, ~87% da superfície), GLD100 da câmera WAC (±79°, resolução efetiva ~1 km, 10–20 m na vertical) e DTMs da câmera NAC (2–5 m, mas só ~2% da Lua).
- Curiosidades para o modo educativo: o ponto mais alto da Lua fica a **+10,792 km** (5,341°N, 201,37°E); o mais fundo, a **−9,129 km**, dentro de Antoniadi (70,36°S), em sombra permanente. Shackleton é uma cratera antiga (mais de 3 bilhões de anos) e muito bem preservada; o fundo dela é mais claro no infravermelho do LOLA, o que pode indicar gelo ou menos intemperismo espacial.

## Bloco D: Sanchez Net, Peña-Asensio, Gläser 2018, Mazarico 2018, Wueller 2026

### Sanchez Net 2019, JPL IPN 42-216 (lido inteiro)
É quase todo teoria de rádio (modelo estatístico do canal). Para o projeto:
- **Confirmado:** no polo sul, a antena aponta para a Terra a **no máximo 10°**. Com antena de pouco ganho, a "zona de Fresnel" do sinal encosta no chão e as reflexões somam ou cancelam o sinal (**multipercurso**).
- Na época **não existiam medições reais** desse canal no polo. Hoje há a medição citada no white paper da NASA (IPN 42-226, 2021).
- Formas de mitigar: mais potência ou taxa menor, controle automático de ganho, várias antenas, intercalação de dados, retransmissão.
- Resultado: em banda X (8,45 GHz) com antena de 34 m da DSN, o canal tem **desvanecimento lento** (tempo de coerência de ~50–58 ms) para taxas de 1 a 500 kbps. Os "apagões" de sinal duram de 3 a 6 ordens de grandeza mais que os de celular.
- ⚠️ **Inconsistência no próprio artigo:** a Seção IV usa Doppler máximo de **35 kHz** e ângulo de 70–115°, e a conclusão fala em **~12 kHz** e 75–115°. Não afeta o nosso projeto, mas convém não citar esses números.
- **Para o app:** o que importa é a regra prática. Terra baixa perto da crista significa enlace pior. Mostrar a **margem da Terra acima do horizonte** já basta; não precisamos modelar o canal de rádio.

### Peña-Asensio, Neira-Acosta e Sánchez-Lozano 2024, arXiv 2406.19863 v2 (lido inteiro)
**Acrescenta:**
- **Método completo do TOPSIS em 7 passos:**
  1. montar a matriz de alternativas × critérios;
  2. normalizar pela norma euclidiana de cada coluna;
  3. multiplicar pelos pesos (soma = 1);
  4. achar a solução ideal (melhor valor de cada critério) e a anti-ideal (pior valor), lembrando que há critérios de "benefício" e de "custo";
  5. calcular a distância euclidiana de cada alternativa às duas;
  6. calcular a proximidade R = d⁻ / (d⁺ + d⁻);
  7. ordenar.

  **É pouca conta e roda instantâneo no navegador.** Dá para implementar direto nos sliders.
- **Como eles geraram os locais candidatos:** inclinação de **0–5°** (mais rígido que os 10° da palestra do Space Apps) com uma margem de segurança de **100 m**. Isso deu 732 polígonos, amostrados a cada 50 m, e daí as **1.247 alternativas**.
- **Os 6 critérios:**
  - C1: área total visível da janela do HLS, a **40 m de altura**, até 200 km, considerando a curvatura;
  - C2: % do raio de 2 km de caminhada de onde o lander continua visível;
  - C3: iluminação média × % de PSR no raio de 2 km, um produto que obriga a ter as duas coisas;
  - C4: comunicação com a Terra;
  - C5: unidades geológicas;
  - C6: minerais máficos.
- **Fonte de dados nova:** mapas de iluminação, PSR e Terra visível a **240 m** em `https://imbrium.mit.edu/BROWSE/EXTRAS/ILLUMINATION/`.
- A visibilidade é calculada com o **algoritmo de Bresenham** (linha em grade) com curvatura. Ele lembra que, num terreno plano, o horizonte fica a ~12 km para quem está a 40 m de altura (√(2·R·h) ≈ 11,8 km).
- Resultado: o ponto nº 358 em **Nobile Rim 2 (−84,20156°, 60,69989°)**, com R = 0,69. Ele vê a Terra **~1/3 do tempo**. Dos 100 melhores, 36% estão no Nobile Rim 2, 30% no "Site 23" e 13% no Amundsen Rim. Haworth não tem nenhum no top 100.
- **Sensibilidade:** com 40% de peso para Sol/PSR e 40% para a Terra, o 1º colocado continua o mesmo e os 19 primeiros também. O resultado foi comparado com outros três métodos (MABAC, VIKOR, CoCoSo): todos concordam nos dois primeiros e divergem mais embaixo.
- ⚠️ A tabela que liga as siglas antigas (DM1, DM2, LM7, Site01…) aos nomes oficiais saiu embaralhada na extração do PDF (14 siglas e 13 nomes). Só **DM1 = Amundsen Rim** e **DM2 = Nobile Rim 2** são seguros. Usaram as 13 regiões antigas + o Site 004, não as 9 atuais.
- **Para o app:** o TOPSIS é a forma mais simples e defensável de fazer o botão "Otimizar" com pesos. Uma "análise de sensibilidade" (mexer nos pesos e ver se o 1º lugar muda) é um ótimo recurso visual.

### Gläser et al. 2018, PSS 162 (versão do autor no NTRS; lido inteiro)
**Corrige um entendimento nosso:**
- ⚠️ Os artigos usam **duas métricas diferentes**:
  - **"average illumination"** é a média da fração do disco visível;
  - **"solar visibility"** é a % do tempo com *algum* pedaço do Sol visível.

  O "92,27% a 2 m" do Gläser 2014 ("recebendo luz solar 92,27% do tempo") é **solar visibility**, não iluminação média. Neste artigo, o mesmo lugar (Connecting Ridge C1) dá **88,0% de iluminação média e 92,1% de solar visibility a 2 m**. **No app, as duas métricas precisam ter nomes diferentes.**
- Referência confirmada: Gläser 2014 = *Icarus* 243, **78–90**.

**Acrescenta:**
- DTM de 20 m com 400 × 400 km. Na área central de 50 × 50 km do polo sul, **77% dos pixels de 20 m têm dado real** (23% interpolados). O erro de interpolação tem desvio-padrão de 10 cm.
- Iluminação hora a hora de 2017 a 2037, na superfície e a 2 m.
- **Melhores pontos do polo sul** (longitude de 0 a 360°E; para converter para ±180, subtraia 360):

  | Ponto | Lat, lon | Superfície (média / visib. / sombra máx.) | A 2 m (média / visib. / sombra máx.) |
  |---|---|---|---|
  | Connecting Ridge C1 | −89,4505°, 222,84°E | 76,0% / 81,3% / 268 h | (em −89,4398°, 222,83°E) **88,0% / 92,1% / 112 h** |
  | Connecting Ridge C2 | −89,3157°, 245,94°E | 75,6% / 80,6% / 166 h | 78,1% / 82,0% / 165 h |
  | Borda de Shackleton | −89,7849°, 203,97°E | 81,0% / 85,5% / 221 h | 85,5% / 89,4% / 66 h (em −89,6866°, 197,19°E) |
- **O mesmo ponto em três estudos:** no C1, o Mazarico 2011 (DEM de 240 m) dá 89,0% de média e 92,7% de visibilidade; este estudo (20 m) dá 76,0%; Speyerer & Robinson 2013 (imagens de 100 m, 1 ano) dá 64,2%. **DEM grosso superestima** (alisa o horizonte próximo); imagens de baixa resolução subestimam. Por isso o nosso cálculo a 20 m deve ficar abaixo dos mapas de 240 m.
- Na superfície, as faixas bem iluminadas têm só **20–40 m de largura**; a 2 m de altura elas se alargam para **centenas de metros**.
- Esses sítios ficam no escuro no máximo **3 a 8 dias**, contra ~15 dias de noite no equador.
- Um rover que **se move um pouco** no C1 fica iluminado em **94,4% do ano**, com o maior eclipse de 101 h (Speyerer et al. 2016).
- Há PSRs pequenas a **30–370 m** dos pontos iluminados, com inclinações de até 17° (um rover aguenta ~21,8°).
- **Cruzamento:** o B1 do Bryant (−89,388°, −137,81° = 222,19°E) fica praticamente no **Connecting Ridge C1**. O "melhor lugar" é o mesmo em todos os estudos; os números mudam por causa do DEM e da métrica.

### Mazarico, Barker e Nicholas 2018, IllumNG, *Adv. Space Res.* 62(11) (PMC; lido inteiro)
**Acrescenta:**
- **O horizonte mais distante possível na Lua fica a ~300 km.** Eles calcularam 10 milhões de pontos e acharam 299,8 km no máximo, confirmando um estudo teórico de 2008. Muitas regiões têm horizonte bem mais perto. Para a cratera Faustini, perto do polo, **200 km bastaram**. **Para nós:** usar 200 km no polo e até 300 km como limite seguro em qualquer lugar. Isso fecha a questão entre os "200 km" do Bryant e os "310 km" do Barker 2023.
- O **método do horizonte** do Mazarico 2011, que é o nosso, pré-calcula o horizonte de cada ponto e é **o mais eficiente para longos períodos**. Ele usava simplificações de projeção válidas **perto dos polos**. Para um sítio isolado em qualquer lugar (Apollo, por exemplo), a máscara de horizonte por azimute continua válida; a limitação era para mapas de muitos pixels.
- O IllumNG faz *raytracing* de verdade (C++, biblioteca CGAL, SPICE, octree): mais exato e mais caro.
  - O Sol é modelado como **100 pontos de luz com escurecimento de borda**, num total de **1.365 W/m²**.
  - A **Terra** é modelada como uma fonte 3D com 671 elementos, para calcular a luz da Terra refletida (*earthshine*) e a "visibilidade da Terra iluminada".
- Exemplo de **malha em várias resoluções** (caso global): 128 px/grau até 30 km, 64 até 60 km, 32 até 120 km, 16 até 300 km e 4 além disso. É o mesmo princípio da grade aninhada.
- Curiosidade útil: usar uma Lua esférica em vez do relevo LOLA erra o início e o fim de eclipses em até **200 s**.
- O resto do artigo trata de calibração de instrumentos da LRO (LOLA passivo, brilho do horizonte lunar, star trackers, LAMP com luz de estrelas, imagens da câmera NAC dentro de PSRs com luz refletida duas vezes). Não se aplica ao nosso projeto.

### Wueller et al. 2026, *JGR Planets* 131(3) (versão aberta da ETH Zürich, CC-BY; lido inteiro, menos as referências)
**Resolve a dúvida do nosso CSV:**
- ✅ **"dias_sol_AAAA" = o número MÁXIMO de dias SEGUIDOS com Sol** no **meio do verão** daquele ano; "dias_sol_terra_AAAA" = o mesmo, mas com Sol **e** Terra visíveis ao mesmo tempo (Tabela A2).
- Como foi calculado:
  - ferramenta **Lunar QuickMap "TerrainShadows"** (da empresa ACT, a mesma do QuickMap);
  - mapa de **60 m/px**, passos de **12 h**, painel a **2 m** de altura;
  - sombras calculadas até **150 km** de distância;
  - efemérides **DE441**.
- **"Meio do verão"** é quando a latitude subsolar fica **≤ −1,5°**. Datas (Tabela 2):

  | Ano | Início | Fim | Dias |
  |---|---|---|---|
  | 2025 | 20/11 | 21/12 | 32 |
  | 2026 | 06/11 | 27/11 | 22 |
  | 2027 | 15/10 | 14/11 | 31 |
  | 2028 | 27/09 | 14/10 | 18 |
  | 2029 | 15/09 | 02/10 | 18 |
  | 2030 | 19/08 | 19/09 | 32 |
  | 2031 | 05/08 | 26/08 | 22 |
  | 2032 | 13/07 | 12/08 | 31 |

  **O pico do verão anda de novembro (2025) para julho (2032).** Isso bate com as "2–3 semanas por ano" da NASA.
- **Critério deles:** **≥ 10 dias seguidos** é favorável (6,5 dias de missão + folga antes e depois); **> 16 dias** é ideal.
- **Ótimo dado para o pitch:** o meio do verão de **2026 vai de 06/11 a 27/11**. O hackathon (14 e 15/11/2026) cai **bem dentro do verão lunar do sul**.

**Acrescenta:**
- Os nomes das 16 regiões estão confirmados na Tabela 1. **MMA = "Mons Malapert"** (antes "Malapert Massif"); **MMO = Mons Mouton, que antes se chamava "Leibnitz Beta Plateau"**. O Connecting Ridge saiu da lista de 2024. Mons Malapert tem ~6 km de altura e Mons Mouton ~8 km; os dois são restos da borda da bacia SPA.
- Requisito do HLS (documento da NASA de 2019): inclinação de **0–8° (limite) e 0–5° (meta)**, com precisão de pouso de **100 m (3σ)**. Eles excluíram tudo a menos de 100 m de uma inclinação > 8°. ⚠️ A palestra do Space Apps 2025 diz **"< 10°"**. **Há divergência entre as fontes da NASA:** no app, deixar o limite como parâmetro (padrão 8°, com opção de 10°).
- Para caminhar: rota com **inclinação ≤ 15°**; EVA "nominal" < 20°.
- Área boa para pouso por região: a maior é a do MMP (**564,8 km²**, mais que todas as outras juntas); a maior fração é a do Slater Plain (**19,3%**); a menor é a do PCB (**0,5%**, 2,1 km²).
- **Disponibilidade:** em 2032, 97 dos 130 sítios estão disponíveis; em 2031, só 44. Exigindo também a Terra: 86 e 34. **A Terra limita pouco.**
- **Os mais estáveis:** os sítios em pontos altos (CR06, CR07, 001, MMA_K2023, MMO01, MMO02, NR101, NR103, 007, 011) têm **≥ 16–17 dias seguidos em todos os anos**, chegando a 30–32 dias nos verões longos. Os pontos altos variam pouco de ano a ano.
- Inclui os **sítios de referência da NASA** 001 (Connecting Ridge), 007 (Peak Near Shackleton) e 011 (de Gerlache Rim 1), além de sítios de Kring et al. 2023 (`_K2023`).
- Exemplos detalhados:
  - **CR05** (−89,421°, −149,472°): bom em 2025, 2026, 2027 e 2030; tem PSRs com ~425 t de água potencial;
  - **PNS02** (−89,061°, 128,442°): bom em 2028, 2029, 2030 e 2032; PSRs a 62–91 K.
- Gelo: 21 sítios têm PSR acessível que nunca passa de 110 K; os mais frios (< 90 K) ficam perto de FRA04, FRA06, PNS01, PNS02, SP01 e SP10. 85% das crateras com PSR têm menos de 1,5 bilhão de anos. Estimativas de água: até ~645 t em PNS03, ~26% de uma piscina olímpica. Para fazer 10 t de oxigênio por ano são precisos ~15 t de água, ou ~1.500 t de regolito a 1% de gelo. Bom para o modo educativo; foge do núcleo do desafio.
- ⚠️ O artigo diz que o eixo da Lua tem inclinação de **1,59°** (citando Vasavada 2012). O Bryant e a maioria das fontes usam **1,54°**. Mantemos 1,54°, que é o valor padrão.
