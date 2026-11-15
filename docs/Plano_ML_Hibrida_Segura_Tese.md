# Plano Forte e Defensável — Arquitetura Híbrida (`Neuroevolução Offline + Safety Shield P90/P99`)

> **Status:** Proposta para avaliação de Eduardo (não altera os `.docx` atuais nem o núcleo base da tese até aprovação).  
> **Enquadramento na tese:** Subseção de **Extensão Operacional / Trabalhos Futuros**, demonstrando como aprendizado de máquina leve (estilo redes neurais evolutivas compactas) pode ser aproveitado **sem violar** o conservadorismo probabilístico `P90/P99` nem as restrições físicas do Polo Sul lunar.

---

## 1. Tese Central desta Extensão (Por que ela se sustenta perante uma banca)

Em vez de afirmar que *"uma IA vai dirigir o rover sozinha aprendendo na Lua"* — o que é **fisicamente e operacionalmente indefensável** — a proposta formula uma hipótese científica verificável e auditável:

> **Hipótese:** Uma rede neural compacta (MLP de poucos kilobytes), treinada **100% *offline* em Terra** por estratégias evolutivas sobre realizações sintéticas da incerteza topográfica de `5 m` (`~92,71%` interpolado) e subordinada a um **escudo determinístico `P90/P99` (*Safety Shield* + regra *No False Relief*)**, aumenta a eficiência energética e o alcance diário do rover sem elevar a taxa de falhas críticas em terrenos inéditos (*out-of-sample*).

---

## 2. Arquitetura em 4 Blocos

```text
[Terreno Real 5m/20m/60m + LDEC + DE440]
        │
        ▼  (Somente em Terra — Gêmeo Digital Estocástico)
(1) Gerador de Realizações Monte Carlo (injeta microcrateras/declives compatíveis com 92,71% interpolado)
        │
        ▼  (Treino Offline por Estratégias Evolutivas — "milhões de falhas no simulador")
(2) Política Neural Leve (MLP 8→7→4, pesos CONGELADOS antes do lançamento, < 4 KB)
        │
        ▼  (Operação a bordo — sem computação pesada nem aprendizado online)
(3) Escudo Determinístico ("Safety Shield"): P90/P99 + Horizonte Distante 1,54° + Regra No False Relief
        │
        ├─[Ação Segura]────► Executa manobra / velocidade proposta
        └─[Risco P90/P99]──► VETA ação da IA e impõe modo seguro (parar / desviar / replanejar em Terra)
```

### Bloco 1 — Gêmeo Digital Estocástico (Treinamento *Offline* em Terra)
* **Base empírica:** Utiliza os dados reais do projeto (`LDEM_875S_5M`, `LDEC_875S_5M`, `PGDA 78` e kernels `DE440` em `MOON_ME`).
* **Realismo do risco oculto:** Cada episódio de treino mantém o macro-relevo observado nos pixels medidos (`7,29%` na calota) e sorteia micro-relevo compatível com a parcela interpolada (`~92,71%`) — criando microcrateras não resolvidas a `60 m` / `20 m`, bolsas de inclinação excessiva e projeções de sombra sob Sol rasante de `1,54°`.
* **Separação de alcance:** Obstáculos locais (`5–50 m`) são percebidos pelos sensores simulados do rover (`LiDAR`/estéreo, `IMU`, potência fotovoltaica), enquanto a sombra de cristas distantes (`> 50–500 m` até `200 km`) vem da máscara pré-calculada em Terra.

### Bloco 2 — Política Neural Compacta 3D (Inspiração Evolutiva, Zero Treino em Voo)
* **Entradas físicas normalizadas (8 variáveis direcionais sobre grade 3D):**
  1. Distância livre à frente (`5–45 m`), à esquerda (`+30°`) e à direita (`-30°`) via `LiDAR`/estéreo (3 entradas direcionais);
  2. Erro lateral até a **rota pré-traçada pelo Controle da Missão ($\Delta_{\text{rota}}$)**, permitindo contornar zonas proibidas e retornar ao traçado nominal;
  3. Declividade combinada instantânea sob as rodas via `IMU` (*pitch* + *roll*, em $^\circ$);
  4. Margem solar sob o azimute dinâmico $\phi(t)$ a $1{,}54^\circ$ (máscara distante + distância à próxima sombra);
  5. Densidade local de interpolação do DEM no corredor à frente (`% LDEC = 0`);
  6. Estado de carga da bateria (`%`) integrado ao saldo energético/`wheel slip`.
