# CONTEXTO-AGENTE.md — briefing de transferência

**Para:** o próximo agente (ou sessão) que trabalhar neste projeto.
**De:** sessão OpenClaw de 2026-10-22 23:13–23:35 (modelo `deepseek/deepseek-v4-flash`).
**Objetivo deste arquivo:** você não precisa refazer a pesquisa. Aqui está o que foi pesquisado,
por que, o que existe em disco, o que não existe e o que falta decidir.

> Leia este arquivo inteiro antes de qualquer ação. Depois leia `SINTESE-TECNICA.md`.
> `MANIFEST.json` é a versão legível por máquina deste inventário (tamanho + SHA-256 de cada arquivo).

---

## 1. TL;DR em sete linhas

1. O desafio é de **interface**, não de física. O método de cálculo já está publicado e é reprodutível.
2. Método correto: **máscara de horizonte 360° a partir de DEM** (ray-marching) + **efemérides SPICE**,
   comparando elevação do Sol/Terra com o perfil do terreno no azimute correspondente.
3. No polo sul o Sol **nunca passa de ~1,5° de elevação**. Toda a dinâmica cabe em ±1,5° — logo a
   precisão da máscara de horizonte é o fator crítico.
4. **Iluminação não é potência**: cos(1,5°) ≈ 0,026. Um app que mostra só claro/escuro está errado.
5. A precessão lunar é de **18,6 anos**: sem cobrir esse ciclo, o app não pode dizer "melhor data".
6. Números de referência para validar o motor: **69,5–82,9%** (superfície) e **77,1–88,0%** (a 2 m).
7. Já existe um acervo de 10 documentos em `artigos/` e um plano funcional de outra sessão em
   `plano_projeto_polo_sul_lunar.md`. **Não regenere nem sobrescreva nada** — some a isso.

---

## 2. O que foi pesquisado (e por quê)

O desafio pede três coisas simultâneas: (a) posição do Sol relativa ao horizonte → energia;
(b) posição da Terra relativa ao horizonte → comunicação DTE; (c) comparação rápida entre sítios e datas.

A pesquisa foi organizada nesses três eixos + dois transversais (ferramentas e operações):

| Eixo | Pergunta que respondeu |
|---|---|
| Iluminação polar | Como se calcula, com que dados, com que precisão, e quais são os valores publicados |
| Visibilidade da Terra / DTE | Como se calcula, qual é o teto realista e por que existe relay |
| Seleção de sítio | Quais critérios a literatura usa — e portanto quais a UI deve expor |
| Ferramentas | O que já existe (Moon Trek) e por que é considerado difícil de usar |
| Operações | Comunicação (LunaNet) e trajetos com restrição de luz |

**Método de busca:** OpenAlex API (metadados + locais de acesso aberto), NASA NTRS API, arXiv,
Europe PMC, repositórios institucionais (Birkbeck, DLR). Metadados (DOI, volume, páginas, autores)
conferidos um a um no OpenAlex.

**Aviso de método:** o SearXNG local **retornou resultados degradados** nesta consulta (devolveu
resultados irrelevantes, ex. "Lunar Client"/Minecraft). Não use `web_search` como descoberta
primária nesta máquina; vá direto ao OpenAlex, que funcionou bem e é gratuito.

---

## 3. Inventário do que existe em disco

Ver `MANIFEST.json` para SHA-256 e bytes. Resumo:

