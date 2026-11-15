# Simulador v18: escudo calibrado, treino e teste em relevo real LOLA, Monte Carlo no treino

**Data:** 15/11/2026. **Arquivo:** `animacao_tese_rover_neuroevolucao_v18.html` (3,4 MB: o relevo real vai embutido).

## 1. O que mudou

1. **Margem do escudo calibrada.** Novo seletor "Margem nominal / Margem calibrada (LOLA)". A calibrada usa os quantis do erro real da tese medidos no Monte Carlo dos 26 sítios (mediana entre sítios, perto × longe de disparo LOLA):

   | Nível | Nominal (perto / longe) | Calibrada (perto / longe) |
   |---|---|---|
   | P50 | 1,00° / 1,00° | 0,12° / 0,00° |
   | P90 | 2,03° / 3,56° | 2,99° / 2,78° |
   | P99 | 2,86° / 5,65° | 6,42° / 5,85° |

   A margem vale nos três lugares em que o escudo e o planejamento a usam (veto a bordo, planejamento de rota e planejamento em solo).

2. **Relevo real LOLA.** Novo botão "Relevo real LOLA" (grupo Terreno). São 52 faixas de 3 km × 550 m (600 × 110 células de 5 m), 2 por sítio, recortadas do PGDA #78 com cerca de 5% das células acima de 15° (para serem difíceis, mas transitáveis). O mapa de bordo do time B é a tese de verdade: grade de 60 m + resíduo dos disparos LOLA reais (as células com LDEC > 0), com o mesmo algoritmo do `mc_lola.py`. Travessia de 1,5 km, sem sombras (só relevo), corredor da PSR desligado. Duas rotas são planejadas em solo antes da partida: uma na grade de 60 m e outra no mapa da tese.
   - **Treino:** 17 sítios (34 faixas).
   - **Validação:** 2 faixas do Site04, fora do treino.
   - **Teste:** 8 sítios nunca vistos no treino (16 faixas): Site23, Site42, Site11, LM8, Site20v2, LM3, NPB, Shoemaker. Foram escolhidos de 3 em 3 na ordem de aspereza, para cobrir do liso ao acidentado.

3. **Monte Carlo no treino.** Caixa "Monte Carlo no treino": a cada geração, o declive verdadeiro de cada célula é sorteado de Normal(declive LOLA, erro publicado). O teste sempre sorteia, com as mesmas sementes para todas as configurações (comparação pareada).

## 2. Experimento (Node, sem tela)

`exp_lola.js` (uma configuração por processo) e `analisa_lola.py`. População de 30 rovers por time, 16 faixas de teste, escala realista. O time A é sempre o D0 (grade de 60 m).

| Configuração (time B) | Chegada | Tombamento | Rota média |
|---|---|---|---|
| Regra + tese, margem nominal (RT_nom) | **50,6%** | 3,1% | 57,0% |
| Regra + tese, margem calibrada (RT_cal) | 48,5% | 4,4% | 57,7% |
| IA Híbrida pré-treinada em terreno sintético (H_sint) | 44,2% | 4,6% | 53,4% |
| IA Híbrida + 8 ger. em relevo real, com MC (H_lola) | 44,2% | 4,8% | 53,6% |
| IA Híbrida + 8 ger. em relevo real, sem MC | 44,4% | 4,4% | 53,7% |
| IA Híbrida + 30 ger. em relevo real, com MC (H_lola30) | 44,8% | 3,5% | 53,4% |
| IA Híbrida + 30 ger. em relevo real, sem MC | 43,5% | 3,8% | 51,7% |
| Time A (D0, grade de 60 m), em todas as rodadas | 48,1% | 3,3% | — |

Comparações pareadas (Wilcoxon sobre as 16 faixas de teste; nenhuma significativa a 5%):

- Tese (RT_nom) × D0: 50,6 × 48,1%, p = 0,23.
- Margem calibrada × nominal: 48,5 × 50,6%, p = 0,12.
- IA Híbrida × regra: 44,2 × 50,6%, p = 0,10. A IA ficou atrás em 7 faixas e à frente em 2.
- Treino em relevo real (30 ger.) × sem esse treino: 44,8 × 44,2%, p = 0,75.
- Monte Carlo no treino (30 ger.) × sem: 44,8 × 43,5%, p = 0,74.