* **Topologia enxuta:** Rede *Multilayer Perceptron* (`8 → 7 → 4`), executável em microsegundos até em processadores espaciais endurecidos à radiação, com **pesos congelados antes da operação**.
* **Saídas (Propostas direcionais em relação à rota nominal, não ordens finais):**
  * `Seguir / retornar à rota da missão`;
  * `Contornar pela esquerda`;
  * `Contornar pela direita`;
  * `Frear / recarregar em zona iluminada`.
* **Função de aptidão (*Fitness*) evolutiva:** Premia distância útil percorrida e margem positiva de energia ao final do turno; aplica **penalidade terminal** a qualquer tombamento (`S > limite`), entrada não autorizada em sombra sem reserva ou erro de odometria não mitigado.

### Bloco 3 — Escudo Determinístico de Segurança (*Safety Shield* `P90/P99`)
Este bloco é o que torna o trabalho **cientificamente defensável**:
* **Auditoria matemática antes de mover as rodas:** Toda saída da rede neural passa obrigatoriamente por três checagens determinísticas:
  1. **Trava geotécnica `P99`:** Declividade medida + margem estatística `P99` do terreno interpolado à frente $\le$ limite da missão (`8°` nominal / `15°` VIPER);
  2. **Trava energética sob Sol a `1,54°`:** Bateria remanescente $\ge$ consumo mínimo de travessia + reserva térmica até o próximo ponto iluminado confirmado na máscara distante;
  3. **Regra Assimétrica (*No False Relief*):** Trechos momentaneamente planos ou iluminados **jamais** reduzem a margem `P90/P99` nos pixels ainda não medidos à frente.
* **Veto explícito e rastreável:** Quando a rede neural subestima um risco (ex.: terreno fora da distribuição de treino), o escudo registra `VETO_P90_P99`, bloqueia o comando neural e aplica a ação conservadora.

### Bloco 4 — Protocolo de Validação (*Ablation Study* em 3 Modos sobre Terrenos Inéditos)
Para provar valor sem "vender mágica", o experimento compara **três arquiteturas** nos mesmos **100+ cenários de teste *out-of-sample*** (blocos `PGDA 78` deixados fora do treinamento, em validação cruzada regional):

| Modo testado | Base física usada | Tem Escudo `P90/P99`? | Tem IA (`MLP`)? | O que o experimento demonstra |
| :--- | :---: | :---: | :---: | :--- |
| **Modo 1 — Padrão Atual (DEM `60 m` / `20 m`)** | Grade grossa suavizada | Não | Não | Expõe os **falsos positivos atuais**: microcrateras e sombras `1,54°` invisíveis a `60 m` derrubam o rover nos `92,71%` interpolados. |
| **Modo 2 — Tese Base (`Multirresolução P90/P99`)** | Grade `5 m` + calibração `P90/P99` | Sim | Não | Prova o **ganho de segurança do núcleo da tese** (regras fixas conservadoras zeram ou quase zeram falhas críticas, ao custo de menor velocidade/alcance). |
| **Modo 3 — Híbrido (`IA Proibitiva + Escudo da Tese`)** | Grade `5 m` + `P90/P99` + *No False Relief* | Sim (soberano) | Sim (*offline*) | Mede o **ganho líquido da extensão**: mantém a segurança auditável do Modo 2 enquanto recupera alcance/eficiência energética onde é provadamente seguro. |

---

## 3. Riscos Científicos Mapeados (O que responder à banca)