```
C:\NASA PROJETO 2026\
├── CONTEXTO-AGENTE.md              ← este arquivo
├── MANIFEST.json                   ← inventário máquina-legível (19 itens, com hash)
├── LEIA-ME.md                      ← índice e status de downloads
├── BIBLIOGRAFIA.md                 ← 15 referências comentadas, com DOI e status
├── SINTESE-TECNICA.md              ← algoritmo, dados, números, arquitetura, validação
├── LOG.md                          ← log da sessão 1 (inclui falhas e contornos)
├── plano_projeto_polo_sul_lunar.md ← plano funcional (OUTRA sessão, 23:27) — ver §7
├── sitios_pouso_candidatos.json    ← 5 sítios (OUTRA sessão, 23:27) — ver §7
├── artigos\                        ← 9 PDFs + 1 full text XML (10 documentos)
├── dados\README.md                 ← fontes de DEM e kernels (links verificados HTTP 200)
├── referencias-visual\             ← still + JSON da NASA SVS 5228
├── _build_manifest.py              ← gerador do MANIFEST.json (rodar se adicionar arquivo)
└── Curso_Metodos_Otimizacao_Marcato\  ← material de curso pré-existente; NÃO MEXER
```

---

## 4. Mapa artigo → conteúdo → onde olhar

Números de página conferidos por extração de texto (1-based, contando a capa).

### `2018_Glaser_illumination-poles-PSS162.pdf` — o mais importante (21 p)
Manuscrito aceito, não a versão diagramada: a paginação pode diferir da revista.
- **p.1** — resumo com todos os números.
- **p.5–7** — construção da máscara de horizonte (o algoritmo).
- **p.6** — ciclo de precessão de 18,6 anos.
- **p.7** — identificação das regiões de topo; crista Shackleton–de Gerlache.
- **p.10–12** — valores de iluminação média e **Tabela 2** (superfície × 2 m × 10 m).
- **p.11–14, 17** — 77,1% e 88,0% (os dois extremos a 2 m).

### `2019_Flahaut_ROI-lunar-south-pole-PSS180.pdf` — os critérios de decisão (37 p)
- **p.11 e p.13** — texto literal *"must be maximal"* para iluminação e para visibilidade da Terra.
- **p.8, 10–13** — discussão de visibilidade da Terra / comunicação.
- **p.12** — **Tabela 1**: os ROIs e suas coordenadas.
- **p.11–13, 17** — elipses de pouso e restrições (encosta >7°, iluminação <40%).

### `2024_Pena-Asensio_ArtemisIII-MCDM-ActaAstronautica.pdf` — o ranking (13 p)
- **p.1** — resumo com 1.247 pontos, 13 regiões, vencedor DM2.
- **p.2–3, 6–8** — método TOPSIS e a lista de critérios.
- **p.5** — critério C4, "Direct communication with Earth" (usa *earthshine*).
- **p.7–10** — resultados e análise de sensibilidade.

### `2023_Zhang_illumination-south-pole-multitemporal-RS.pdf` — validação (23 p)
- **p.1, 4** — base de imagens 0,69–1,97 m/px e método.
- **p.12** — aplicação na área de pouso de Chang'E-7.

### `2026_Miao_illumination-constrained-Astar-path-planning-RS.pdf` — trajetos (28 p)
- **p.1, 3, 11–16** — algoritmo DIC3D-A*.
- **p.4** — DEM 5 m/px, recorte 1300 × 1300 m.
- **p.8–9, 12–13** — custo combinando declividade, distância e iluminação.

### `2022_LunaNet_interoperability-specification-draft.pdf` — comunicação (52 p)
- **p.9, 11** — *Direct-to-Earth*.
- **p.12–13, 43** — serviços de comunicação em tempo real.
- **p.16–24** — serviços de navegação e posicionamento.

### `2023_Leone_Sverdrup-Henson-iScience_fulltext.xml`
XML completo (o PDF foi bloqueado). Comparação multi-critério de base; útil para o argumento
"não existe um sítio melhor em tudo".

---

## 5. O que NÃO temos (e como obter legalmente)

