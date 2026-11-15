# LOG de trabalho — NASA PROJETO 2026

## 2026-10-22 · Sessão 1 — Levantamento bibliográfico e montagem do acervo

**Pedido (Eduardo):** sobre o desafio do polo sul lunar (ferramenta para comparar sítios de pouso e
datas, visualizando Sol e Terra em relação ao horizonte), buscar artigos científicos que possam
ajudar; depois, baixar tudo e gravar em `C:\NASA PROJETO 2026`.

**Método:**
1. Roteador de pesquisa (`skills/web-research-hybrid/router.js`) → domínio científico, modo `simple`,
   sem sensibilidade. Pesquisa aprofundada por pedido explícito do usuário.
2. Descoberta via **OpenAlex API** (metadados + locais de acesso aberto). SearXNG local retornou
   resultados degradados (irrelevantes) — descartado após a primeira tentativa.
3. Complemento: **NASA NTRS API**, **arXiv**, **Europe PMC**, repositórios institucionais
   (Birkbeck eprints, DLR elib), **NASA SVS API**.
4. Fallback pago (Serper, 1 crédito) apenas para confirmar o valor de 94% de Speyerer & Robinson.
5. Metadados (DOI, volume, páginas, autores) conferidos um a um no OpenAlex.

**Downloads realizados (10 arquivos, integridade verificada por magic bytes + pypdf):**

| Arquivo | Páginas | Origem |
|---|---|---|
| 2018_Glaser_illumination-poles-PSS162.pdf | 21 | NTRS 20170007365 (manuscrito aceito) |
| 2024_Pena-Asensio_ArtemisIII-MCDM-ActaAstronautica.pdf | 13 | arXiv 2406.19863 |
| 2019_Flahaut_ROI-lunar-south-pole-PSS180.pdf | 37 | Birkbeck eprints 29463 |
| 2023_Zhang_illumination-south-pole-multitemporal-RS.pdf | 23 | MDPI (mdpi-res) |
| 2026_Miao_illumination-constrained-Astar-path-planning-RS.pdf | 28 | MDPI (mdpi-res) |
| 2022_LunaNet_interoperability-specification-draft.pdf | 52 | NTRS 20220004317 |
| 2017_MoonTrek_interactive-web-portal-NTRS.pdf | 2 | NTRS 20170008884 |
| 2018_SolarSystemTreks_online-portals-NTRS.pdf | 1 | NTRS 20180000384 |
| 2016_LRO_future-exploration-south-pole-NTRS.pdf | 1 | NTRS 20160012274 |
| 2023_Leone_Sverdrup-Henson-iScience_fulltext.xml | — | Europe PMC (PDF bloqueado) |

**Falhas e contorno:**
- MDPI e Cell bloquearam `curl` direto (retornaram HTML). Contornado com `mdpi-res.com` para os
  dois MDPI e com full text XML do Europe PMC para o iScience. Nenhum paywall foi contornado.
- `pdfinfo` não existe neste host (só `pdftotext`, do Git mingw). Contagem de páginas feita com `pypdf`.
- SVS 5228 só disponibilizou o still `print.jpg`; PNG e vídeo retornaram 404.

**Acesso fechado (não baixado, registrado com DOI):** Mazarico 2011 (Icarus), Speyerer & Robinson
2013 (Icarus), Bryant 2009 (IEEE), Israel 2020 (IEEE — suprido pela especificação LunaNet completa).

**Resultado:** acervo organizado em `artigos/`, `dados/`, `referencias-visual/`, com
`LEIA-ME.md`, `BIBLIOGRAFIA.md`, `SINTESE-TECNICA.md` e `dados/README.md`.

**Descobertas técnicas relevantes:**
- Iluminação média publicada: 69,5–82,9% na superfície; 77,1–88,0% a 2 m (Gläser 2018).
- Melhor sítio do polo sul: 92% solar vs ~50% DTE (Bryant 2009).
- Borda de Shackleton: 94% iluminada (Speyerer & Robinson 2013).
- Sol nunca passa de ~1,5° de elevação → painel horizontal recebe ~2,6% do nominal.
  **"92% de iluminação" ≠ "92% de energia"** — este é o diferencial de produto mais forte.
- Precessão de 18,6 anos é obrigatória na janela temporal da ferramenta.

**Pendências:**
- [ ] Decidir se o protótipo será construído (oferecido ao Eduardo).
- [ ] Baixar DEM SLDEM2015 / recorte LOLA (grande, sob demanda).
- [ ] Criar scripts `01_baixar_dem.py` … `04_validate.py` (esqueleto descrito em `dados/README.md`).

## 2026-10-22 · Sessão 2 — Documentação de transferência (handoff)

**Pedido (Eduardo):** registrar na pasta do projeto o conteúdo para que outro agente saiba o que foi
pesquisado e que dados existem.

**Entregues:**
- `CONTEXTO-AGENTE.md` (13 KB) — briefing autocontido: TL;DR, mapa artigo→página, o que falta,
  revisão técnica do plano paralelo, próximo passo e armadilhas da máquina.
- `MANIFEST.json` — inventário legível por máquina: 21 arquivos com bytes, SHA-256 e páginas.
- `_build_manifest.py` — gerador do manifesto; rodar ao adicionar arquivos.