1. ***"Por que usar IA se o rover anda a centímetros por segundo?"***
   * **Resposta:** Não para reflexo em tempo real de alta velocidade, mas para **otimização de política multiobjetivo em ambientes com incerteza estocástica** (decidir quando vale desacelerar, desviar ou parar para recarga antes de entrar em trecho com alta taxa de interpolação e Sol rasante), evitando programação manual de dezenas de limiares acoplados.
2. ***"E se a rede sofrer *Reward Hacking* (ficar parada no Sol para não morrer)?"***
   * **Resposta:** A função *fitness* penaliza tempo ocioso sem progresso rumo ao alvo/waypoints e só pontua sobrevivência quando associada ao avanço útil da travessia.
3. ***"E o *Sim-to-Real Gap* (simulador diferente da Lua real)?"***
   * **Resposta:** Exatamente por existir *Sim-to-Real Gap* é que a rede **não controla diretamente a segurança** — o *Safety Shield* `P90/P99` e a regra *No False Relief* garantem que qualquer discrepância do simulador resulte em **veto seguro**, nunca em colisão ou blecaute.
4. ***"Como lidar com sombras vindas de fora do alcance dos sensores?"***
   * **Resposta:** A rede e os sensores locais (`20–50 m`) não tentam adivinhar o horizonte distante; recebem a elevação solar e a margem de sombra pré-computadas da máscara de horizonte distante (`> 500 m` até `200 km`) + pacotes de replanejamento enviados da Terra entre turnos.

---

## 4. Mapa Estático vs. Dinâmico e Uso para Sugestão de Parâmetros da Otimização

1. **Por que separar Mapa Estático vs. Mapa Dinâmico:**
   * **Em mapa 100% estático e determinístico**, não se precisa de IA — busca exata (`A*` / Programação Linear) acha o ótimo global. Usar ML num mapa único gera apenas *overfitting* (memorização do percurso).
   * **Em mapa dinâmico** (Sol a $1{,}54^\circ$ varrendo em azimute $\phi(t)$ + novas realizações estocásticas dos `92,71%` interpolados a cada turno/cenário), políticas adaptativas sob escudo `P90/P99` revelam seu valor real ao generalizar regras de cautela sem travar a missão.
2. **Uso dos resultados como sugestão de parâmetros no otimizador (`TOPSIS / Monte Carlo`):**
   * Os ensaios comparativos geram **recomendações empíricas de sensibilidade** para calibrar hiperparâmetros operacionais do otimizador: quantil de segurança (`P90` vs. `P95` vs. `P99`), reserva mínima de bateria (`SOC_min`), peso de retorno à rota nominal (`w_rota`), fator de penalidade em células sem tiro LOLA (`LDEC = 0`) e limite de velocidade sob incerteza.
   * **Regra cética anti-vazamento (*No Data Leakage*):** os valores definitivos citados na tese devem sempre ser extraídos dos **blocos reais `PGDA 78` em Python** (com divisão estrita treino/validação regional), usando o simulador web apenas para visualização interativa da sensibilidade paramétrica.

---

## 5. Cronograma Enxuto de Execução (Quando Eduardo autorizar implementar)

1. **Fase 1 (Base já pronta no protótipo visual 3D):** Simulador 3D `(x, y, z)` com **Rota Pré-Traçada pelo Controle da Missão**, **zonas evitadas (`P99/ShadowCam`)**, **retorno à rota (`Δ_rota`)** em **3 Modos (`Atual 60m` vs. `Tese P90/P99` vs. `Híbrido MLP 8→7→4`)**, chave **Estático vs. Dinâmico**, **Velocidade de Evolução (`Turbo +5 Gen` / Mutação)** e painel de **Sugestão de Parâmetros**.
2. **Fase 2 (Python científico com dados reais do repositório):** Extrair perfis transversais reais dos recortes `PGDA 78` (`5 m`) vs. `20 m` / `60 m` + `LDEC` para calibrar o gerador de microcrateras ocultas.
3. **Fase 3 (Treino *offline* + *Ablation Study*):** Rodar `Modo 1` vs. `Modo 2` vs. `Modo 3` em validação cruzada regional (*leave-one-region-out*) e extrair a tabela final de parâmetros recomendados e trade-off segurança vs. alcance para a tese.
