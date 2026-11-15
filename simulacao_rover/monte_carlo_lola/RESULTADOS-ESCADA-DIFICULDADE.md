# Escada de dificuldade em relevo real — onde a tese se destaca (15/11/2026)

## Motivação
No teste base, tudo que usa o mapa 60→5 m termina em 77–79% de chegada e a grade bruta de 60 m chega a 66–70%: o teste é fácil (≈5% das células >15°), o rover tem câmera, replanejamento e reflexos, e ~20% das travessias falham por "tempo esgotado" / "fora do mapa" em qualquer mapa (teto compartilhado). Para ver onde o mapa importa, a dificuldade foi aumentada em degraus.

## Desenho
Mesmas 16 faixas de teste LOLA (8 sítios × 2), mesmas sementes, população 30 por configuração (480 travessias por célula da tabela), margem nominal, sem treino (regra, Mérito com pesos padrão e IA Híbrida pré-treinada) — os 4 métodos são comparados pareados por faixa.

| Nível | Mudança | Células >15° |
|---|---|---|
| 0 | Base | 4,9% |
| 1 | **Terreno perigoso:** relevo das faixas × 1,3 (exagero vertical; as faixas reais já extraídas só têm ~5% de perigo, exceto uma) | 20,1% |
| 2 | Nível 1 + **metade das dificuldades:** erro real do declive ×1,5 (além do publicado); alcance da câmera ×0,75; replanejamento mantido | 20,1% |
| 3 | Nível 1 + **todas:** erro real ×2; câmera degradada (alcance ×0,5 e 35% de leituras perdidas); **sem replanejamento a bordo** | 20,1% |

Limitação: o terreno perigoso é sintético (derivado do real por exagero vertical), não faixas reais mais íngremes; o erro maior que o publicado representa incerteza não modelada pelo planejador.

## Resultados (chegada à meta / tombamento)
| Nível | Rover A (original) | Grade 60 m | **Tese 60→5 m (regra)** | Mérito (pesos fixos) | IA Híbrida |
|---|---|---|---|---|---|
| 0 | 71,7% / 2,3% | 66,5% / 3,1% | 77,3% / 1,2% | 78,1% / 1,2% | 77,7% / 2,3% |
| 1 | 33,3% / 10,0% | 34,2% / 8,5% | 47,5% / 8,3% | 48,1% / 8,3% | 46,2% / 13,3% |
| 2 | 27,9% / 13,3% | 33,1% / 15,4% | 44,2% / 12,7% | 43,8% / 10,4% | 42,9% / 12,5% |
| 3 | 21,7% / 45,4% | 30,8% / 18,3% | 40,0% / 16,5% | 38,3% / 15,0% | 32,5% / 11,5% |

Wilcoxon pareado (16 faixas), tese × grade 60 m, chegada: N0 +10,8 pts (p=0,12); N1 +13,3 (p=0,068); N2 +11,0 (p=0,018); N3 +9,2 (p=0,043). Mérito × grade: N1 +14,0 (p=0,027), N2 +10,6 (p=0,018), N3 +7,5 (p=0,028). Tese × Mérito: diferenças ≤1,7 pt, sem significância em nenhum nível. Tese × IA Híbrida: +7,5 pt no N3 (p=0,18, não significativo).

## Leitura
1. **A vantagem do mapa multirresolução se mantém em todos os níveis** (+9 a +13 pontos de chegada sobre a grade 60 m) e passa a ser estatisticamente significativa nos níveis 2 e 3 (no base, p=0,12). Em termos relativos ela dobra: +16% sobre a grade no nível 0 e +30% no nível 3.
2. **O ganho absoluto NÃO cresce com a dificuldade** neste desenho: a hipótese "mais incerteza amplia a diferença" só se confirma em termos relativos e em significância estatística (mais faixas com ganho consistente), não em pontos absolutos.
3. **Tombamento:** a vantagem da tese sobre a grade em tombamento (−1,9 pt no N0) desaparece com terreno perigoso (8,3% × 8,5% no N1); com a dificuldade total o mapa melhora a chegada, mas o tombamento continua alto (16,5% × 18,3%). Quem derruba o tombamento nos níveis difíceis é o sistema do rover (replanejamento/câmera), não o mapa: o rover A despenca para 45% de tombamento no N3.
4. **Mérito e regra ficam empatados em todos os níveis; a IA Híbrida só diverge no N3** (32,5% × 40,0%, p=0,18), consistente com o achado de que aprender não superou a regra simples.
5. O teto compartilhado ("tempo esgotado"/"fora do mapa") persiste e continua escondendo parte da diferença.

## Reprodução
`exp_dif.js` (env CFG, NIV, POP) → `lola4/<cfg>_N<nível>.json`; `analise_dif.txt`. Configurações: RT_nom, R60, M_fixo, H_sint.
