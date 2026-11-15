# NASA PROJETO 2026 — Polo Sul Lunar: base científica

**Desafio:** criar uma ferramenta/app intuitiva para planejadores de missão, educadores e público
compararem **sítios de pouso e datas** no polo sul da Lua, visualizando **posições do Sol e da Terra
em relação ao horizonte** para avaliar potencial de geração de energia e janelas de comunicação
direta com a Terra (DTE).

**Tese central deste acervo:** a física já está publicada e resolvida (máscara de horizonte + efemérides).
A lacuna que o desafio pede é de **interface e comparação**, não de modelagem.

---

## Estrutura

```
C:\NASA PROJETO 2026\
├── RELATORIO.md              ← ★ LEIA ESTE: explica o projeto inteiro (pesquisa, dados, motor, resultados)
├── CONTEXTO-AGENTE.md         ← briefing para outro agente (o que foi pesquisado, o que falta, revisão do plano)
├── LEIA-ME.md                ← este arquivo (índice curto)
├── BIBLIOGRAFIA.md           ← 15 referências com metadados verificados e status de download
├── SINTESE-TECNICA.md        ← algoritmo, dados, arquitetura e validação
├── LOG.md                    ← log de trabalho do projeto
├── MANIFEST.json             ← inventário máquina-legível: todos os arquivos com SHA-256
├── _build_manifest.py        ← gerador do MANIFEST.json (rodar ao adicionar arquivos)
├── plano_projeto_polo_sul_lunar.md  ← plano funcional de outra sessão (ver §7 do CONTEXTO-AGENTE)
├── sitios_pouso_candidatos.json     ← 5 sítios candidatos (coordenadas a revisar)
├── artigos\                  ← 9 PDFs + 1 full text XML
├── dados\                    ← DEM LOLA 20 m/px + 5 kernels SPICE (154 MB) + README
├── precalc\                  ← motor de cálculo, efemérides, varredura, figuras e RESULTADOS.md
└── referencias-visual\       ← still + metadados da NASA SVS 5228
```

## O que foi baixado

| # | Arquivo | Tipo | Status |
|---|---|---|---|
| 1 | `2018_Glaser_illumination-poles-PSS162.pdf` | artigo completo (21 p) | ✅ baixado |
| 2 | `2024_Pena-Asensio_ArtemisIII-MCDM-ActaAstronautica.pdf` | artigo completo (13 p) | ✅ baixado |
| 3 | `2019_Flahaut_ROI-lunar-south-pole-PSS180.pdf` | artigo completo (37 p) | ✅ baixado |
| 4 | `2023_Zhang_illumination-south-pole-multitemporal-RS.pdf` | artigo completo (23 p) | ✅ baixado |
| 5 | `2026_Miao_illumination-constrained-Astar-path-planning-RS.pdf` | artigo completo (28 p) | ✅ baixado |
| 6 | `2023_Leone_Sverdrup-Henson-iScience_fulltext.xml` | full text XML (PDF bloqueado) | ⚠️ XML |
| 7 | `2022_LunaNet_interoperability-specification-draft.pdf` | norma NASA/TP (52 p) | ✅ baixado |
| 8 | `2017_MoonTrek_interactive-web-portal-NTRS.pdf` | precedente de ferramenta (2 p) | ✅ baixado |
| 9 | `2018_SolarSystemTreks_online-portals-NTRS.pdf` | pôster AGU (1 p) | ✅ baixado |
| 10 | `2016_LRO_future-exploration-south-pole-NTRS.pdf` | resumo (1 p) | ✅ baixado |
| 11 | `referencias-visual\southpole_earth_sun.1858_print.jpg` | still NASA SVS 5228 | ✅ baixado |
| 12 | `referencias-visual\svs5228_api.json` | metadados SVS | ✅ baixado |

## O que NÃO foi baixado (acesso fechado — pagamento)

| Referência | Motivo |
|---|---|
| Mazarico et al. 2011, Icarus 211 | Elsevier, sem versão aberta localizada |
| Speyerer & Robinson 2013, Icarus 222 | Elsevier, sem versão aberta localizada |
| Bryant 2009, IEEE Aerospace | IEEE, sem versão aberta localizada |
| Israel et al. 2020, IEEE Aerospace (LunaNet) | IEEE; suprido pela especificação NASA/TP completa |

Detalhes, DOIs e resumos em `BIBLIOGRAFIA.md`. Nenhum paywall foi contornado.

---

## Comece por aqui

0. `RELATORIO.md` — o documento explicativo completo. É o ponto de entrada.
1. `CONTEXTO-AGENTE.md` — se você é outro agente ou outra sessão, este é o briefing de transferência.
   `MANIFEST.json` permite verificar integridade dos arquivos por SHA-256.
2. `SINTESE-TECNICA.md` — se for construir algo, leia esta em seguida (30 min).
2. `2018_Glaser_illumination-poles-PSS162.pdf` — método e números de referência do polo sul.
3. `2019_Flahaut_ROI-lunar-south-pole-PSS180.pdf` — os critérios de decisão que a UI deve expor.
4. `2024_Pena-Asensio_...pdf` — como transformar critérios em ranking (MCDM/TOPSIS).

> Fontes consultadas em 2026-10-22. Metadados (DOI, volume, páginas, autores) conferidos via OpenAlex.
