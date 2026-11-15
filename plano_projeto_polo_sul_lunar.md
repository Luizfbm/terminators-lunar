# Plano de Projeto — Lunar South Pole Mission Planner (NASA 2026)
## Ferramenta Interativa de Otimização e Visualização para Pouso no Polo Sul Lunar

---

### 1. Resumo Executivo e Enunciado do Desafio

> **Desafio NASA:**
> *"Missions to the Moon’s south pole face extreme lighting and communication constraints, and planning them takes careful coordination between science and engineering teams. Tools for determining Sun and Earth positions at candidate landing sites exist, but their complicated interfaces make it difficult to evaluate critical information with efficiency. Your challenge is to create an intuitive tool or application that lets mission planners, educators, and the public compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows."*

O objetivo do projeto é conceber e implementar uma **aplicação interativa de alta usabilidade** capaz de calcular, visualizar e **otimizar** janelas temporais de pouso e operação no Polo Sul da Lua, avaliando:
1. **Posição e Elevação do Sol** (potencial de geração de energia fotovoltaica e períodos de eclipse/escuridão extrema).
2. **Posição e Elevação da Terra** (janelas de comunicação direta com a Terra — *Direct-to-Earth / DTE* sujeitas à libração lunar).
3. **Topografia e Horizonte Local** (bloqueio de visada por montanhas e crateras).
4. **Otimização Multiobjetivo de Missão** (encontrar as melhores datas e locais com base em formulações de Pesquisa Operacional e Métodos de Otimização).

---

### 2. Por que Usar Métodos de Otimização (Curso Marcato)?

O planejamento tradicional faz buscas manuais ou varreduras gráficas lentas. Com as técnicas do curso de Métodos de Otimização (Prof. André Marcato - UFJF), implementaremos um **motor de decisão analítico**:

1. **Modelagem Matemática (Aula 01):**
   - **Variáveis de decisão:** Instante de pouso $t_0$, duração da missão $\Delta t$, e escolha do sítio de pouso $S_k \in \{S_1, S_2, \dots, S_N\}$.
   - **Função Objetivo:**
     $$\max_{t_0, S_k} J = w_{\text{solar}} \int_{t_0}^{t_0 + \Delta t} P_{\text{solar}}(t) \, dt + w_{\text{comms}} \int_{t_0}^{t_0 + \Delta t} C_{\text{DTE}}(t) \, dt - w_{\text{risco}} \text{Penalidade}(t_0)$$
   - **Restrições Operacionais:**
     - Elevação solar mínima para geração: $\theta_{\text{sol}}(t) \ge \theta_{\text{horizonte}}(\phi_{\text{sol}}(t))$.
     - Elevação da Terra mínima para rádio: $\theta_{\text{terra}}(t) \ge \theta_{\text{comms\_min}} \approx 5^\circ$.
     - Tempo máximo contínuo em escuridão $\le T_{\text{bateria\_max}}$.
     - Tempo máximo de silêncio de rádio $\le T_{\text{comms\_loss\_max}}$.

2. **Programação Linear Inteira-Mista (MILP) e Simplex (Aulas 04, 05, 08):**
   - Discretização dos intervalos de tempo e seleção binária de sítios candidatos via variáveis $\{0, 1\}$.
   - Uso de **Preços Sombra / Variáveis Duais** para avaliar o custo de oportunidade de restrições de bateria versus ângulo dos painéis solares.

3. **Otimização Não Linear e Condições KKT (Aulas 10, 11, 12):**
   - Orientação ótima contínua de painéis solares rastreadores (*solar tracking*) maximizando a captação de irradiação em função do azimute e elevação solares.

---

### 3. Arquitetura do Sistema