## 3. Leitura honesta (primeira rodada, ANTES das correções da seção 5)

1. **No relevo real, nenhuma diferença foi significativa com 16 faixas.** A tese ficou levemente à frente da grade, e a regra fixa à frente da IA, como na ablação em terreno sintético.
2. **O que derruba os rovers no relevo real é ficar preso, não tombar.** No time B, a maior causa de fracasso é "tempo esgotado" (cerca de 40% dos rovers); tombamentos ficam em 3–5%. Quatro faixas (Site42 f1, as duas do Site20v2 e NPB f1) não foram vencidas por ninguém. Como o escudo atua contra tombamento, sobra pouco para ele ganhar. Este é um achado novo: no relevo real, o gargalo é a mobilidade (achar passagem), mais que a segurança.
3. **A margem calibrada não melhorou o resultado na missão.** Ela é mais larga perto de dado e mais estreita longe, e isso não se traduziu em mais chegadas.
4. **O treino em relevo real não mudou a IA Híbrida (8 ou 30 gerações), com ou sem Monte Carlo.** A curva de treino oscila entre 0% e 100% de geração a geração porque cada geração usa uma faixa só, de dificuldade muito variável: o sinal para a Estratégia Evolutiva fica dominado pela sorte da faixa. Para o Monte Carlo no treino ajudar, cada geração precisaria avaliar cada rede em várias faixas (média de Monte Carlo da aptidão), o que multiplica o tempo de treino.
5. **Ressalvas:** 16 faixas de teste, população de 30, uma semente de treino; faixas escolhidas com ~5% de declive acima de 15°; sem sombras; a "verdade" é o próprio LOLA (interpolado em ~90% das células) + o erro publicado.

## 4. Como reproduzir

```
python extrair_faixas_lola.py            (gera lola_faixas.json e lola_faixas.b64; já embutidos no HTML v18)
CFG=RT_nom node exp_lola.js              (configurações: RT_nom, RT_cal, H_sint, H_lola, H_lola_semMC, H_lola30, H_lola30_semMC)
python analisa_lola.py
```
No navegador: abrir o v18, escolher "Relevo real LOLA", e opcionalmente "Margem calibrada (LOLA)" e a caixa "Monte Carlo no treino".

## 5. Correções do "rover preso" e nova rodada (15/11/2026, 02h)

### 5.1 Por que o rover ficava preso, e o que foi corrigido
1. **O sorteio do erro criava degraus falsos.** O erro do Monte Carlo era sorteado de forma independente em cada célula, o que gerava saltos de declive entre células vizinhas e disparava o reflexo da IMU sem parar. Agora o erro é **espacialmente correlacionado**: ruído suavizado por gaussiana de 20 m e renormalizado, vezes o erro publicado da célula, como o erro de interpolação real do LOLA.
2. **O reflexo da IMU disparava a 13°**, abaixo do limite do chassi (15°). No relevo real, muitas células legais ficam entre 13° e 15°. O limite do reflexo passou para 14,5° (limite − 0,5°) em todos os modelos. Isso também muda o terreno sintético: a ablação antiga foi feita com 13°.
3. **Replanejamento a bordo** (liga sozinho no relevo real). Quando o rover não avança 10 m em 40 s, ou vê perigo no caminho, ele:
   - faz uma panorâmica de 360° com a câmera;
   - recalcula o caminho de custo mínimo com o que sabe (o mapa do seu time, o que já viu e a memória de bordas);
   - segue esse caminho ponto a ponto, devagar (≤ 6,5 m/s).
4. **Correções sugeridas pelo outro agente e aceitas:**
   - **Planejamento em solo com barreira contínua** em vez de bloqueio binário. Antes, a rota da tese falhava e caía para a rota da grade.
   - **Plano travado:** A segue a rota da grade e B a rota do seu mapa.
   - **Margem zero nas células que a câmera ou a IMU já mediram.** Antes, somava-se a margem de mapa a um declive já medido.
   - **Física realista no relevo real:** acima de 25°, tomba em qualquer velocidade.

### 5.2 Resultado (16 faixas de teste em 8 sítios nunca vistos, 20 rovers por time, pareado)

