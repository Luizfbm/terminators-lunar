# Ablação em degraus + validação com o Pragyan (v15, 14/11/2026)

Simulador: `animacao_tese_rover_neuroevolucao_v15.html` (base: v14). Terreno calibrado, escala realista (1 cm/s), hibernação real (≤ 50 h), corredor da PSR ativo, P90, modelo Padrão.
Estatística completa (descritiva de todas as métricas): `ESTATISTICA-ABLACAO.md`. Scripts: `testes/teste18.js` (ablação), `testes/estat.py`, `pragyan/validar_pragyan.py`.

## 1. Diagnóstico: o "preso" de 72–85%
- O rover B ficava preso **no começo da rota** (x < 600 m), com **bateria ≈ 95%**, num vaivém entre o reflexo da IMU e o desvio da zona vetada.
- O v14 tinha dado a **fuga inteligente** (voltar ao último ponto seguro iluminado e tentar o lado ainda não tentado) **só ao rover A**. No v15 ela vale para A e B (mesmo equipamento; chave `S.fugaB`).
- Efeito (4 terrenos de diagnóstico): presos do B 189 → 0. Nos 30 terrenos da ablação: preso ≤ 1,6% em todos os degraus.

## 2. Degraus (uma ferramenta por vez) — o que entrou e o que ficou fora
| Degrau | Ferramenta | Como é ligada (time B) |
|---|---|---|
| D0 | Base ingênua: grade 60 m + câmera + reflexo | rover A |
| D1a | + Restrições duras / escudo P90 / portos ≤ 50 h (em 60 m) | Regra, previsão "60 m bruto", planejador grade 60 m |
| D1b | + Simplex duas fases / dualidade (preço-sombra) no planejamento (60 m) | idem, planejador com Simplex |
| D1c | + Barreira logarítmica + Newton/KKT (Mérito Marcato), ainda em 60 m | Mérito, 60 m bruto |
| D2 | + Multirresolução 60→5 m (P90, No False Relief) | Mérito, Tese 60→5 m |
| D3 | + Pesos do mérito aprendidos offline (10 ger. em terrenos de treino, 1 vetor congelado) | Mérito, pesos evolutivos → fixos |
| D4a | + Neuroevolução MLP 8→7→4 sob escudo (10 ger., congelada) | IA MLP + Escudo |
| D4b | + IA Híbrida 14→8→3 pré-treinada sob escudo direcional | IA Híbrida |
| C2r | controle: multirresolução **sem** Mérito (para separar os dois efeitos) | Regra, Tese 60→5 m |

**Fora (não existem como módulo separável no simulador):** Branch & Bound, Programação Dinâmica/A* na grade, Monte Carlo para calibrar os quantis P50/P90/P99, ML sobre coeficientes 60→5 m. O Monte Carlo aparece na forma de 60 rovers com sementes pareadas e, na validação do Pragyan, 500 sorteios.

## 3. Resultado — 30 terrenos NOVOS pareados (sementes 7101–7130; nunca usados em treino nem nos 3 de teste da página)
Chegada à PSR (% dos 60 rovers por terreno): média ± dp | mediana [IQR]

| D0 | D1a | D1b | D1c | **D2** | D3 | D4a | D4b |
|---|---|---|---|---|---|---|---|
| 0,4 ± 1,6 · 0 [0–0] | 53,0 ± 22,1 · 56,7 [32,9–69,2] | 53,0 ± 22,1 (idêntico) | 56,3 ± 21,5 · 57,5 [43,8–70,0] | **95,2 ± 7,7 · 98,3 [93,3–100]** | 95,9 ± 5,6 · 98,3 [96,7–100] | 90,9 ± 19,7 · 98,3 [95,4–100] | 82,1 ± 29,7 · 96,7 [87,5–98,3] |

Transições Com × Sem (Wilcoxon pareado por terreno, N = 30; McNemar exato por rover pareado, 1.800 pares; p com correção de Holm):

| Transição | Δ PSR [IC 95%] | Wilcoxon p (Holm) | r rank-biserial | McNemar b/c, p (Holm) | Leitura |
|---|---|---|---|---|---|
| D0 → D1a | +52,6 [+45,0; +60,1] | 1,6·10⁻⁵ | +1,00 | 1/948, 3,6·10⁻²⁸² | escudo + restrições: grande ganho |
| D1a → D1b | 0,0 | 1 | 0 | 0/0 | **Simplex não muda nada**: escolheu a mesma rota nos 30 terrenos |
| D1b → D1c | +3,3 [+0,2; +6,4] | 0,068 (0,34) | +0,39 | 301/360, 0,024 (0,096) | Mérito em 60 m: ganho pequeno, **não significativo após Holm** |
| **D1c → D2** | **+38,9 [+31,8; +46,4]** | **1,6·10⁻⁵** | **+1,00** | **47/748, 1,4·10⁻¹⁶²** | **multirresolução: maior salto, mesmo após o Marcato** |
| D2 → D3 | +0,7 [−0,8; +2,6] | 0,81 (1) | +0,06 | 56/69, 0,28 (0,85) | pesos aprendidos: sem ganho (teto) |
| D3 → D4a | −5,1 [−11,6; −0,1] | 0,67 (1) | −0,10 | 146/55, 5,2·10⁻¹⁰ | MLP: **piora** (por rover), sobretudo congelamento > 50 h |
| D3 → D4b | −13,9 [−25,2; −3,9] | 0,025 (0,15) | −0,52 | 307/57, 9·10⁻⁴² | IA Híbrida: **piora**; menos quedas, mais congelamento e saídas do corredor |
| D1b → C2r | +42,2 [+34,8; +49,3] | 1,6·10⁻⁵ | +1,00 | 40/799, 2·10⁻¹⁸³ | multirresolução sozinha já dá o salto |
| C2r → D2 | +0,1 | 0,99 (1) | 0,00 | 66/67, 1 | Mérito sobre a tese: sem ganho |