| Referência | Editora | Por que importa | Como obter |
|---|---|---|---|
| Mazarico et al. 2011, Icarus 211, 1066–1081 · `10.1016/j.icarus.2010.10.030` | Elsevier | artigo fundador do método | acesso institucional; ou usar Gläser 2018 (mesmo método, aberto) |
| Speyerer & Robinson 2013, Icarus 222, 122–136 · `10.1016/j.icarus.2012.10.010` | Elsevier | fonte do valor 94% | idem |
| Bryant 2009, IEEE Aerospace · `10.1109/aero.2009.4839375` | IEEE | único paper com solar **e** DTE no mesmo pipeline; fonte de 92%/50% | IEEE Xplore |
| Israel et al. 2020, IEEE Aerospace · `10.1109/aero47225.2020.9172509` | IEEE | LunaNet | **já suprido** pela especificação NASA/TP baixada |

**Regra:** nenhum paywall foi contornado e nenhum deve ser. Se precisar do conteúdo fechado,
peça acesso institucional ao Eduardo.

---

## 6. Dados brutos ainda não baixados

Estão catalogados com links verificados em `dados\README.md`. Nada foi baixado porque são grandes:

- **SLDEM2015** (59 m/px) — https://pgda.gsfc.nasa.gov/products/78
- **LOLA / PDS** — https://pds-geosciences.wustl.edu/missions/lro/ · https://imbrium.mit.edu/
- **Kernels SPICE** — https://naif.jpl.nasa.gov/naif/ — precisa de `de440s.bsp`, `naif0012.tls`,
  `pck00011.tpc` **e um kernel de orientação lunar** (`moon_pa_de440_*.bpc`). Sem este último a
  libração fica errada e a máscara de horizonte aponta para o azimute errado.

---

## 7. Revisão técnica do plano paralelo (`plano_projeto_polo_sul_lunar.md`)

O plano foi escrito por outra sessão às 23:27, ou seja, **em paralelo** a este levantamento.
Ele é bom no enquadramento (problema, camadas, curso Marcato) e **não deve ser apagado**.
Pontos que precisam de ajuste antes de virar código — todos com base na literatura baixada:

1. **Janela temporal curta (crítico).** A Fase 1 prevê matriz 2026–2028. A precessão é de 18,6 anos;
   Gläser 2018 simula 2017–2037. Com 2 anos o app **não pode** responder "melhor data".
   → estender para **2026–2045**, com passo de 10 min (1 h é o padrão da literatura e basta para
   estatística, mas 10 min melhora as bordas das janelas DTE).

2. **Piso de 5° para a Terra.** A elevação da Terra vista do polo sul oscila ~±7° em torno do horizonte
   (libração em latitude) — medido com SPICE: −7,01° a +6,72° em 89,9°S (ver `precalc/RESULTADOS.md`).
   Um piso de 5° deixa **21,8%** do tempo geometricamente viável no polo e 44,2% em Malapert:
   restritivo, mas **não fatal** — correção da primeira avaliação. Use máscara de terreno com margem
   pequena (0–2°).

3. **`elevation_m` no JSON não substitui DEM.** Máscara de horizonte exige o perfil 360° do terreno.
   Os valores de altitude servem para sanity-check e rótulo, não para o cálculo.

4. **Cobertura de sítios.** São 5 sítios; a literatura trabalha com 13 regiões candidatas Artemis III
   (Peña-Asensio) e 12 elipses (Flahaut). Falta pelo menos **DM2 / Nobile Rim 2**
   (−84,20156°, 60,69989°E), que é o ótimo do MCDM, e os ROIs de Flahaut (Tabela 1, p.12).

5. **Ordem de trabalho invertida.** Otimização (MILP/KKT) sobre um modelo de iluminação não validado
   otimiza o erro. → primeiro máscara + efemérides + **validação contra 77,1–88,0%**; só depois
   o otimizador.

6. **Função-objetivo deve conter o cosseno.** Se o termo solar for "fração iluminada", o otimizador
   vai preferir iluminação em vez de energia. Use `P_solar ∝ cos(elevação solar)` explicitamente.