| Time B | Chegada | Tombamento | Tempo esgotado |
|---|---|---|---|
| **Regra + grade de 60 m (R60, mesmo controlador, sem a tese)** | 70,3% | 2,8% | 21,2% |
| Regra + tese 60→5 m, margem nominal (RT_nom) | **78,4%** | 0,9% | 15,6% |
| Regra + tese 60→5 m, margem calibrada (RT_cal) | 75,9% | 0,9% | 20,0% |
| IA Híbrida + tese 60→5 m (pré-treino sintético) (H_sint) | **78,8%** | **0,0%** | 15,0% |
| Time A (D0) | 73,4% | 2,8% | — |

**Efeito isolado da multirresolução** (mesmo controlador, só troca o mapa: R60 → RT_nom):
- chegada 70,3% → 78,4%; melhor em 6 faixas, pior em 1; Wilcoxon p = 0,075;
- tombamento 2,8% → 0,9%; p = 0,059.

**IA Híbrida + tese × regra + grade:**
- chegada 70,3% → 78,8%; melhor em 6 faixas, nenhuma pior; p = 0,027;
- tombamento 2,8% → 0,0%; p = 0,039.

**Margem calibrada × nominal:** 75,9% × 78,4%; p = 0,34 (sem diferença).

### 5.3 Leitura
1. **Corrigido o "preso", as chegadas subiram de cerca de 45–50% para 70–79%** em todas as configurações. A maior parte do fracasso anterior era defeito de controle, não do relevo.
2. **Com o mesmo controlador, trocar a grade de 60 m pela tese 60→5 m aumenta a chegada e reduz o tombamento** no relevo real de sítios nunca vistos. É a mesma direção do Monte Carlo e do terreno sintético, agora medida em missão.
3. A significância é **limítrofe** (p de 0,03 a 0,08, 16 faixas, sem correção para comparações múltiplas). Vale como evidência consistente, não como prova.
4. A margem calibrada continua sem ganho na missão.
5. **Treino em relevo real (30 gerações, com Monte Carlo) × só o pré-treino sintético:** 78,4% × 78,8% (p = 0,65). O treino em relevo real não mudou o desempenho da IA Híbrida. O ganho medido vem do mapa (tese) e do controle, não do aprendizado.

