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

A resposta de `/visibility` também traz os pontos subsolar e sub-Terra e o raio do Sol. Com a fila cheia, a API responde 503 `busy` com `Retry-After`. A cobertura de tempo vai de 01/08/2023 a 31/12/2032.

A Uncertainty band do erro do DEM (ADR 0003) ainda não foi feita.

O projeto mantém testes de regressão para defeitos conhecidos no motor e nos dados: raios que pulavam picos próximos, o recorte do SLDEM2015, o polo exato com poucos raios distintos, o limite de memória do cache, as rotas leves e o encerramento da thread de aquecimento.

## Como sabemos que os números estão certos, e onde não estão

Cada checagem tem uma tolerância escrita antes da primeira rodada, e nenhuma tolerância muda para a checagem passar. Estes são os dados atuais de `/validations`:

| Checagem | Resultado | Status |
|---|---|---|
| Sol contra o JPL Horizons, 300 instantes, ≤ 0,02° | erro máximo de 0,000001° | passou |
| Terra contra o JPL Horizons, a mesma regra | erro máximo de 0,000312° | passou |
| Controles negativos (hora 10 min errada; Site deslocado) | a checagem percebe os dois erros | passou |
| Pontos subsolar e sub-Terra contra o Horizons, 12 instantes, ≤ 0,05° | 0,0002° e 0,0058°; o controle negativo com a hora errada dá 1,020° | passou |
| Dias de Sol contra o Wueller 2026, ≤ 1 dia por Site | 75 de 130 dentro, 55 fora | **falhou** |
| Blue Ghost 1: Sunset de 5 a 6 h antes dos últimos dados | Sunset às 19h44 UTC, 3,51 h antes | **falhou** |
| IM-2 Athena | não existe número comparável | pendente |
| Chandrayaan-3: primeiro Sunset não antes de 04/09/2023 | 04/09/2023 às 07h12 UTC | passou |

- **Wueller 2026:** o valor publicado é um pixel de 60 m arredondado para baixo, num mapa que varia vários dias em ±180 m. O nosso número cai nessa faixa em 90 dos 130 Sites, e uma caminhada independente no DEM bate com o motor. Restam 40 Sites sem explicação, e o método do artigo não está em nenhuma fonte aberta que conseguimos abrir. A investigação está em [docs/validation/wueller-2026.md](docs/validation/wueller-2026.md).
- **Blue Ghost 1:** o recorte do SLDEM2015 fica num grid deslocado por uma fração de pixel e cria uma parede falsa a 54 m do módulo. Com o recorte corrigido, o Sunset sai às 19h44 UTC. Continua falhando, e o ponto fraco é a regra. A faixa de 17h15 a 18h15 veio de uma frase do comunicado da Firefly, e o JPL Horizons põe o centro do Sol no horizonte sem relevo às 20h10m39, cerca de 2 h depois da faixa ([docs/validation/sources-wueller-blue-ghost.md](docs/validation/sources-wueller-blue-ghost.md)).
- **Chandrayaan-3:** a ISRO dá o dia em que pôs o módulo em repouso, mas não a hora. A checagem confere só a ordem, não um instante medido.
- **IM-2:** o lander tombou numa cratera de uns 20 m, menor que o DEM mais fino, com os painéis virados para o outro lado. A missão não acabou num Sunset atrás do relevo.

## Como funciona, rodar localmente, dados e créditos

Os detalhes estão no [README em inglês](README.md#how-it-works):

- **Motor:** SPICE com DE440. Horizon mask com 720 raios sobre DEMs aninhados: 20 m até 5 km, 80 m até 100 km e 240 m até 300 km. O Sol é tratado como disco.
- **Rodar localmente:** os comandos exatos, para rodar e testar.
- **Dados e créditos:** a tabela com as licenças. Wueller et al. 2026 é CC-BY 4.0, e o Gazetteer da IAU é de domínio público.

## Como foi feito

O projeto é implementado com Python, FastAPI, React, TypeScript e os produtos de dados NASA SPICE e LOLA descritos acima.
