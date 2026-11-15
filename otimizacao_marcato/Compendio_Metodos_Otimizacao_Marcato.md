# Curso de Métodos de Otimização — Professor André Marcato (UFJF)
## Compêndio Técnico e Guia Completo para o Projeto

---

### Visão Geral do Curso
Este compêndio reúne e estrutura detalhadamente o conteúdo das aulas do **Curso de Métodos de Otimização**, ministrado pelo **Prof. Dr. André Luís Marques Marcato** no Departamento de Energia Elétrica da Universidade Federal de Juiz de Fora (**UFJF**).

O material foi elaborado para servir como **base de consulta de alta precisão** para projetos de engenharia, pesquisa operacional, modelagem de sistemas elétricos e aeroespaciais/NASA, cobrindo:
1. **Fundamentos e Formulação Matemática Rigorosa**
2. **Métodos de Resolução Manual e Tabular (Simplex, Big M, Duas Fases, Newton)**
3. **Dualidade e Análise de Pós-Otimalidade**
4. **Otimização Não Linear Restrita (Condições KKT) e Pontos Interiores**
5. **Implementações Computacionais Completas em Python** (SciPy, Pyomo, PuLP e NumPy)

---

### Sumário das Aulas

| Aula | Título | ID YouTube | Foco Principal |
| :---: | :--- | :---: | :--- |
| **01** | Introdução à Otimização e Modelagem Matemática | `tWosf3dT_gw` | Variáveis, Função Objetivo, Classificação de Restrições |
| **02** | Python Aplicado à Otimização | `cpU3SZ19XdQ` | SciPy (`linprog`, `minimize`), formulação vetorial |
| **03** | Método Gráfico e Geometria da Otimização | `IqemQ2PBZUg` | Espaço de busca, curvas de nível, vértices ótimos |
| **04** | Forma Padrão e Representação Matricial | `QWeI3cuBatM` | Variáveis de folga/excesso, matriz de restrições $[A\|I]$ |
| **05** | Método SIMPLEX Passo a Passo | `mD2SzR_2c2Q` | Tabela Simplex, pivoteamento, base e não-base |
| **06** | Método do Grande M (Big M) | `GaCZ-LDYA1c` | Variáveis artificiais, penalização no custo ($M \gg 0$) |
| **07** | Método das Duas Fases | `zV68b6_KzcE` | Fase 1 (encontrar base viável), Fase 2 (otimizar) |
| **08** | Dualidade e Análise de Sensibilidade | `hi641_z22Qk` | Problema Primal-Dual, Preço Sombra, Folgas Complementares |
| **10** | Otimização Não Linear — Newton Monovariado | `5jZZMy0YAmQ` | Derivadas, série de Taylor, critério de parada |
| **11** | Otimização Não Linear — Newton Multivariado | `Z7h65aYprrc` | Gradiente, Hessiana, direções de descida, convexidade |
| **12** | Otimização Não Linear Restrita e KKT | `KE9Hjp8ugT0` | Multiplicadores de Lagrange, condições KKT, regularidade |
| **13** | Método de Pontos Interiores | `c_pxqkeI9t8` | Barreira logarítmica, trajetória central, Primal-Dual |

---

## Aula 01 — Introdução à Otimização e Modelagem Matemática
*Vídeo de referência:* `tWosf3dT_gw` (Gravado na Faculdade de Engenharia / Edifício Itamar Franco - UFJF)

### 1.1 O que é Otimização?
Otimizar significa tomar a melhor decisão possível diante de um conjunto finito ou infinito de alternativas, respeitando limitações físicas, operacionais, financeiras ou temporais.

Na engenharia elétrica e espacial, otimização surge no:
- Despacho econômico e hidrotérmico de geradores.
- Roteamento e planejamento de trajetórias orbitais.
- Minimização de peso estrutural sujeito a tensões mecânicas máximas.
- Alocação ótima de potência e energia em baterias/painéis solares.