7. **KPIs ausentes.** Faltam as duas restrições que realmente dimensionam a missão:
   **pior apagão contínuo (horas)** e **maior intervalo sem DTE (horas)**. São elas que definem
   bateria e buffer de dados.

8. **Declarado e inexistente.** O plano cita `src\`, `ephemeris.py`, `optimizer.py`, `app.py`,
   `requirements.txt`, `src\sites.json`. **Nada disso existe ainda.** Use
   `sitios_pouso_candidatos.json` como base de dados de sítios, mas veja o item 4.

---

## 8. Números-âncora (use para validar, não para decorar)

| Métrica | Valor | Fonte |
|---|---|---|
| Iluminação na borda de Shackleton | 94% do tempo | Speyerer & Robinson 2013 |
| Iluminação média, sítios de topo, superfície | 69,5–82,9% | Gläser 2018 |
| Idem, a 2 m de altura | 77,1–88,0% (máx. crista Shackleton–de Gerlache) | Gläser 2018 |
| Melhor sítio polo sul: solar / DTE | 92% / ~50% | Bryant 2009 |
| Áreas com iluminação média >80% | restritas, poucos km² | Mazarico 2011 |
| Ótimo MCDM Artemis III | DM2, −84,20156°, 60,69989°E | Peña-Asensio 2024 |

**Teste de aceitação do motor:** rodar no sítio da crista Shackleton–de Gerlache, observador a 2 m,
2017–2037 → tem que cair em **77–88%**. Se der ~60% ou ~95%, há erro de máscara, de frame ou de altura.

---

## 9. Próximos passos sugeridos (em ordem)

1. Implementar `horizon_mask()` + `ephemeris()` e rodar o teste de aceitação do §8. **Nada mais
   importa antes disso.**
2. Baixar recorte do DEM (SLDEM2015 ou LOLA 20 m/px) na bbox do polo sul.
3. Resolver o item 2 do §7 (piso de elevação da Terra) com um cálculo real.
4. Expandir `sitios_pouso_candidatos.json` para os 13 ROIs de Artemis III + DM2.
5. Só então: ranking, otimização de janela e UI (panorama 360° + Gantt).
6. Manter `LOG.md` atualizado e rodar `python _build_manifest.py` ao adicionar arquivos.

---

## 10. Armadilhas operacionais desta máquina

- **SearXNG local degradado** — não use para descoberta científica; use OpenAlex.
- **MDPI bloqueia `curl` direto** (devolve HTML). Use
  `https://mdpi-res.com/d_attachment/<journal>/<journal>-<vol>-<artigo>/article_deploy/<journal>-<vol>-<artigo>.pdf`.
- **PMC bloqueia PDF** (`ptpmcrender.fcgi` devolve HTML). Use
  `https://www.ebi.ac.uk/europepmc/webservices/rest/PMC<id>/fullTextXML`.
- **`pdfinfo` não existe** neste host. Só `pdftotext` (Git mingw) e `pypdf` (Python 3.10).
- **Console cp1252**: acentos aparecem como `?` na saída de ferramentas, mas os arquivos são UTF-8
  e estão íntegros. Não "conserte" acentuação por causa disso.
- **`curl.exe` com caminho contendo espaço** funciona; só lembre de escapar `%` em URLs com
  `%20` quando passar por PowerShell.

---

## 11. Verificação rápida

```powershell
cd "C:\NASA PROJETO 2026"
python _build_manifest.py                  # revalida tamanhos + hashes + páginas
python -c "import json;d=json.load(open('MANIFEST.json',encoding='utf-8'));print(d['contagem'])"
Get-ChildItem artigos | Select-Object Name,Length
python -c "from pypdf import PdfReader; print(len(PdfReader('artigos/2018_Glaser_illumination-poles-PSS162.pdf').pages))"
```

Estado esperado: 21 arquivos presentes, 21 páginas no Gläser 2018, 10 documentos em `artigos\`.