Causas de perda nos últimos degraus (1.800 rovers): D2 → congelou 54, tombou 28; D4a → congelou 123, preso 21; D4b → **congelou 231**, fora do corredor 53, preso 29, tombou só 8.
A IA Híbrida é a que **menos cai em relevo** (0,4% contra 1,7% do D2), mas o escudo direcional dela não tem as regras de energia, então ela fica mais tempo no escuro.

**O custo dos planejadores prevê o resultado?** Dentro de cada terreno, a ordem das 4 rotas pelo custo previsto concorda com a ordem pelo custo real: τ de Kendall médio **+0,18 na grade 60 m** contra **+0,69 na tese**; a tese escolhe a rota de menor custo real em **20/30** terrenos, a grade em **5/30**. Entre terrenos, porém, o custo da rota escolhida não prevê a chegada à PSR (ρ = +0,22, p = 0,25 no D2): a fórmula ordena bem as rotas, mas não é um preditor de sucesso. Não ajustei a fórmula para "fazer o ganho aparecer".

## 4. Validação com a rota real do Pragyan (Chandrayaan-3)
Cena: setor da South Crater, 23–27/08/2023, trilha e crateras digitalizadas de Stooke (LPSC 2025 #1025, Fig. 3). Mesmo método da tese numa escala 12:1 (grade de 3 m → 25 cm, como 60 m → 5 m), 7,29% de células medidas, mesmo planejador de custo mínimo nos três mapas. 500 sorteios Monte Carlo (posição das crateras, d/D 0,10–0,20, pontos medidos).

| Plano | Entra em perigo real | Comprimento (mediana) |
|---|---|---|
| Grade de 3 m | **99,4%** (1º perigo a ≈ 11 m do início: a cratera de 4 m) | 18,8 m (reto, quase sobre a trilha real) |
| Tese 3 m → 25 cm, P90 | **6,0%** | 21,9 m |
| Relevo real (referência) | 0% | 21,9 m |

- McNemar (500 pares): b = 467, c = 0, p ≈ 5·10⁻¹⁴¹. O desvio da tese custa +3,1 m; o Pragyan real perdeu **12,3 m** na ida e volta até o ponto de 27/08.
- O plano grosso **repete a decisão real** que obrigou o Pragyan a refazer o caminho; o plano da tese coincide com o ótimo do relevo real (diferença mediana 0,00 m).
- **Sensibilidade:** com 3% de células medidas a falha da tese sobe para 32%; com 1%, 62%. P50, P90 e P99 dão o mesmo resultado nesta cena: **o ganho vem dos pontos medidos, não da margem**.
- **Limites:** a posição da cratera de 4 m é inferida (post da ISRO "3 m à frente" + fim do ramo sul na Fig. 3 + depressão no fundo OHRC); o relevo das crateras é modelo morfológico, não DEM; o Pragyan está a 69,37°S (sem sombras longas): valida a **parte de relevo** da tese, não a de sombra.

## 5. O que dizer à banca
1. **A contribuição da tese é a multirresolução**: +39 pontos de chegada à PSR mesmo depois de aplicar o Marcato em 60 m (p = 1,6·10⁻⁵ com Holm), e sozinha (C2r) ela já dá o salto.
2. **Simplex e Mérito em 60 m quase não ajudam**: sem saber onde estão os perigos de 5 m, otimizar melhor não resolve.
3. **A rede neural não supera o escudo determinístico** nesta configuração; reduz quedas, mas congela no escuro. Posicionar a IA como apoio/alerta, não como piloto.
4. **Validação externa**: no único caso real documentado de desvio por cratera perto do polo, o plano grosso repete o erro do Pragyan e o plano com a tese o evita.

## 6. Ressalvas
- Simulação ilustrativa; o rover A melhorou no v14 (fuga) e o B ganhou a mesma fuga no v15: números de versões anteriores não são comparáveis.
- Os pesos pré-treinados da IA Híbrida vieram do v14 sem o procedimento de treino documentado; aqui foram avaliados só em terrenos novos.
- D3 e D4a treinaram 10 gerações; mais treino pode mudar D4a.