### 1.2 Anatomia de um Problema de Otimização
Qualquer problema de otimização é formalmente expresso pela tríade:
1. **Variáveis de Decisão ($x \in \mathbb{R}^n$):** Valores desconhecidos que o projetista tem a liberdade de escolher (ex: megawatts despachados, espessura de uma chapa, tempo de queima de um propulsor).
2. **Função Objetivo ($f(x)$):** Função matemática escalar que quantifica o mérito da solução.
   - $\min f(x)$ (custo, perda de energia, combustível, erro quadrático).
   - $\max f(x)$ (lucro, eficiência, confiabilidade).
   *Nota do Prof. Marcato:* Todo problema de maximização pode ser convertido em minimização:
   $$\max f(x) \iff \min -f(x)$$
3. **Restrições:** Equações e inequações que delimitam a região viável $\Omega$:
   - Restrições de igualdade: $h_i(x) = 0, \quad i = 1, \dots, p$ (balanços de potência, conservação de massa).
   - Restrições de desigualdade: $g_j(x) \le 0, \quad j = 1, \dots, m$ (limites térmicos, capacidades máximas).
   - Restrições de canalização (bounds): $x_k^{\min} \le x_k \le x_k^{\max}$.

### 1.3 Classificação dos Problemas
- **Programação Linear (PL):** $f(x)$ e todas as restrições são funções lineares afins. Possui a propriedade de que qualquer mínimo local é global.
- **Programação Não Linear (PNL):** $f(x)$ ou pelo menos uma restrição é não linear. Podem existir múltiplos mínimos locais.
- **Programação Inteira / Mista (MIP/MILP):** Parte ou a totalidade das variáveis assume valores discretos $\{0, 1\}$ ou $\mathbb{Z}$.
- **Programação Dinâmica:** Problemas de decisão multiestágio onde o tempo ou estágios desacoplam a função custo via Princípio da Otimalidade de Bellman.

---

## Aula 02 — Python e Ambientes de Otimização
*Vídeo de referência:* `cpU3SZ19XdQ`

O Professor Marcato ensina a transcrição de formulações matemáticas analíticas para código executável utilizando o **Python** (especialmente Google Colab / Jupyter).

### 2.1 Principais Bibliotecas Utilizadas
1. **NumPy:** Vetorização, cálculo matricial e álgebra linear rápida.
2. **SciPy (`scipy.optimize`):**
   - `linprog`: Solucionador nativo de Programação Linear (métodos `highs-ds`, `highs-ipm`, `interior-point`).
   - `minimize`: Solucionador de Otimização Não Linear (métodos `SLSQP`, `BFGS`, `trust-constr`).
3. **PuLP / Pyomo:** Modeladores algébricos de alto nível com sintaxe declarativa próxima da matemática.

### 2.2 Template de Programação Linear com `scipy.optimize.linprog`
O `scipy.optimize.linprog` assume a forma padrão de **minimização**:
$$\min c^T x \quad \text{sujeito a} \quad A_{ub} x \le b_{ub}, \quad A_{eq} x = b_{eq}, \quad l \le x \le u$$

```python
import numpy as np
from scipy.optimize import linprog

# Exemplo do Marcato: Max Z = 3*x1 + 5*x2  -->  Min -Z = -3*x1 - 5*x2
c = [-3.0, -5.0]

# Restricoes de Desigualdade (A_ub * x <= b_ub)
# 2*x1 + x2 <= 16
# x1 + 2*x2 <= 11
# x1 + 3*x2 <= 15
A_ub = [
    [2.0, 1.0],
    [1.0, 2.0],
    [1.0, 3.0]
]
b_ub = [16.0, 11.0, 15.0]

# Limites de nao negatividade (x1 >= 0, x2 >= 0)
bounds = [(0, None), (0, None)]

res = linprog(c=c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method='highs')

print("Status:", res.message)
print("Solucao Otima (x1, x2):", res.x)
print("Valor Otimo Z:", -res.fun)
```

---

## Aula 03 — Método Gráfico e Geometria da Otimização
*Vídeo de referência:* `IqemQ2PBZUg`

