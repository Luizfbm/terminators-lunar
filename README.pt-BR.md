# Lunar Landing Site Navigator

[English](README.md)

Nosso projeto no NASA Space Apps Challenge 2026, desafio "Lunar Landing Site Navigator". Você escolhe um Site perto do polo sul da Lua e uma Window, e o app responde uma pergunta: um lander ali vai ver o Sol e a Terra? Por quanto tempo? E quando eles sumirem, o que vai escondê-los?

No polo, o Sol fica a cerca de ±1,5° do horizonte e dá uma volta nele por mês. Por isso uma única crista decide se o painel solar funciona. Os termos em inglês (Site, Window, Occluder...) são os do [GLOSSARY.md](GLOSSARY.md), usados igual no código e na API.

## Experimente

O repositório inclui a interface web em `frontend/` e a API em `backend/`. Um deploy pode expor a API em:

`https://lunar-api.luizfbm.win` (contrato em [contract/openapi.yaml](contract/openapi.yaml), guia em [docs/frontend-api-guide.md](docs/frontend-api-guide.md)).

Os exemplos abaixo usam uma resposta representativa da API. Os trechos de JSON estão no [README em inglês](README.md#try-it).

- **A Query padrão** (Connecting Ridge, Site 001, Window de 708,73 h a partir do dia UTC atual, Observer height de 2 m):
  ```bash
  curl "https://lunar-api.luizfbm.win/visibility?site_id=001&start=$(date -u +%F)T00:00:00Z"
  ```
  A Terra se põe em 30/11 às 06h08m29 UTC atrás de Mons Malapert, a 134 km, no azimute 143°. O Sol não se põe nessa Window (708,73 h de Sol), e há 329,06 h com Sol e Terra juntos.
- **O ano de um Site:**
  ```bash
  curl "https://lunar-api.luizfbm.win/sites/001/year?year=2027"
  ```
  A melhor Window de 2027 começa em 12/09 às 06h00 UTC e tem 403,2 h de Sol e Terra juntos.
- **A Resolution ladder:**
  ```bash
  curl "https://lunar-api.luizfbm.win/visibility/ladder?site_id=CR05&start=$(date -u +%F)T00:00:00Z"
  ```
  No Site CR05, o próximo Sunset cai em 21/11 às 06h39m40 UTC com o DEM de 240 m, às 02h47m20 com o de 80 m e às 00h55m26 com o de 20 m. O DEM grosso atrasa o Sunset em 5,7 h.

## O que a aplicação oferece

- O Occluder de cada Sunset, Sunrise, Earthset e Earthrise, com o azimute, a distância e o nome da feição da IAU.
- 134 Sites: os 130 do Artemis de Wueller et al. 2026, mais os pontos de pouso do IM-2 e do Blue Ghost 1, a Apollo 11 e o Chandrayaan-3.
- A Resolution ladder: qualquer Query em três resoluções de DEM, com a faixa entre elas.
- O ano de um Site, mês a mês, com as melhores Windows.
- Sites custom: uma coordenada em 80°S ou mais ao sul também é um Site (source `custom`), e a Query inteira, com o plano B, vai no link.

A resposta de `/visibility` também traz os pontos subsolar e sub-Terra e o raio do Sol. Com a fila cheia, a API responde 503 `busy` com `Retry-After`. A cobertura de tempo vai de 01/08/2023 a 31/12/2032.

A Uncertainty band do erro do DEM (ADR 0003) ainda não foi feita.

### Na resposta

Abaixo da frase que responde a Query, o app mostra:

- **Um aviso de knife-edge.** Se poucos metros de erro de pouso mudam a resposta, uma frase avisa antes de você abrir qualquer outra coisa. Ela lê o Landing scatter do painel "Se o módulo errar o alvo" e só conta os pontos até 250 m do Site, o erro que o IM-2 Athena fez. Fala quando um desses pontos tem o Sol, ou a Terra, por pelo menos 10% da Window (nunca menos de 1 h) a mais ou a menos que o Site, e diz a distância, a direção e as horas. Um link leva ao painel. Um Site estável, ou um scatter ainda carregando ou que falhou, não mostra nada.
- **O disco do Sol no Cursor.** Ao lado do Cursor, na linha do tempo e na vista do chão, a Sun fraction aparece como "Sol: disco inteiro à vista", "Sol: escondido" ou "Sol: 63% do disco". Um Sol parcialmente à vista nunca arredonda para 0% nem para 100%.
- **Até onde o horizonte alcança.** Uma linha diz que o nosso horizonte vai até 300 km, a borda externa do DEM de 240 m, e a que distância ficam os Occluders do próximo Sunset e do próximo Earthset. Abaixo dela, a regra: o Sol conta como visível enquanto qualquer pedaço do disco estiver à vista, e a Terra conta pelo centro.
- **Plano A × Plano B.** O Plano A é a Query na tela. O Plano B muda o Site, o dia de início, a duração em dias ou a Observer height, e os seis números (Sun-and-Earth time, horas de Sol, horas de Terra visível, LCIP, LCSP, Sun fraction média) ficam lado a lado, com uma estrela no melhor. Uma diferença menor que 0,5 h, ou menor que 0,5 ponto percentual numa fração da Window, é empate, e a frase final nunca nomeia um vencedor quando os planos não se separam. Se as duas Windows têm durações diferentes, os totais são comparados como fração de cada Window.
- **Conferir no JPL Horizons.** Em "Estatísticas para nerds", a posição do Sol e da Terra no Cursor vem com um link para cada um no JPL Horizons, já preenchido com o Site, a Observer height e o instante (ao minuto, UT, sem atmosfera). É o mesmo pedido que a validação usa, então o Horizons imprime azimute e elevação para comparar com os nossos.

Também no app, cada um respondido por uma rota do contrato: as Windows de um Site por dia de início e os Sites vizinhos em ranking (`/sites/{site_id}/windows`, `/sites/{site_id}/neighbours`); o Landing scatter, a inclinação e a sombra permanente mais próxima (`/visibility/scatter`, `/terrain`); a bateria de um módulo ao longo da Window (`/visibility/energy`); a mesma Query sem relevo, como linha de horizonte plano (`/visibility/flat`); quando uma antena da Deep Space Network consegue ouvir o Site (`/visibility/dsn`); e um assistente que responde perguntas sobre uma Query com os números do motor (`/assistant`; sem modelo configurado, responde em modo offline).

O projeto mantém testes de regressão para defeitos conhecidos no motor e nos dados: raios que pulavam picos próximos, o recorte do SLDEM2015, o polo exato com poucos raios distintos, o limite de memória do cache, as rotas leves e o encerramento da thread de aquecimento.

## Como sabemos que os números estão certos, e onde não estão

Cada checagem tem uma tolerância, e nenhuma tolerância nem referência muda para a checagem passar. A tabela é o conteúdo atual de [`backend/app/data/validations.json`](backend/app/data/validations.json), o arquivo que `/validations` serve e que a página Prova mostra: 32 entradas, 29 passam, 2 falham e 1 está pendente. A pendente é um exemplo, não uma checagem. As que falham vêm primeiro, como na página Prova. Um controle negativo é uma checagem que precisa falhar de propósito, para mostrar que ela distingue uma resposta errada de uma certa; ele não diz nada sobre o motor. O arquivo também guarda, para cada entrada, contra o que ela foi conferida e o que ela não cobre; leia isso na página Prova antes de citar uma linha.

| Id | Checagem | Tolerância | Resultado | Status | Script |
|---|---|---|---|---|---|
| `wueller2026-sunlit-days` | Dias seguidos de Sol nos Sites do Artemis contra Wueller et al. 2026 | ≤ 1 dia por Site | 75 de 130 Sites dentro de 1 dia; maior diferença +19,23 d em MMO09. Dos 97 com valor publicado acima de 0, 75 dentro de 1 dia. 33 Sites aparecem publicados com 0 dia. | **falhou** | `validation/live_checks.py` |
| `landing-blue-ghost-1` | Sunset do Blue Ghost 1 contra o fim da missão | nosso Sunset de 5 a 6 h antes dos últimos dados | nosso Sunset 2025-03-16 19:44 UTC, 3,51 h antes dos últimos dados; Occluder: Mare Crisium, 0,7 km at azimuth 270,0° | **falhou** | `validation/live_landings.py` |
| `example-sun-height-apollo11` | Exemplo: até onde o Sol sobe, Apollo 11 contra o polo | nenhuma: é um exemplo, não uma checagem | Sol mais alto: 87,8° no Apollo 11, 2,0° no Site 001 | pendente | `validation/live_landings.py` |
| `horizons-sun-azel` | Azimute e elevação do Sol contra o JPL Horizons | ≤ 0,02° | erro máximo de 0,000001° em 300 instantes (separação angular 0,000001°) | passou | `validation/test_horizons.py` |
| `horizons-earth-azel` | Azimute e elevação da Terra contra o JPL Horizons | ≤ 0,02° | erro máximo de 0,000312° em 300 instantes (separação angular 0,000312°) | passou | `validation/test_horizons.py` |
| `larissa-athena-horizon` | Máscara de horizonte no IM-2 Athena, contra a silhueta independente da Larissa | por azimute \|nosso − dela\| ≤ atan(1 m / d) + 0,01°, d a distância de bloqueio dela; pelo menos 99% dos nossos 720 azimutes dentro disso e RMS ≤ 0,03°. 1 m: o RMS de 0,3–0,5 m dos mapas LOLA ajustados (Barker et al. 2021) e o erro radial de órbita de ~0,5 m do mapa não ajustado (Mazarico et al. 2018), em quadratura. Fixada antes de avaliar a comparação | 99,2% de 720 azimutes dentro; nosso − dela: média -0,0022°, RMS 0,0197°, P95 0,051°, maior +0,090° em 190° (Occluder dela a 0,55 km) | passou | `validation/test_athena.py` |
| `negative-control-larissa-horizon-rotated` | Controle negativo: a silhueta da Larissa girada 1° | precisa quebrar as duas condições: menos de 99% dos azimutes dentro e RMS acima de 0,03° | quebrou as duas condições (37,6% dentro, RMS 0,079°) | passou | `validation/test_athena.py` |
| `landing-im2-athena` | Ponto de pouso do IM-2 Athena | incidência = 90° − nossa elevação do Sol no centro publicado da imagem, dentro de 0,015° nas duas imagens (as duas publicadas com 0,01°). A Terra durante a transmissão é relatada como fato, não julgada | incidência, nossa − LROC: M1495922531LE +0,0040°, M1496181900LE -0,0000°. Fato, não julgado: durante a transmissão nossa máscara mantém o centro da Terra pelo menos 12,3° acima do horizonte (2025-03-06T17:30:00Z). Só como informação: fração do Sol no ponto final 1,00 e 1,00 nas duas imagens; as fotos mostram o local iluminado. | passou | `validation/test_athena.py` |
| `negative-control-lroc-article-times` | Controle negativo: as imagens da LROC nos horários dos artigos | precisa passar de 0,015° nas duas imagens | quebrou nas duas imagens (M1495922531LE -0,881°, M1496181900LE -0,358°) | passou | `validation/test_athena.py` |
| `eclipse-2025-local-contacts` | O eclipse lunar total de 14/03/2025, visto da Lua: quando a Terra cobre o Sol | cada um dos quatro contatos (a fração do Sol sai de 1, chega a 0, sai de 0, volta a 1) a até 30 s do gfoclt: nossa Terra é uma esfera do raio equatorial, a do gfoclt um elipsoide 21,4 km mais curto nos polos, ~20 s a ~0,55°/h, mais a bisseção. E dentro dos contatos da NASA: entra na umbra em [U1, U2], sai em [U3, U4], tudo em [P1, P4] | em -89,4°, 90°: nosso − gfoclt -6,9 s, -8,0 s, +3,6 s, +4,4 s (contatos 04:22:39,6, 05:32:09,3, 08:17:50,8, 09:27:24,8 UTC); dentro dos intervalos da NASA. No Athena, só como informação: nosso − gfoclt -6,8 s, -8,0 s, +3,6 s, +4,4 s. | passou | `validation/test_eclipse.py` |
| `negative-control-eclipse-earth-radius` | Controle negativo: o eclipse com a Terra 1% maior | precisa passar de 30 s em algum contato | quebrou a checagem: nosso − gfoclt -77,8 s, -79,3 s, +74,8 s, +75,4 s | passou | `validation/test_eclipse.py` |
| `horizons-flat-sunset` | Horizonte plano: a borda de cima do Sol em cada pôr do Sol contra o JPL Horizons | ≤ 0,02° do mergulho do horizonte | erro máximo de 0,00014° em 26 pores do Sol | passou | `validation/test_flat_horizon.py` |
| `negative-control-flat-sunset-centre` | Controle negativo: o centro do Sol em cada pôr do Sol no horizonte plano | tem que passar de 0,02° | falhou como esperado (0,262°) | passou | `validation/test_flat_horizon.py` |
| `negative-control-time-shift` | Controle negativo: deslocamento de 10 min | tem que passar de 0,02° | falhou como esperado (0,085°) | passou | `validation/test_horizons.py` |
| `negative-control-longitude-shift` | Controle negativo: deslocamento de longitude | 0,01° detectado (≥ 0,009°), 0,03° passa de 0,02° | deslocamento de 0,01° moveu o Sol 0,0100°, de 0,03° moveu 0,0300° (como esperado) | passou | `validation/test_horizons.py` |
| `horizons-dsn-elevation` | Elevação da Lua em cada borda de passagem da DSN contra o JPL Horizons | ≤ 0,05° de 6° | erro máximo de 0,002126° de 6° em 74 bordas de passagem | passou | `validation/test_horizons_dsn.py` |
| `horizons-dsn-pass-edges` | Início e fim das passagens da DSN contra o cruzamento de 6° do JPL Horizons | ≤ 2 min | diferença máxima de 0,8 s em 74 bordas de passagem | passou | `validation/test_horizons_dsn.py` |
| `negative-control-dsn-edges-shifted` | Controle negativo: bordas das passagens da DSN 10 minutos atrasadas | tem que passar de 0,05° | menor erro de 1,283406° em 74 bordas deslocadas 10 min | passou | `validation/test_horizons_dsn.py` |
| `eduardo-panel-incidence` | Apontamento dos painéis contra o modelo de geometria de painel do Eduardo | ≤ 1e-9 no fator de incidência | erro máximo de 5,0e-16 em 2.520 direções do Sol e 8 instantes pela API | passou | `validation/test_panel_incidence.py` |
| `negative-control-panel-azimuth-turned` | Controle negativo: os painéis virados 180° | tem que passar de 1e-9 | falhou como esperado (1,00) | passou | `validation/test_panel_incidence.py` |
| `pgda-sun-visibility` | Parte do tempo com Sol, contra o mapa de 18,6 anos da NASA | RMSE ≤ 5 pontos percentuais e diferença média ≤ 2 pontos | RMSE de 1,00 pontos, diferença média de -0,44 pontos em 86 pontos (maior -3,01); um segundo ciclo muda a média em -0,14 pontos; a fração média do Sol, não julgada, fica em média -1,78 pontos fora. Cristas claras, só como informação (ali o mapa não consegue situar um valor dentro de um pixel de 60 m): RMSE de 25,40, diferença média de -22,36 pontos em 18 pontos | passou | `validation/test_pgda.py` |
| `pgda-earth-visibility` | Parte do tempo com a Terra visível, contra o mapa de 18,6 anos da NASA | RMSE ≤ 5 pontos percentuais e diferença média ≤ 2 pontos | RMSE de 3,01 pontos, diferença média de -0,53 pontos em 86 pontos (maior -19,11); um segundo ciclo muda a média em -0,10 pontos; pelo centro da Terra, como o app conta, a média fica em -5,72 pontos | passou | `validation/test_pgda.py` |
| `negative-control-pgda-longitude` | Controle negativo: os mesmos pontos na longitude + 180° | precisa quebrar as duas checagens (RMSE acima de 5 pontos) | quebrou as duas checagens (RMSE do Sol 22,45, RMSE da Terra 47,35 pontos) | passou | `validation/test_pgda.py` |
| `psr-synthetic-patch` | Sombra permanente mais próxima num mapa conhecido | distância dentro de uma célula (60 m); azimute dentro do ângulo que uma célula ocupa ali | maior erro de distância 16,7 m; maior erro de azimute 0,39 do ângulo de uma célula | passou | `validation/test_psr.py` |
| `slope-synthetic-plane` | Inclinação de um plano conhecido | ≤ 0,01°; plano nivelado exatamente 0, todo abaixo de 10° | maior diferença de 0,000002° no plano inclinado; plano nivelado 0 e todo abaixo de 10° | passou | `validation/test_slope.py` |
| `slope-cell-count` | Células a até 100 m numa grade de 20 m | dentro de 12 % | 81 células, 3,1 % de 78,5 | passou | `validation/test_slope.py` |
| `horizons-sub-sun` | Ponto subsolar contra o JPL Horizons | ≤ 0,05° por ponto | separação máxima de 0,0002° em 12 instantes | passou | `validation/test_sub_points.py` |
| `horizons-sub-earth` | Ponto sub-Terra contra o JPL Horizons | ≤ 0,05° por ponto | separação máxima de 0,0058° em 12 instantes | passou | `validation/test_sub_points.py` |
| `negative-control-sub-points-time-shift` | Controle negativo: ponto subsolar 2 h depois | tem que passar de 0,05° | falhou como esperado (1,020°) | passou | `validation/test_sub_points.py` |
| `horizons-sun-distance-factor` | Fator de distância do Sol na bateria contra o JPL Horizons | ≤ 0,1 % de (1 au / d)² | erro máximo de 3,4e-09 % em 12 instantes | passou | `validation/test_sun_distance.py` |
| `negative-control-sun-distance-ignored` | Controle negativo: a bateria com o Sol sempre a 1 au | tem que passar de 0,1 % | falhou como esperado (3,34 %) | passou | `validation/test_sun_distance.py` |
| `landing-chandrayaan-3` | Sunset do Chandrayaan-3 contra a data em que a ISRO o pôs para dormir | nosso Sunset depois de 04/09/2023 (a ISRO os pôs para dormir antes do pôr do Sol) | nosso primeiro Sunset 2023-09-04 07:12 UTC; Occluder: 6,9 km at azimuth 277,5° | passou | `validation/live_landings.py` |

A página Prova abre com dois resumos antes das checagens. "Onde um número pode errar" é uma tabela de nove fontes de erro (resolução do mapa, erro de altura do mapa, relevo menor que a célula mais fina, alcance do horizonte, o passo do tempo, as posições do Sol e da Terra, o Sol como disco, a Terra pelo centro e onde o módulo pousa), cada uma com o tamanho, o efeito na resposta e de onde vem o tamanho: uma checagem, um script, um registro de decisão ou um artigo. Linha sem fonte para o tamanho fica sem número. "O que ainda não conferimos" lista oito lacunas que são da página inteira e não de uma checagem só, como os mapas de 5 m, os erros que todo mapa LOLA compartilha, instantes medidos para comparar os Sunsets, os 40 Sites de Wueller et al. 2026 sem causa conhecida, as cristas brilhantes, o DSN link, o modelo de bateria além do ângulo e da distância do Sol e a atmosfera da Terra num eclipse. Um teste unitário procura cada número dessas linhas na checagem, no arquivo ou no registro de decisão que ela cita.

- **Wueller 2026:** o valor publicado é um pixel de 60 m arredondado para baixo, num mapa que varia vários dias em ±180 m. O nosso número cai nessa faixa em 90 dos 130 Sites, e uma caminhada independente no DEM bate com o motor. Restam 40 Sites sem explicação, e o método do artigo não está em nenhuma fonte aberta que conseguimos abrir. A investigação está em [docs/validation/wueller-2026.md](docs/validation/wueller-2026.md).
- **Blue Ghost 1:** o recorte do SLDEM2015 fica num grid deslocado por uma fração de pixel e cria uma parede falsa a 54 m do módulo. Com o recorte corrigido, o Sunset sai às 19h44 UTC. Continua falhando, e o ponto fraco é a regra. A faixa de 17h15 a 18h15 veio de uma frase do comunicado da Firefly, e o JPL Horizons põe o centro do Sol no horizonte sem relevo às 20h10m39, cerca de 2 h depois da faixa ([docs/validation/sources-wueller-blue-ghost.md](docs/validation/sources-wueller-blue-ghost.md)).
- **Chandrayaan-3:** a ISRO dá o dia em que pôs o módulo em repouso, mas não a hora. A checagem confere só a ordem, não um instante medido.
- **IM-2:** duas checagens passam, e nenhuma é sobre o Sunset. `landing-im2-athena` confirma a efeméride: o ângulo de incidência que a LROC publica no ponto de repouso bate com 90° menos a nossa elevação do Sol, com diferença de até 0,004° nas duas imagens. `larissa-athena-horizon` compara a nossa Horizon mask ali com uma silhueta independente (99,2% dos 720 azimutes dentro da tolerância). O lander tombou numa cratera de uns 20 m, menor que o DEM mais fino, com os painéis virados para o outro lado, e o motor vê o Sol o tempo todo (Sun fraction 1,00 nas duas imagens). A missão não acabou num Sunset atrás do relevo, então não há horário para comparar, e o relevo não é o que essas checagens testam.

## Como funciona, rodar localmente, dados e créditos

Os detalhes estão no [README em inglês](README.md#how-it-works):

- **Motor:** SPICE com DE440. Horizon mask com 720 raios sobre DEMs aninhados: 20 m até 5 km, 80 m até 100 km e 240 m até 300 km. O Sol é tratado como disco, e a Terra conta pelo centro.
- **Rodar localmente:** os comandos exatos, para rodar e testar o backend e a interface (a interface lê a API em `https://lunar-api.luizfbm.win`, ou em `VITE_API_BASE_URL` se definida). Os DEMs de teste vêm de dois assets de release: os polares (cerca de 59 MB) e as janelas dos Sites fora dos DEMs polares (cerca de 151 MB).
- **Dados e créditos:** a tabela com as licenças. Wueller et al. 2026 é CC-BY 4.0, e o Gazetteer da IAU é de domínio público.

## Em produção

A stack de `deploy/compose.yaml` roda três containers com Docker Compose num VPS: o backend, o Caddy (que também serve o frontend já compilado) e um Cloudflare Tunnel. `lunar.luizfbm.win` serve o frontend e `lunar-api.luizfbm.win` o backend. Os DEMs completos e os kernels SPICE ficam no servidor, não no repositório, e `deploy/fetch-data.sh` os coloca lá. O GitHub Actions faz o deploy a cada merge em `main`.

Os limites do backend, definidos em `deploy/compose.yaml`:

| Limite | Valor |
|---|---|
| Execuções do motor ao mesmo tempo (`LUNAR_ENGINE_CONCURRENCY`) | 4 |
| Cache de respostas (`LUNAR_CACHE_MAX_MB`) | 1,2 GB |
| Memória do container (`mem_limit`) | 4,5 GB |
| Rotas do motor por endereço de cliente por minuto | 600 |

Um pedido que espera mais de 25 s por uma vaga do motor, ou um endereço acima do seu limite, recebe o 503 `busy` descrito acima. O cache é aquecido em segundo plano para todos os Curated Sites na Window padrão, depois de cada início e depois de cada meia-noite UTC (ADR 0004).

## Como foi feito

O projeto é implementado com Python, FastAPI, React, TypeScript e os produtos de dados NASA SPICE e LOLA descritos acima.