**Descoberta durante o trabalho:** outra sessão criou, às 23:27 (em paralelo), dois arquivos:
`plano_projeto_polo_sul_lunar.md` e `sitios_pouso_candidatos.json`. Foram **preservados** e
incorporados ao inventário. Revisão técnica registrada em `CONTEXTO-AGENTE.md` §7, com 8 pontos —
os três mais relevantes:

1. Janela 2026–2028 é insuficiente; precessão é de 18,6 anos (Gläser 2018 usa 2017–2037).
2. Piso de 5° para elevação da Terra provavelmente elimina quase toda janela DTE — a Terra oscila
   apenas alguns graus em torno do horizonte no polo sul. Verificar com SPICE antes de fixar.
3. Otimização (MILP/KKT) antes de validar a máscara de horizonte otimiza o erro. Inverter a ordem.

**Verificação:** `python _build_manifest.py` → 21/21 arquivos presentes, todos com hash.
Nenhum arquivo pré-existente foi movido, sobrescrito ou apagado.

**Pendências herdadas:** teste de aceitação do motor (77–88% na crista Shackleton–de Gerlache a 2 m),
download do DEM, expansão dos sítios para os 13 ROIs de Artemis III + DM2.

## 2026-10-22 · Sessão 3 — Antecipação de dados e motor de cálculo

**Pedido (Eduardo):** "a NASA provavelmente cederá dados... o que você acha que serão? Podemos nos
antecipar a recolher os dados? Ou estimar para adiantar os cálculos?"

**Identificação do desafio na fonte:** *CLPS Lunar Mission Browser* — Space Apps 2026, slug
`clps-lunar-mission-browser`, publicado 2026-09-17, atualizado 2026-10-20. Texto do enunciado
confirmado idêntico ao recebido.

**Dados recolhidos (não dependem do hackathon):** DEM polar LOLA 20 m/px (109,7 MB) + 5 kernels
SPICE, incluindo o kernel de orientação lunar (`moon_pa_de440_200625.bpc`) e os dois frames de
texto — sem eles a libração sai errada. Total ~154 MB em `dados/`.

**Motor construído:** `precalc/build_ephem.py` (SPICE → vetores Sol/Terra, 55.521 amostras,
2026–2045), `precalc/engine.py` (horizonte + iluminação em milissegundos por sítio),
`precalc/scan.py` (varredura de 9.000 pontos). Detalhes em `precalc/RESULTADOS.md`.

**Validação:** melhor iluminação encontrada 68,4% (centro do disco) → **75,9%** ao contar o limbo
superior do Sol (+0,27°), contra **77,1–88,0%** publicados por Gläser 2018. Diferença de ~1 ponto.
DTE geométrico no polo 49,1%, casando com os ~50% de Bryant 2009.

**Bugs corrigidos durante a construção (registro para o próximo agente):**
1. SPICE trabalha em **km**; eu usei raio em metros → direções deslocadas em ~0,68°. Produzia
   Terra a −78° de elevação. Corrigido em `engine.el_az`.
2. `sp.namfrm` devolve **0** quando o frame não existe, sem levantar exceção — o teste de
   disponibilidade do frame estava falso-positivo. Agora checa `!= 0` e testa `spkpos`.
3. Frame `MOON_ME` exige os kernels de texto `moon_de440_250416.tf` + `moon_assoc_me.tf`.

**Achados novos:** melhor sítio de iluminação em −89,30°S / ~128°E; melhor sítio de DTE em
−88,25°S / ~8°E (69,9%); o "Shackleton rim" do JSON existente está na encosta, não na borda
(h0 634 m, horizonte médio +2,97°).

**Correção de registro:** a nota anterior de que um piso de 5° "eliminaria quase toda janela DTE"
estava exagerada — o valor medido é 21,8% do tempo no polo.

## 2026-10-23 · Sessão 4 — Consolidação e relatório

**Pedido (Eduardo):** colocar tudo que foi encontrado no projeto e escrever um .md explicando.

**Criado:**
- `RELATORIO.md` (13 KB) — documento único que explica o projeto inteiro: desafio identificado,
  previsão do que a NASA fornecerá, acervo científico por eixo, dados recolhidos, motor, resultados
  medidos, decisões de produto, erros corrigidos, pendências e índice completo.
- `precalc/make_figures.py` + `fig_panorama.png` + `fig_timeline.png` — panorama 360° do
  horizonte do melhor sítio (terreno, faixa do Sol, faixa da Terra) e linha do tempo de 1 ano com
  janelas de energia e DTE. Ambas conferidas visualmente.

**Reescrito:**
- `dados/README.md` — agora reflete o que existe em disco, com ordem de carga dos kernels,
  formato do DEM (com a pegadinha do DERIVED_MINIMUM em DN) e a lista do que falta com tamanhos.
- `LEIA-ME.md` — passa a apontar `RELATORIO.md` como ponto de entrada.

**Estado:** `MANIFEST.json` com **43 arquivos, 193 MB, todos presentes e com SHA-256**.
Nenhum arquivo pré-existente foi removido ou sobrescrito.
