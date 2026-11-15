# Resultados — comparação SfS × LOLA e validação com fotos LROC

15/11/2026. Versão editável: https://claude.ai/artifact/1DCitY9vsUYTbFmWeCmBma

## Resumo

O cálculo de sombras do projeto acerta 94–96% dos pixels em 486 fotos reais da LROC NAC, e o erro perigoso (prever luz onde há sombra) cresce com a grade do terreno: 2,1% no SfS de 5 m contra 9,1% na grade de 240 m, nas regiões polares.

1. **Validação independente:** o motor de sombras confere com 8,87 milhões de pixels de 486 fotos LROC NAC em três regiões (Leibnitz Beta, de Gerlache Rim, Peak Near Shackleton).
2. **Resolução importa no erro perigoso, pouco no acerto global:** de 20 m para 5 m o acerto sobe cerca de 0,9 ponto; a luz falsa cai de 3,4% para 2,1% (SfS). A grade de 240 m chega a 9,1%.
3. **SfS × LOLA no agregado:** iluminação e DTE com correlação ≥ 0,99; a diferença está em pontos isolados. Em Peak Near Shackleton o melhor ponto cai de 72,5% (SfS) para 66,0% (LOLA 20 m).
4. **Margens da tese:** a grade de 60 m não vê 12–41% das encostas acima de 15°; com LOLA 5 m e margem P99, só 0,2–0,5% escapam. P99 está calibrada (excedência 0,7–1,5% contra 1%); P90 é conservadora (3–6% contra 10%).
5. **Motor e calibração corrigidos:** o motor do projeto usava a escala da Terra (111.320 m/grau); corrigido, o sítio de referência dá 65,9% de iluminação, e não 68,4%. A tabela de calibração tinha duas coordenadas erradas; corrigidas, ela confere com o terreno.

## Dados e método

| Item | O que foi usado |
| --- | --- |
| Terreno SfS | Produtos A3CLR22 #10 (Leibnitz Beta), #9 (de Gerlache Rim) e #8 (Peak Near Shackleton), Bertone et al. 2026: elevação 5 m/px, 16 × 16 km cada |
| LOLA 5 m | Referência LOLA do próprio pacote SfS (elevação − diferença) |
| LOLA 20 m | LDEM_875S_20M (87,5–90°S), usado pelo app |
| LOLA 60 e 240 m | Médias de blocos do LOLA 20 m (polares) ou do LOLA 5 m (Leibnitz) |
| Sol e Terra | Efemérides DE440 + orientação lunar `moon_pa_de440`, frame MOON_ME |
| Horizonte | Ray-marching bilinear, geometria estereográfica exata, curvatura lunar, até 75 km, 360 azimutes |
| Observadores | 841 por região (grade de 500 m), mastro de 2 m, período 2026–2045, passo de 3 h |
| Fotos | 486 imagens LROC NAC ortorretificadas dos pacotes SfS (120 + 194 + 172), 8,87 milhões de pixels |

- **Alinhamento:** SfS × LOLA 20 m tem RMSE de 1,3–1,5 m no deslocamento zero e 3–17 m com deslocamentos de 20–100 m.
- **Sol de cada foto:** calculado das efemérides com a hora tirada do número da foto; conferido contra os 33 arquivos de câmera de de Gerlache, erro máximo 0,006°.
- **Pixel iluminado na foto:** brilho maior que 0,001. Iluminação pelo centro do disco solar, salvo indicação.

## Resultado 1: iluminação e DTE, SfS × LOLA

No agregado o SfS quase não muda a iluminação nem o DTE (correlação ≥ 0,99, mediana da diferença 0,06–0,3 ponto); a diferença se concentra em 1% dos pontos, em cristas e pequenas cavidades. Figura: `fig1_mapas_iluminacao_sfs_lola.png`.

