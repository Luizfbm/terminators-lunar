# O que aprender com os 27 repositórios

Lições tiradas dos READMEs e dos documentos de método, validação, decisões, demo e uso de IA dos outros times, lidos em 02/11/2026. A lista dos repositórios está em [repos-concorrentes.md](repos-concorrentes.md) e a análise geral em [concorrencia.md](concorrencia.md).

Aprender com métodos e fontes públicas é estudo. Copiar código de outro time, não. Os números citados aqui são o que cada time declara: não rodei nada. Antes de usar um número deles, conferir no artigo original.

## As 12 lições que mais mudam o nosso plano

1. **Pergunte ao Local Lead as regras do evento local.** O evento de Bangladesh tem uma "Stage 1" que pedia um link público do GitHub até 7/10 (SIGHTLINE, decisão D-010). Eventos locais podem ter prazos e regras próprios. O SIGHTLINE listou três perguntas que também valem para nós: (a) pode ter documento de conceito antes do evento? (b) pode baixar dados públicos antes? (c) pode ter templates genéricos prontos?
2. **Um PROMPT.md preparado antes é legítimo, e o BroBYW mostra como.** O arquivo deles foi escrito para ser colado no Claude Code em 14/11: visão do produto, funcionalidades P0/P1/P2, métricas definidas e a regra "o enunciado oficial vence". Eles acabaram começando antes, por escolha. Nós podemos preparar o mesmo documento e só usá-lo em 14/11.
3. **A coordenada publicada quase nunca é o ponto certo.** Mover 51 m levou o ponto de Shackleton do Mazarico 2011 de 0% para 72% de Sol (BroBYW). O centro do quadrado do SIGHTLINE em Shackleton caiu numa parede de cratera com 11% de Sol e Terra nunca visível. A regra dos dois times é a mesma: usar o ponto mais alto dentro da região, ou dentro de 250 m da coordenada publicada.
4. **Validar só contra estudos que usaram LOLA.** Bryant 2009 (radar de Goldstone), Bussey 2010 (Kaguya) e Speyerer 2013 (imagens) usaram outros mapas, e as coordenadas deles não batem com o LOLA (BroBYW). Os pares bons para comparar são o Gläser 2014/2018, o Barker 2021 e os mapas do PGDA 69 / AVGVISIB.
5. **Comparar as mesmas métricas e a mesma altura.** O BroBYW calcula as três definições (fração média do disco, "algum pedaço do Sol" e "Sol inteiro") na mesma altura do estudo. A 0 m o resultado cai muito (55,7% contra os 76% do Gläser), porque o relevo dos primeiros metros passa a mandar.
6. **Os primeiros 30 m mandam no resultado com mastro baixo.** No Connecting Ridge, o SIGHTLINE achou 24,8% de Sol sem mastro e 35,2% com 2 m. O DEM de 5 m perto do sítio é obrigatório, e a altura do mastro precisa ser um controle visível.
7. **A máscara de horizonte é barata.** O POLAR WINDOW mediu ~130 ms por sítio (43 ms com numba) para 1.440 raios até 50 km. Isso derruba a premissa de que só dá para pré-calcular: dá para calcular coordenadas livres na hora.
8. **Não é preciso baixar o DEM inteiro.** O POLAR WINDOW lê só uma janela de 20 km em volta de cada sítio, com requisições HTTP de intervalo (range), sem baixar o arquivo de 1,85 GB.
9. **Fixar a tolerância antes de rodar o teste e incluir um controle negativo.** O SIGHTLINE escreveu o limite de 0,02° antes de existir qualquer resíduo e testou que um deslocamento de 10 min ou de 0,01° na longitude quebra o teste. Isso convence um juiz.
10. **Separar geometria de sobrevivência.** Dois dos três landers CLPS que pousaram terminaram com Sol e Terra ainda visíveis (POLAR WINDOW). A ferramenta diz quando há luz e contato. Não diz se a missão sobrevive.
11. **Uma frase de validação que qualquer um entende.** "O pôr do Sol do Blue Ghost 1 caiu no dia em que a NASA anunciou o fim da missão" (POLAR WINDOW, 16/03/2025, ±32 min). Cabe num slide.
12. **Na demo, só números de uma tabela fechada.** O SIGHTLINE proíbe ler na gravação um valor que não esteja numa tabela com definição e fonte, e proíbe dizer "validado no sítio": o certo é "conferido". Também proíbe o logo da NASA e pessoas menores de 18 no vídeo.

