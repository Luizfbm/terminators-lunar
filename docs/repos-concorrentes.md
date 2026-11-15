# Os 27 repositórios públicos do desafio

Repositórios de outros times no GitHub, levantados em 02/11/2026 com `gh search repos` e busca na web. Os resumos vêm do README, da descrição e da árvore de arquivos de cada um. Não rodei o código de nenhum deles, então os números de validação são o que os próprios times declaram. A análise do que isso significa para nós está em [concorrencia.md](concorrencia.md).

"Commits" é a contagem no branch principal. "Criado" é a data de criação do repositório.

## Nível 1: projetos grandes e validados

| # | Repositório | Demo | Linguagem | Commits | Criado | Resumo |
|---|---|---|---|---|---|---|
| 1 | [MdAhbab/PolarWindow](https://github.com/MdAhbab/PolarWindow) | só local | Python + front | 320 | 18/09 | **POLAR WINDOW.** O mais completo. Horizonte em 1.440 direções sobre o LOLA de 20 e 80 m, SPICE DE440, uma margem ± em cada número e quatro números por sítio (horas de Sol, horas de contato, maior noite, maior tempo sem contato). Tem 20 missões CLPS com a fonte de cada campo e foi validado contra IM-1, IM-2 e Blue Ghost 1. Inclui antenas da DSN, trajetória, radiação e um assistente de IA (Gemini) que só repete números calculados. Não dá nota única. 900+ testes. Apache 2.0. |
| 2 | [BroBYW/CLPS-Lunar-Mission-Website](https://github.com/BroBYW/CLPS-Lunar-Mission-Website) | [no ar](https://clps-lunar-mission-browser.vercel.app) | TypeScript | 31 | 30/09 | 14 sítios citados ou um ponto livre ao sul de 82°S. Refaz os pousos do IM-1 e do IM-2 e mostra os eclipses de 2024 a 2030. Tem panorama do horizonte, contato com a DSN, calculadora de bateria, planejador de mastro (2 a 50 m), comparação de 2 ou 3 sítios e busca de datas com mapa de calor. O 3D vai até 300 km. Diz ter validado contra o Gläser, os mapas do PGDA e 1.022 fotos do LRO, e passar no WCAG AA. MIT. |
| 3 | [WarRinOP/sightline](https://github.com/WarRinOP/sightline) | só local | TypeScript | 113 | 01/10 | **SIGHTLINE**, do evento de Bangladesh. Calcula Sol e Terra no navegador para três sítios. Fez 300 comparações com o JPL Horizons e conferiu o resultado com o Barker 2021 e com o mapa AVGVISIB. Tem página "Evidence", 3D com o LOLA, carta do céu e código de barras do ano. A busca de janelas ainda não existe. Já tem roteiro de demo e declaração de uso de IA. Apache 2.0. |

## Nível 2: sérios, com horizonte e efemérides

| # | Repositório | Demo | Linguagem | Commits | Criado | Resumo |
|---|---|---|---|---|---|---|
| 4 | [EmanuelAbasto/CLPS-Lunar-Mission-Browser](https://github.com/EmanuelAbasto/CLPS-Lunar-Mission-Browser) | só local | TypeScript | 46 | 19/09 | Compara de 2 a 4 sítios, com horizonte de 200 km e um botão para trocar pelo horizonte plano. Tem modos simples e especialista, link que guarda o cenário, exportação para CSV e 3D. Os sítios ainda são exemplos. MIT. |
| 5 | [Hamzaslam1996/lunarwindow](https://github.com/Hamzaslam1996/lunarwindow) | só local | Python | 9 | 24/09 | **LunarWindow.** SPICE DE440, máscara de horizonte do LOLA, fração do disco do Sol, maior período no escuro, potência do painel vertical e do horizontal e janelas de DTE. Gera um "relatório de garantia" com os kernels, o DEM e o commit usados. Só backend e API. Apache 2.0. |
| 6 | [Klauscreates/lunar-south-pole-explorer](https://github.com/Klauscreates/lunar-south-pole-explorer) | só local | Python + Cesium | 14 | 05/10 | Lua em 3D com Cesium e SPICE. Cobre 5 pontos de out a dez/2026, em passos de 10 min, e compara dois sítios. Tem um lander de referência com 5 atitudes e um modelo térmico. |
| 7 | [kaizarmerchantt-git/clps-lunar-mission-browser](https://github.com/kaizarmerchantt-git/clps-lunar-mission-browser) | só local | TypeScript | 1 | 21/10 | **Lunar Horizons.** Painel de 13 regiões candidatas do Artemis III, com panorama, radar do céu, mastro e linha do tempo de 721 h. Usa o LOLA e o JPL Horizons e diz ter testado 112 mil estados. Subiu tudo num commit só. MIT. |
| 8 | [rafaa-sf/L-SEA](https://github.com/rafaa-sf/L-SEA) | [no ar](https://lunar-horizon-clps-browser.streamlit.app/) | Python | 6 | 07/10 | **L-SEA**, do evento de Málaga. Escolhe onde e quando pousar com base no LOLA, nas efemérides DE421 e no modelo de orientação da IAU. Tem foco no Artemis, roda em Streamlit e o README vem em inglês e espanhol. MIT. |
| 9 | [rafaa-sf/lunar-horizon-clps-browser](https://github.com/rafaa-sf/lunar-horizon-clps-browser) | igual ao 8 | Python | 6 | 07/10 | Cópia do L-SEA, do mesmo time. |
| 10 | [partofcosmos-site/lunarsite-compass](https://github.com/partofcosmos-site/lunarsite-compass) | [no ar](https://lunarsite-compass.vercel.app) | Python + Next.js | 31 | 01/10 | **LunarSite Compass.** Calcula o horizonte por ray-casting e procura janelas em que Sol e Terra aparecem juntos. Mostra a inclinação do terreno e tem o IM-2 em Mons Mouton como exemplo. O README é cheio de jargão ("Flight Decision Seal", "GO FOR TOUCHDOWN"). |
| 11 | [dundaryusuf566-maker/clps-lunar-browser](https://github.com/dundaryusuf566-maker/clps-lunar-browser) | só local | Python | 4 | 26/10 | Outro enfoque: 1.830 transferências Terra–Lua de 2026 (DE440) com Δv e tempo de espera em órbita, mais a luz no local de pouso. Responde "se eu lançar em tal dia, quando chego e com quanto Sol". README em inglês e turco. |
| 12 | [Nxmmy-Na/CLPS-Lunar-Mission-Browser](https://github.com/Nxmmy-Na/CLPS-Lunar-Mission-Browser) | só local | JavaScript | 5 | 10/10 | Navegador 3D das regiões do Artemis III e das missões CLPS. O backend em FastAPI calcula potência solar, sobrevivência da bateria e inclinação. A interface está em inglês e tailandês. |
| 13 | [taimashard0/spice1](https://github.com/taimashard0/spice1) | só local | (zip) | 2 | 31/10 | Backup completo num zip anexado ao release: app React + TypeScript, pipeline Python com kernels SPICE e PDFs. Tem comparação na linha do tempo, zoom por ano, mês e dia, mapas de calor diários e 73 testes. |

## Nível 3: começo de projeto, protótipo ou vazio

| # | Repositório | Demo | Linguagem | Commits | Criado | Resumo |
|---|---|---|---|---|---|---|
| 14 | [suhaslord/clps-lunar-browser](https://github.com/suhaslord/clps-lunar-browser) | não | Python | 23 | 24/09 | Time de 6 com as tarefas divididas por área (backend, front, visualização, terreno). Já tem a estrutura de pastas e o formato da API. O bloqueio pelo relevo ficou "para depois". |
| 15 | [shrestha-droid/clps-lunar-mission-browser](https://github.com/shrestha-droid/clps-lunar-mission-browser) | [no ar](https://shrestha-droid.github.io/clps-lunar-mission-browser/) | HTML + Python | 1 | 18/10 | Página estática que pega az/el do Sol e da Terra no JPL Horizons. O horizonte ainda é uma esfera lisa, e o próprio README diz que a máscara do LOLA é o que falta. |
| 16 | [friendlyfoe241-cyber/CLPS-Lunar-Mission-Browser](https://github.com/friendlyfoe241-cyber/CLPS-Lunar-Mission-Browser) | [no ar](https://lunarnav.vercel.app) | TypeScript + Python | 9 | 25/09 | Pacote Python "lunasight" com SPICE, iluminação, visibilidade e catálogo de sítios, mais um front na Vercel. O README é quase vazio. |
| 17 | [platonicHunter/CLPS-Lunar-Mission-Browser](https://github.com/platonicHunter/CLPS-Lunar-Mission-Browser) | [no ar](https://clps-lunar-mission-browser-psi.vercel.app) | TypeScript | 4 | 09/10 | Painel em Next.js com cena 3D (corpos celestes, trajetória), seletor de local, métricas e controles de reprodução. O README é o padrão do Next.js. |
| 18 | [polcxw/clps-lunar-mission-browser](https://github.com/polcxw/clps-lunar-mission-browser) | não | HTML | 2 | 04/10 | Uma página HTML ("V5.1") colada dentro do próprio README. |
| 19 | [EAZYCODER2415/clps_lunar_mission_browser](https://github.com/EAZYCODER2415/clps_lunar_mission_browser) | não | JavaScript | 6 | 18/10 | Front em React com carta do céu, linha do tempo e controles de câmera. Ainda não tem backend. MPL 2.0. |
| 20 | [kaveen-git12/nasa-clps-lunar-mission-browser](https://github.com/kaveen-git12/nasa-clps-lunar-mission-browser) | não | TypeScript | 2 | 02/10 | Front em React com páginas de missões, detalhe da missão e planejador. |
| 21 | [joahan77/clps-lunar-mission-browser](https://github.com/joahan77/clps-lunar-mission-browser) | não | TypeScript | 20 | 19/10 | App com dados de dezenas de missões lunares (Apollo, Chandrayaan, Chang'e, Beresheet, Blue Ghost...). Não tem README. |
| 22 | [DinithMadushan/CLPS_Lunar_Mission_Browser_2026](https://github.com/DinithMadushan/CLPS_Lunar_Mission_Browser_2026) | não | JavaScript | 36 | 14/10 | Lua genérica em 3D, reaproveitada de um projeto de sismos ("Moonquake Map 2.0"): dados das Apollo, missões CLPS, pouso simulado e laboratórios de gravidade. Pouco foco em Sol e Terra. |
| 23 | [nitrimandylis/space-apps-mockup](https://github.com/nitrimandylis/space-apps-mockup) | não | HTML | 1 | 28/10 | Maquete visual em 3D de Sol, Terra e Lua com as janelas de energia e comunicação. Já usa o nome novo do desafio. MIT. |
| 24 | [0Aaheed0/SeleneSight](https://github.com/0Aaheed0/SeleneSight) | não | só README | 2 | 13/10 | Só o README com a ideia: comparar sítios pela luz do Sol e pela visibilidade da Terra. |
| 25 | [yeskendir-sailau/lunar-navigator](https://github.com/yeskendir-sailau/lunar-navigator) | não | vazio | 2 | 02/11 | Só o README: "Sun, Earth and neighbour safety". Usa o nome novo. Apache 2.0. |
| 26 | [ZCarlosZNica/nasa-space-apps-nexus](https://github.com/ZCarlosZNica/nasa-space-apps-nexus) | não | vazio | 1 | 30/10 | Vazio. A descrição fala em topografia, iluminação e vantagens de cada sítio. Usa o nome novo. |
| 27 | [quadruple-t/NASASpaceApps27](https://github.com/quadruple-t/NASASpaceApps27) | não | vazio | 1 | 02/11 | Vazio. Só a descrição, que cita o nome novo do desafio. |

## O que se repete

- Pelos READMEs, 9 calculam o horizonte sobre o relevo: do 1 ao 8 e o 10 (o 9 é cópia do 8). Nos outros, o horizonte é plano, não aparece no README ou ainda não foi feito.
- 6 têm demo no ar: o 2, o 8, o 10, o 15, o 16 e o 17 (Vercel, Streamlit e GitHub Pages).
- Quase todos foram criados com o nome antigo do desafio. Os que usam o nome novo (23, 25, 26, 27) foram criados a partir de 28/10 e estão vazios ou são só maquetes.
- Vários têm arquivos de agentes de IA (AGENTS.md, CLAUDE.md).
- Nenhum README cita contagem regressiva até o pôr do Sol ou da Terra, os 130 sítios do Wueller 2026 ou a incerteza do DEM por sítio.