| Medida | Leibnitz Beta | de Gerlache Rim | Peak Near Shackleton |
| --- | --- | --- | --- |
| Diferença de elevação SfS − LOLA 5 m, média / desvio (m) | 0,02 / 0,67 | 0,02 / 0,96 | 0,02 / 0,74 |
| Pixels com diferença > 2 m | 1,2% | 4,5% | 1,7% |
| Área com declive > 15°, SfS / LOLA 5 m | 35,0 / 34,7% | 45,8 / 45,6% | 18,7 / 17,6% |
| Diferença de iluminação SfS − LOLA 5 m, mediana / p95 (pontos) | 0,12 / 1,2 | 0,06 / 1,9 | 0,12 / 1,5 |
| Diferença de iluminação SfS − LOLA 20 m, mediana / p95 (pontos) | — | 0,1 / 2,4 | 0,3 / 3,2 |
| Pontos com diferença > 5 pontos (SfS − LOLA 5 m) | 0,7% | 1,4% | 0,6% |
| Pontos que mudam de lado no limiar LEAG de 40% (vs LOLA 5 m / 20 m), de 841 | 10 / — | 12 / 15 | 8 / 20 |
| Melhor ponto da grade: iluminação SfS / LOLA 5 m / LOLA 20 m | 81,2 / 79,7 / — | 77,1 / 75,7 / 75,9 | 72,5 / 73,0 / **66,0** |
| Coordenada do melhor ponto | −85,48°, 31,43°E | −88,47°, −67,86° | −88,81°, 123,69°E |
| DTE, diferença SfS − LOLA 20 m, mediana / p95 (pontos) | — | 0,0 / 1,5 | 0,0 / 4,4 |

Leibnitz Beta (85,4°S) fica fora do LOLA 20 m polar. Em Peak Near Shackleton o SfS e o LOLA 5 m concordam e os dois se afastam do LOLA 20 m: o efeito é da resolução, não do SfS em si.

## Resultado 2: validação com 486 fotos LROC NAC

O cálculo de sombras acerta 93–96% dos pixels das fotos reais em qualquer terreno; o que separa as resoluções é a luz falsa (prever luz onde a foto está escura). Figuras: `fig2_luz_falsa_por_grade.png`, `fig4_exemplo_foto_vs_previsao.png`.

Acerto / luz falsa / sombra falsa, em %:

| Terreno | Leibnitz Beta (120 fotos) | de Gerlache Rim (194) | Peak Near Shackleton (172) | Polares juntas (366) |
| --- | --- | --- | --- | --- |
| SfS 5 m | 94,3 / 7,7 / 3,8 | 95,8 / 2,1 / 5,9 | 95,7 / 2,2 / 6,1 | 95,7 / 2,1 / 6,0 |
| LOLA 5 m | 93,8 / 8,8 / 3,8 | 95,3 / 3,0 / 6,0 | 94,9 / 4,1 / 5,9 | 95,1 / 3,6 / 6,0 |
| LOLA 20 m | 93,8 / 9,5 / 3,3 | 94,7 / 2,9 / 7,1 | 93,7 / 4,0 / 8,3 | 94,2 / 3,4 / 7,7 |
| LOLA 60 m | 92,8 / 11,0 / 3,8 | 95,3 / 4,2 / 5,1 | 94,0 / 7,0 / 5,1 | 94,7 / 5,7 / 5,1 |
| LOLA 240 m | 90,2 / 13,8 / 6,1 | 94,8 / 6,5 / 4,2 | 92,5 / 11,5 / 4,1 | 93,6 / 9,1 / 4,2 |

- **Foto a foto:** nas polares o SfS acerta mais que o LOLA 20 m em 346 de 366 fotos, e o LOLA 5 m em 349. Em Leibnitz, 98 e 54 de 120.
- **De 20 m para 5 m** o acerto sobe cerca de 0,9 ponto nas polares e nada em Leibnitz.
- **Anomalia sem explicação:** nas polares o LOLA 60 m tem acerto global igual ou maior que o de 20 m, porque troca sombra falsa por luz falsa.
- **Exemplo (fig. 4):** na foto M115416165LE (Peak Near Shackleton, Sol a 0,9°) a luz falsa é 5,2% com SfS, 8,7% com LOLA 20 m e 24,7% com LOLA 240 m.

