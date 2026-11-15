# Pacote de resultados — comparação SfS × LOLA e validação com fotos LROC (15/11/2026)

Material pronto para o relatório da tese e para o próximo agente continuar.
Documento editável com o texto completo: **"Resultados — comparação SfS × LOLA e validação com fotos LROC"** (artifact no claude.ai: https://claude.ai/artifact/1DCitY9vsUYTbFmWeCmBma). Cópia em Markdown: `RESULTADOS-SFS.md`.

## Conteúdo
| Arquivo | O que é |
|---|---|
| `RESULTADOS-SFS.md` | Texto completo dos resultados (resumo, método, 4 resultados, limitações) |
| `fig1_mapas_iluminacao_sfs_lola.png` | Mapas de iluminação SfS, diferença SfS − LOLA e dispersão, 3 regiões |
| `fig2_luz_falsa_por_grade.png` | Luz falsa (erro perigoso) por resolução, 486 fotos |
| `fig3_margens_perigos_nao_vistos.png` | Perigos > 15° não vistos: grade 60 m × LOLA 5 m + P50/P90/P99 |
| `fig4_exemplo_foto_vs_previsao.png` | Exemplo visual: foto LROC × sombra prevista (SfS, LOLA 20 m, LOLA 240 m) |
| `dados/tabela_validacao_fotos.csv` | Acerto, luz falsa e sombra falsa por região e terreno |
| `dados/tabela_margens.csv` | Perigos não vistos por método e região |
| `dados/fotos_todas.csv` | Resultado por foto (486 linhas, contagens TP/TN/FP/FN por terreno) |
| `dados/sfs_comparacao_sitios.csv` | Iluminação, DTE e horizonte por observador (2.523 linhas) |
| `codigo/` | Ray-marcher (`ray.c`, `lib.py`), efemérides sem SPICE (`eph.py`), corridas (`run.py`, `photo2.py`) e figuras (`figs.py`, `figs2.py`, `fig4.py`) |

## Para o próximo agente
- Contexto completo: `claude/HANDOFF-SFS.md` e `claude/COMPARACAO-SFS.md` no projeto "NASA 2026".
- Os scripts esperam os dados em `/mnt/user-data/uploads/NASA PROJETO 2026/...` (pacotes SfS, `LDEM_875S_20M.IMG`, kernels em `dados/kernels/`, `precalc/ephem_*.npy`). Ajuste `B` em `codigo/load.py` para rodar em outro lugar. `ray.c` compila com `gcc -O3 -fopenmp -shared -fPIC -o libray.so ray.c -lm`.
- Pendências (não feitas): abrir `src/cockpit_missao_lunar.html` no navegador e testar após o commit 4d7f78f; medir o funil com a 8ª etapa (era 31 viáveis); atualizar `RELATORIO.md` §6.2, `precalc/RESULTADOS.md` e `CONTEXTO-AGENTE.md` com o motor corrigido (65,9 / 71,6 / 54,4% em vez de 68,4 / 75,9 / 53,8%); regenerar `precalc/scan_coarse.npy` e figuras; recalcular os 97,7% / 98,3% de assertividade.
- Atenção: `sfs_comparacao/RELATORIO-SFS.md` (pasta acima) ainda tem o parágrafo antigo da tabela de calibração (43%/18% nas coordenadas antigas). Vale o texto deste pacote.