## Repositório por repositório

### 1. MdAhbab/PolarWindow

- **Arquitetura em camadas (ADR-1):** a máscara é pré-calculada por sítio, e as linhas do tempo são calculadas na hora com passo de 900 s e guardadas em cache. Uma tabela anual pré-calculada foi abandonada porque calcular na hora custa 12,5 ms.
- **Resolução justificada pela física:** perto do polo o Sol anda 0,51° de azimute por hora. Uma faixa de 0,25° equivale a 29 min de movimento do Sol, a mesma ordem do erro que o DEM já impõe. Passo de 900 s é meia faixa, então nenhuma passagem escapa. Depois, bissecção até ~1 s.
- **Validação contra o que voou:** compara com o arquivo SPICE do CLPS no NAIF (instante do pouso com 1 s de diferença, posição a menos de 100 m) e diz onde a validação não serve. Nenhum dos três pousos foi um pôr do Sol causado pelo relevo.
- **Quatro números sempre juntos e nenhuma nota única.** A comparação ordena por um número de cada vez e mostra empates como empates.
- **IA que não pode inventar número:** o assistente só responde com resultados das ferramentas, e uma trava recusa números que não vieram delas.
- **O que evitar:** o escopo é enorme (trajetória, radiação, clima no lançamento). Em 36 h, isso é impossível e dilui a mensagem.

### 2. BroBYW/CLPS-Lunar-Mission-Website

- **O PROMPT.md e o PLAN.md** (lição 2) e o **AI_USAGE.md**, um registro datado do que a IA fez e do que o time decidiu. É o formato que vamos precisar para declarar o uso de IA.
- **As propostas técnicas do PLAN.md:** geometria esférica exata em vez de d²/2R (a aproximação erra 0,012° a 300 km), raios a cada 0,1°, horizonte até 300 km, métricas num grid interpolado de 10 min, eclipses lunares tirando o Sol e balanço de energia da bateria além de "carga × maior noite".
- **Validação variada:** Horizons, terreno sintético (esfera e platô com resposta exata), "subir o observador nunca levanta o horizonte" em 50.400 valores, Gläser na mesma altura, mapas do PGDA, eclipses contra o catálogo da NASA, WCAG e 1.022 fotos do LRO.
- **Pino livre com aviso:** fora dos sítios, usa uma grade de 480 m e chama o resultado de "primeira olhada". O pior caso é Malapert, com 15 pontos a mais porque a grade arredonda o pico.
- **Roteiro de demo pronto:** vídeo de 30 s plano a plano com legenda, links que reproduzem cada tomada exatamente e 7 slides de reserva.
- **Uma frase de comparação que fica:** "o cume mais ensolarado perde a Terra, e Haworth equilibra os dois".
- **Ideias de produto:** o "cartão-postal da Terra" (o momento mais bonito da Terra acima da crista), jogos e "olhar em volta" com a bússola do celular.
- **O que evitar:** depois que o núcleo ficou pronto, a IA "sugeriu nove funcionalidades e construiu sem aprovação passo a passo", e o produto inchou.

### 3. WarRinOP/sightline