O sistema é desenhado em **3 camadas modulares**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CAMADA 1: NÚCLEO FÍSICO                           │
│  - Efemérides Lunares (NASA SPICE / SpiceyPy / Skyfield / Astropy)     │
│  - Coordenadas Selenográficas (MCMF - Moon Centered Moon Fixed)        │
│  - Cálculo de Azimute e Elevação do Sol e da Terra                     │
│  - Perfis de Horizonte Topográfico (LOLA / LRO DEM)                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CAMADA 2: MOTOR DE OTIMIZAÇÃO                        │
│  - Algoritmo de Otimização de Janelas de Missão (SciPy / NumPy)        │
│  - Solver de Programação Linear para Despacho de Bateria e Potência    │
│  - Classificação e Ranking dos Sítios Candidatos                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    CAMADA 3: INTERFACE INTUITIVA                       │
│  - Visualizador Polar Azimute-Elevação do Horizonte (360°)             │
│  - Linha do Tempo Interativa de Luz e Comunicação (Gantt Colorido)    │
│  - Comparador Lado a Lado de Sítios de Pouso                           │
│  - Painel de Recomendações Automáticas de Datas Ótimas                 │
│  - Dashboard Web (Streamlit / Dash / React)                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Sítios de Pouso Candidatos (Polo Sul Lunar - Artemis Candidate Sites)

| ID | Nome do Sítio | Latitude | Longitude | Características Principais |
| :---: | :--- | :---: | :---: | :--- |
| **S1** | **Shackleton Crater Rim** | 89.9° S | 0.0° E | Iluminação quase contínua em pontos altos; cratera adjacente permanentemente sombreada (PSR). |
| **S2** | **Malapert Mountain (Peak)** | 85.9° S | 2.7° E | Excelente visibilidade contínua da Terra (DTE) devido à grande elevação topográfica. |
| **S3** | **Connecting Ridge** | 89.4° S | 222.0° E | Conexão estratégica entre Shackleton e de Gerlache; favorável para mobilidade de rovers. |
| **S4** | **Leibnitz Plateau** | 85.4° S | 32.5° E | Superfície relativamente plana, com boas janelas solares sazonais. |
| **S5** | **Haworth Rim** | 87.4° S | 355.0° E | Borda de cratera com depósitos de voláteis/gelo de água. |

---

### 5. Cronograma e Etapas de Desenvolvimento

#### Fase 1: Motor de Efemérides e Astrometria (Fundação)
- [ ] Implementar script de cálculo de Azimute e Elevação do Sol e Terra a partir de qualquer coordenada lunar $(lat, lon)$ no tempo $t$.
- [ ] Validar com dados oficiais da NASA (JPL Horizons / SPICE).
- [ ] Criar matriz de iluminação e visibilidade para 2026-2028.

#### Fase 2: Motor de Otimização (Aulas Marcato)
- [ ] Modelar a função objetivo de mérito (Energia Solar + Contato DTE - Penalidade de Frio/Escuridão).
- [ ] Implementar algoritmo de busca da janela ótima de 7, 14 ou 28 dias de missão.
- [ ] Incorporar restrição de horizonte e capacidade de armazenamento de energia.

#### Fase 3: Desenvolvimento da Interface Interativa
- [ ] Gráfico de Horizonte Polar (Skyplot): Trajetória do Sol (amarelo) e da Terra (azul) no horizonte local.
- [ ] Timeline de Operação: Barras coloridas indicando janelas de potência e comunicação.
- [ ] Comparador de Sítios: Tabela e gráficos comparativos rápidos para apoio à decisão.
- [ ] Seletor rápido de datas com botão *"Descobrir Melhor Janela de Pouso"*.

#### Fase 4: Documentação, Testes e Apresentação
- [ ] Manual de uso e contextualização científica.
- [ ] Validação de casos de uso (Missão tripulada Artemis, Rover autônomo, Estação científica fixa).
- [ ] Vídeo demonstrativo e entrega do projeto.

---

### 6. Estrutura de Arquivos do Projeto

```
c:\NASA PROJETO 2026\
├── Curso_Metodos_Otimizacao_Marcato\
│   ├── Compendio_Metodos_Otimizacao_Marcato.md
│   ├── simplex_tableau.py
│   └── metodos_nao_lineares.py
├── plano_projeto_polo_sul_lunar.md         <-- Este documento
├── src\
│   ├── ephemeris.py                        <-- Cálculo do Sol e da Terra
│   ├── optimizer.py                        <-- Motor de otimização de janelas
│   ├── sites.json                          <-- Coordenadas e metadados dos sítios
│   └── app.py                              <-- Interface gráfica interativa
└── requirements.txt                        <-- Dependências (numpy, scipy, etc.)
```