### 3.1 Fundamentos Geométricos
O método gráfico é aplicável a problemas bidimensionais ($n = 2$ variáveis: $x_1, x_2$) e fornece a intuição fundamental para o Simplex:
1. **Semiplanos:** Cada restrição $a_{i1}x_1 + a_{i2}x_2 \le b_i$ define um semiplano fechado.
2. **Poliedro Viável ($\Omega$):** A interseção de todos os semiplanos define uma região convexa.
   - Se $\Omega = \emptyset$, o problema é **inviável**.
   - Se a região se estende indefinidamente na direção de melhoria de $Z$, o problema é **ilimitado**.
3. **Curvas de Nível da Função Objetivo:** A equação $c_1 x_1 + c_2 x_2 = k$ representa retas paralelas ortogonais ao vetor gradiente $\nabla f = [c_1, c_2]^T$.
4. **Teorema Fundamental da Programação Linear:**
   > *Se um problema de programação linear possui solução ótima finita, pelo menos um ponto extremo (vértice) do poliedro viável é solução ótima.*

---

## Aula 04 — Forma Padrão e Representação Matricial
*Vídeo de referência:* `QWeI3cuBatM`

Para que o algoritmo Simplex possa operar algebricamente, o problema deve ser convertido para a **Forma Padrão**:
$$\min c^T x \quad \text{s.a.} \quad Ax = b, \quad x \ge 0$$
com $b \ge 0$.

### 4.1 Regras de Transformação
1. **Sentido da Otimização:** $\max Z \implies \min -Z$.
2. **Restrições de Desigualdade:**
   - Menor ou igual ($\le$): Adiciona-se uma **variável de folga** $s_i \ge 0$:
     $$a_{i1}x_1 + a_{i2}x_2 \le b_i \implies a_{i1}x_1 + a_{i2}x_2 + s_i = b_i$$
   - Maior ou igual ($\ge$): Subtrai-se uma **variável de excesso** $e_i \ge 0$:
     $$a_{i1}x_1 + a_{i2}x_2 \ge b_i \implies a_{i1}x_1 + a_{i2}x_2 - e_i = b_i$$
3. **Lado Direito Negativo:** Se $b_i < 0$, multiplica-se a linha por $-1$ e inverte-se o sinal da inequação antes de inserir a folga/excesso.
4. **Variáveis Livres (sem restrição de sinal):** Se $x_k \in \mathbb{R}$, substitui-se $x_k = x_k^+ - x_k^-$, onde $x_k^+, x_k^- \ge 0$.

### 4.2 Partição em Base ($B$) e Não-Base ($N$)
Com $m$ equações e $n$ variáveis ($n > m$):
$$A = [B \mid N], \quad x = \begin{bmatrix} x_B \\ x_N \end{bmatrix}$$
- $B$ é uma matriz quadrada $m \times m$ invertível (colunas básicas).
- Fazendo as variáveis não-básicas $x_N = 0$, obtém-se a **Solução Básica**:
$$x_B = B^{-1} b$$
- Se $x_B \ge 0$, trata-se de uma **Solução Básica Viável (SBV)**, que corresponde exatamente a um vértice do poliedro.

---

## Aula 05 — O Algoritmo SIMPLEX
*Vídeo de referência:* `mD2SzR_2c2Q`

O Simplex percorre vértices adjacentes do poliedro viável melhorando (ou mantendo) o valor da função objetivo a cada iteração, até que nenhum vértice vizinho ofereça redução de custo.

### 5.1 O Tableau Simplex Canônico
$$\begin{array}{|c|c|c|c|}
\hline
\text{Base} & Z & x_1 \dots x_n & \text{Lado Direito (LD)} \\
\hline
Z & 1 & c_B^T B^{-1} N - c_N^T & c_B^T B^{-1} b \\
\hline
x_B & 0 & B^{-1} A & B^{-1} b \\
\hline
\end{array}$$

### 5.2 Critérios do Algoritmo
1. **Condição de Parada (Otimalidade):**
   - Para maximização (com linha $Z$ na convenção $Z - \sum c_j x_j = 0$): O ótimo é atingido quando todos os custos reduzidos na linha $Z$ forem $\ge 0$.
