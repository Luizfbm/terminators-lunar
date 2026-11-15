# Rodada do Mérito (Marcato) em relevo real — 15/11/2026

Mesmas 16 faixas LOLA de teste (8 sítios × 2 faixas), mesmas sementes, mapa tese 60→5 m, margem nominal, replanejamento a bordo, 20 rovers por faixa (320 travessias por configuração).

| Configuração | Chegada | Tombamento | Rota percorrida |
|---|---|---|---|
| Mérito, pesos fixos (padrão) | 78,1% | 1,6% | 80,0% |
| Mérito, pesos otimizados SEM Monte Carlo (15 gerações) | 77,5% | 1,2% | 79,8% |
| Mérito, pesos otimizados COM Monte Carlo (15 gerações) | 78,8% | 0,6% | 80,3% |
| Regra (referência, RT_nom) | 78,4% | 0,9% | 80,2% |
| IA Híbrida, 30 gerações com MC | 78,4% | 0,9% | 79,5% |
| Grade 60 m (R60) | 70,3% | 2,8% | 76,9% |
| Rover A (referência) | 73,4% | 2,8% | — |

Wilcoxon pareado (16 faixas): MC × fixo p=0,32; MC × sem MC p=0,10; sem MC × fixo p=0,16; MC × regra p=0,32; MC × IA Híbrida p=0,71.

Leitura: a otimização de pesos com MC dá a melhor média e o menor tombamento (0,6%), e sem MC fica abaixo dos pesos fixos, mas nenhuma diferença é estatisticamente significativa (a melhor, MC × sem MC, p≈0,10, tendência). Todas as configurações com mapa 60→5 m ficam em 77–79%; o salto está no mapa (70,3% → ~78%), não nos pesos nem na rede.
Pesos aprendidos (com MC): avanço 1,03, segurança 0,89, energia 0,81, sombra 0,49, rota 0,37, declive 0,24, incerteza 0,23. Sem MC: avanço 1,06, segurança 0,80, energia 0,73, sombra 0,47, rota 0,44, incerteza 0,32, declive 0,30.
Limitação: 15 gerações, população 20, uma execução por configuração.
