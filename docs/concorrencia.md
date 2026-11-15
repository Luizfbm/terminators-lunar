# Concorrência e ferramentas que já existem

Levantamento feito em 02/11/2026. Os dados dos times vêm da API pública do site do Space Apps. Os dados dos projetos vêm dos repositórios públicos no GitHub (README, árvore de arquivos e histórico). Não rodei o código de ninguém.

## Resumo

O nível está bem mais alto do que imaginávamos. Pelo menos oito times já publicaram projetos com SPICE, horizonte calculado sobre o DEM do LOLA e validação contra o JPL Horizons. Os mais fortes têm centenas de commits e foram feitos ao longo de um a dois meses. Quase tudo o que listamos como diferencial na [arquitetura proposta](arquitetura-proposta.md) já existe em algum deles: a máscara de horizonte, a fração do disco do Sol, o maior período no escuro, o mastro, a busca de datas, as missões CLPS reais e a validação.

Ganhar por quantidade de funcionalidades está fora de alcance em 36 horas. O caminho é outro (ver [Implicações](#implicações)).

Duas coisas jogam a nosso favor:

1. **O julgamento local vem primeiro.** Na fase local, só competimos com os times do nosso evento, e cada evento indica de 1 a 3 times. Os projetos grandes listados aqui só entram na conta na fase global.
2. **A regra proíbe começar antes de 14/11.** Todos esses repositórios têm commits de setembro e outubro. Não sabemos se a organização fiscaliza, mas o nosso histórico vai estar limpo: até 13/11 o repo só tem estudo.

## Os times inscritos no desafio

- **905 times** no desafio, de 17.945 no evento todo (~5%).
- 728 ainda procuram membros. Nenhum preencheu o projeto no site.
- 79 países. Os que mais têm times: Universal (online) 159, Índia 158, EUA 48, Egito 42, Turquia 41, Bangladesh 36, México 26, Espanha 23, Paquistão 20, Canadá 17, Malásia 16, Argentina 14, Marrocos 14 e **Brasil 13**.
- Os 13 times brasileiros vêm de Vilhena, Fortaleza, Ribeirão Preto, Caxias do Sul, São Gonçalo e Sorocaba, entre outras cidades. Se algum estiver no nosso evento local, é concorrente direto na fase local.

Temas citados nas descrições dos 905 times:

| Tema | Times |
|---|---|
| educação | 265 |
| Artemis / CLPS | 153 |
| IA | 133 |
| dashboard | 62 |
| polo sul | 57 |
| aplicativo de celular | 53 |
| Sol e Terra | 51 |
| comunicação | 47 |
| 3D | 34 |
| energia | 28 |
| DEM / LOLA | 27 |
| linha do tempo | 23 |
| horizonte | 20 |
| otimização | 9 |
| jogo | 9 |
| acessibilidade | 9 |
| SPICE / Horizons | 4 |
| VR / AR | 2 |
| pôr do Sol / contagem regressiva | 0 |

Pelas descrições, a maioria vai fazer algo educativo ou um painel genérico. O perigo está nos poucos que já têm código pronto, que aparecem abaixo.

## Os projetos públicos no GitHub

Encontrei 27 repositórios do desafio, criados entre 18/09 e 02/11/2026. A lista completa, com link, demo e resumo de cada um, está em [repos-concorrentes.md](repos-concorrentes.md). O que aprender com cada um está em [licoes-concorrentes.md](licoes-concorrentes.md). Quase todos usam o nome antigo, "CLPS Lunar Mission Browser". Só dois usam o nome novo, e os dois estão vazios.

### Nível 1: muito acima do que dá para fazer em 36 h

| Projeto | Repositório | Tamanho | O que tem |
|---|---|---|---|
| **POLAR WINDOW** | MdAhbab/PolarWindow | 320 commits, 900+ testes | Horizonte em 1.440 azimutes (LOLA de 20 e 80 m, SLDEM2015 fora do polo); SPICE DE440 em MOON_ME; uma margem (±) em cada número; 20 entregas CLPS com fonte de cada campo; validação contra o que voou (IM-1, IM-2 e Blue Ghost 1: pouso no segundo certo, posição a menos de 100 m, pôr do Sol do Blue Ghost na data que a NASA informou); estações da DSN com máscaras de horizonte reais; trajetória, lançamento, radiação; assistente de IA (Gemini) que não pode inventar número. Não dá nota única nem veredito, de propósito. |
| **CLPS Lunar Mission Browser** (no ar) | BroBYW/CLPS-Lunar-Mission-Website | ~40 MB | 14 sítios citados e qualquer ponto ao sul de 82°S; replay dos pousos do IM-1 e do IM-2; eclipses lunares de 2024 a 2030; panorama do horizonte; contato com a DSN; calculadora de bateria; **planejador de mastro** (2 a 50 m); comparação de 2 a 3 sítios; **busca de datas** com mapa de calor para missões de 3 a 28 dias; 3D com o terreno até 300 km; rota de rover. Validado contra o Gläser 2014/2018 (até 1,5 ponto), os mapas do PGDA, **1.022 fotos da câmera WAC do LRO** (99,3% de acerto) e acessibilidade WCAG AA. |
| **SIGHTLINE** (Bangladesh) | WarRinOP/sightline | 113 commits | Monorepo TypeScript; Sol e Terra calculados no navegador; 300 comparações com o Horizons (erro de 3e-8° no Sol); comparação com a Tabela 2 do Barker 2021 e com o mapa AVGVISIB (correlação de 0,95); página "Evidence"; código de barras do ano; noites maiores que uma bateria de 50 h. Ainda falta a busca de janelas e o "analista de IA". Tem roteiro de demo e declaração de uso de IA prontos. |

### Nível 2: sério, com horizonte e SPICE

| Projeto | Repositório | O que tem |
|---|---|---|
| CLPS Lunar Mission Browser | EmanuelAbasto/CLPS-Lunar-Mission-Browser | Compara de 2 a 4 sítios; horizonte de 200 km; botão para trocar por horizonte plano ("muitas vezes inverte o ranking"); modos simples e especialista; link que guarda o cenário; exportação para CSV. Os sítios ainda são exemplos. |
| LunarWindow | Hamzaslam1996/lunarwindow | Python, SPICE DE440, máscara de horizonte do LOLA, fração do disco, maior período no escuro, potência do painel vertical e horizontal, janelas de DTE e um "relatório de garantia" com kernels, DEM e commit usados. Apache 2.0. |
| Lunar South Pole Explorer | Klauscreates/lunar-south-pole-explorer | Cesium + SPICE; 5 pontos; out–dez/2026 em passos de 10 min; comparação de dois sítios; modelo de lander com 5 atitudes e modelo térmico. |
| Lunar Horizons | kaizarmerchantt-git/clps-lunar-mission-browser | Painel de **13 regiões candidatas do Artemis III**; mastro; linha do tempo de 721 h; diz ter 112 mil estados testados. |
| L-SEA (Málaga) | rafaa-sf/L-SEA | Streamlit no ar; DE421; otimização de onde e quando pousar; foco em Artemis. |
| LunarSite Compass | partofcosmos-site/lunarsite-compass | Next.js 14 no ar na Vercel; ray-casting do horizonte; inclinação do terreno. |
| CLPS Lunar Browser | dundaryusuf566-maker/clps-lunar-browser | Outro enfoque: 1.830 transferências Terra–Lua de 2026 (DE440), Δv e espera em órbita, mais a luz no pouso. |
| CLPS Lunar Mission Browser | Nxmmy-Na/CLPS-Lunar-Mission-Browser | 3D, regiões do Artemis III, backend FastAPI com potência, bateria e inclinação; inglês e tailandês. |
| spice1 | taimashard0/spice1 | Backup completo (React + pipeline Python com kernels); 73 testes; mapas de calor diários. |

### Nível 3: começo, protótipo ou vazio

suhaslord/clps-lunar-browser (time de 6 dividido por áreas, terreno "para depois"), shrestha-droid (no ar no GitHub Pages, Horizons sem horizonte do terreno), friendlyfoe241-cyber (lunarnav.vercel.app), platonicHunter (Next.js recém-criado), polcxw (uma página HTML), EAZYCODER2415, kaveen-git12, joahan77, DinithMadushan (Lua 3D genérica com sismos), nitrimandylis (maquete 3D), 0Aaheed0/SeleneSight (só README), yeskendir-sailau, ZCarlosZNica e quadruple-t (vazios).

### Observações

- Vários repositórios têm arquivos de agentes de IA (CLAUDE.md, AGENTS.md) e READMEs muito longos. Esses times usaram IA pesadamente, como nós vamos usar. A organização exige que o uso seja declarado.
- O "sem nota única" do POLAR WINDOW é uma decisão de produto deliberada. O BroBYW e o EmanuelAbasto fazem ranking. As duas escolhas aparecem entre os melhores.
- Ninguém fala em **contagem regressiva** para o próximo pôr do Sol ou da Terra. Ninguém usa os **130 sítios do Wueller 2026**. Ninguém trata a **incerteza do DEM por sítio** (o POLAR WINDOW usa um valor só para cada produto).

## Quem escreveu o desafio

Não dá para saber antes de 13/11. A página não mostra a divisão da NASA nem o nome de quem escreveu. Os indícios:

- o nome original era "CLPS Lunar Mission Browser" e a imagem do desafio se chama "10 - CLPS";
- os assuntos marcados são Human Exploration, Moon, Software e Space Exploration;
- o CLPS é gerido pela Diretoria de Missões Científicas (SMD) da NASA.

Pelos repositórios, a troca de nome para "Lunar Landing Site Navigator" parece ter acontecido depois que a maioria deles foi criada: os de setembro e outubro usam o nome antigo, e os dois de 30/10 e 02/11 já usam o novo. O nome novo põe o sítio de pouso no centro e tira as missões CLPS do título. Isso pesa no critério de Relevância. Os Resources de 13/11 devem mostrar quem é o autor e quais dados ele espera.

## Ferramentas que já existem (fora do hackathon)

| Ferramenta | O que faz | Limite para o nosso público |
|---|---|---|
| **NAIF WebGeocalc** (wgc2.jpl.nasa.gov:8443/webgeocalc) | Ângulos de iluminação com o modelo de forma DSK; busca de eventos | Ferramenta de especialista, sem comparação de sítios |
| **JPL Horizons** | Az/el do Sol e da Terra para um observador na superfície da Lua | Sem relevo; uma consulta por vez |
| **PGDA 69** e o mapa **AVGVISIB** no PDS | Mapas de iluminação média e de visibilidade da Terra | Médias de longo prazo, sem datas |
| **LROC QuickMap** | Mapas do LRO e camadas de sombra do terreno (usado pelo Wueller 2026) | Visual; não responde "quando" |
| **Moon Trek** | Portal da NASA com camadas de iluminação | Visual; sem planejamento por data |
| **MoonCalc** | Posição do Sol e da Lua para um ponto | Genérico, sem relevo |
| **Klauscreates/lunar-south-pole-explorer** | Cesium + SPICE, 5 pontos, out–dez/2026 | Período e pontos fixos |

### Dados novos que vale guardar

Os concorrentes trouxeram duas fontes que não estavam no [catálogo de fontes](fontes.md):

1. **Arquivo SPICE do CLPS no NAIF** (naif.jpl.nasa.gov/pub/naif/pds/pds4/clps/clps_spice/spice_kernels/spk/). Tem as trajetórias reconstruídas e os pontos de pouso do IM-1, do IM-2, do Blue Ghost 1 e do Peregrine. Servem para validar contra o que voou: dá para conferir que o nosso cálculo põe o pôr do Sol do Blue Ghost 1 na data em que a NASA anunciou.
2. **Máscaras de horizonte das antenas da DSN** (DSN 810-005, módulo 301, planilha Horizon-Masks-Download-V2-301O.xlsx). Dizem quando cada antena na Terra consegue ver a Lua. Completam o "a Terra está acima do horizonte do sítio" com "e alguma antena da DSN está vendo a Lua".

## Implicações

1. **Não competir em quantidade.** Na fase global vamos encontrar projetos com dois meses de trabalho. Em 36 horas, ganha quem responde uma pergunta de forma muito clara e confiável.
2. **Seguir o nome novo.** "Navigator" significa ajudar a escolher onde e quando pousar. Uma tela que responde "qual sítio, em qual data, e por quê" encaixa melhor do que um navegador de missões.
3. **Diferenciais que ainda estão livres:**
   - os **130 sítios do Artemis do Wueller 2026**, com os dias de Sol de 2025 a 2032, como base pronta e citável;
   - a **incerteza do DEM por sítio** (ε = a·R + b·S + c), mostrada como faixa nos números;
   - a **contagem regressiva** "faltam X h para o Sol se pôr / para a Terra sumir", que ninguém citou e que um juiz leigo entende na hora;
   - a **validação contra o Blue Ghost 1 e o IM-2**, usando o arquivo SPICE do CLPS, num slide só.
4. **A apresentação pesa 20% e quase todos esses projetos são de engenheiro para engenheiro.** Uma história simples ("o Sol gira rente ao chão, um morro desliga o lander") e um vídeo de 30 s bem feito separam.
5. **Histórico limpo como trunfo.** Código só a partir de 14/11, commits pequenos e datados, declaração de uso de IA. Se houver fiscalização, isso conta.
6. **Não copiar código de outro time.** As licenças (MIT, Apache) permitiriam, mas seria estranho no julgamento e vai contra o espírito da regra. Aprender com os métodos e usar as mesmas fontes públicas da NASA é legítimo.
7. **Descobrir quais times estão no nosso evento local** quando o Luiz souber qual é. Esses são os concorrentes reais da primeira fase.
