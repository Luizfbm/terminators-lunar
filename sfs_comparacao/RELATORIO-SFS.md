# Comparação SfS (5 m) × LOLA — Leibnitz Beta, de Gerlache Rim, Peak Near Shackleton

Gerado em 2026-11-15. Dados: produtos SfS A3CLR22 #10, #9, #8 (Bertone et al. 2026), ELEV 5 m/px, 16 × 16 km cada.
Figura: `fig_comparacao_sfs.png` · Tabela por ponto: `sfs_comparacao_sitios.csv` (2.523 observadores) · Código: `run.py`, `ray.c`.

## Método
- 841 observadores por região (grade de 500 m, margem de 1 km), altura 2 m, Sol/Terra de 2026–2045 (efemérides do projeto, passo 3 h), disco solar no centro (`illum`) e no limbo (`limb`).
- Horizonte por ray-marching bilinear, 360 azimutes, passo 5/10/20 m, **geometria estereográfica exata + curvatura lunar**.
- Três configurações: **SfS** (patch SfS + LOLA 20 m fora do patch), **LOLA5** (referência LOLA a 5 m = ELEV − DIFF, mesmo contorno) e, nas duas regiões polares, **LOLA20** (`LDEM_875S_20M` puro = o que o app usa hoje).
- Validação de alinhamento: SfS × LDEM 20 m, RMSE 1,3–1,5 m no deslocamento zero, 3–17 m com deslocamentos de 20–100 m.

## Resultados
| | Leibnitz Beta | de Gerlache Rim | Peak Near Shackleton |
|---|---|---|---|
| Δ elevação SfS−ref: média / σ | 0,02 / 0,67 m | 0,02 / 0,96 m | 0,02 / 0,74 m |
| pixels com \|Δ\| > 2 m | 1,2% | 4,5% | 1,7% |
| área com declive > 15° (20 m), SfS / ref | 35,0 / 34,7% | 45,8 / 45,6% | 18,7 / 17,6% |
| Δ iluminação SfS−LOLA5: mediana \|Δ\| / p95 | 0,12 / 1,2 p.p. | 0,06 / 1,9 | 0,12 / 1,5 |
| Δ iluminação SfS−LOLA20 (app): mediana / p95 | n/d | 0,1 / 2,4 | 0,3 / 3,2 |
| pontos com \|Δ\| > 5 p.p. (SfS−LOLA5) | 0,7% | 1,4% | 0,6% |
| pontos que cruzam o limiar LEAG de 40% (SfS vs LOLA5 / LOLA20) | 10 / n/d | 12 / 15 | 8 / 20 |
| Melhor ponto da grade, iluminação SfS / LOLA5 / LOLA20 | 81,2 / 79,7 / n/d (−85,48°, 31,43°E) | 77,1 / 75,7 / 75,9 (−88,47°, −67,86°) | 72,5 / 73,0 / **66,0** (−88,81°, 123,69°E) |
| DTE, Δ mediana / p95 (SfS−LOLA20) | n/d | 0,0 / 1,5 p.p. | 0,0 / 4,4 p.p. |

## Leitura
1. O SfS **não muda o quadro regional**: correlação 0,99+ com LOLA em iluminação e DTE; o ganho do SfS é de escala métrica, não de ordem de grandeza.
2. Onde ele pesa é em **pontos isolados** (cristas/pequenas cavidades): até 14–20 p.p. de diferença em 0,6–1,4% dos pontos, e 8–20 de 841 pontos trocam de lado no limiar de 40%.
3. **Peak Near Shackleton** é o caso em que a resolução importa: o melhor ponto cai de 72,5% (SfS) para 66,0% no LOLA 20 m; DTE tem p95 de 4,4 p.p. e máximo de 62 p.p. num ponto. SfS ≈ LOLA 5 m, ou seja, o efeito é da **resolução**, não do SfS em si.
4. Declive (20 m): praticamente igual (diferença < 1,1 p.p. na fração > 15°).

## Ressalvas (importantes)
- **Bug no motor do projeto (`precalc/engine.py` e `horizon.py`)**: usam 111.320 m/grau (Terra); na Lua são 30.323 m/grau → raios ~3,7× curtos. Corrigindo só a constante, o horizonte máximo do sítio −89,30°/128,5°E vai de 0,38° a 1,38°. Com geometria exata, o mesmo sítio dá 65,7% (centro) / 71,5% (limbo) / DTE 54,4%, contra 68,4 / 75,8 / 53,8 publicados no RELATORIO. A "calibração" de 75,9% vs 77–88% (Gläser) **não se sustenta**. Reproduzi os números antigos com `engine.horizon` original para confirmar que a minha cadeia Sol/Terra é a mesma. Máscaras de `horizon.py` para os 41 sítios do app provavelmente têm o mesmo erro (não conferi o JS).
- **Leibnitz Beta (85,4°S) está fora do `LDEM_875S_20M`**: só há o patch de 16 km, sem terreno distante. Os números absolutos são otimistas; só os Δ SfS−LOLA5 valem. Para fechar, falta `LDEM_85S_10M` (1,76 GB).
- "LOLA5" é reconstruído como ELEV − DIFF (o README diz "reference LOLA DEM", sem a versão).
- Grade de 500 m: o melhor ponto real pode estar entre nós. Amostragem de 3 h limita a resolução de apagões e silêncios DTE.

## Implicações para a tese (adendo, 15/11 manhã)
Teste das margens P50/P90/P99 da animação (`margem = 1,0 + z·2,0°` em célula interpolada) usando o SfS como terreno de referência. Declive com baseline de 10 m (±1 célula de 5 m, como a animação), perigo = declive > 15°. "Grade 60 m" = média de blocos 12×12 e diferença de ±60 m, como o rover A.

