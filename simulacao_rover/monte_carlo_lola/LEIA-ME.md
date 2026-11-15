# Monte Carlo da tese com dados LOLA reais (NASA PGDA #78)

Roda **no seu computador**, com os dados oficiais que já estão em `dados/acervo_tese/02_PGDA_78_5M/`. Cada etapa aparece
no terminal, e no fim sai um relatório HTML com mapas, tabelas, testes estatísticos e o registro completo da execução.

## Como rodar (na pasta `C:\NASA PROJETO 2026`)

```
python simulacao_rover\monte_carlo_lola\mc_lola.py --sitio Site20v2
```
Um sítio leva ~10 s. Para todos os sítios da pasta, com a tabela comparativa entre eles:
```
python simulacao_rover\monte_carlo_lola\rodar_todos.py
```
Opções do `mc_lola.py`: `--sitio` (Site20v2, Site01, Haworth…), `--grossa 60` (ou 20), `--recorte 2000` (células de 5 m do
recorte central; `0` = sítio inteiro, mais lento), `--dobras 5`, `--sorteios 100`, `--limite 15`, `--semente 2026`.

Requisitos: numpy, scipy, matplotlib (já estão no `requirements.txt`). `tifffile` é opcional.

## O que sai
`simulacao_rover\monte_carlo_lola\resultados\<sítio>\`
- `relatorio.html` — abrir no navegador (bom para prints)
- `fig1_mapas.png`, `fig2_erros.png`, `fig3_perigo_falso_alarme.png`, `fig4_calibracao.png`
- `metricas_por_sorteio.csv` — uma linha por sorteio × método
- `resumo.json` — parâmetros, resultados, testes e margens calibradas
- `log.txt` — tudo o que apareceu no terminal

`rodar_todos.py` também gera `resultados\RESUMO_SITIOS.html` e `resumo_sitios.csv`.

## Sugestão de prints para documentar
1. O terminal durante a execução (etapas 1 a 7).
2. Seção 2 do relatório (mapas: LOLA, grade, tese e células com disparo).
3. Seção 3 (tabela e gráfico de perigo não vetado × falso alarme).
4. Seção 5 (calibração das margens).
5. `RESUMO_SITIOS.html` (comparação entre sítios).

## O que o teste faz, em uma frase por etapa
1. Lê as camadas oficiais (`surf`, `ldec`, `slp`, `slperr`) e confere que o declive recalculado bate com o oficial.
2. Monta a grade grossa de 60 m (média por blocos) e a interpola de volta para 5 m.
3. Tese: grade + correção local só onde há disparo LOLA; validação cruzada escondendo 1/5 das células medidas por vez.
4. Monte Carlo: sorteia o declive verdadeiro de cada célula conferida como Normal(slp, slperr), o erro oficial da NASA.
5. Calibra as margens P50/P90/P99 pelos quantis reais do erro (com sorteios separados dos de avaliação).
6. Resume: perigo real não vetado, falso alarme e cobertura, com intervalo de 95%; McNemar, Wilcoxon e Spearman.
7. Gera figuras e o relatório.

## Resultados já conferidos (14/11/2026)
| Sítio | Perigo > 15° NÃO vetado: grade 60 m | tese P90 (margem do simulador) | tese P90 calibrada | falso alarme tese P90 |
|---|---|---|---|---|
| Site20v2 (Mons Mouton, VIPER) | 29,6% | 7,3% | 3,7% | 20,4% |
| Site01 (Connecting Ridge) | 27,7% | 4,6% | 3,4% | 19,6% |

## Limites
- Só células com disparo LOLA servem de verdade (as demais do LOLA também são interpoladas).
- O sorteio usa o erro RMS por célula como Normal independente; os 100 clones de erro correlacionado do PGDA (>150 GB) não estão no projeto.
- A "tese" é uma implementação de referência da mesma ideia do simulador, aplicada a dado real.