2. **Escolha da Variável que Entra na Base (Pivô Coluna):**
   - Escolhe-se a variável não-básica com o coeficiente mais negativo na linha $Z$ (regra de Dantzig).
3. **Escolha da Variável que Sai da Base (Pivô Linha - Teste da Razão Mínima):**
   - Para a coluna pivô $k$, calcula-se:
     $$\theta = \min_{i \,:\, y_{ik} > 0} \left\{ \frac{b_i}{y_{ik}} \right\}$$
   - A linha que atinge o valor mínimo define a variável básica que sai da base.
   - Se todos os $y_{ik} \le 0$, o problema é **ilimitado** ($Z \to \infty$).
4. **Operações Elementares de Gauss-Jordan:**
   - Linha do pivô é dividida pelo elemento pivô.
   - Zera-se todos os outros elementos da coluna pivô nas demais linhas e na linha $Z$.

---

## Aula 06 — Método do Grande M (Big M)
*Vídeo de referência:* `GaCZ-LDYA1c`

Quando o problema contém restrições do tipo $\ge$ ou $=$, as variáveis de folga convencionais não fornecem uma base identidade viável inicial ($s_i = -b_i < 0$ seria inviável).

### 6.1 Formulação com Penalização $M$
Introduzem-se variáveis artificiais $a_i \ge 0$:
$$a_{i1} x_1 + \dots - e_i + a_i = b_i$$
Para forçar $a_i \to 0$ na solução final, penaliza-se fortemente a função objetivo com um escalar $M \gg 0$:
$$\text{Min } Z = c^T x + M \sum a_i \quad \text{ou} \quad \text{Max } Z = c^T x - M \sum a_i$$

### 6.2 Eliminação Algébrica Inicial
Antes de iniciar o Simplex, a linha $Z$ deve ser ajustada para eliminar as variáveis básicas $a_i$ de seus coeficientes iniciais, efetuando:
$$\text{Linha } Z_{\text{novo}} = \text{Linha } Z_{\text{original}} - M \sum (\text{Linhas das artificiais})$$

### 6.3 Diagnóstico de Inviabilidade
Se o algoritmo Simplex terminar indicando ótimo, mas **alguma variável artificial $a_i > 0$ permanecer na base**, o problema original é **inviável**.

---

## Aula 07 — Método das Duas Fases
*Vídeo de referência:* `zV68b6_KzcE`

O método das Duas Fases resolve o mesmo problema do Big M, porém sem a necessidade de manipular o parâmetro simbólico $M$, evitando instabilidades numéricas e erros de arredondamento em computadores.

### 7.1 Fase 1: Busca de uma SBV Inicial
1. Constrói-se uma função objetivo artificial auxiliar $W$, cujo objetivo é unicamente minimizar a soma das variáveis artificiais:
   $$\min W = \sum_{i} a_i$$
2. Aplica-se o Simplex padrão.
3. **Conclusão da Fase 1:**
   - Se $\min W > 0$: O conjunto viável original é vazio ($\Omega = \emptyset$). O algoritmo é abortado.
   - Se $\min W = 0$: Todas as variáveis artificiais saíram da base (ou estão com valor nulo). Encontrou-se uma base viável para o problema original.

### 7.2 Fase 2: Otimização do Problema Real
1. Eliminam-se as colunas das variáveis artificiais do tableau.
2. Restaura-se a função objetivo original $Z = c^T x$.
3. Ajusta-se a linha $Z$ com respeito à base atual e roda-se o Simplex até o ótimo final.

---

## Aula 08 — Teoria da Dualidade e Análise de Sensibilidade
*Vídeo de referência:* `hi641_z22Qk`

Para todo problema de Programação Linear (chamado **Primal**), existe um problema simétrico associado chamado **Dual**.

### 8.1 Relação Primal $\iff$ Dual
$$\begin{array}{ccc}
\textbf{Primal (Maximização)} & & \textbf{Dual (Minimização)} \\
\max Z = c^T x & \iff & \min W = b^T y \\
A x \le b & \iff & A^T y \ge c \\
x \ge 0 & \iff & y \ge 0
\end{array}$$