| | Leibnitz | de Gerlache | Peak N. Shackleton |
|---|---|---|---|
| células realmente > 15° | 35,4% | 46,0% | 19,8% |
| perigos que a grade de 60 m (rover A) não vê | 12,2% | 15,5% | 41,0% |
| perigos não vistos, LOLA 5 m + margem P50 (1,0°) | 4,5% | 7,7% | 14,9% |
| idem, margem P90 (3,56°) | 0,7% | 1,2% | 2,2% |
| idem, margem P99 (5,65°) | 0,2% | 0,3% | 0,5% |
| mapa bloqueado por P90 / P99 | 51 / 63% | 69 / 81% | 43 / 60% |
| P(Δ declive SfS−LOLA > 3,56°) (nominal 10%) | 3,3% | 6,0% | 3,8% |
| P(Δ declive SfS−LOLA > 5,66°) (nominal 1%) | 0,7% | 1,5% | 0,9% |

Leitura: P99 está calibrado (0,7–1,5% de excedência contra 1% nominal); P90 está conservador (3–6% contra 10%).
Limites: o SfS é uma estimativa restrita ao LOLA, não verdade de campo; 3 regiões; margem testada só no caso "célula interpolada" (2,0°).

**Tabela de calibração (`tabelas_brutas/calibracao_sitios_referencia_4resolucoes.csv`)**: nas coordenadas dos sítios 007 (−89,061°, 128,44°E) e 011 (−88,71°, −68,44°), o terreno real (LOLA 20 m, LOLA 5 m e SfS, 2 m de mastro) dá 43–44% e 18–20% de iluminação (centro do disco), contra 74,1% e 72,0% na coluna "Gläser 20 m". Os melhores pontos de cada patch (72–77%) estão na faixa publicada, então os valores da tabela parecem ser de outro lugar (cume), não destes pontos. Os scripts da bancada (`build_bancada.py` etc.) não usam o `engine.py` com o bug dos 111.320 m/grau.

## Verificação com as fotos LROC NAC (15/11, três regiões)
Cada pacote SfS traz as fotos ortorretificadas (`LROC-NAC-maps`: 120 / 194 / 172 em Leibnitz / de Gerlache / Peak). Teste: prever sombra/luz de cada pixel por ray-tracing em cada DEM, com o Sol do instante da foto, e comparar com o pixel real (iluminado = DN > 0,001). Dados por foto em `fotos_todas.csv`; código em `photo2.py`, `eph.py`, `ray.c`.

- **Fotos usadas: 183 de 486** (50 de 120, 83 de 194, 50 de 172), escolhidas espaçadas ao longo da lista; 3,09 milhões de pixels (1 a cada 40 m). Não rodei as 303 restantes: a ponte de arquivos traz 50 por chamada.
- **Sol**: só de Gerlache tem os JSON de câmera. Para as três regiões calculei o Sol direto de `de440s.bsp` + `moon_pa_de440_200625.bpc` (leitor próprio, sem SPICE), com a hora tirada do número da foto. Conferido contra os 33 JSON: erro angular máximo 0,006°.

Disco solar pelo centro. "Luz falsa" = modelo prevê luz e a foto está escura (erro perigoso). "Sombra falsa" = o contrário.

| DEM | Leibnitz: acerto / luz falsa / sombra falsa | de Gerlache | Peak N. Shackleton |
|---|---|---|---|
| SfS 5 m | 94,0% / 7,9% / 4,1% | 96,1% / 1,7% / 6,1% | 95,5% / 2,3% / 6,1% |
| LOLA 5 m (ref.) | 93,6% / 8,9% / 4,1% | 95,6% / 2,5% / 6,4% | 94,9% / 4,2% / 5,8% |
| LOLA 20 m | 93,5% / 9,6% / 3,5% | 95,0% / 2,4% / 7,7% | 93,7% / 4,1% / 7,9% |
| LOLA 60 m | 92,5% / 11,1% / 4,1% | 95,5% / 3,8% / 5,3% | 94,1% / 7,1% / 5,0% |
| LOLA 240 m | 89,9% / 13,7% / 6,7% | 94,9% / 5,9% / 4,3% | 92,7% / 11,9% / 4,0% |

Duas regiões polares juntas (133 fotos, 2,29 M px): acerto 95,9 / 95,3 / 94,4 / 94,9 / 93,9% e luz falsa 1,9 / 3,2 / 3,1 / 5,1 / 8,3% (SfS, 5, 20, 60, 240 m). SfS acerta mais que o LOLA 20 m em 121 das 133 fotos; LOLA 5 m, em 127.

Leitura:
1. O cálculo de sombras confere com fotos reais em 94–96% dos pixels nas três regiões.
2. A luz falsa cresce com a grade nas três regiões: de 2–8% (SfS) a 6–14% (240 m).
3. De 20 m para 5 m o ganho é pequeno (0,6–1,2 ponto de acerto nas polares; nenhum em Leibnitz); o SfS acrescenta mais ~0,5 ponto.
4. Nas regiões polares o LOLA 60 m tem acerto global igual ou maior que o 20 m (troca sombra falsa por luz falsa); em Leibnitz não. Causa não investigada.

Ressalvas: o SfS foi ajustado a estas mesmas fotos (vantagem em amostra); Leibnitz não tem terreno além do patch de 16 km (sombras vindas de fora não entram, daí a luz falsa mais alta) e ali 20/60/240 m são médias do LOLA 5 m de referência; nas polares 60/240 m são médias do LDEM 20 m, não os produtos oficiais; limiar de DN único; não há fotos com o Sol de 2026+.