- **Mastro exato:** para cada azimute, o arquivo guarda as retas `A − h·B`, e a máscara para qualquer altura h é o envelope superior delas. A primeira versão interpolava 13 alturas e errava de 0,1° a 0,7°.
- **Fórmula estável:** a elevação do relevo foi escrita para não subtrair dois números perto de 1,7 milhão de metros, o que perdia dígitos.
- **Armadilha numérica:** `acos(u·v)` não resolve ângulos abaixo de 8,5e-7°. O certo é `atan2(|u×v|, u·v)`.
- **Detalhes do Horizons:** no máximo 25 instantes por requisição (com 50 a URL fica longa e dá erro 502), 1 s entre pedidos e conferir o "eco" de como o Horizons leu o sítio.
- **Contratos de dados com zod e um motor falso** marcado como SIMULATED, para a interface andar antes do motor real.
- **Registro de decisões (D-001 a D-034),** com contexto, decisão e consequência. Útil para o nosso ai-memory.
- **AI_DISCLOSURE.md:** separa a IA usada para construir da IA dentro do produto. Princípio: a IA nunca calcula resultado científico.
- **Números que dá para conferir:** no Shackleton Rim (crista), 85,8% de disco médio visível em 2026 a 2 m. A estação pesa: o Sol fica metade do ano acima do horizonte e metade abaixo, e a maior noite chega a 185,8 dias.
- **O que evitar:** monorepo grande com seis semanas de cronograma e três devs. Não serve para 36 h.

### 4. EmanuelAbasto/CLPS-Lunar-Mission-Browser

- **Botão "horizonte plano × relevo real",** que "muitas vezes inverte o ranking". É a melhor forma de mostrar por que o relevo importa.
- **Validação barata e boa:** 50 pixels do mapa de sombra permanente (PSR) do LOLA. Os 25 de sombra nunca foram iluminados e os 25 iluminados foram, todos.
- **Regra de "Sol nasceu" pela borda superior do disco,** conferida com a marcação de dia do próprio Horizons.
- **Modo simples, com frases como "cerca de 9 dias de Sol por mês", e modo especialista,** além de um link que guarda o cenário inteiro.
- **O que evitar:** sítios de exemplo no lugar dos reais. Fizeram a engenharia antes dos dados.

### 5. Hamzaslam1996/lunarwindow

- **Detalhe que pega muita gente:** no mapa polar estereográfico, o "para cima" não é o norte. O azimute verdadeiro é o da grade menos a longitude.
- **Reproduziu um número publicado:** o pior dia lunar na borda de Shackleton do Fincannon 2007 (0,71). Ficou a 0,015 com o observador a 10 m e a 0,48 nas coordenadas impressas no artigo. De novo, a coordenada manda.
- **"Relatório de garantia"** exportável, com os kernels, o DEM, a versão do método e o commit usados. Isso é reprodutibilidade.
- **Lista honesta do que não modela:** escurecimento do limbo, curvatura do horizonte dentro do disco do Sol e modelo térmico.

### 6. Klauscreates/lunar-south-pole-explorer

- **Avisos de escopo em linguagem clara:** "visibilidade geométrica não é qualidade de enlace" e "geração modelada não é carga garantida".
- **Um "Test Site A" neutro para validação,** separado dos sítios reais.
- **O que evitar:** período fixo (out a dez/2026) e 5 pontos. O usuário bate no limite logo.

### 7. kaizarmerchantt-git/clps-lunar-mission-browser

- **A ideia de usar as 13 regiões do Artemis III** é boa e ainda livre de execução séria.
- **O que evitar (o mais didático da lista):**
  - coordenadas arredondadas (89,90°S 0,00°E; 88,00°S 30,00°E);
  - duas linhas com os mesmos números ("Connecting Ridge" e "Connecting Ridge Extension");
  - notas de janela todas 100/100, que não separam nada;
  - nota final que vai de 92 para 18 entre sítios quase iguais.
  
  Um juiz técnico desconfia na hora.

### 8 e 9. rafaa-sf/L-SEA e lunar-horizon-clps-browser

- **Demo em Streamlit:** é o caminho mais rápido para ter algo no ar em Python.
- **README em dois idiomas.** No nosso caso o enunciado pede inglês, mas a apresentação local pode ser em português.
- **O que evitar:** promessa de "motor autônomo de decisão" e "cockpit tático". Prometer decisão autônoma num problema em que a NASA quer ver a evidência soa mal. E dois repositórios iguais confundem.