### 8.2 Teoremas Fundamentais
1. **Dualidade Fraca:** Se $x$ é viável para o primal e $y$ é viável para o dual:
   $$c^T x \le b^T y$$
2. **Dualidade Forte:** Se o primal possui solução ótima finita $x^*$, então o dual também possui solução ótima finita $y^*$, e seus valores coincidem:
   $$c^T x^* = b^T y^*$$
3. **Teorema das Folgas Complementares:**
   $$y_i^* (b_i - A_i x^*) = 0, \quad \forall i$$
   $$x_j^* (A_j^T y^* - c_j) = 0, \quad \forall j$$
   *Interpretação:* Se uma restrição primal tiver folga estrita ($A_i x^* < b_i$), seu recurso não está escasso e seu valor econômico (preço sombra $y_i^*$) é zero.

### 8.3 Preço Sombra (Shadow Price)
O multiplicador dual $y_i^*$ mede a taxa de variação da função objetivo ótima em relação a uma variação marginal no recurso $b_i$:
$$y_i^* = \frac{\partial Z^*}{\partial b_i}$$

---

## Aula 10 — Otimização Não Linear: Método de Newton Monovariado
*Vídeo de referência:* `5jZZMy0YAmQ`

### 10.1 Fundamentação Matemática
Deseja-se encontrar o ponto $x^*$ que minimiza uma função diferenciável $f(x): \mathbb{R} \to \mathbb{R}$.
Pela condição necessária de primeira ordem:
$$f'(x^*) = 0$$

Aproximando $f(x)$ em torno do ponto $x_k$ pela Série de Taylor de segunda ordem:
$$f(x_k + \Delta x) \approx f(x_k) + f'(x_k) \Delta x + \frac{1}{2} f''(x_k) (\Delta x)^2$$
Derivando em relação a $\Delta x$ e igualando a zero:
$$\frac{d}{d(\Delta x)} \left[ f(x_k + \Delta x) \right] = f'(x_k) + f''(x_k) \Delta x = 0 \implies \Delta x = -\frac{f'(x_k)}{f''(x_k)}$$

