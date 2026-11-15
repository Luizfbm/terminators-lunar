# Monte Carlo da tese com dados reais do LOLA — registro completo

**Projeto:** NASA Space Apps 2026 — *Lunar Landing Site Navigator* (simulação de rovers no polo sul lunar).
**Pasta:** `C:\NASA PROJETO 2026\simulacao_rover\monte_carlo_lola\`
**Período:** 14/11/2026.
**Uso:** base para a escrita da tese. Reúne a pergunta, os dados, o método, os passos para reproduzir, os resultados, a interpretação, o que é e o que não é novo, os limites e o que ainda está em andamento.

---

## 1. A pergunta

A tese propõe um escudo de segurança para o rover. O rover parte de um mapa grosso (60 m ou 20 m por célula) e corrige o relevo localmente com os disparos reais do laser LOLA, a 5 m. Depois veta qualquer célula cujo declive estimado, somado a uma margem de segurança, passe do limite do rover (15°). A margem é menor onde há disparo perto e maior onde o mapa foi interpolado.

Perguntas testadas:

1. Quanto perigo real (declive > 15°) um mapa grosso esconde nos sítios candidatos do polo sul?
2. Quanto desse perigo a tese recupera?
3. Quanto do ganho vem só de ser mais cauteloso (a margem) e quanto vem de saber onde o mapa foi medido (a multirresolução)?
4. Partir de 20 m em vez de 60 m muda a conclusão?
5. Onde a tese ainda falha, e por quê?

---

## 2. Por que este Monte Carlo, e não o GMAT

O GMAT (NASA) foi considerado e descartado: ele simula órbitas e manobras de espaçonave, não terreno nem rover. A incerteza que importa para a tese está no relevo, e a NASA publica essa incerteza célula a célula no produto PGDA #78. Por isso o Monte Carlo foi escrito em Python sobre os dados oficiais, rodando no computador da equipe, com registro (log), figuras e relatório HTML para documentar cada passo com capturas de tela.

Antes deste trabalho, havia um Monte Carlo sintético das margens dentro do simulador (`testes/teste_mc_quantis.js`). Ele mostrou que os rótulos P50/P90/P99 do simulador não correspondiam aos quantis reais do erro. Esse resultado motivou a calibração com dados reais descrita aqui.

---

## 3. Dados

**Fonte:** NASA GSFC Planetary Geodynamics Data Archive, produto #78, Barker et al. (2021), *Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions*, Planetary and Space Science 203, 105119. doi:10.1016/j.pss.2020.105119.

**Pasta local:** `dados\acervo_tese\02_PGDA_78_5M\<sítio>\`

| Camada | Arquivo | O que é |
|---|---|---|
| `surf` | `<sítio>_final_adj_5mpp_surf.tif` | altura da superfície, 5 m/pixel |
| `ldec` | `..._ldec.tif` | número de disparos LOLA em cada célula (0 = interpolada) |
| `slp` | `..._slp.tif` | declive oficial (graus) |
| `slperr` | `..._slperr.tif` | erro do declive, célula a célula (graus) |
| `toterr` | `..._toterr.tif` | erro total de altura (não usado) |

GeoTIFF float32 sem compressão, projeção estereográfica polar sul.

**Conferências feitas:**

- O declive oficial (`slp`) é igual ao gradiente central da superfície (`surf`); a diferença média é de cerca de 0,001°. Assim, o declive calculado pela tese é comparável ao oficial.
- Só uma pequena parte das células tem disparo real (LDEC > 0): cerca de 3,5% em NPC, 14% em Haworth, ~7% em média. O resto do mapa de 5 m da NASA é interpolado.
- **Site20 e Site20v2:** o recorte central dos dois é a mesma área e dá resultados idênticos. O Site20 foi excluído. A análise final usa **26 sítios independentes**.

**Sítios (26):** DM1, DM2, Haworth, LM1–LM8, NPA, NPB, NPC, NPD, SL2, SL3, Shoemaker, Site01, Site04, Site06, Site07, Site11, Site20v2, Site23, Site42.

---

## 4. Método

### 4.1 Recorte
Em cada sítio, um quadrado central de 2000 × 2000 células (10 × 10 km), com lado múltiplo do bloco da grade grossa.

### 4.2 Grade grossa (o que um rover sem a tese teria)
Média da superfície em blocos (12 × 12 células para 60 m; 4 × 4 para 20 m), interpolada de volta para 5 m de forma bilinear. O declive é calculado do mesmo jeito que o oficial.

### 4.3 Tese (grade grossa + disparos)
1. Resíduo = altura real − altura da grade, observado **só** nas células com disparo.
2. O resíduo é espalhado por convolução normalizada gaussiana (σ = metade do espaçamento médio entre disparos).
3. O resíduo espalhado é multiplicado por um peso de confiança, densidade / (densidade + 0,02). Longe de dado, ele tende a zero: a tese não inventa relevo onde não há medida ("No False Relief").
4. Onde há disparo, vale o dado.

### 4.4 Margem de segurança (escudo)
- **Nominal (a do simulador):** margem = 1 + z·σ, com σ = 0,8° perto de dado (densidade acima da mediana) e 2,0° longe. z = 0 (P50), 1,282 (P90), 2,326 (P99). Em P90: 2,03° perto e 3,56° longe.
- **Calibrada:** quantis reais do erro da tese, separados em perto e longe de dado, medidos em 20 sorteios de calibração **independentes** dos sorteios de avaliação.
- **Regra de veto:** a célula é vetada se declive estimado + margem > 15°.

### 4.5 Validação cruzada (de onde vem a verdade)
Só as células com disparo têm verdade medida. Elas são divididas em 5 dobras. Em cada dobra, os disparos daquela dobra são escondidos da tese, a tese é recalculada, e o declive estimado é comparado com o declive oficial nessas células. Assim a tese nunca vê a resposta que está sendo conferida.

### 4.6 Monte Carlo
Em cada um dos **100 sorteios** por sítio, o declive verdadeiro de cada célula conferida é sorteado como Normal(slp, slperr), usando o erro oficial da NASA. Para cada método, conta-se:

- **Perigo não vetado:** % das células perigosas (> 15°) que o método deixou passar. É a métrica de segurança.
- **Falso alarme:** % das células seguras que o método vetou. É o custo em terreno perdido.
- **Cobertura da margem** e **|erro| médio do declive**.

### 4.7 Controle justo (separar margem de multirresolução)
Uma tese com margem sempre vai vetar mais que uma grade sem margem. Para não comparar "cauteloso × descuidado", dois controles foram acrescentados:

- **Grade + margem P90 calibrada:** margem uniforme igual ao quantil 90% do erro da grade.
- **Grade + margem com o mesmo falso alarme da tese P90:** a margem uniforme da grade é ajustada (por bisseção, nos sorteios de calibração) até a grade vetar a mesma fração de terreno seguro que a tese P90. A diferença máxima de falso alarme obtida foi de 0,02 ponto. **Esta é a comparação justa principal.**

### 4.8 Estatística
- **Dentro de cada sítio:** McNemar exato (perigos oficiais detectados só pela grade × só pela tese), Wilcoxon do |erro| (amostra de 20.000 células), Spearman entre densidade de dado e erro.
- **Entre sítios (cada sítio é uma unidade, N = 26):** Wilcoxon pareado, correlação de rank-biserial, mediana e intervalo interquartil.

---

## 5. Como reproduzir (passo a passo)

### 5.1 Requisitos
Python 3 com `numpy`, `scipy`, `matplotlib`, `tifffile` (ou `Pillow`). No Windows, rodar no PowerShell, de dentro da pasta `monte_carlo_lola`, sempre com `python` na frente (ex.: `python rodar_todos.py`). Rodar só `rodar_todos.py`, sem `python`, não funciona.

### 5.2 Arquivos

| Arquivo | Função |
|---|---|
| `mc_lola.py` | Monte Carlo de um sítio. Argumentos: `--sitio`, `--grossa 60\|20`, `--recorte 2000`, `--dobras 5`, `--sorteios 100`, `--limite 15`, `--semente 2026` |
| `rodar_todos.py` | Roda o `mc_lola.py` em todos os sítios e monta a tabela entre sítios. Ignora o Site20 quando o Site20v2 existe |
| `graficos_sitios.py` | Gráficos e tabela entre sítios; com as duas rodadas feitas, também o comparativo 60 m × 20 m |
| `diagnostico\diagnostico_falhas.py` | Onde e por que a tese falha (NPC e Haworth) |
| `diagnostico\figura_falhas.py` | Figura `onde_a_tese_falha.png` |
| `diagnostico\comparar_sfs.py` | Comparação com o mapa SfS independente (seção 9) |

### 5.3 Comandos (cerca de 5 minutos cada lote)

```
python rodar_todos.py
python rodar_todos.py --grossa 20
python graficos_sitios.py --grossa 20
python graficos_sitios.py
```

### 5.4 Saídas
- `resultados\<sítio>\` (60 m) e `resultados_20m\<sítio>\` (20 m): `relatorio.html`, `fig1_mapas.png` a `fig4_calibracao.png`, `metricas_por_sorteio.csv`, `resumo.json`, `log.txt`.
- Em `resultados\` e `resultados_20m\`:
  - `resumo_sitios.csv` e `RESUMO_SITIOS.html` (tabela entre sítios);
  - `g1_perigo_por_sitio.png`: perigo não vetado, grade × tese, sítio a sítio;
  - `g2_troca_perigo_alarme.png`: troca entre perigo não vetado e falso alarme;
  - `g3_erro_declive.png`: erro mediano do declive por sítio;
  - `g4_60m_x_20m.png`: os quatro métodos, 60 m e 20 m;
  - `g5_controle_mesmo_alarme.png`: grade com margem × tese, com o mesmo falso alarme;
  - `tabela_sitios.png` e `GRAFICOS_SITIOS.html` (tudo junto, com a estatística).

### 5.5 Capturas de tela sugeridas para a tese
1. Terminal com o `log.txt` de um sítio: os passos [1/7] a [7/7] e o resumo final.
2. `fig1_mapas.png` de um sítio acidentado (Haworth): declive oficial, grade e tese lado a lado.
3. `g5_controle_mesmo_alarme.png` (60 m): a figura central do argumento.
4. `g4_60m_x_20m.png`: efeito da resolução de partida.
5. `diagnostico\onde_a_tese_falha.png`: onde a tese erra.

### 5.6 Problemas encontrados e correções
- **Calibração contra a verdade sem ruído.** A primeira versão calibrava a margem contra o declive oficial e avaliava contra declives sorteados com ruído. Corrigido: a calibração usa sorteios independentes.
- **p-valor zero.** Valores menores que o limite numérico agora aparecem como "p < 10⁻³⁰⁰".
- **Site20 duplicado.** Excluído; N passou de 27 para 26.
- **`--grossa` não reconhecido no PC.** Os scripts novos não tinham chegado à pasta; regravados.

---

## 6. Resultados (26 sítios, 100 sorteios cada)

### 6.1 Grade grossa × tese (partindo de 60 m)

| Medida (mediana entre sítios) | Grade 60 m | Tese P90 60→5 m |
|---|---|---|
| Perigo real não vetado | 28,7% | **3,9%** |
| Falso alarme | 4,7% | 17,9% |
| Erro mediano do declive | 1,08° | 0,61° |

- A tese deixa passar menos perigo em **26 de 26 sítios** (Wilcoxon pareado p = 3·10⁻⁸).
- O erro do declive também é menor com a tese (Wilcoxon entre sítios p ≈ 1,5·10⁻⁸ na rodada com N = 27).
- **O preço:** o falso alarme sobe de cerca de 5% para cerca de 18% do terreno seguro.

### 6.2 Controle justo: com o mesmo falso alarme (resultado principal)

| Partida | Grade + margem (mesmo alarme da tese) | Tese P90 | Tese melhor em | Wilcoxon | Redução relativa (mediana [IQR]) |
|---|---|---|---|---|---|
| 60 m | 6,45% | **3,88%** | 26 / 26 | p = 3·10⁻⁸ | **38,5%** [32–44%], faixa 18–56% |
| 20 m | 3,57% | **3,19%** | 24 / 26 | p = 7,5·10⁻⁷ | 12% [7–16%] |

**Leitura:**

1. **A maior parte do ganho vem da margem.** Só pôr margem na grade de 60 m já leva o perigo não vetado de 28,7% para 6,5%.
2. **A multirresolução acrescenta um ganho real e consistente.** Com exatamente o mesmo falso alarme, a tese partindo de 60 m deixa passar 38% menos perigo que a grade com margem, em todos os 26 sítios.
3. **O ganho da multirresolução cresce com a aspereza do sítio.** A correlação de Spearman entre o ganho e o perigo escondido pela grade é ρ = 0,91 (p ≈ 8·10⁻¹¹). Nos sítios mais acidentados (Haworth, NPC, NPA, NPD, Shoemaker) a diferença em pontos é a maior.
4. **O ganho diminui quando o mapa de partida já é fino.** Partindo de 20 m, a vantagem cai para 12%, e a tese perde em 2 sítios. Faz sentido: com um mapa grosso melhor, há menos a corrigir.

### 6.3 Partir de 60 m ou de 20 m

| Medida (mediana) | Grade 60 m | Grade 20 m | Tese 60→5 m | Tese 20→5 m |
|---|---|---|---|---|
| Perigo não vetado, sem margem na grade | 28,7% | 23,6% | 3,9% | 3,2% |
| Erro mediano do declive | 1,08° | 0,55° | 0,61° | 0,47° |

- Afinar a grade de 60 m para 20 m, sem margem, ajuda pouco (28,7% → 23,6%).
- A tese partindo de 20 m é melhor que partindo de 60 m em todos os sítios (Wilcoxon p = 3·10⁻⁸).
- **Correção importante de uma afirmação anterior:** com o mesmo falso alarme, a grade de 20 m com margem (3,57%) é um pouco **melhor** que a tese partindo de 60 m (3,88%). A tese só vence em 3 de 26 sítios (p = 1,7·10⁻⁴). Portanto **não** se pode dizer que "a tese a partir de 60 m equivale a um mapa 3× mais fino". O que vale: a tese a partir de 60 m supera com folga a grade de 20 m **sem margem** (26/26), e chega perto da grade de 20 m **com margem**.
- Também em erro médio do declive a grade de 20 m (0,55°) é um pouco melhor que a tese partindo de 60 m (0,61°). A vantagem da tese não está no mapa médio; está em saber onde o mapa é incerto e pôr margem ali.

### 6.4 Margem nominal × calibrada (60 m)

| | Perigo não vetado | Falso alarme |
|---|---|---|
| Tese P90 nominal (simulador) | 3,88% | 17,9% |
| Tese P90 calibrada | 3,44% | 19,2% |
| Grade + margem P90 calibrada | 4,71% | 22,5% |

- A calibrada reduz um pouco o perigo não vetado, à custa de mais falso alarme. É melhor que a nominal em 22 de 26 sítios (p = 1,6·10⁻⁵).
- Em Haworth, as margens P90 calibradas ficaram em +2,82° (perto de dado) e +2,88° (longe), contra 2,03° e 3,56° do simulador. O erro real perto de dado é maior do que o simulador supunha, e longe de dado é menor.
- A grade com margem P90 calibrada veta muito mais terreno (22,5%). Comparada só pelo perigo, a tese ganha em 16 de 26 sítios (p = 0,036), mas essa comparação não tem o mesmo falso alarme. Por isso o controle principal é o da seção 6.2.

### 6.5 Tabela por sítio (perigo real não vetado; ordenada pela grade de 60 m)

| Sítio | Células conferidas | Grade 60 m | Grade 60 m + margem (mesmo alarme) | Tese P90 60→5 m | Grade 20 m + margem (mesmo alarme) | Tese P90 20→5 m | Falso alarme tese 60 m |
|---|---|---|---|---|---|---|---|
| Site04 | 323.555 | 5,5% | 1,2% | **0,5%** | 0,5% | 0,4% | 42,8% |
| Site23 | 386.732 | 10,8% | 3,6% | **1,9%** | 2,2% | 1,6% | 34,0% |
| LM5 | 250.514 | 12,1% | 3,5% | **2,1%** | 2,0% | 1,6% | 7,0% |
| DM1 | 91.471 | 12,9% | 3,4% | **2,7%** | 2,1% | 2,1% | 18,0% |
| Site42 | 165.561 | 13,8% | 2,9% | **2,0%** | 1,7% | 1,6% | 31,0% |
| Site06 | 236.373 | 13,9% | 4,0% | **2,7%** | 2,8% | 2,5% | 27,1% |
| LM2 | 286.941 | 16,5% | 3,8% | **2,4%** | 2,2% | 1,9% | 14,9% |
| Site11 | 301.872 | 16,8% | 3,9% | **2,1%** | 2,0% | 1,7% | 35,2% |
| SL3 | 221.032 | 18,3% | 4,6% | **2,8%** | 2,2% | 2,0% | 24,4% |
| LM4 | 321.878 | 19,3% | 4,8% | **2,9%** | 2,8% | 2,4% | 15,2% |
| LM8 | 362.806 | 20,1% | 6,2% | **3,9%** | 3,8% | 3,2% | 11,0% |
| DM2 | 105.541 | 22,3% | 4,7% | **3,9%** | 2,8% | 2,9% | 12,9% |
| Site01 | 410.045 | 27,7% | 8,3% | **4,6%** | 4,4% | 3,5% | 19,6% |
| Site20v2 | 281.163 | 29,6% | 10,2% | **7,3%** | 7,1% | 6,3% | 20,4% |
| SL2 | 276.310 | 32,2% | 6,3% | **3,9%** | 3,5% | 3,2% | 31,1% |
| LM1 | 400.267 | 33,3% | 7,0% | **3,8%** | 3,6% | 3,0% | 28,4% |
| LM3 | 306.561 | 36,2% | 9,6% | **6,0%** | 5,8% | 4,9% | 17,8% |
| Site07 | 302.964 | 36,5% | 9,0% | **5,0%** | 4,7% | 4,1% | 22,1% |
| LM6 | 202.568 | 37,0% | 6,6% | **4,4%** | 3,6% | 3,5% | 23,7% |
| NPB | 73.919 | 37,9% | 16,6% | **13,6%** | 9,8% | 9,6% | 2,3% |
| LM7 | 173.679 | 51,4% | 12,3% | **8,4%** | 6,4% | 6,3% | 17,0% |
| NPD | 206.289 | 54,5% | 21,4% | **13,2%** | 10,2% | 9,0% | 2,1% |
| Shoemaker | 335.016 | 54,7% | 20,4% | **12,5%** | 11,9% | 9,7% | 5,9% |
| NPA | 231.352 | 57,5% | 25,5% | **14,5%** | 10,0% | 8,8% | 2,8% |
| NPC | 135.984 | 69,7% | 35,2% | **23,1%** | 18,4% | 16,4% | 0,6% |
| Haworth | 537.779 | 78,0% | 28,4% | **15,7%** | 17,0% | 12,5% | 9,5% |

Grade 20 m e tese 20→5 m vêm da rodada `--grossa 20`. Falso alarme da grade com margem = falso alarme da tese, por construção.

### 6.6 Qual resolução de partida é a realista no polo sul

**Mapas oficiais do LOLA (Barker et al., PGDA #90 e produtos GDR):** 60 m/pixel de 60°S até o polo; 30 m de 75°S; **20 m de 80°S até o polo**, com camadas de resolução efetiva, erro de altura, declive e erro do declive; 5 m de 87,5°S até o polo e nos sítios do PGDA #78. Todos os 26 sítios ficam ao sul de 80°S. Portanto, **no polo sul, o mapa de partida realista de um rover é o de 20 m**, não o de 60 m.

**Pixel não é resolução.** No mapa de 20 m, o valor é interpolado nos buracos entre as trilhas do laser. A camada de resolução efetiva (`LDEM_80S_20MPP_ADJ_EFFRES`) mostra quanto detalhe há de fato em cada lugar; onde faltam trilhas, ela pode ser bem pior que 20 m. Os valores dessa camada não foram conferidos neste trabalho.

**Partindo de 20 m, qual método fica mais perto do declive real de 5 m?** A verdade de 5 m aqui são as células com disparo LOLA, escondidas da tese pela validação cruzada.

| Medida (26 sítios) | Grade 20 m | Tese 20→5 m |
|---|---|---|
| Erro mediano do declive (mediana entre sítios) | 0,55° | **0,47°** |
| Intervalo interquartil | 0,43–0,64° | 0,41–0,51° |
| Pior sítio | 0,94° | 0,70° |
| Sítios em que fica mais perto do real | 5 | **21** |

- A tese reduz o erro do declive em cerca de 14% (mediana por sítio), mais perto do real em 21 de 26 sítios (Wilcoxon p = 5·10⁻⁵).
- A tese também deixa o erro mais uniforme entre sítios: o pior caso cai de 0,94° para 0,70°.
- **Nos 5 sítios em que a grade de 20 m fica igual ou melhor** (DM1, DM2, LM7, NPB, NPC), o erro dos dois já é pequeno (0,26–0,41°), e a diferença é de no máximo 0,05°. Nesses sítios, o mapa de 20 m já está perto do limite que os disparos permitem corrigir.

**Na decisão do rover (com o mesmo falso alarme, cerca de 18%):** grade 20 m com margem 3,6% de perigo não vetado; tese 20→5 m **3,2%**; tese melhor em 24 de 26 sítios (p = 7,5·10⁻⁷); redução mediana de 12%.

**Como apresentar 60 m e 20 m:**
- **20 m é o caso realista do polo sul.** O ganho é modesto, mas consistente: a tese fica mais perto do declive de 5 m (14% menos erro) e deixa passar 12% menos perigo com o mesmo custo.
- **60 m é um cenário de estresse.** Ele mostra que o ganho cresce quanto pior é o mapa de partida (38% menos perigo não vetado). Isso se aplica a um rover com pouca memória que carrega um mapa grosso de uma área grande, a regiões fora do polo com mapas mais grossos, e a trechos em que a resolução efetiva do mapa de 20 m é muito pior que o pixel.
- **Frase sugerida:** "No polo sul, o mapa de partida realista é o de 20 m; ali a multirresolução reduz o erro do declive em 14% e o perigo não vetado em 12%, com o mesmo custo em terreno vetado. O ganho cresce para 38% quando o mapa de partida é de 60 m, o que indica onde a abordagem rende mais."

---

## 7. Onde a tese falha (diagnóstico de NPC e Haworth)

**Como foi feito:** validação cruzada sem sorteio (verdade = declive oficial), tese P90 nominal partindo de 60 m. Os números saem um pouco menores que os da tabela, que inclui o ruído do Monte Carlo. Figura: `diagnostico\onde_a_tese_falha.png`.

| | NPC | Haworth |
|---|---|---|
| Células com disparo no recorte | 3,5% | 13,9% |
| Perigos não vetados | 10,7% (72 de 671) | 5,3% (1.417 de 26.694) |
| Desses, quase no limite (15–17°) | 76% | 77% |
| Desses, realmente íngremes (> 20°) | 1,4% | 3,4% |
| Desses, na zona "perto de dado" (margem pequena) | 65% | 75% |
| Fatia de todos os perigos que fica nessa zona | 46% | 47% |
| Desses, onde a grade de 60 m já marca > 10° | 24% | 53% |

**Conclusões:**

1. **Quase todo erro é de raspão.** Três quartos do que passa está entre 15° e 17°. A tese quase nunca deixa passar uma parede de verdade.
2. **O erro se concentra onde a tese se acha mais segura.** As falhas ficam desproporcionalmente perto de dado, onde a margem é pequena. Na figura, aparecem nas bordas de crateras pequenas em NPC e nas paredes da cratera grande em Haworth.
3. **Causa provável:** a margem de 0,8° perto de dado é otimista em terreno inclinado. O erro do declive cresce também com a inclinação, não só com a distância ao dado. Isso está de acordo com Barker et al.: o erro de interpolação e de declive se correlaciona com o tamanho do buraco entre dados e com o próprio declive.

**Teste de ajuste (margem extra onde a grade marca > 10°):**

| Margem extra | NPC: perigo não vetado | NPC: falso alarme | Haworth: perigo não vetado | Haworth: falso alarme |
|---|---|---|---|---|
| nenhuma | 10,7% | 0,7% | 5,3% | 10,1% |
| +1° | 9,4% | 0,9% | 3,5% | 13,3% |
| +2° | 8,3% | 1,1% | 2,8% | 16,3% |

**Ajuste "Tese P90 + 1° em encosta" no Monte Carlo** (prévia com 2 sítios, perigo não vetado / falso alarme):

| Método | Site01 | Site20v2 |
|---|---|---|
| Tese P90 nominal | 4,6% / 19,6% | 7,3% / 20,4% |
| Tese P90 + 1° em encosta | 2,7% / 25,2% | 4,5% / 27,1% |
| Tese P90 calibrada | 3,4% / 20,8% | 3,7% / 28,1% |

**Resultado nos 26 sítios** (rodada de 60 m com o ajuste, 14/11/2026, 22:53; os demais números da rodada não mudaram):

| Mediana entre sítios | Perigo não vetado | Falso alarme |
|---|---|---|
| Tese P90 nominal | 3,9% | 17,9% |
| **Tese P90 + 1° em encosta** | **2,1%** | **23,0%** |
| Tese P90 calibrada | 3,4% | 19,2% |
| Grade 60 m + margem (mesmo alarme da tese nominal) | 6,5% | 17,9% |

- Contra a tese nominal, o ajuste reduz o perigo não vetado em **26 de 26 sítios** (p = 3·10⁻⁸), mas aumenta o falso alarme em cerca de 5 pontos.
- Contra a calibrada, deixa passar menos perigo em 21 de 26 sítios (p = 9·10⁻⁴), mas veta mais terreno seguro em 22 de 26 (p = 1·10⁻⁵). Em nenhum sítio ele é melhor nas duas coisas ao mesmo tempo. Na média dos sítios, é um ponto diferente da mesma troca entre perigo e alarme, não uma margem claramente mais inteligente.
- **Onde ele rende: nos sítios acidentados.** Ali o ajuste corta bastante perigo por pouco alarme, e supera a calibrada:

| Sítio | Nominal (perigo / alarme) | + 1° em encosta | Calibrada |
|---|---|---|---|
| Haworth | 15,7% / 9,5% | **10,7% / 12,6%** | 14,3% / 9,0% |
| Shoemaker | 12,5% / 5,9% | **8,7% / 8,3%** | 13,0% / 4,6% |
| NPC | 23,1% / 0,6% | **20,2% / 0,9%** | 23,6% / 0,5% |
| NPD | 13,2% / 2,1% | **10,8% / 2,5%** | 11,8% / 2,1% |
| NPA | 14,5% / 2,8% | 12,7% / 3,2% | 11,7% / 3,2% |
| NPB | 13,6% / 2,3% | 10,8% / 3,0% | 9,3% / 3,2% |

  Nos sítios mais lisos (como Site01 e Site20v2), o ajuste só acrescenta alarme: 6 a 7 pontos a mais.

**Leitura para a tese:** o diagnóstico (seção 7) acertou a causa. Nos sítios acidentados, o erro do declive cresce com a inclinação, e somar margem em encosta corta de 13% a 32% do perigo que passava em Haworth, Shoemaker, NPC e NPD, com 0,3 a 3 pontos a mais de alarme. Nos sítios lisos, o mesmo ajuste é desperdício. A versão seguinte da margem deveria crescer com o declive e com a aspereza do sítio, não ser +1° fixo. Para comparar com rigor, faltaria a comparação com o mesmo falso alarme, como na seção 6.2.

**Frase sugerida:** "O diagnóstico mostrou que as falhas restantes se concentram em encostas quase no limite, perto de dado. Uma margem extra em encosta reduz o perigo não vetado em todos os 26 sítios, a um custo de cerca de 5 pontos de falso alarme; o ganho compensa nos sítios acidentados (Haworth: 15,7% → 10,7%) e não nos lisos."

---

## 7b. Curvas de troca (custo × benefício)

**Por que:** escolher um único ponto (P90, "+1° em encosta") mistura duas coisas: o método e o quanto de cautela se escolheu. Uma função de custo com pesos (por exemplo, "um tombamento vale X metros de desvio") exigiria inventar esses pesos. A curva de troca evita isso: para cada família de margem, varre-se o tamanho da margem do zero ao máximo e registra-se, em cada ponto, o custo (falso alarme, terreno seguro vetado) e o risco (perigo que passa). Para o mesmo custo, a curva mais baixa é a melhor, qualquer que seja o peso escolhido depois.

**Como:** cada célula é vetada quando a escala da margem passa de (15° − declive estimado) / forma da margem. Ordenando esse limiar, a curva inteira sai de uma vez, usando 20 sorteios do declive verdadeiro, independentes dos de avaliação e calibração. Saem os valores com o falso alarme fixado em 5, 10, 15, 20, 25 e 30%.

**Famílias comparadas:**
1. Grade, margem uniforme.
2. Tese, margem por densidade de dado (a forma do simulador).
3. Tese, margem por densidade e declive (forma × (1 + declive da grade / 15°)).

Uma margem que cresce com o declive da própria grade não muda a curva da grade: para um mapa só, isso apenas reordena as mesmas células. Por isso essa família foi descartada.

**Saídas:** `fig5_curvas_troca.png` por sítio, colunas `curva_*_FA*` no `resumo_sitios.csv`, `g6_curvas_troca.png` (mediana dos sítios) e Wilcoxon com o falso alarme fixado em 10% e 20%.

**Resultado nos 26 sítios** (grade de partida de 60 m; perigo não vetado, mediana entre sítios [intervalo interquartil]):

| Falso alarme fixado | 5% | 10% | 15% | 20% | 25% | 30% |
|---|---|---|---|---|---|---|
| Grade 60 m | 23,3% [15,0–34,5] | 14,3% [7,7–20,7] | 10,1% | 6,9% [3,2–9,5] | 4,7% | 3,5% |
| Tese, densidade | **16,6%** [9,0–24,8] | **9,5%** [4,7–14,1] | **6,0%** | **4,1%** [2,1–5,8] | **3,1%** | **2,1%** |
| Tese, densidade e declive | 16,6% | 9,4% | 5,9% | 4,0% | 2,8% | 2,1% |
| Tese melhor que a grade em | 26/26 | 26/26 | 26/26 | 26/26 | 26/26 | 25/26 |
| Redução mediana do perigo (tese × grade) | 29% | 35% | 38% | 40% | 41% | 42% |

Wilcoxon pareado, tese × grade: p = 3·10⁻⁸ em todos os pontos de 5% a 25%, e p = 6·10⁻⁸ em 30%.

- **A curva da tese fica abaixo da curva da grade em toda a faixa de custo, em 26 de 26 sítios** (25 de 26 com falso alarme de 30%). A vantagem não depende do ponto de operação escolhido. É o resultado mais forte do trabalho, mais que a comparação num ponto só (seção 6.2).
- **A vantagem cresce quando o rover aceita bloquear mais terreno:** de 29% menos perigo (falso alarme de 5%) para 40–42% (20–30%). Com margens pequenas, as duas deixam passar as encostas no limite; com margens maiores, a tese põe a cautela nos lugares certos.
- **Fazer a margem crescer com o declive é estatisticamente melhor, mas o ganho é desprezível:** de 0,03 a 0,13 ponto na mediana (no máximo 0,67 ponto num sítio); melhor em 21 a 26 dos 26 sítios a partir de 10% de falso alarme (p ≤ 2·10⁻⁴); empate em 5%. Isso confirma a seção 7: o ganho grande do "+1° em encosta" (3,9% → 2,1%) vinha de pôr mais margem, não de uma margem mais inteligente.
- **Conferência:** a 18% de falso alarme, a curva da grade dá cerca de 8%, perto dos 6,5% do controle justo (seção 6.2); a pequena diferença vem da forma da margem (lá, deslocamento fixo nos sorteios de calibração; aqui, curva sobre outros 20 sorteios).

**Frase sugerida:** "Para qualquer quantidade de terreno que a missão aceite bloquear, de 5% a 30%, a tese deixa passar menos perigo real que o mapa grosso com margem uniforme, em todos os 26 sítios: 29% a 42% menos (p = 3·10⁻⁸). A vantagem vem de saber onde o laser mediu; fazer a margem crescer com o declive acrescenta menos de 0,2 ponto."

**Relação com o simulador:** a curva mede o escudo célula a célula, com dados reais. A simulação do rover mede a consequência na missão (chegar, tombar, cair, ficar preso, tempo e distância), com terreno sintético. As duas se completam: a curva mostra que, para o mesmo custo em terreno vetado, a tese deixa passar menos perigo real; o simulador mostra o que isso significa para a missão. Para fechar o argumento de custo-benefício, o ponto de operação escolhido na curva (por exemplo, falso alarme de 20%) deve ser o mesmo usado no simulador.

---

## 7c. Escudo calibrado e treino/teste em relevo real no simulador (v18)

Detalhes em `simulacao_rover\RESULTADOS-RELEVO-REAL.md`. Resumo:

- As margens calibradas deste Monte Carlo entraram no simulador como opção ("Margem calibrada (LOLA)"): P90 = 2,99° perto de disparo e 2,78° longe (nominal: 2,03° / 3,56°).
- O simulador ganhou um modo de **relevo real**: 52 faixas de 3 km dos 26 sítios; treino em 17 sítios, validação em 1, **teste em 8 sítios nunca vistos**; mapa de bordo = tese com os disparos LOLA reais; Monte Carlo do erro LOLA a cada geração (opcional).
- **Resultado (16 faixas de teste, nada significativo a 5%):** regra + tese 50,6% de chegada × grade de 60 m 48,1%; margem calibrada 48,5%; IA Híbrida 44,2–44,8%, com ou sem 8–30 gerações de treino em relevo real, com ou sem Monte Carlo no treino.
- **Achado:** no relevo real, o rover fracassa sobretudo por ficar preso (tempo esgotado, cerca de 40%), não por tombar (3–5%). O escudo atua sobre o segundo problema, e por isso ganha pouco ali.
- **Depois de corrigir o "preso"** (erro do Monte Carlo espacialmente correlacionado, reflexo da IMU a 14,5°, replanejamento a bordo, planejamento com barreira contínua, margem zero nas células já vistas e física realista), as chegadas subiram para 70–79%. **Com o mesmo controlador, trocar a grade de 60 m pela tese 60→5 m elevou a chegada de 70,3% para 78,4% (p = 0,075) e reduziu o tombamento de 2,8% para 0,9% (p = 0,059).** Com a IA Híbrida: 78,8% e 0% de tombamento (p = 0,027 e 0,039). O treino em relevo real (30 gerações, com Monte Carlo) não acrescentou nada (78,4% × 78,8%).

---

## 8. O que é e o que não é novo

### 8.1 O que já existe na literatura (não apresentar como novo)
- **Margem por incerteza do mapa.** Um trabalho japonês de 2022 (Journal of the Japan Society for Aeronautical and Space Sciences, vol. 70, n. 6, p. 208–214) parte da mesma observação: a precisão dos mapas de relevo depende da densidade dos dados de origem, e a maioria dos planejadores de rota ignora isso. Eles propõem uma rota robusta a essa incerteza e mostram, com dados reais, que ela é mais segura que assumir o mapa como correto ou somar ruído gaussiano ao mapa.
- **Krigagem com incerteza por ponto interpolado** aplicada a rotas de rover (Autonomous Robots, 2015/2016, doi:10.1007/s10514-015-9527-z).
- **A NASA (Barker)** já recomenda usar o erro do mapa de 5 m como mapa de peso no planejamento de trajeto.
- **Fusão de fontes de relevo:** LOLA com Kaguya e Chang'E-1 (Mons Rümker, Remote Sensing 2018); LOLA com câmeras por *shape-from-shading* (Bertone et al.; ASP/NASA Ames).
- Tabelas de sombra pré-calculadas e neuroevolução também não são novas.

### 8.2 O que este trabalho mede e que não foi encontrado publicado
A busca na literatura foi curta (algumas consultas), não uma revisão sistemática. Por isso a formulação correta é "não encontrado publicado", não "inédito".

1. **Quanto perigo um mapa grosso esconde nos sítios candidatos do polo sul**, medido em 26 sítios oficiais com o erro publicado de cada célula e validação cruzada sobre disparos reais.
2. **A separação entre o ganho da margem e o ganho de saber onde o mapa foi medido**, com o mesmo falso alarme: 38% a menos de perigo não vetado partindo de 60 m, em 26 de 26 sítios, crescendo com a aspereza.
3. **Onde o escudo ainda falha:** encostas quase no limite, perto de dado, onde a margem é otimista.
4. **Integração ponta a ponta no simulador:** planejamento, escudo, controlador aprendido, ablação degrau a degrau e comparação com o trajeto real do Pragyan (documentados em `RESULTADOS-ABLACAO.md` e na validação Pragyan).

### 8.3 Frase sugerida para a tese
> A incerteza dos mapas de relevo lunar depende da densidade de dados; isso é conhecido. Este trabalho mede, em 26 sítios reais do polo sul, quanto perigo essa incerteza esconde de um rover, quanto uma margem por densidade de dado recupera, e quanto disso vem de saber onde o mapa foi medido, e não só de ser cauteloso. A comparação com um mapa independente feito de imagens (SfS, Haworth) mostra o limite: entre as trilhas do laser, onde não há medida, a correção não melhora o mapa oficial.

---

## 9. Validação independente nas células interpoladas (em andamento)

**Ideia:** o Monte Carlo só tem verdade onde há disparo (cerca de 7% das células). Para medir a tese nas células interpoladas, é preciso um mapa independente.

**Dado:** Bertone et al. (NASA GSFC), *Enhanced Topography Models for selected Lunar South Pole regions with Shape-from-Shading*, The Planetary Science Journal, doi:10.3847/PSJ/ae5b70; produtos no PGDA #104 e no Zenodo (doi:10.5281/zenodo.17954508). São mapas de 5 m/pixel, feitos a partir de imagens LROC NAC, para as 13 regiões candidatas da Artemis III de 2022. Uma delas é **Haworth**, que também está entre os 26 sítios (arquivo `A3CLR22_2_Haworth.zip`, 4,4 GB; download em andamento).

**Script:** `diagnostico\comparar_sfs.py`

```
python comparar_sfs.py --sfs "C:\caminho\da\pasta_descompactada"
```

**O que mede:**
1. Onde há disparo: a concordância de declive entre SfS e LOLA. Se for boa, o SfS serve de referência.
2. Onde não há disparo: grade 60 m, mapa LOLA 5 m oficial (interpolado), tese e tese P90, cada um contra o SfS. Para cada um: erro do declive, perigo não vetado e falso alarme.

Responde a pergunta "a tese ao menos iguala o interpolado da NASA nas células sem disparo?".

**Dados usados (pasta `C:\NASA PROJETO 2026\A3CLR22_2_Haworth\A3CLR22_2_Haworth\`):** `A302_GLDELEV_005.tif` (elevação SfS), `A302_GLDSIGM_005.tif` (incerteza de altura), `A302_GLDDIFF_005.tif` (SfS − LOLA) e os mapas de declive `SLOPE_MAPS\A302_GLDTSLP_005_010/020.tif`. A grade do SfS é **idêntica** à do LOLA de Haworth (mesmo canto, 5 m, estereográfica polar sul, R = 1.737.400 m). Os GeoTIFFs são comprimidos com preditor de ponto flutuante; o script lê com Pillow quando o `tifffile` não consegue.

**Resultado (14/11/2026; recorte central de 10 × 10 km; partida de 60 m; 97% das células com incerteza do SfS < 0,5 m):**

- **SfS e LOLA concordam em altura** (diferença mediana −0,02 m; |diferença| mediana 0,37 m), mas **discordam em declive** em cerca de 1,25° até nas células com disparo. Com os mapas de declive do próprio produto (bases de 10 m e 20 m), a discordância é de 1,5–1,6°. Ou seja, a referência tem uma incerteza de declive do mesmo tamanho das diferenças entre os métodos.
- **Nas células sem disparo (3,3 milhões), com o SfS como referência:**

| Método | |erro| mediano do declive | Perigo não vetado com falso alarme de 10% | ... de 20% | ... de 30% |
|---|---|---|---|---|
| Grade 60 m | 1,14° | 16,8% | 10,3% | 7,8% |
| Mapa LOLA 5 m oficial | 1,19° | 15,8% | 7,6% | 4,8% |
| Tese | 1,27° | 19,1% | 10,4% | 7,0% |

  Com os declives do próprio produto SfS (base 10 m e 20 m), a ordem é a mesma ou pior para a tese: falso alarme de 20% → grade 8,9–10,1%, LOLA oficial 7,8–9,8%, tese 11,1–13,1%.

**Leitura honesta:**
1. **Nas células interpoladas, a tese não melhora o mapa oficial da NASA nem a grade grossa**, segundo o SfS. O mapa oficial (que usa todos os disparos com interpolação mais cuidadosa) fica à frente; a tese fica empatada com a grade ou pior.
2. **O ganho medido no Monte Carlo vale para as células com disparo e sua vizinhança** (14% das células em Haworth), não para o mapa inteiro. Há ainda uma ressalva sobre a própria verdade do Monte Carlo: o declive oficial numa célula com disparo é calculado com as células vizinhas, que em geral são interpoladas.
3. **Na prática, a correção da tese espalha o resíduo dos disparos para dentro dos buracos, e isso não acrescenta informação útil ali** quando se compara com o relevo das imagens.
4. **Limites desta checagem:** um sítio só; o SfS depende do LOLA como ponto de partida e é um produto em si incerto (1,2–1,6° de discordância de declive); nada disso substitui uma medida no chão.
5. **Consequência para a tese:** a afirmação defensável é "a margem por densidade de dado reduz o perigo que passa nas células próximas de disparo"; não "a tese reconstrói melhor o relevo entre as trilhas". Onde existir SfS (as 13 regiões candidatas da Artemis III), o caminho natural é usá-lo como mais um nível do mapa, não competir com ele.

**E usar o mapa oficial de 5 m com a margem por densidade?** Teste complementar (mesmo recorte; referência SfS; perigo não vetado com falso alarme de 5 / 10 / 20 / 30%, células sem disparo):

| Método | SfS (gradiente próprio) | SfS (declive base 10 m do produto) |
|---|---|---|
| LOLA 5 m oficial, margem uniforme | 27,6 / 14,0 / **5,4** / **2,7** | 38,2 / 21,9 / **9,8** / **5,5** |
| LOLA 5 m oficial, margem por densidade (2 níveis) | 27,3 / 14,7 / 7,2 / 4,4 | 37,8 / 22,3 / 11,8 / 7,8 |
| LOLA 5 m oficial, margem cresce com a distância ao disparo | 27,5 / 14,3 / 6,0 / 3,2 | 38,0 / 22,0 / 10,6 / 6,2 |
| Grade 60 m, margem uniforme | 26,8 / 16,0 / 9,0 / 6,0 | 28,4 / 17,1 / 10,1 / 7,2 |

- **O mapa oficial de 5 m pode e deve ser usado.** Com margem uniforme, é o melhor dos métodos testados a partir de 10–20% de falso alarme.
- **Pôr no mapa oficial uma margem maior longe dos disparos não ajudou** em Haworth: segundo o SfS, os erros do mapa de 5 m não se concentram onde faltam disparos. A margem uniforme foi melhor.
- Com falso alarme muito baixo (5%), a grade de 60 m empata ou supera o mapa de 5 m contra o declive de base 10 m do SfS, porque a referência e a grade são ambas suaves. Isso mostra o peso da escolha da referência.
- Ressalva: um sítio, e a referência SfS tem incerteza própria.

**Arquivos:** `diagnostico\comparar_sfs.py` e `diagnostico\sfs_Haworth\` (`relatorio.txt`, `resumo.json`, `comparacao_sfs.png`, `curvas_sfs.png`).

**Limites:** o SfS usa o LOLA como mapa inicial (não é totalmente independente); só acrescenta detalhe em áreas iluminadas; não tem camada dedicada de incerteza.

---

## 10. Ideias discutidas e por que ficaram fora

- **Cascata 60 → 20 → 5 m.** Os produtos existem (a NASA publica o mapa do polo sul a 20 m/pixel, com incerteza), mas os três níveis vêm dos mesmos disparos do LOLA. Um nível intermediário reorganiza a mesma informação; não acrescenta medida nova. A analogia da curva de calibração (mais pontos, curva melhor) só vale quando cada ponto é uma medida independente.
- **Outros lasers lunares.** Kaguya/LALT (ponto de 40 m, cerca de 1,6 km entre disparos) e Chang'E-1/LAM (ponto de 120 m, cerca de 1,4 km) são esparsos demais para 5 m. Num estudo em Mons Rümker, LOLA + Kaguya melhorou o mapa, mas os outros lasers precisaram ser alinhados ao LOLA, e LOLA + Chang'E-1 ficou distorcido por erro de posição. No polo sul, o LOLA já tem a maior densidade.
- **1 m.** O LOLA não chega a 1 m: cada disparo cobre 5 m. Fontes de 1–2 m: estéreo e SfS com a câmera NAC (fora da sombra) e a ShadowCam (dentro da sombra permanente, 1,7 m/pixel; mapas ainda em fase de pesquisa).
- **Arquitetura em três níveis com fontes diferentes** (sugerida como trabalho futuro): mapa orbital (60 ou 20 m) para planejar; disparos LOLA (5 m) para o escudo; câmera do rover (~1 m, alcance de 3 m, como no modo Pragyan do simulador) para o próximo passo.
- **Fotos como calibração.** Imagens sombreadas mostram brilho, não altura. Não servem para calibrar declive; servem para explicação qualitativa e ilustração. No QuickMap, nos sítios testados, só carregou a camada de baixa resolução.
- **Curva de desempenho pela resolução de partida** (60, 40, 30, 20, 10 m): proposta, não rodada.

---

## 10b. Imagens LROC NAC dos 26 sítios (acervo montado por outro agente) e checagem de localização

**O acervo:** `C:\NASA PROJETO 2026\lroc_nac\pgda78_26\`, com um recorte de 1200 × 1200 pixels (cerca de 1,9 km, 1,5–1,6 m/pixel, imagens calibradas CDR, não projetadas) e uma visão da faixa inteira para cada sítio. Índice em `figuras\recortes_final.csv`. A coluna "800 produtos" é o teto da consulta ao ODE; o número real de imagens que cobrem cada sítio é a coluna `n_cobrindo` (mediana 30, de 0 a 56).

**Checagem em Haworth** (`diagnostico\checar_local_nac.py` e `checar_faixa_nac.py`): o relevo do LOLA foi renderizado com o Sol na posição aproximada da hora da foto (elevação 5,6°, com sombras projetadas) e comparado com a imagem por correlação, testando giro, espelhamento e direção do Sol.

- **Escala corrigida:** os pixels desta imagem de 2009 não são quadrados. Pelo footprint, são cerca de 0,97 m na direção transversal e 2,18 m ao longo da faixa (faixa de 2,44 km × 114 km), e não os 1,57 m/pixel do campo `Map_resolution` do ODE. O outro agente apontou a largura; a primeira versão desta checagem usava 1,57 m quadrado. Com a escala certa, um recorte de 1200 × 1200 pixels cobre cerca de 1,2 km × 2,6 km.
- **Resultado com a escala certa:** um trecho de 6 km da faixa se encaixa no relevo com correlação **0,89**, contra 0,56 no melhor lugar alternativo. O encaixe é robusto a ±10° na direção do Sol e a ±4° no giro. O centro do recorte fica a **3,1 km do centro esperado**, quase todo na direção transversal à faixa.
- O encaixe só aparece com a imagem espelhada na direção transversal (de um lado para o outro).
- **O que o outro agente validou com SPICE** (modelo de câmera completo): os 4 cantos da faixa RC do par M109312885 batem com o footprint oficial com erro de 60–120 m, e as amostras crescem de oeste para leste, sem espelhamento nos arquivos CDR. Isso confirma a geometria da faixa, mas não a posição em que o recorte foi tirado dentro dela, que foi calculada por interpolação bilinear nos cantos.
- **Conflito em aberto:** o espelhamento encontrado aqui contradiz a orientação confirmada por SPICE. Ou a figura PNG foi gerada com as colunas invertidas, ou a renderização tem algum detalhe errado. A correlação de 0,89 sugere que o deslocamento de cerca de 3 km é real.
- **O outro agente também encontrou** que os recortes de LM1 (trilha a 11,45 km do sítio) e de Site23 (footprint cortado no meridiano) estão em posição não confiável, e propôs reposicionar todos os recortes com o modelo de câmera completo (precisão de cerca de ±50 m). É a correção certa; ela depende de baixar os arquivos de atitude da nave (2–3 GB).

**Uso na tese:** as imagens servem como ilustração da região, com legenda honesta ("imagem LROC NAC próxima ao sítio; posição aproximada, não projetada"). Não servem para medir declive, conferir pixel a pixel onde a tese falha, nem calibrar. Para isso, o produto SfS (seção 9) é o caminho.

---

## 11. Limitações

1. A verdade do Monte Carlo existe só nas células com disparo (cerca de 7%), e mesmo ali o declive oficial usa células vizinhas interpoladas. Na validação com o SfS em Haworth (seção 9), a tese **não** melhorou as células interpoladas.
2. O sorteio usa o erro de declive por célula como desvio-padrão de uma Normal independente. Os 100 "clones" de erro correlacionado do PGDA (mais de 150 GB) não foram usados.
3. A grade grossa é a média em blocos do próprio mapa de 5 m. Um produto real de 60 m ou 20 m pode ter erros diferentes.
4. A "tese" aqui é uma implementação de referência (grade + correção pelos disparos + margem): a mesma ideia do simulador, aplicada a dado real, não o código do simulador.
5. O recorte é de 10 × 10 km por sítio, não o sítio inteiro.
6. O limite de 15° é o do rover simulado; outros rovers têm outros limites.
7. A revisão de literatura foi curta.

---

## 12. Próximos passos

1. Ajuste de encosta: feito para 60 m nos 26 sítios (seção 7). Falta a versão de 20 m (`python rodar_todos.py --grossa 20`) e a comparação com o mesmo falso alarme.
2. Curvas de troca: feitas para 60 m nos 26 sítios (seção 7b). Falta a versão de 20 m (`python rodar_todos.py --grossa 20` e `python graficos_sitios.py --grossa 20`).
3. SfS de Haworth: feito (seção 9). Resultado: nas células interpoladas, a tese não supera o mapa oficial nem a grade. Próximo passo possível: usar o SfS como nível extra do mapa onde ele existir.
4. Opcional: curva de desempenho pela resolução de partida.
5. Ampliar a revisão de literatura antes de afirmar qualquer novidade.

---

## 13. Referências

- Barker, M. K. et al. (2021). Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. *Planetary and Space Science* 203, 105119. doi:10.1016/j.pss.2020.105119. Dados: PGDA #78.
- Barker, M. K. et al. A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA). NTRS 20230014419. Dados: PGDA #90 (mapas do polo sul a 20 m/pixel com incerteza).
- Bertone, S., McKenna, T. E., Barker, M. K., Mazarico, E., Beyer, R. A., Petro, N. Enhanced Topography Models for selected Lunar South Pole regions with Shape-from-Shading. *The Planetary Science Journal*, doi:10.3847/PSJ/ae5b70. Dados: PGDA #104; Zenodo doi:10.5281/zenodo.17954508.
- Trabalho japonês de 2022 sobre planejamento de rota robusto à incerteza do mapa por densidade de dados. *Journal of the Japan Society for Aeronautical and Space Sciences* 70(6), 208–214. (Conferir autores e título completo na J-STAGE antes de citar.)
- Planejamento de rota de rover com krigagem e incerteza por ponto interpolado. *Autonomous Robots*, doi:10.1007/s10514-015-9527-z. (Conferir autores e título completo antes de citar.)
- Modelo de elevação melhorado de Mons Rümker com altimetria de várias missões (LOLA, LALT, LAM). *Remote Sensing* 10(9), 1442 (2018).
- Iz, H. B., Shum, C. K., Chen, Y. Q., Dai, C. L. An improved geometric lunar figure from Chang'E-1 and SELENE laser altimetry.
- Jia, R., Wu, B., Mahanti, P. (2024). Shape-from-Shading Derived DEMs from ShadowCam Images in Permanently Shadowed Regions at the Lunar South Pole: A First Look. ISPRS Archives XLVIII-3-2024, 245. doi:10.5194/isprs-archives-XLVIII-3-2024-245-2024.
- NASA Ames Stereo Pipeline, documentação de *shape-from-shading* (sfs).