## Resultado 3: margens P50/P90/P99 da tese

Com o SfS como referência, a margem P99 está calibrada e a P90 é conservadora; a grade de 60 m, sem margem, deixa passar 12–41% das encostas acima de 15°. Figura: `fig3_margens_perigos_nao_vistos.png`. Regra da animação: margem 1,0 + z · 2,0° em célula interpolada (1,0° P50, 3,56° P90, 5,65° P99).

| % de perigos não vistos | Leibnitz Beta | de Gerlache Rim | Peak Near Shackleton |
| --- | --- | --- | --- |
| Grade 60 m | 12,2 | 15,5 | 41,0 |
| LOLA 5 m + P50 | 4,5 | 7,7 | 14,9 |
| LOLA 5 m + P90 | 0,7 | 1,2 | 2,2 |
| LOLA 5 m + P99 | 0,2 | 0,3 | 0,5 |

| Medida | Leibnitz Beta | de Gerlache Rim | Peak Near Shackleton |
| --- | --- | --- | --- |
| Células realmente acima de 15° | 35,4% | 46,0% | 19,8% |
| Mapa bloqueado por P90 / P99 | 51 / 63% | 69 / 81% | 43 / 60% |
| Excedência observada da margem P90 (nominal 10%) | 3,3% | 6,0% | 3,8% |
| Excedência observada da margem P99 (nominal 1%) | 0,7% | 1,5% | 0,9% |

## Resultado 4: motor corrigido e tabela de calibração

O motor de horizonte usava 111.320 m/grau (Terra) em vez de 30.323 m/grau (Lua); foi corrigido no commit 8dea6de com geometria estereográfica exata, bilinear, curvatura lunar, passo 20 m, 75 km. Trocar só a constante dá 55,7% no sítio de referência.

| Sítio −89,30°, 128,5°E, mastro 2 m, 2026–2045 | Iluminação, centro | Iluminação, limbo | DTE |
| --- | --- | --- | --- |
| Motor antigo (RELATÓRIO §6.2) | 68,4% | 75,9% | 53,8% |
| Motor corrigido | 65,9% | 71,6% | 54,4% |

A comparação antiga "75,9% contra 77,1–88,0% de Gläser 2018" não vale mais.

Tabela de calibração, coordenadas de 007 e 011 corrigidas; iluminação a 2 m, centro (limbo):

| Sítio | Tabela, Gläser 20 m | LOLA 20 m | LOLA 5 m | SfS 5 m |
| --- | --- | --- | --- | --- |
| 007 Peak Near Shackleton (−88,8113°, 123,554°E) | 74,1% | 79,7 (84,1) | 79,2 (83,2) | 77,4 (82,5) |
| 011 de Gerlache Rim 1 (−88,6744°, −68,228°) | 72,0% | 71,6 (77,7) | 73,9 (79,3) | 67,9 (74,0) |

Nas coordenadas antigas era 43–44% e 16–18%. A afirmação de 97,7% / 98,3% de assertividade ainda não foi recalculada.

## Limitações

- SfS não é verdade de campo e foi ajustado às mesmas fotos usadas na validação; os números do LOLA são os independentes.
- Leibnitz Beta fica fora do LOLA 20 m polar; sem terreno distante, os absolutos são otimistas. Faltaria o LDEM_85S_10M (1,76 GB).
- Grades de 60 e 240 m são médias de blocos, não produtos oficiais.
- LOLA 5 m é a referência reconstruída do pacote SfS; versão não informada.
- Limiar único de brilho; fotos de 2009–2024.
- Margens testadas só no caso de célula interpolada, em três regiões.
- Grade de observadores de 500 m e passo de 3 h.