### 10.2 Equação de Recorrência
$$x_{k+1} = x_k - \frac{f'(x_k)}{f''(x_k)}$$

- **Critérios de Parada:**
  1. Gradiente pequeno: $|f'(x_{k+1})| < \epsilon_1$
  2. Passo pequeno: $|x_{k+1} - x_k| < \epsilon_2$
  3. Número máximo de iterações atingido ($k > k_{\max}$).
- **Condição de Convexidade Local:** Requer $f''(x_k) > 0$ para convergir para um ponto de mínimo. Se $f''(x_k) < 0$, o passo caminha para um máximo local.

---

## Aula 11 — Otimização Não Linear: Método de Newton Multivariado
*Vídeo de referência:* `Z7h65aYprrc`

Generalização para funções com múltiplos parâmetros $x = [x_1, x_2, \dots, x_n]^T \in \mathbb{R}^n$.

### 11.1 O Vetor Gradiente e a Matriz Hessiana
- **Gradiente ($\nabla f(x) \in \mathbb{R}^n$):** Vetor das derivadas parciais de primeira ordem:
  $$\nabla f(x) = \left[ \frac{\partial f}{\partial x_1}, \frac{\partial f}{\partial x_2}, \dots, \frac{\partial f}{\partial x_n} \right]^T$$
- **Hessiana ($H(x) \in \mathbb{R}^{n \times n}$):** Matriz simétrica das derivadas de segunda ordem:
  $$H_{ij}(x) = \frac{\partial^2 f}{\partial x_i \partial x_j}$$

### 11.2 Passo de Newton Multivariado
A expansão de Taylor multivariada é:
$$f(x_k + d) \approx f(x_k) + \nabla f(x_k)^T d + \frac{1}{2} d^T H(x_k) d$$
Minimizando em relação à direção $d$:
$$\nabla_d \left[ f(x_k + d) \right] = \nabla f(x_k) + H(x_k) d = 0 \implies H(x_k) d = -\nabla f(x_k)$$
Se a Hessiana for inversível:
$$d_k = - [H(x_k)]^{-1} \nabla f(x_k)$$
$$x_{k+1} = x_k + \alpha_k d_k$$
onde $\alpha_k$ é o fator de amortecimento obtido por busca linear (Backtracking Line Search) para garantir convergência global.

### 11.3 Condições de Otimalidade Irrestrita
- **Ponto Estacionário:** $\nabla f(x^*) = 0$
- **Mínimo Local:** $\nabla f(x^*) = 0$ e $H(x^*)$ é **Definida Positiva** (todos os autovalores $\lambda_i > 0$).
- **Máximo Local:** $\nabla f(x^*) = 0$ e $H(x^*)$ é **Definida Negativa** ($\lambda_i < 0$).
- **Ponto de Sela:** Hessiana indefinida (possui autovalores positivos e negativos).

---

## Aula 12 — Otimização Não Linear Restrita e Condições KKT
*Vídeo de referência:* `KE9Hjp8ugT0`

Considera o problema geral:
$$\min f(x) \quad \text{s.a.} \quad g_j(x) \le 0 \; (j=1,\dots,m), \quad h_i(x) = 0 \; (i=1,\dots,p)$$

### 12.1 A Função Lagrangeana
$$\mathcal{L}(x, \lambda, \mu) = f(x) + \sum_{j=1}^m \mu_j g_j(x) + \sum_{i=1}^p \lambda_i h_i(x)$$
onde $\mu_j \ge 0$ são os multiplicadores para desigualdades e $\lambda_i \in \mathbb{R}$ para igualdades.

### 12.2 As Condições de Karush-Kuhn-Tucker (KKT)
No ponto ótimo $x^*$, sob condições de qualificação de restrições (ex: LICQ):
1. **Estacionariedade:**
   $$\nabla_x \mathcal{L}(x^*, \lambda^*, \mu^*) = \nabla f(x^*) + \sum_{j=1}^m \mu_j^* \nabla g_j(x^*) + \sum_{i=1}^p \lambda_i^* \nabla h_i(x^*) = 0$$
2. **Viabilidade Primal:**
   $$g_j(x^*) \le 0, \quad \forall j=1,\dots,m$$
   $$h_i(x^*) = 0, \quad \forall i=1,\dots,p$$
3. **Viabilidade Dual:**
   $$\mu_j^* \ge 0, \quad \forall j=1,\dots,m$$
4. **Folga Complementar:**
   $$\mu_j^* g_j(x^*) = 0, \quad \forall j=1,\dots,m$$
   *(Se a restrição estiver inativa $g_j(x^*) < 0$, necessariamente $\mu_j^* = 0$. Se $\mu_j^* > 0$, a restrição está ativa $g_j(x^*) = 0$).*

---

## Aula 13 — Método de Pontos Interiores (Interior-Point)
*Vídeo de referência:* `c_pxqkeI9t8`

Enquanto o Simplex caminha pelas arestas e vértices externos do poliedro, os métodos de pontos interiores (Karmarkar, Mehrotra) atravessam o interior da região viável.

### 13.1 Abordagem por Barreira Logarítmica
Substituem-se as restrições de desigualdade $x \ge 0$ por uma penalização na função objetivo:
$$\min c^T x - \mu \sum_{j=1}^n \ln(x_j) \quad \text{s.a.} \quad Ax = b$$
onde $\mu > 0$ é o parâmetro de barreira.

À medida que qualquer $x_j \to 0^+$, $-\ln(x_j) \to +\infty$, criando uma "barreira infinita" que impede o ponto de violar os limites. Conforme $\mu \to 0$, a solução da barreira converge com precisão arbitrária para o ótimo exato do problema original.

---

### Guia Rápido de Scripts em Python Prontos para Uso

Criamos no diretório do projeto códigos de exemplo completos implementando os principais métodos abordados nas aulas:
- `simplex_tableau.py`: Implementação do algoritmo Simplex com exibição do tableau passo a passo.
- `metodo_newton.py`: Implementação do método de Newton monovariado e multivariado com busca linear.
- `kkt_solver.py`: Resolução de problemas não lineares com restrições via SciPy SLSQP.