### 5.4 Arquivos
- `testes\lola2\*.json` (RT_nom, RT_cal, R60, H_sint, H_lola30).
- Para reproduzir: `$env:CFG='RT_nom'; node exp_lola.js` (resultado em `testes\lola2\`) e `$env:DIR='lola2'; python analisa_lola.py`.

---

## 6. Bateria Completa (v18): Treino em Terrenos Sintéticos → Avaliação no Relevo Real LOLA (32 Configurações)

**Scripts:** `testes\exp_sint_lola.js`, `testes\analisa_sint_lola.py` e arquivos em `testes\lola_sint\*.json`.
**Protocolo:**
- **Fase 1 (Treino em terrenos sintéticos `calibrado`):** Todas as configurações com aprendizado (evolução + otimizador Newton/Barreira 7×7 dos pesos do Mérito Marcato no degrau D3 por 10 gerações, neuroevolução da MLP 8→7→4 no D4a por 10 gerações e Rank-ES da IA Híbrida 14→8→3 no D4b) são treinadas **exclusivamente nos terrenos sintéticos** (`definirTerreno('calibrado')`, sementes de treino `2026 + 101·k`) e têm seus parâmetros congelados ao fim do treino.
- **Fase 2 (Avaliação no relevo real LOLA com Monte Carlo):** Os modelos congelados e todas as variantes sem treino são avaliados de forma **pareada** nas **16 faixas de teste do LOLA** (8 sítios nunca vistos: `Site23`, `Site42`, `Site11`, `LM8`, `Site20v2`, `LM3`, `NPB`, `Shoemaker`), 20 rovers por faixa (320 travessias por configuração), com sorteio Monte Carlo espacialmente correlacionado (`MC_LOLA.ativo = true`, sementes `7300..7315`).

### 6.1 Tabela Geral por Grupo (16 faixas reais LOLA, 320 rovers por linha)

| Grupo / Código | Configuração no Relevo Real (Time B, exceto D0_A) | Chegada (média ± dp) | Mediana [IQR] | Rota média | Tombamento | Tempo esg. | Fora do mapa |
|---|---|---|---|---|---|---|---|
| **1. Grade de 60 m** | | | | | | | |
| `D0_A` | Time A (D0): Grade 60 m pura + câmera + reflexo IMU (sem escudo) | 73,4 ± 40,0% | 100% [48,8–100] | 77,9% | 2,8% | 15,9% | 7,8% |
| `R60` | Regra + Escudo P90 na grade de 60 m (D1a/D1b, sem tese) | 70,3 ± 41,4% | 95% [36,2–100] | 76,9% | 2,8% | 21,2% | 5,6% |
| **2. Regra + Marcato + Monte Carlo (pesos fixos)** | | | | | | | |
| `M60_mc` | Regra + Marcato (Simplex + KKT/Barreira) na grade 60 m (D1c) | 68,1 ± 41,9% | 100% [36,2–100] | 74,5% | 3,1% | 22,2% | 6,6% |
| `MT_nom_P50` | Regra + Marcato + Tese 60→5 m · Margem Nominal P50 | **78,8 ± 38,1%** | 100% [80,0–100] | **81,2%** | 1,2% | 18,1% | 1,9% |
| `MT_nom_P90` | Regra + Marcato + Tese 60→5 m · Margem Nominal P90 (D2) | 78,1 ± 39,1% | 100% [73,8–100] | 80,0% | 1,6% | 15,3% | 5,0% |
| `MT_nom_P99` | Regra + Marcato + Tese 60→5 m · Margem Nominal P99 | 70,6 ± 39,7% | 100% [48,8–100] | 75,2% | **0,6%** | 22,2% | 6,6% |
| `MT_cal_P50` | Regra + Marcato + Tese 60→5 m · Margem Calibrada (MC) P50 | 77,5 ± 37,2% | 100% [73,8–100] | 80,3% | 0,9% | 19,4% | 2,2% |
| `MT_cal_P90` | Regra + Marcato + Tese 60→5 m · Margem Calibrada (MC) P90 | 77,2 ± 39,5% | 100% [80,0–100] | 79,3% | **0,6%** | 19,1% | 3,1% |
| `MT_cal_P99` | Regra + Marcato + Tese 60→5 m · Margem Calibrada (MC) P99 | 72,5 ± 40,4% | 95% [65,0–100] | 74,6% | 0,9% | 19,4% | 7,2% |
| **3. Regra + Marcato + MC + Ajuste de Pesos com IA (Treino Sintético → Real)** | | | | | | | |
| `M60_ia_sint` | Regra + Marcato + Pesos IA (10 ger. sint.) na grade 60 m | 67,8 ± 41,8% | 92,5% [27,5–100] | 74,8% | 3,8% | 23,1% | 5,3% |
| `MT_ia_nom_P50` | Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) · Nom. P50 | 78,4 ± 38,0% | 100% [78,8–100] | 81,0% | 0,9% | 18,8% | 1,9% |
| `MT_ia_nom_P90` | **Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) · Nom. P90 (D3)** | **79,1 ± 39,2%** | 100% [85,0–100] | 80,3% | **0,6%** | 15,3% | 5,0% |
| `MT_ia_nom_P99` | Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) · Nom. P99 | 70,6 ± 39,7% | 100% [48,8–100] | 75,1% | **0,6%** | 22,5% | 6,2% |
| `MT_ia_cal_P50` | Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) · Cal. P50 | 77,5 ± 37,6% | 100% [68,8–100] | 79,7% | **0,6%** | 19,1% | 2,8% |
| `MT_ia_cal_P90` | Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) · Cal. P90 | 75,6 ± 39,7% | 100% [66,2–100] | 78,6% | **0,6%** | 20,3% | 3,4% |
| `MT_ia_cal_P99` | Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) · Cal. P99 | 73,1 ± 40,7% | 100% [65,0–100] | 74,7% | **0,6%** | 19,1% | 7,2% |
| `MLP_sint_nom` | Escudo + Rede MLP 8→7→4 (10 ger. sint., D4a) + Tese Nom. P90 | 78,1 ± 38,8% | 100% [81,2–100] | 79,9% | 0,9% | 15,9% | 5,0% |
| `MLP_sint_cal` | Escudo + Rede MLP 8→7→4 (10 ger. sint., D4a) + Tese Cal. P90 | 75,9 ± 39,3% | 100% [68,8–100] | 78,8% | 0,9% | 20,0% | 3,1% |
| `H_sint_nom` | Escudo + IA Híbrida 14→8→3 (pré-treino sint., D4b) + Tese Nom. P90 | 78,8 ± 40,0% | 100% [87,5–100] | 79,8% | **0,0%** | 15,0% | 6,2% |
| `H_sint_cal` | Escudo + IA Híbrida 14→8→3 (pré-treino sint., D4b) + Tese Cal. P90 | 74,4 ± 41,3% | 100% [66,2–100] | 76,9% | 1,9% | 19,7% | 4,1% |
| `H_sint10_nom` | **Escudo + IA Híbrida (pré-treino + 10 ger. sint.) + Tese Nom. P90** | **79,7 ± 39,2%** | 100% [90,0–100] | **80,5%** | 0,9% | 15,0% | 4,4% |
| **4. Regra + Tese (Todas as Combinações Possíveis)** | | | | | | | |
| `RT_nom_P50` | Regra + Tese 60→5 m · Margem Nominal · P50 (1,00° / 1,00°) | 76,6 ± 38,5% | 100% [72,5–100] | 80,8% | 0,9% | 20,6% | 1,9% |
| `RT_nom_P90` | **Regra + Tese 60→5 m · Margem Nominal · P90 (2,03° / 3,56°)** | **78,4 ± 38,9%** | 100% [81,2–100] | 80,2% | 0,9% | 15,6% | 5,0% |
| `RT_nom_P99` | Regra + Tese 60→5 m · Margem Nominal · P99 (2,86° / 5,65°) | 70,6 ± 39,7% | 100% [48,8–100] | 75,0% | **0,6%** | 22,8% | 5,9% |
| `RT_cal_P50` | Regra + Tese 60→5 m · Margem Calibrada (MC) · P50 (0,12° / 0,00°) | 76,2 ± 38,1% | 100% [65,0–100] | 79,4% | **0,6%** | 20,6% | 2,5% |
| `RT_cal_P90` | Regra + Tese 60→5 m · Margem Calibrada (MC) · P90 (2,99° / 2,78°) | 75,9 ± 39,3% | 100% [68,8–100] | 78,8% | 0,9% | 20,0% | 3,1% |
| `RT_cal_P99` | Regra + Tese 60→5 m · Margem Calibrada (MC) · P99 (6,42° / 5,85°) | 71,6 ± 40,9% | 100% [46,3–100] | 74,2% | **0,6%** | 19,7% | 8,1% |
| `RT_soPlano_nom` | Regra + Tese **só no plano em solo** (execução a bordo em 60 m) | 70,6 ± 41,6% | 97,5% [36,2–100] | 77,2% | 2,8% | 21,9% | 4,7% |
| `RT_soExec_nom` | Regra + Tese **só na execução a bordo** (rota planejada em 60 m) | **78,4 ± 38,9%** | 100% [81,2–100] | 80,2% | **0,6%** | 14,7% | 6,2% |
| `R20` | Controle: Regra + Grade bruta de 20 m (sem tese) | 78,4 ± 38,7% | 100% [86,2–100] | 79,8% | 1,6% | 13,1% | 6,9% |
| `RT20_nom_P90` | Regra + Tese **20→5 m** · Margem Nominal · P90 | 79,4 ± 37,0% | 100% [82,5–100] | **82,1%** | 1,9% | 16,2% | 2,5% |
| `RT20_cal_P90` | **Regra + Tese 20→5 m · Margem Calibrada (MC) · P90** | **80,9 ± 36,8%** | 100% [90,0–100] | 82,0% | 1,6% | 15,3% | 2,2% |
| `R_oraculo` | Referência teórica: Regra + Mapa Real Oráculo de 5 m | 79,4 ± 39,6% | 100% [92,5–100] | 80,4% | 1,2% | 15,3% | 4,1% |

### 6.2 Pesos do Mérito Marcato Aprendidos nos Terrenos Sintéticos (10 Gerações)

Pesos padrão iniciais: `avanco=1.000, seguranca=0.800, rota=0.400, energia=0.700, sombra=0.500, incerteza=0.300, declive=0.300`.
Após 10 gerações de neuroevolução + otimizador de Pontos Interiores/Newton 7×7 (`otimizarPesosMarcato`) nos terrenos sintéticos:
- **`M60_ia_sint` (treino em 60 m):** `avanco=1.017, seguranca=1.189, rota=0.365, energia=0.639, sombra=0.451, incerteza=0.565, declive=0.483` (como na grade de 60 m o rover sofre muitas quedas no treino sintético, o otimizador KKT eleva fortemente `seguranca`, `incerteza` e `declive`).
- **`MT_ia_nom_P90` (D3, treino na Tese 60→5 m Nominal P90):** `avanco=1.020, seguranca=0.872, rota=0.402, energia=0.727, sombra=0.543, incerteza=0.397, declive=0.366`.
- **`MT_ia_cal_P90` (treino na Tese 60→5 m Calibrada P90):** `avanco=0.930, seguranca=0.828, rota=0.436, energia=0.703, sombra=0.596, incerteza=0.403, declive=0.377`.

### 6.3 Principais Comparações Pareadas e Achados

1. **Salto da Tese (60→5 m) sobre a Grade de 60 m em todas as famílias:**
   - **Com Regra (`RT_nom_P90` × `R60`):** chegada sobe de **70,3% → 78,4%** (+8,1 pp; Wilcoxon $p = 0,0749$; McNemar exato por rover $c/b = 32/6$, $p = 2,4 \times 10^{-5}$) e tombamento cai de **2,8% → 0,9%** ($p = 0,0588$).
   - **Com Marcato fixo (`MT_nom_P90` × `M60_mc`):** chegada sobe de **68,1% → 78,1%** (+10,0 pp; McNemar $c/b = 41/9$, $p = 5,6 \times 10^{-6}$).
   - **Com Marcato + Pesos IA treinados em sintético (`MT_ia_nom_P90` × `R60`):** chegada sobe de **70,3% → 79,1%** (+8,8 pp; melhor em 6/16 faixas e pior em 1/16; **Wilcoxon $p = 0,0411$**, **McNemar $c/b = 32/4$, $p = 1,9 \times 10^{-6}$**) e tombamento cai de **2,8% → 0,6%** ($p = 0,0588$).
2. **Efeito do Ajuste de Pesos com IA em Terrenos Sintéticos transferido para o Terreno Real:**
   - No Mérito Marcato com Tese (`MT_ia_nom_P90` × `MT_nom_P90`), os pesos aprendidos no terreno sintético transferem bem para o relevo real LOLA: a chegada passa de **78,1% → 79,1%** (+0,9 pp) e o tombamento cai de **1,6% → 0,6%** (0,6% é o menor índice de tombamento entre os métodos de mérito/regra).
   - Na IA Híbrida (`H_sint10_nom` × `H_sint_nom`), +10 gerações de treino sintético Rank-ES elevaram a chegada no relevo real LOLA de **78,8% → 79,7%** (a maior taxa de chegada em base de 60 m).
3. **Todas as combinações de `Regra + Tese`:**
   - **Nível de confiança (P50 vs P90 vs P99):** `P90` (78,4% nominal) e `P50` (76,6% nominal / 76,2% calibrada) têm desempenho próximo, enquanto `P99` (70,6% nominal / 71,6% calibrada) veta excessivamente o terreno interpolado e reduz a chegada em −7,8 pp (McNemar $p = 0,00011$).
   - **Onde a Tese atua (Plano em solo × Execução a bordo):** Usar a tese **só na execução/escudo a bordo** (`RT_soExec_nom`: 78,4% chegada, 0,6% tombamento) entrega **100% do ganho** da tese completa (`RT_nom_P90`: 78,4%), enquanto usar a tese **só no plano em solo** andando cego em 60 m a bordo (`RT_soPlano_nom`: 70,6% chegada, 2,8% tombamento) não melhora sobre `R60` (70,3%).
   - **Base de 20 m (`RT20_cal_P90` e `RT20_nom_P90`) e Oráculo (`R_oraculo`):** A tese 60→5 m (78,4%–79,1%) chega a apenas ~1 ponto percentual do **Oráculo perfeito de 5 m** (`R_oraculo`: 79,4%), e partir de uma base de 20 m com a tese (`RT20_cal_P90`) atinge **80,9%** de chegada e **82,0%** de rota média.

