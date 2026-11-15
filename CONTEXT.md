# CONTEXT.md — Arquitetura e Regras do Projeto (`NASA PROJETO 2026`)

> **Leia este arquivo antes de editar código, scripts científicos ou documentos da tese.**  
> Ele consolida a arquitetura atual do repositório, o mapa de dados reais em disco e as regras inegociáveis de física lunar, geodésia, memória e fluxo de trabalho. *(Obs.: `CONTEXTO-AGENTE.md` é um registro histórico de `22/10/2026` mantido apenas para rastreabilidade.)*

---

## 1. Objetivo Central do Projeto

Unir a seleção multicritério de sítios e rotas no Polo Sul Lunar (**130 sítios candidatos** de *Wueller et al., 2026* em `60 m/px`, distribuídos em `16` regiões incluindo as **`9` regiões prioritárias da NASA desde out/2024**) com um **método probabilístico multirresolução (`240 → 120 → 60 → 20 → 5 m`)** que calibra a perda de iluminação solar e o aumento da variância de declividade usando os recortes reais de `5 m/px`, corrigindo estatisticamente sítios e rotas de travessia que só dispõem de `60 m`, `20 m` ou `10 m`.

---

## 2. Mapa de Diretórios e Módulos

```text
c:\NASA PROJETO 2026\
├── CONTEXT.md                        ← Este guia de arquitetura e regras (fonte de verdade)
├── sites\
│   └── artemis_sitios_wueller2026.csv← Catálogo oficial (130 sítios, 21 colunas, base 60 m/px)
├── dados\
│   ├── dem\LDEM_875S_20M.IMG/.LBL    ← DEM LOLA 20 m/px contínuo (87,5°S–90°S, 7584×7584)
│   ├── kernels\                      ← NAIF/SPICE DE440 + MOON_ME (.bsp, .bpc, .tf, .tls, .tpc)
│   └── acervo_tese\                  ← 161 arquivos oficiais (12,288 GB)
│       ├── 01_LDEM_5M_MIT\           ← LDEM_875S_5M e LDEC_875S_5M (5 m/px, 30336×30336 px)
│       ├── 02_PGDA_78_5M\            ← 27 recortes ajustados pós-GRAIL (GeoTIFF 5 m/px)
│       └── 03_PGDA_69_Iluminacao\    ← Mapas oficiais NASA AVGVISIB / _EARTH / LPSR (60/120/240 m)
├── multirresolucao\
│   ├── analise_cobertura_lola.py     ← Numeração N→S (1..130), stats LDEC/PGDA78 e figuras base
│   ├── gera_mosaico_multiescala.py   ← Comparativo LDEC 5→120 m na escala única 0%–100%
│   ├── build_bancada.py              ← Automação da planilha Excel de validação
│   └── tabelas_brutas\               ← Tabelas auxiliares e artigos_base\
├── precalc\
│   ├── build_ephem.py / ephem_*.npy  ← Pré-cálculo SPICE Sol/Terra em MOON_ME (2026–2045)
│   ├── engine.py / horizon.py        ← Motor de horizonte + iluminação (VER AVISO DE BUG NA §4!)
│   └── scan.py / probe_geometry.py   ← Varredura e geometria polar pura
├── otimizacao_marcato\               ← Referências Simplex, KKT e métodos não lineares
├── src\                              ← Interface cockpit HTML/Three.js e bundle estático da tese
│   ├── cockpit_missao_lunar.html
│   ├── build_map_bundle.py
│   ├── educational_3d.html
│   ├── solar_panel_math.py
│   ├── assets\tese_bundle\           ← sites_master.json + recortes PGDA 78 5 m/px
│   └── js\                           ← rover_tese_engine.js, route_sim_v18.js, surface_3d_terrain.js, tese_ui.js
├── docs\
│   ├── PLANO_INTEGRACAO_COCKPIT_TESE.md                  ← Especificação completa + instruções p/ cockpit e terminators-lunar
│   ├── Relatorio_Consolidado_Tese_2026.md/.docx          ← Consolidação científica integral formatada (MC, SfS, LROC NAC, POP=100)
│   ├── Tese_Versao_Simplificada.md                       ← Síntese enxuta focada na tese
│   ├── Tese_Apresentacao_Dados_e_Variaveis.md            ← Documento técnico completo + Apêndice A (130 sítios)
│   ├── Plano_Mestre_Otimizacao_e_Probabilidade_5m_Eduardo.md
│   ├── Tese_Notas_Arquitetura_Dados.md                   ← Contornos permanentes de sensores + log
│   ├── figuras_tese\                                     ← PNGs 180 DPI gerados pelos scripts
│   └── tabelas_tese\                                     ← sitios_numerados.csv/.md, cobertura_multiescala.csv, resumo.json
└── repo_lunar_navigator\             ← Subpasta com repositório Git espelho (não commitar sem ordem)
```

---

## 3. Fatos Físicos e Empíricos Imutáveis (Não Contradizer no Código ou Texto)