### 10. partofcosmos-site/lunarsite-compass

- **Achado útil:** o mesmo ponto pode ter Sol e Terra por muitos dias seguidos em Mons Mouton, porque a altitude levanta a Terra no céu. Vale conferir com o Wueller 2026.
- **O que evitar:**
  - efemérides do Meeus em fórmula fechada em vez de SPICE;
  - pesos arbitrários (35/25/25/10/5) sem justificativa;
  - jargão teatral ("Flight Decision Seal", "GO FOR TOUCHDOWN" com hash SHA-256).
  
  Se usarmos TOPSIS, os pesos têm que vir de um requisito (Artemis III) ou ficar na mão do usuário.

### 11. dundaryusuf566-maker/clps-lunar-browser

- **Previsão registrada antes do evento:** publicaram com data marcada uma previsão de quando e onde o Griffin-1 pode pousar, antes do lançamento. Uma ideia equivalente para nós: "a próxima noite em Mons Mouton começa em tal data".
- **"Uma checagem que falhou continua falhando":** o critério fica escrito no código antes de ver os dados, e as falhas aparecem no placar (12/13, 5/6, temperatura no polo reprovada). Mostrar uma falha aumenta a confiança.
- **Pergunta invertida:** "quero pousar aqui entre estas datas, com pelo menos N dias de Sol". Encaixa no nome "Navigator".
- **Temperatura do solo** conferida contra o Diviner. Fica de fora do nosso núcleo.

### 12. Nxmmy-Na/CLPS-Lunar-Mission-Browser

- **API simples e documentada** (`/api/sites`, `/api/site-analysis`), com parâmetros de painel e bateria.
- **Interface bilíngue** com troca na tela.
- **O que evitar:** "fator de sombreamento do terreno de 0 a 1" como parâmetro manual e estação do ano como "latitude subsolar ±1,54°". É física de enfeite: o relevo tem que vir do DEM.

### 13. taimashard0/spice1

- **Mapas de calor diários** e zoom por ano, mês e dia: é um jeito bom de mostrar meses de dados de uma vez.
- **Limiares editáveis** (o usuário define o que conta como "ter Sol").
- **O que evitar:** subir o projeto como um zip de 7.474 arquivos com dependências instaladas. Os juízes não vão baixar.

### 14. suhaslord/clps-lunar-browser

- **Formato JSON combinado antes** (sítio, hora, Sol e Terra com azimute, elevação e "visível") para o front e o back trabalharem em paralelo. Em 36 h, isso é essencial.
- **Divisão do time por área** escrita no README.
- **O que evitar:** o exemplo põe o Sol a 3,7° de elevação a 89,5°S, o que não acontece. Até dados falsos precisam ser plausíveis, porque alguém tira print.

### 15. shrestha-droid/clps-lunar-mission-browser

- **O mínimo viável:** uma página estática com dados do Horizons e só a biblioteca padrão do Python. Ficou no ar no GitHub Pages em um commit.
- **Lista honesta de "próximos passos",** com a máscara do LOLA como prioridade 1. É exatamente o que nos separa de um projeto raso.

### 16. friendlyfoe241-cyber/CLPS-Lunar-Mission-Browser

- **Pacote Python organizado por domínio** (efemérides, iluminação, terreno, sítios, coordenadas) e um docs/DATA_SOURCES.md. É uma boa estrutura de pastas para o nosso backend.
- **O que evitar:** README vazio com demo no ar. Ninguém entende o que é.

### 17. platonicHunter/CLPS-Lunar-Mission-Browser

- **O que evitar:** README padrão do create-next-app. É o primeiro arquivo que o juiz abre.

### 18. polcxw/clps-lunar-mission-browser

- **O que evitar:** colar o HTML inteiro dentro do README.

### 19. EAZYCODER2415/clps_lunar_mission_browser

- Componentes de interface separados (carta do céu, linha do tempo, barra de ferramentas). É uma divisão de telas parecida com a que vamos precisar.

