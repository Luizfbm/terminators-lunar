# Diretório Dedicado: Metodologia Multirresolução (Dados e Artigos Base)

> **Finalidade:** Repositório local e autocontido de dados brutos, artigos científicos primários, planilhas de calibração e bancada de validação para a **Metodologia Multirresolução (240m → 60m → 20m → 5m)**.
> **Status:** Local (não enviado para o repositório remoto até autorização expressa).

---

## 📁 Estrutura de Arquivos

```
c:\NASA PROJETO 2026\multirresolucao\
│
├── Catalogo_Kernels_e_Simulacao_Polo_Sul_Multirresolucao_v2.xlsx
│   └── Planilha mestre oficial com 5 abas:
│       1. 1_Padronizacao_Condicoes (Ceteris Paribus)
│       2. 2_Calibracao_Sitios_Comuns (Dados brutos dos 4 sítios)
│       3. Bancada_Validacao_5m (Validação científica passo a passo + 98,3% assertividade + Custo Computacional HPC vs Rover)
│       4. 3_Simulador_Multirresolucao (Motor reverso de missão)
│       5. 4_Base_130_Sitios_5m_MC (Matriz completa dos 130 sítios com NORMSDIST)
│
├── build_bancada.py
│   └── Script de automação que constrói e atualiza a aba Bancada_Validacao_5m no Excel.
│
├── README.md
│   └── Este documento de inventário, contexto físico e rastreabilidade dos dados.
│
├── tabelas_brutas/
│   ├── artemis_sitios_wueller2026.csv
│   │   └── Base primária oficial de Wueller et al. (fev/2026) contendo todos os 130 sítios
│   │       candidatos da Artemis III, com coordenadas heliográficas, inclinação local (S),
│   │       distância e área de PSRs, e iluminação solar contínua 2025–2032 na resolução de 60 m/px.
│   │
│   └── calibracao_sitios_referencia_4resolucoes.csv
│       └── Tabela consolidada dos 4 sítios de calibração comuns (001, 004, 007, 011) cruzando
│           as medições de 240 m, 60 m, 20 m e 5 m com os parâmetros de erro de Barker (2021).
│
└── artigos_base/
    ├── 2021_Barker_Improved-LOLA-PSS203.pdf
    │   └── Artigo seminal da NASA (Mike Barker et al., Planetary and Space Science 2021).
    │       Contém a Tabela 1 (coeficientes da regressão de erro vertical e de inclinação)
    │       e a Tabela 2 (simulações de Monte Carlo com 100 clones a 5 m/px a 1 m e 5 m de mastro).
    │
    ├── 2018_Glaser_illumination-poles-PSS162.pdf
    │   └── Artigo do DLR/NASA (Philipp Gläser et al., PSS 2018).
    │       Contém as séries horárias a 20 m/px de 2017 a 2037 para Connecting Ridge e Shackleton,
    │       com separação entre iluminação média e visibilidade solar.
    │
    ├── 2023_Barker_New-View-PSJ4.pdf
    │   └── Publicação da NASA (Barker et al., The Planetary Science Journal 2023).
    │       Documenta a família oficial de DEMs consistentes do LOLA (PGDA 90: 20, 40, 80 e 240 m/px)
    │       e o catálogo de PSRs a 20 m/px.
    │
    └── 2024_Pena-Asensio_ArtemisIII-MCDM-ActaAstronautica.pdf
        └── Artigo de referência de decisão multicritério (Peña-Asensio et al., Acta Astronautica 2024).
            Fundamentação dos pesos e método TOPSIS aplicados à seleção de sítios do HLS.
```

---

## 🔬 Destaques da Bancada de Validação Científica (`Bancada_Validacao_5m`)

1. **Assertividade Média Comprovada:**
   * **20 m/px (vs. Gläser 2018):** **97,7% de assertividade**;
   * **5 m/px (vs. 100 clones de Barker 2021 Tabela 2):** **98,3% de assertividade** (com erro residual médio de apenas $-0,2\text{ pontos percentuais}$).

2. **Complexidade Computacional e Custo-Benefício:**
   * Simulação direta via Ray-Tracing a 5 m no Polo Sul: **~4,8 horas** por sítio ($2,95 \times 10^{14}$ operações em supercomputador HPC);
   * Modelo Analítico Multirresolução: **0,001 segundo** ($O(1)$ em CPU comum);
   * **Speedup:** **$17.280.000\times$ mais rápido**;
   * **Viabilidade de Bordo:** 100% executável em tempo real no computador do rover lunar (**BAE RAD750, 133 MHz, 128 MB RAM**).