1. **NÃO existe DEM de iluminação solar a `5 m/px` nem a `1 m/px` para o Polo Sul inteiro.** Mapas globais contínuos de iluminação (`PGDA 69`) existem apenas em `60 m`, `120 m` e `240 m/px`.
2. **LOLA (`LRO`):** A coleta densa polar encerrou em **setembro de 2013**. Na calota contínua `87,5°S–90°S` (`LDEC_875S_5M`), apenas **`7,29%`** dos pixels de `5 × 5 m` têm disparo real do laser e **`92,71%` são interpolados matematicamente** (`25,90%` em `10 m`; `67,97%` em `20 m`; `95,93%` em `40 m`; `99,40%` em `60 m`; `99,997%` em `120 m`).
3. **GRAIL + `PGDA 78` (`5 m`) e `PGDA 90` (`20 m`):** Corrigiu erros orbitais de 2009–2013. Dos `130` sítios, **`104` (`80,0%`)** têm DEM `5 m` no `PGDA 78` (mediana de **`7,6%`** medidos na elipse de `100 m`, mínimo `0,08%` em `Nº 16 NR2_K2023`, máximo `21,24%`), em recortes pequenos (`16 × 16 km` a `29,8 × 29,8 km`, sem iluminação pronta e sem horizonte distante de `100–200 km`). Os **`26` sítios sem `5 m` (`20,0%`)** concentram-se **100%** em três regiões atuais da NASA (`PCB` = `5` em `20 m`; `SP` = `11` em `10 m`; `MMP` = `9` em `20 m` + `1` em `10 m` + `1` em `5 m`).
4. **`LROC NAC SfS` (`1–2 m/px` e `5 m/px`):** Ancorado ao LOLA, mas **não funciona no escuro / dentro de PSRs**.
5. **`ShadowCam` (`KPLO/Danuri`):** Imagens ópticas (`~1,7–2 m/px`, `>200×` sensibilidade via luz espalhada) dentro de PSRs — **não é mapa de radiação solar/energia**, servindo para auditoria visual de obstáculos e voláteis no escuro.
6. **Numeração canônica dos sítios:** Ordem estrita do mais ao norte (`Nº 1 PCB04`, `-83,3691°`) ao mais ao sul (`Nº 130 CR08`, `-89,6319°`), mantida em `docs/tabelas_tese/sitios_numerados.csv`.

---

## 4. Regras Obrigatórias de Código, Geodésia e Memória

### 4.1 Geodésia e Cálculo Astronômico (`MOON_ME`)
* **Raio lunar padrão IAU:** Sempre `R_LUA = 1737400.0` m ($\approx 30.323\text{ m/grau}$ de latitude).
* **Aviso de bug legado em `precalc/horizon.py` e `precalc/engine.py`:** Ambos contêm atualmente `m_lat = 111320.0` (fator da Terra!) e ignoram a curvatura esférica $-d^2 / (2 R_{\text{Lua}})$ ao traçar raios em lat/lon. **Para qualquer novo motor ou calibração *ceteris paribus* (`Passo 1`), NÃO reutilizar essa aproximação:** projetar e marchar raios diretamente no plano estereográfico polar `(x, y)` em metros e subtrair $d^2 / (2 R_{\text{Lua}})$ na cota relativa.
* **Kernels SPICE obrigatórios:** Carregar em conjunto `de440s.bsp`, `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` e `moon_assoc_me.tf` para garantir o referencial `MOON_ME`.

### 4.2 Leitura de Rasters e Uso de Memória
* **Processamento fora-do-núcleo (`out-of-core`):** Nunca carregar `LDEM_875S_5M.IMG` (`1,84 GB`) ou `LDEC_875S_5M.IMG` (`920 MB`) inteiros como `float64` na RAM. Usar `np.memmap(..., mode="r")` em faixas de altura `STRIP = 96` px (`480 m`, divisor exato de `30.336` e múltiplo de `1, 2, 4, 8, 12, 16, 24, 48` subcélulas).
* **Conversões PDS3 `.IMG` + `.LBL` vs. `GeoTIFF`:**
  * `LDEM_*` (`int16` little-endian `<i2`): `Z (m) = DN * 0.5` (relativo a `1.737.400 m`), centro da grade em `15167.5` (`5 m`) ou `3791.5` (`20 m`).
  * `AVGVISIB_*` (`int16` `<i2`): `Fração = DN * 0.00004`; `LPSR_*`: `DN * 0.000025 + 0.5`.
  * `PGDA 78 *_5mpp_*.tif`: `float32` já em metros/graus; ler sempre `ModelTiepointTag` e `ModelPixelScaleTag` via `tifffile` (nota: `rasterio` não é assumido como instalado).
* **Acoplamento de horizonte:** Como os blocos `PGDA 78` medem `16–29,8 km`, simulações de iluminação devem usar o recorte `5 m` no entorno imediato do sítio/rota e estender o horizonte distante (`> 8 km` até `200 km`) com grade regional (`20 m` / `60 m` / `120 m`).

### 4.3 Documentação, LaTeX/DOCX e Controle de Versão
* **Sem Git automático:** Nunca executar `git add`, `git commit` ou `git push` sem solicitação explícita do usuário.
* **Arquivos grandes:** Manter `.IMG`, `.tif` e kernels binários exclusivamente em `dados/`.
* **Compilação de `.docx` via `pandoc` + `python-docx`:**
  * Usar sempre `$formula$` sem espaços internos para matemática inline e `$$...$$` isolado por linhas em branco para blocos, validando **`0` cifrões `$` soltos** fora de `<m:oMath>` após compilar.
  * Toda tabela de dados extensa (como o Apêndice A de `130` sítios) deve ficar em seção Paisagem dedicada com `w:tblHeader` e `w:cantSplit`.
  * Não duplicar ou alterar `Tese_Notas_Arquitetura_Dados.md` contradizendo a Seção 6/7.
* **Integridade científica:** Citar apenas números, colunas, caminhos e saídas de scripts efetivamente medidos ou lidos em arquivo/execução — nunca extrapolar métricas não simuladas.
