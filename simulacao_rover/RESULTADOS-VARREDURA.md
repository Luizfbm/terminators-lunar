# Varredura "onde a IA mais se destaca" (14/11/2026)

Código: v11 (sua versão + painel de pesos/validação), **sem alterar a simulação**. Cada cérebro treina 10 gerações
(terrenos aleatórios) e é medido em 3 terrenos inéditos (900001–3). 4 rotas, P90, Tese 60→5 m, 1 semente por célula.
Resultado = % da rota percorrida (média de 60 rovers) / % que chega à PSR. A (sem tese) faz 7–9% em todos.

| Modelo | Hibernação | Regra P90 | Só IA | IA + Escudo | Mérito + Escudo |
|---|---|---|---|---|---|
| Padrão | grátis | 62% / 42% | 61% / 15% | 61% / 39% | (ver teste anterior: 76% / 59%) |
| Padrão | real 50 h | 9% / 0% | 29% / 0% | 9% / 0% | 9% / 0% |
| Leve | grátis | 52% / 16% | 61% / 13% | 42% / 6% | — |
| Leve | real 50 h | 8% / 0% | 42% / 6% | 9% / 0% | 9% / 0% |
| VIPER calibrado | real 50 h | 6% / 0% | 15% / 0% | 7% / 0% | — |

Observação: o botão de teste "escudo só de relevo" (iaRelevo) não é comparável na sua versão (60–73% de perdas por energia), então ficou fora da conclusão.
