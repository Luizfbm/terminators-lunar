# Notas Obrigatórias para a Tese: Separação de Fontes, *Ceteris Paribus* via Kernels e Escala de DEMs

> **Lembrete para Redação da Dissertação/Tese:** Incluir obrigatoriamente os pontos 1, 2 e 3 abaixo nos **Capítulos 3 (Metodologia)** e **4 (Materiais e Dados)** para blindar o trabalho contra críticas de mistura de métricas.

---

## 1. O Papel de Cada Fonte (Astronomia vs. Topografia vs. Iluminação)

A iluminação média solar ($L$) **não** está armazenada dentro dos arquivos de relevo (`LDEM`). Ela resulta do cruzamento computacional entre dois conjuntos independentes:

1. **DEM / LDEM (Topografia):** Fornece apenas a altitude em metros ($z$) de montanhas e bordas de crateras ao redor do ponto de pouso, definindo o perfil angular do horizonte local em $360^\circ$.
   * *Arquivo local:* `dados/dem/LDEM_875S_20M.IMG` ($20\text{ m/px}$, cobertura de $87,5^\circ\text{S}$ a $90^\circ\text{S}$, abarcando **42 dos 130 sítios** da Artemis III).
2. **Kernels SPICE (`dados/kernels/`):** Padrão-ouro oficial da NASA/NAIF para efemérides planetárias (`de440s.bsp`), constantes de raios (`pck00011.tpc`), tempo (`naif0012.tls`) e rotação/libração real da Lua no referencial `MOON_ME` (`moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `moon_assoc_me.tf`). Fornecem a elevação e o azimute reais do Sol e da Terra hora a hora.
3. **Iluminação Média ($L$):** Calculada comparando, instante a instante, se o disco solar (dos Kernels) está acima ou abaixo da silhueta do horizonte (do LDEM), corrigida pela curvatura lunar ($-d^2 / 2R_{\text{Lua}}$).

---

## 2. Por que Usar os Kernels Garante *Ceteris Paribus* Absoluto

Comparar números copiados de artigos distintos (*Mazarico 2011*, *Gläser 2018*, *Barker 2021*, *Wueller 2026*) contamina o experimento porque cada estudo variou efemérides (`DE421` vs. `DE441`), período (2 anos vs. 20 anos), altura do sensor ($0\text{ m}$, $1\text{ m}$ ou $2\text{ m}$) e métrica (% média anual vs. dias contínuos de verão).

Ao fixar os **mesmos Kernels SPICE (`de440` + `MOON_ME`)**, o mesmo período, a mesma altura ($h = 2\text{ m}$) e a mesma definição de disco solar, **todas as condições astronômicas e métricas ficam travadas**. Qualquer variação observada em $L(A)$ deve-se **exclusivamente** à mudança da resolução espacial da grade topográfica.

---

## 3. Como o `LDEM_875S_20M.IMG` Gera `60 m`, `120 m` e `240 m` — e o Papel de `PGDA 69`, `PGDA 78` e `LDEM_875S_5M`

* **Geração de Resoluções Maiores (Downsampling Físico Oficial — Barker 2023):**  
  A partir da grade nativa de **$20\text{ m/px}$** ($400\text{ m}^2$), as grades mais grossas são geradas por **média aritmética de blocos quadrados** (simulando exatamente o efeito de "alisamento" de um sensor ou grade de menor resolução):
  * **$20\text{ m/px}$ ($400\text{ m}^2$):** Pixel original $1 \times 1$;
  * **$60\text{ m/px}$ ($3.600\text{ m}^2$):** Média de blocos $3 \times 3$ pixels;
  * **$120\text{ m/px}$ ($14.400\text{ m}^2$):** Média de blocos $6 \times 6$ pixels;
  * **$240\text{ m/px}$ ($57.600\text{ m}^2$):** Média de blocos $12 \times 12$ pixels.

* **Inventário e Cobertura dos Produtos Públicos da NASA (O que cada um faz/tem):**
  1. **`LDEM_875S_20M.IMG` (Local — 110 MB):** Topografia nativa a **$20\text{ m/px}$** cobrindo **$87,5^\circ\text{S}$ a $90^\circ\text{S}$**, o que abarca **42 dos 130 sítios** da Artemis III (`CR`, `CRE`, `FRA`, `PNS`, `dGR1`, `dGR2`). **Não cobre todos os 130 sítios:** regiões mais ao norte (como Malapert, Nobile e Mons Mouton) ficam fora desse arquivo e exigem DEMs mais amplos (ex.: $82,5^\circ\text{S}\text{–}90^\circ\text{S}$ ou $80^\circ\text{S}\text{–}90^\circ\text{S}$).
  2. **`LDEM_875S_5M.IMG` (MIT/PDS LOLA GDR — ~1,76 GB):** Apenas topografia (altitudes em metros) a **$5\text{ m/px}$** de $87,5^\circ\text{S}$ a $90^\circ\text{S}$. Não traz iluminação calculada.
  3. **`PGDA 78` (Barker et al., 2021 — NASA GSFC):** Contém o relevo a **$5\text{ m/px}$** corrigido contra erros orbitais (10–20 cm horizontal), nuvem de pontos e mapas de incerteza/clones, restrito a apenas **4 áreas de $16 \times 16\text{ km}$** (`Site 1` Connecting Ridge, `Site 4` Shackleton, `Site 7` Peak Near Shackleton, `Site 11` de Gerlache). Serve como referência de calibração em 5 m.
  4. **`PGDA 69` (Mazarico et al., 2011 — NASA GSFC):** Contém **mapas prontos de Iluminação Média e Visibilidade da Terra** (ciclo de 18,6 anos, passo de 1 h), calculados pela NASA em **$240\text{ m}$**, **$120\text{ m}$** e **$60\text{ m/px}$** (cobrindo de $82,5^\circ\text{S}$ a $90^\circ\text{S}$, alcançando sítios mais ao norte fora do recorte de $87,5^\circ\text{S}$). Não possui $20\text{ m}$ nem $5\text{ m}$.

---

## 4. Downsampling de Barker (2023) vs. Ineditismo da Tese (Calibração vs. Inferência Reversa)

Uma dúvida metodológica central para a banca: *se Barker et al. (2023) já geram $60/120/240\text{ m}$ por média de blocos a partir de $20\text{ m}$, o Método Multirresolução perde o ineditismo?*

**Não — porque operam em sentidos e objetivos opostos, onde o downsampling é apenas a bancada de calibração:**

1. **O que Barker et al. (2023) fizeram (Física Direta com Grades Aninhadas):**
   Usaram o *downsampling* ($20\text{ m} \to 40, 60, 80, 120, 240, 480\text{ m}$) para construir **grades aninhadas** num traçado de horizonte tradicional: manter $20\text{ m}$ no centro (até $7\text{ km}$) e usar pixels grossos para o horizonte distante (até $310\text{ km}$) para calcular PSRs. Eles **não** formularam uma lei analítica de perda de iluminação por escala nem extrapolaram estatisticamente sítios de $60\text{ m}$ para $5\text{ m}$.
2. **Os dois vetores da presente Tese (Por que não é o inverso contraditório):**
   * **Passo 1 — Calibração controlada (*Fino $\to$ Grosso*):** Onde temos alta resolução (`5 m` no `PGDA 78` e `20 m` nos 42 sítios do `LDEM_875S_20M`), aplicamos o *downsampling* oficial (média de blocos + mesmos Kernels SPICE) para **medir empiricamente a lei de perda** de iluminação ($\Delta L / \Delta \ln A$) e o achatamento da inclinação ($S$) quando o pixel cresce de $5\text{ m} \to 20\text{ m} \to 60\text{ m} \to 120\text{ m} \to 240\text{ m}$.
   * **Passo 2 — Inferência Reversa / Surrogate (*Grosso $\to$ Fino*):** Como os catálogos completos da Artemis III (ex.: *Wueller et al., 2026*, 130 sítios) só existem em **$60\text{ m/px}$** e simulações a $5\text{ m}$ exigem HPC proibitivo, **invertemos o uso da curva calibrada** para estimar, em $O(1)$, a penalidade conservadora de iluminação e o risco de inclinação a **$20\text{ m}$ e $5\text{ m}$** para sítios sem mapa de alta resolução.
3. **Blindagem de honestidade científica (o que NÃO reivindicar como inédito):**
   * *Não é inédito:* apenas fazer *downsampling* de $20\text{ m}$ para $60/120/240\text{ m}$ (*Barker 2023*) ou constatar qualitativamente que grades mais finas geram menos iluminação média (*Smith 2016*, *Gläser 2018*).
   * *É contribuição original:* **(a)** isolar e parametrizar essa perda sob *ceteris paribus* via Kernels SPICE; **(b)** usar os dois sentidos de forma complementar (calibrar `Fino -> Grosso` para então **inverter** a curva no sentido `Grosso -> Fino`, `60 m -> 5 m`) como um *Conservative Surrogate Prior* sobre catálogos completos da Artemis III (sem exigir HPC por sítio); e **(c)** acoplar o erro angular de Barker ($\Delta \theta = \arctan(\varepsilon/d)$) ao Monte Carlo na elipse de $100\text{ m}$ e ao ranqueamento TOPSIS em custo $O(1)$ compatível com tempo real / bordo.

---

## 5. Alternativa Prática ao *Ray-Tracing* Completo a 5 m (Missão, Triagem e Rover)

> **Posicionamento correto perante a banca:** O Método Multirresolução é uma **alternativa computacional leve (`O(1)`) ao *ray-tracing* completo a $5\text{ m}$** onde o *ray-tracing* é operacionalmente inviável — funcionando como filtro conservador antes da validação final em HPC/imagens de alta resolução, e não como substituto exato pixel-a-pixel na certificação final do ponto exato de pouso.

* **Limitação estrutural do *ray-tracing* a $5\text{ m}$:** Exige $\sim 1.728\times$ mais operações por área do que $60\text{ m}$ (barrando varredura ampla dos 130 sítios com clones de incerteza e impossibilitando execução em hardware espacial limitado, como processadores classe `RAD750` de $133\text{–}200\text{ MHz}$).
* **Ganho para o planejamento da missão:** Permite filtrar falsos positivos de $60\text{ m}$ em todo o catálogo (estimando perda de Sol por sombras sub-resolução e risco de inclinação na elipse de $100\text{ m}$) em milissegundos, direcionando o supercomputador apenas aos finalistas reais.
* **Ganho para o rover em superfície:** Sob Sol rasante ($\pm 1,54^\circ$) e frente de sombra avançando continuamente ($\sim 1\text{ cm/s}$), entrega a bordo um cálculo instantâneo de risco em rampa, margem de sombra local e acoplamento de bateria para cenários de atraso (*"e se?"*) e replanejamento de rota sem depender de horas de reprocessamento na Terra.


---

## 6. Limitações Históricas dos Sensores (LOLA, GRAIL, LROC NAC SfS e ShadowCam) e Restrição Crítica de Iluminação

Registro permanente de contorno físico e de dados para toda a tese e para o pipeline multirresolução:

1. **LOLA (*Lunar Orbiter Laser Altimeter*, sonda `LRO`):**
   * Operou com coleta densa de perfis altimétricos a laser sobre o Polo Sul entre **julho de 2009 e setembro de 2013**, quando mudanças orbitais encerraram a aquisição sistemática densa na calota polar sul.
   * **O problema da grade `5 × 5 m` (`LDEM_875S_5M`):** Embora o produto polar `LDEM_875S_5M` possua pixels de $5 \times 5\text{ m}$ entre $87{,}5^\circ\text{S}$ e $90^\circ\text{S}$, apenas **$7{,}29\%$** das células contêm ao menos um disparo real de laser (`LDEC_875S_5M > 0`); os **$92{,}71\%$** restantes são preenchidos por **interpolação matemática**. Nas escalas agregadas sobre a mesma calota, a fração de células com medição real cresce para **$25{,}90\%$ (`10 m`)**, **$67{,}97\%$ (`20 m`)**, **$95{,}93\%$ (`40 m`)** e **$99{,}40\%$ (`60 m`)**.
2. **Missão GRAIL e Geração do `PGDA 78` (`5 m`) e `PGDA 90` (`20 m`):**
   * O campo de gravidade medido pela missão **GRAIL** (2011–2012) permitiu corrigir erros orbitais sistemáticos dos traços LOLA coletados entre 2009 e 2013, re-alinhando as trilhas antigas com alta precisão geodésica (*Barker et al., 2021, 2023*).
   * Esse ajuste originou os **27 recortes de `5 m` do `PGDA 78`** (cobrindo **`104` dos `130` sítios candidatos, ou `80,0%`**) e o DEM base contínuo de **`20 m` do `PGDA 90`** ($80^\circ\text{S}\text{–}90^\circ\text{S}$). Mesmo após o `PGDA 78`, **`26` sítios (`20,0%`)** — todos em três das nove regiões atuais da NASA (`PCB`, `SP` e `MMP`) — ainda não dispõem de recorte `5 m`.
3. **Câmera `LROC NAC` + *Shape-from-Shading* (`SfS`):**
   * A técnica `SfS` (fotoclinometria) combina imagens ópticas métricas da `LROC NAC` ($\sim 0{,}5\text{–}2\text{ m/px}$) ao controle geodésico do LOLA para reconstruir micro-relevo local de **`5 m/px`** e novos produtos localizados de **`1–2 m/px`**.
   * **Limitação física fundamental:** O `SfS` **não funciona no escuro** — não é possível inferir topografia dentro de sombras profundas ou regiões permanentemente sombreadas (`PSR`), além de sofrer ambiguidade albedo/inclinação sob luz rasante.
4. **REGRA PERMANENTE DA TESE — Ausência de Mapa Polar Completo de Iluminação a `5 m` ou `1 m`:**
   * **NÃO existe DEM de iluminação solar a `5 m/px` nem a `1 m/px` cobrindo o Polo Sul lunar inteiro.** Os mapas contínuos de visibilidade solar (`PGDA 69`) estão disponíveis apenas a `60 m`, `120 m` e `240 m`, e o catálogo mais recente de 130 sítios (*Wueller et al., 2026*) foi simulado a **`60 m/px`**.
   * **Estratégia da tese:** Em vez de tentar um *ray-tracing* `5 m` impraticável em todo o polo, usamos os recortes reais de **`5 m`** (`LDEM_875S_5M` e `PGDA 78`) para **calibrar empiricamente o efeito da resolução** (erosão de luz e crescimento da dispersão de inclinação $\sigma_S$) e **corrigir estatisticamente os sítios e rotas de travessia que só existem em `60 m`, `20 m` ou `10 m`**, quantificando o ganho operacional da correção.
5. **Câmera `ShadowCam` (sonda `KPLO/Danuri`, lançada em ago/2022):**
   * Opera com sensibilidade óptica **`> 200×`** superior à da `LROC NAC` (sensor *TDI CCD*), gerando imagens de **`~1,7–2 m/px`** (~5 km de faixa) no interior das crateras em sombra permanente usando apenas **luz solar espalhada secundariamente** pelas paredes iluminadas adjacentes.
   * **O que acrescenta (e o que NÃO é):** A `ShadowCam` **não** é um mapa de radiação/iluminação solar direta nem alimenta diretamente o balanço fotovoltaico no Sol; ela atua como **camada óptica complementar de segurança geológica e tráfego no escuro**, revelando matacões métricos, microcrateras, riscos de tombamento em bordas de `PSR`, acessibilidade de rovers/`EVA` e variações de refletância associadas a voláteis/geada.


---

## 7. Registro de Atualizações Aplicadas (13/11/2026)

1. **[Aplicado em 13/11/2026] Mosaico Multiescala `0% → 100%`:** Incluído [fig_mosaico_multiescala_ldec.png](file:///c:/NASA%20PROJETO%202026/docs/figuras_tese/fig_mosaico_multiescala_ldec.png) em [Tese_Apresentacao_Dados_e_Variaveis_atualizada.docx](file:///c:/NASA%20PROJETO%202026/docs/Tese_Apresentacao_Dados_e_Variaveis_atualizada.docx) *(o original `Tese_Apresentacao_Dados_e_Variaveis.docx` estava aberto/bloqueado no Word)* e em [Tese_Versao_Simplificada.docx](file:///c:/NASA%20PROJETO%202026/docs/Tese_Versao_Simplificada.docx).
2. **[Aplicado em 13/11/2026] Nota Crítica de Contraste (`PGDA 78`):** Adicionada a distinção completa dos `104/130` sítios (`80,0%`) com DEM `5 m` (zero simulação solar pronta, blocos de `16 × 16 km` a `29,8 × 29,8 km`, mediana `7,6%` / mín. `0,08%` `LDEC`, exclusão dos `26` sítios de `PCB`, `SP`, `MMP`).
3. **[Aplicado em 13/11/2026] Versão Simplificada e Direta:** Criado o documento enxuto [Tese_Versao_Simplificada.docx](file:///c:/NASA%20PROJETO%202026/docs/Tese_Versao_Simplificada.docx) e incorporada a Seção 0 de leitura rápida no documento principal.
4. **[Aplicado em 13/11/2026] Extensão Operacional em 3 Camadas, Regra *No False Relief* e Limites Céticos Físicos/Sensoriais:** Incorporada como Seção 6 tanto em [Tese_Apresentacao_Dados_e_Variaveis.md](file:///c:/NASA%20PROJETO%202026/docs/Tese_Apresentacao_Dados_e_Variaveis.md) (`Tese_Apresentacao_Dados_e_Variaveis_atualizada.docx`) quanto em [Tese_Versao_Simplificada.md](file:///c:/NASA%20PROJETO%202026/docs/Tese_Versao_Simplificada.md) (`Tese_Versao_Simplificada.docx`), cobrindo Pré-Pouso `P90/P99` $\to$ Replanejamento de Turno/Dia (`LROC NAC SfS` + `ShadowCam` em `MOON_ME`) $\to$ Coleta do Rover (`LiDAR`/Estéreo, `IMU`, odometria visual + marcos contra *wheel slip*, potência fotovoltaica + sombra no mastro, `SNR` + alcance `20–50 m`) e limites físicos de alcance frente ao Sol de `1,54°`.
5. **[Pausado / Fora do Word em 13/11/2026] Arquitetura Híbrida Segura com ML:** Mantida em [Plano_ML_Hibrida_Segura_Tese.md](file:///c:/NASA%20PROJETO%202026/docs/Plano_ML_Hibrida_Segura_Tese.md) e no protótipo HTML por decisão explícita de não incluir ML nos documentos `.docx` da tese nesta etapa.
6. **[Aplicado em 13/11/2026] Cadeia Numérica Preliminar (`4.1 → 4.5`), Estatística Descritiva em Todas as Tabelas de Valores e Protocolo Inferencial Final (`Seção 4.6`):** Inserido extrato real de `6` sítios (`001`, `MMO01`, `NR106`, `HW04`, `SP06`, `PCB05`) + semente `4` resoluções (`001`, `004`, `007`, `011`) com cálculo passo a passo até `TOPSIS` (`#3 → #2` de `001` vs `NR106`), resumos descritivos ($N$, $\bar x \pm s$, mediana, $Q_1\text{–}Q_3/\text{IQR}$, mín.–máx.) em Tabela 1, tabelas piloto e Apêndice A (`N=130`/`104`), e plano inferencial para o fechamento (*Wilcoxon pareado*, *McNemar*, *Spearman/Kendall*, *Mann-Whitney/KS*, *Kruskal-Wallis*).