### 20. kaveen-git12/nasa-clps-lunar-mission-browser

- Páginas de missões e planejador num React simples. Nada novo além da confirmação de que o "catálogo de missões" é a leitura mais comum do nome antigo do desafio.

### 21. joahan77/clps-lunar-mission-browser

- **"Documento mestre de contexto"** para trocar de assistente de IA sem perder nada. O nosso ai-memory faz isso, mas um arquivo no repo ajuda o resto do grupo.
- **O que evitar:** Shackleton em −89,9°S 0°E e dados de dezenas de missões sem foco no polo sul.

### 22. DinithMadushan/CLPS_Lunar_Mission_Browser_2026

- **O que evitar:** reaproveitar um projeto antigo (um mapa de sismos lunares) e trocar o nome. A falta de foco aparece no critério de Relevância.

### 23. nitrimandylis/space-apps-mockup

- **"O problema inteiro numa imagem":** a página inicial põe a Lua embaixo, o Sol afundando atrás dela e a Terra pendurada no alto. É uma ótima abertura de vídeo.
- **Honestidade com humor:** um selo "ephemeris: toy (for now)" e "not to scale (on purpose)".
- Usa os modelos 3D da NASA em glTF.

### 24. 0Aaheed0/SeleneSight

- Só a ideia. Mostra que muitos times ainda estão no começo.

### 25 a 27. yeskendir-sailau, ZCarlosZNica, quadruple-t

- Vazios. A única coisa a notar é que já usam o nome novo, "Lunar Landing Site Navigator". O yeskendir fala em "segurança dos vizinhos" (neighbour safety), talvez a distância entre landers. Vale ficar de olho se o enunciado novo trouxer isso.

## Números de referência que vieram junto

Segundo a tabela do BroBYW. **Conferir no artigo antes de usar.**

| Ponto | Altura | Fração média do disco | Algum pedaço do Sol | Maior escuridão |
|---|---|---|---|---|
| Gläser 2018 C1, Connecting Ridge | 2 m | 88,0% | 92,1% | 112 h |
| Gläser 2018 C2 | 2 m | 78,1% | 82,0% | 165 h |
| Gläser 2018, borda de Shackleton | 2 m | 85,5% | 89,4% | 66 h |
| Gläser 2014 CR1, ponto 2 | 2 m | 87,9% | 92,3% | 110,9 h |
| Gläser 2014 CR1, ponto 4 | 10 m | 91,9% | 95,66% | 76,1 h |

Inconsistências entre fontes, segundo o mesmo time:
- o Speyerer 2013 aparece com ~94% e com 92,1% para o mesmo conjunto;
- a maior escuridão na borda do Mazarico aparece como ~1,5 dia e como 141 h.

## O que entra no nosso plano

- [ ] Perguntar ao Local Lead: regras e prazos do evento local; se pode ter documento de conceito, dados baixados e templates antes de 14/11.
- [ ] Escrever o nosso PROMPT.md (visão, P0/P1/P2, métricas definidas, "o enunciado oficial vence"), para usar só em 14/11.
- [ ] Regra do ponto representativo: o ponto mais alto da região, ou dentro de 250 m da coordenada publicada.
- [ ] Plano de validação:
  - Horizons (no máximo 25 instantes por pedido);
  - terreno sintético;
  - mapa de PSR;
  - Gläser 2014/2018 na mesma altura;
  - PGDA 69;
  - pôr do Sol do Blue Ghost 1.
  
  Tolerâncias escritas antes, mais um controle negativo.
- [ ] Rever a [arquitetura proposta](arquitetura-proposta.md): a máscara calculada na hora é viável (~130 ms), e dá para ler janelas do DEM por HTTP range.
- [ ] Mastro como envelope de retas, se der tempo. Senão, poucas alturas fixas e o aviso de que é aproximado.
- [ ] AI_USAGE.md datado desde a primeira hora do hackathon.
- [ ] Roteiro do vídeo de 30 s com uma tabela fechada de números, sem logo da NASA.
