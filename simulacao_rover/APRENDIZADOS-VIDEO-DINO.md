# Aprendizados do vídeo "IA no Dino Chrome 2.0" aplicados ao simulador de rovers

**Fonte:** vídeo do canal Universo Programado (https://youtu.be/OQoBGuoQdhY), resumido pela equipe em 13/11/2026.
**Uso:** referência de método (como treinar e como apresentar) para a animação `animacao_tese_rover_neuroevolucao.html` e para o vídeo da submissão.
**Atenção:** o vídeo não informa neurônios por camada, ativação, taxa de mutação nem fórmula de seleção. Esses valores são nossos.

---

## 1. O que o vídeo é

- Jogo lateral infinito baseado no dinossauro do Chrome. **500 indivíduos** jogam ao mesmo tempo, cada um com sua rede neural, evoluindo por seleção e mutação (sem gradiente).
- Pergunta do autor: até onde a rede continua aprendendo um jogo que fica cada vez mais difícil?
- **Tese implícita:** a IA não fica esperta sozinha. Cada avanço vem depois de o criador fechar uma brecha, criar uma penalidade ou reformular a recompensa. O "vilão" é o design do jogo, nunca a IA.

## 2. Mecânicas que importam para nós

| No vídeo | Detalhe | Equivalente no rover |
|---|---|---|
| Score = obstáculos ultrapassados | Trocado de "pixels percorridos" por ser mais intuitivo e comparável | Feito na v8: % da rota e obstáculos superados |
| Cenário infinito e aleatório | Cada indivíduo enfrenta centenas de obstáculos numa só partida | Feito na v8: rota de 3 km, ~21 microcrateras |
| Tamanho dos cactos aleatório (0,75× a 1,25×) | Serve para **generalizar**, não só dificultar: impede decorar | Terreno novo a cada geração; tolerância de fabricação por rover |
| Velocidade oscila entre 5 e 10 | Varia a dificuldade sem torná-la impossível | Sol girando; sombras que se movem |
| Energia: 100, regenera devagar, ações custam 20/30/50 | Sem custo, a IA usa a ação cara para tudo | Bateria, recarga, hibernação |
| +20 de energia ao passar um supercacto | Evita morrer por azar do cenário, e não por erro de decisão | Sombras maiores que a bateria: o rover precisa de saída (hibernar, porto seguro) |
| Ângulo passado como seno e cosseno | 0° e 360° são o mesmo ponto; o valor cru confunde a rede | **A aplicar:** azimute do Sol como seno e cosseno nas entradas |

## 3. Ciclos erro → ajuste → acerto (resumo)

| Erro que apareceu | Ajuste do criador |
|---|---|
| Jogo trivial (dominado em 8 min) | Score por obstáculo; remove ajudas |
| Pulo duplo usado sempre, sem necessidade | Cria custo de energia |
| Energia esgotada por azar (obstáculos em sequência) | Regenera ao passar o obstáculo |
| Agentes grudados no canto esquerdo (parado é mais seguro) | Moeda que muda de lugar |
| Moeda ignorada (vale 1) ou obsessão por moeda (vale 5) | O problema era a **capacidade da rede**: uma camada a mais |
| Recompensa "tudo ou nada" travava o treino | Recompensa **densa**: pontos pela proximidade |
| Obstáculo passava sem a ação pretendida | Redesenha o obstáculo até a ação ser necessária |
| Sem limite de energia: várias estratégias vencedoras | Convergência aleatória; cada reinício dá outro comportamento |
| Atirar e pular ao mesmo tempo: 4 h de treino | **Duas redes**: a de locomoção congelada, a de tiro treinada. 5 min |

## 4. As seis regras de design e o que já vimos delas no rover

1. **Começar pelo simples que funciona e só depois aumentar.** Nossas correções seguiram isso sem querer; vale tornar regra.
2. **Quando a IA explora uma brecha, o erro é do design.** Nossos casos: função de mérito que premiava ficar parado (correção 20); "só recarrega no Sol" que empurrava o rover para o escuro (11); relógio que punia a prudência (13).
3. **Recompensa esparsa é inimiga do aprendizado.** Resolvido na v8 com a nota densa (correção 29).
4. **Dois comportamentos que não coexistem: suspeitar da capacidade da rede** (profundidade antes de largura) antes de mexer na recompensa. Nossa MLP tem uma camada oculta de 7 neurônios e precisa lidar com relevo **e** energia.
5. **Tarefa composta: separar em redes e reaproveitar a parte treinada.** Candidato direto: uma rede para desvio de relevo e outra para gestão de energia.
6. **O platô não é falha, é o formato da busca.** No início qualquer mutação melhora; depois quase todas pioram.

**Comportamento emergente mais relevante para nós:** os dinos gastavam energia à vontade até 40 e paravam ali, porque precisavam de 20 de folga para o obstáculo obrigatório. A seleção não premiou "guardar o máximo", e sim "nunca faltar". É a mesma descoberta da nossa Fase 6: o que decide é a **margem** de energia, não o tamanho da bateria.

## 5. Decisão tomada em 13/11: mapa longo e aleatório

| Opção | A favor | Contra |
|---|---|---|
| Mapa fixo | Curva sobe em poucas gerações (mérito: 32 → 60 de 60); rápido; bom para depurar | A rede decora o terreno e o Sol; não prova nada sobre outro terreno |
| Curto e aleatório (até a v7) | Obriga a generalizar | Uma amostra de dificuldade por geração: chegadas entre 7 e 55 de 60, média parada |
| **Longo e aleatório (escolhido)** | A sorte se dilui dentro da geração; nota densa; é o cenário real de missão | Mais cálculo (~5 s por geração); travessia longa na tela; chegar à PSR fica raro; o VIPER exige portos seguros |

**Resultado medido na v8 (modelo Padrão, P90, teste em 3 terrenos nunca vistos, 24 gerações de treino):**

| Cérebro do B | Antes do treino | Depois | Chegam à PSR |
|---|---|---|---|
| IA MLP + escudo | 23% da rota | 47% | 3% → 13% |
| Mérito, pesos evolutivos | 32% | 47% | 9% → 14% |
| Regra fixa | 42% | 42% (não aprende) | 2% |

O rover A percorre em média 11% da rota. Limite conhecido: algumas gerações ainda despencam (6% a 15%) quando um obstáculo logo no início derruba o enxame inteiro. O mapa fixo continua disponível como modo de demonstração.

## 6. Como o vídeo apresenta (aproveitar no vídeo da submissão)

- **Escala crescente:** começa mostrando que a versão anterior era fácil demais e termina com a IA invicta.
- **Cada bloco é um ciclo:** regra nova → comportamento inesperado → diagnóstico **visual** → ajuste → acerto. É o mesmo formato da nossa Linha do Tempo.
- **Tempo de treino como placar** (8 min, 18 min, 1h30, 4h, 8h): mostra o custo crescente de cada avanço.
- **Um momento "ela é mais esperta que eu"** (a energia de 40). Nossos candidatos: a elite do mérito trocando de estratégia entre a rota curta (avanço domina) e a longa (folga até o perigo domina), e a tese igualando o oráculo com margem apertada.
- **Interface:** HUD com gráfico de aptidão, miniatura do melhor indivíduo e zoom nos pesos da rede. Já temos painel da rede, gráfico e faixa de progresso; falta o destaque do melhor rover.
- **Honestidade sobre brechas:** o autor mostra os erros do próprio design. Reforça manter as tentativas descartadas na Linha do Tempo (ex.: correção 17).

## 7. Recomendações guardadas

| # | Recomendação | Por quê | Estado |
|---|---|---|---|
| A | Gráfico de evolução com % da rota e média móvel | A linha "avanço do melhor" ficava grudada no topo | **Feito (v8)** |
| D | Mapa longo e aleatório + conjunto de teste fixo | Tornar o aprendizado visível sem permitir decorar | **Feito (v8)** |
| E | Nota densa: rota percorrida e obstáculos superados | Lição 3 do vídeo | **Feito (v8)** |
| C | Ensinar o B a procurar portos seguros (escuridão ≤ 50 h) usando a previsão de sombra, e medir o acerto por fonte (60 m, 20 m, tese) | Com o VIPER calibrado ninguém chega: 86 a 92% da rota passa de 50 h no escuro | Próxima |
| B | Assimilação de dados em tempo real: painel, câmera e IMU corrigem o mapa estimado, compartilhado pelo enxame, com seletor liga/desliga | Hoje o rover usa os sensores mas não aprende com eles | Aprovada, não feita |
| F | Azimute do Sol como seno e cosseno nas entradas da rede; previsão de sombra como entrada | Lição do ângulo circular; hoje só o escudo usa a previsão | Proposta |
| G | Testar uma camada oculta a mais antes de mexer em pesos de recompensa | Lição 4 | Proposta |
| H | Duas redes (relevo e energia), congelando a que já funciona | Lição 5 | Proposta |
| I | Repetir a comparação de fontes de previsão (60 m, 20 m, tese) na rota longa, com margem apertada, 100 gerações | O ganho de ~5 pontos da tese foi medido na rota curta e é indício, não prova | Proposta |
| J | Suavizar o início da rota (ou largada escalonada) | Um obstáculo nos primeiros metros ainda derruba o enxame inteiro em algumas gerações | Proposta |
| K | Várias rotas candidatas por terreno (3 a 5, com pernas entre portos seguros), escolhidas no planejamento com a previsão de 60 m, 20 m ou tese, e executadas no terreno real | Uma rota única não acontece na missão real (o VIPER avalia milhares de planos) e transforma a simulação em teste de planejamento, onde a tese mais importa | Proposta (junto com C) |

Ordem sugerida: **C + K** → **B** → **I** → **F, G, H** → **J**.
