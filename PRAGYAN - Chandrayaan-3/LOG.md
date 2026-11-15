# LOG — PRAGYAN (Chandrayaan-3)

## 2026-11-14 — Extração inicial

**Pedido:** "extraia tudo que preciso do pragyan" → consolidar trajeto, desvios, dados científicos e figuras; depois mover para pasta própria em `C:\NASA PROJETO 2026\`.

**Decisões:**
- Fonte primária escolhida: Stooke, *Chandrayaan 3 and Pragyan Rover: Traverse Analysis*, LPSC 2025 #1025 — é o único trabalho que reconstrói o trajeto cruzando imagens do rover com OHRC do Chandrayaan-2 e aponta os erros do mapa oficial da ISRO.
- Complemento quantitativo: release ISRO/PRL do APXS (23 pontos, Fig. 3 com escala de 10 m) + Nature 633 (Vadawale et al. 2024).
- Nature Communications Earth & Environment (2025) usado só via extração de trechos: o site bloqueia acesso automatizado ao HTML completo.

**Resultado:**
- 2 PDFs primários baixados e lidos (LPSC 2 págs, ISRO/PRL 5 págs), todas as páginas inspecionadas visualmente.
- 4 figuras extraídas/ampliadas + 4 JPEGs leves para consulta rápida.
- Dossiê, planilha de 4 abas e 2 CSVs gerados.

**Achados relevantes:**
1. Pragyan pousou a 69,373°S — ~2.100 km do polo. Não é rover polar; é o rover com trajeto real mais próximo do polo sul já dirigido.
2. Cinco desvios identificados: 1 por obstáculo (cratera de 4 m em 27/08/2023), 1 deliberado (offset path para testar tração), 3 de contorno/ajuste.
3. O mapa oficial da ISRO tem erro geométrico verificável: coloca o rover a leste da cratera A, mas a imagem voltada a leste exige o rover a oeste dela.
4. Distância final: 101,4 m (Wikipedia) vs ~103 m (ISRO/PRL) — divergência de fonte mantida explícita no dossiê.

**Pendências / limitações:**
- Tabela 2 do artigo da Nature (Na/K/S por waypoint) não obtida — acesso automatizado bloqueado. Requer acesso institucional ou PDF do autor.
- Trecho lander → West Crater permanece incerto na literatura.
- Rótulos pequenos das figuras foram lidos por ampliação; alguns números de waypoint ficaram ilegíveis (visíveis: 01, 03, 10, 13, 16, 21, 26, 29).

**Mapa dos arquivos:**
- `pragyan_dossie.md` — documento principal, com referência a página/figura de cada dado
- `pragyan_dados.xlsx` — abas: Cronologia, Desvios, APXS, Especificações
- `pragyan_cronologia.csv` / `pragyan_apxs.csv` — mesmos dados em texto
- `pdf/` — fontes primárias + texto extraído
- `img/crops/` — figuras em alta resolução
- `*.jpg` — versões leves das 4 figuras principais
- `pages/` — renderizações de página para verificação visual
- `_pagina_canvas/index.html` — página publicada no canvas do OpenClaw (autocontida)
- scripts `.py` — reaproveitáveis se novas figuras forem necessárias

## 2026-11-14 (17:40) - Artigo da Nature CEE obtido

**Pedido:** "consegue baixar o artigo completo?"

**Como:** Cloudflare bloqueava Invoke-WebRequest (retornava 3 KB de HTML). Unpaywall confirmou oa_status=gold apontando para o PDF do editor. A saida foi usar o navegador gerenciado (skill browser-resilience): `Open` passou pelo Cloudflare e `Download -DirectDownload -RequirePdf` baixou o arquivo real.

**Evidencia:** s43247-025-02305-1.pdf | 2.148.432 bytes | sha256 e467117753ef127da865f13c7fd762d1d31064e149f2bcd5243a568332a08ece | %PDF- + EOF confirmados.

**Resultado:** Table 2 extraido - 23 waypoints com Al2O3, Na, K, S e incertezas 1sigma. Nenhuma limitacao pendente sobre os dados por ponto.

**Arquivos novos:**
- pdf/s43247-025-02305-1.pdf (11 paginas)
- pdf/nature_cee_2025.txt (texto completo)
- pragyan_waypoints_apxs.csv
- aba Waypoints_APXS + aba Comparacao_solos na planilha
- img/nature/p2_1.jpeg (Fig. 2a - trajeto com 23 circulos) e p3_1.jpeg (paineis b-d)
