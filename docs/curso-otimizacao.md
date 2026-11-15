# Curso de Métodos de Otimização (Prof. André Marcato, UFJF)

Playlist: https://www.youtube.com/playlist?list=PLz7tpQ4EY_nek7dQhRTelJsC3RSJ7Znyf

## Aulas

| Aula | Tema |
|---|---|
| 01 | Introdução |
| 02 | Python e Otimização |
| 03 | Método Gráfico |
| 04 | Formulação Padrão e Representação Matricial |
| 05 | Simplex |
| 06 | Big M |
| 07 | Duas Fases |
| 08a | Dualidade |
| 10 | Newton monovariado |
| 11 | Newton multivariado |
| 12 | Não linear restrita |
| 13 | Pontos Interiores |
| 15a–d | Programação Dinâmica (caminho mínimo progressivo e regressivo, recursividade, Python) |
| 16 | Branch and Bound |
| 17 | Algoritmos Genéticos |

## Onde cada técnica entra

**Ponto principal:** escolher "a melhor janela de 10 dias em 2027" é só deslizar uma janela por ~8.760 horas e avaliar cada uma, o que leva milissegundos. **Não forçar Simplex onde força bruta resolve.**

| Problema | Técnica |
|---|---|
| Ranking de janelas por várias métricas (horas de Sol, horas de DTE, maior período no escuro) | **Fronteira de Pareto**. Os sliders de peso são a soma ponderada. |
| Restrições duras: maior escuridão ≤ autonomia da bateria; Sol e Terra visíveis nas primeiras N horas após o pouso | Filtros e restrições |
| Plano de operação (quando fazer ciência e quando transmitir) com o estado da bateria hora a hora | **Programação Linear** (`scipy.optimize.linprog` / HiGHS). Pela dualidade, o preço-sombra mostra quanto vale 1 Wh a mais de bateria. |
| Bateria discretizada ao longo do tempo | **Programação Dinâmica** (caminho mínimo, Aula 15) |
| Escolher k sítios para uma campanha | **Branch and Bound** (variáveis binárias) |

Ficam de fora: algoritmos genéticos e Newton.

A otimização **não é pedida pelo desafio**. Ela é um diferencial, para depois de o núcleo estar funcionando.
