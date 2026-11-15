N = 30 terrenos novos (sementes 7101–7130), 60 rovers por terreno.


**rota_%** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 17.5 ± 8.3 | 17.1 | 10.7–22.5 | 6.5–34.7 |
| D1a + restrições duras/escudo (60 m) | 30 | 74.2 ± 15.9 | 78.9 | 68.4–84.6 | 31.3–94.4 |
| D1b + Simplex/dualidade (60 m) | 30 | 74.2 ± 15.9 | 78.9 | 68.4–84.6 | 31.3–94.4 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 76.4 ± 15.2 | 81.2 | 70.8–86.1 | 28.8–94.5 |
| D2 + Multirresolução 60→5 m P90 | 30 | 96.6 ± 7.0 | 99.1 | 97.0–100.0 | 66.2–100.0 |
| D3 + pesos do mérito aprendidos offline | 30 | 97.3 ± 5.1 | 99.2 | 97.2–100.0 | 81.2–100.0 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 93.6 ± 17.2 | 99.1 | 97.8–100.0 | 18.6–100.0 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 92.6 ± 21.3 | 99.4 | 98.4–99.9 | 9.6–100.0 |
| C2r controle: multirresolução sem Mérito | 30 | 96.2 ± 7.3 | 98.6 | 96.1–100.0 | 64.7–100.0 |

**PSR_%** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 0.4 ± 1.6 | 0.0 | 0.0–0.0 | 0.0–8.3 |
| D1a + restrições duras/escudo (60 m) | 30 | 53.0 ± 22.1 | 56.7 | 32.9–69.2 | 16.7–88.3 |
| D1b + Simplex/dualidade (60 m) | 30 | 53.0 ± 22.1 | 56.7 | 32.9–69.2 | 16.7–88.3 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 56.3 ± 21.5 | 57.5 | 43.8–70.0 | 16.7–90.0 |
| D2 + Multirresolução 60→5 m P90 | 30 | 95.2 ± 7.7 | 98.3 | 93.3–100.0 | 63.3–100.0 |
| D3 + pesos do mérito aprendidos offline | 30 | 95.9 ± 5.6 | 98.3 | 96.7–100.0 | 80.0–100.0 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 90.9 ± 19.7 | 98.3 | 95.4–100.0 | 13.3–100.0 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 82.1 ± 29.7 | 96.7 | 87.5–98.3 | 1.7–100.0 |
| C2r controle: multirresolução sem Mérito | 30 | 95.2 ± 8.1 | 98.3 | 95.0–100.0 | 61.7–100.0 |

**preso_%** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 0.0 ± 0.0 | 0.0 | 0.0–0.0 | 0.0–0.0 |
| D1a + restrições duras/escudo (60 m) | 30 | 0.0 ± 0.0 | 0.0 | 0.0–0.0 | 0.0–0.0 |
| D1b + Simplex/dualidade (60 m) | 30 | 0.0 ± 0.0 | 0.0 | 0.0–0.0 | 0.0–0.0 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 0.0 ± 0.0 | 0.0 | 0.0–0.0 | 0.0–0.0 |
| D2 + Multirresolução 60→5 m P90 | 30 | 0.1 ± 0.6 | 0.0 | 0.0–0.0 | 0.0–3.3 |
| D3 + pesos do mérito aprendidos offline | 30 | 0.0 ± 0.0 | 0.0 | 0.0–0.0 | 0.0–0.0 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 1.2 ± 5.5 | 0.0 | 0.0–0.0 | 0.0–30.0 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 1.6 ± 8.5 | 0.0 | 0.0–0.0 | 0.0–46.7 |
| C2r controle: multirresolução sem Mérito | 30 | 0.0 ± 0.0 | 0.0 | 0.0–0.0 | 0.0–0.0 |

**perda_relevo_%** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 99.4 ± 1.7 | 100.0 | 100.0–100.0 | 91.7–100.0 |
| D1a + restrições duras/escudo (60 m) | 30 | 37.2 ± 20.1 | 35.8 | 23.8–52.1 | 6.7–78.3 |
| D1b + Simplex/dualidade (60 m) | 30 | 37.2 ± 20.1 | 35.8 | 23.8–52.1 | 6.7–78.3 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 34.3 ± 18.5 | 30.0 | 22.1–43.3 | 10.0–78.3 |
| D2 + Multirresolução 60→5 m P90 | 30 | 1.7 ± 2.7 | 0.8 | 0.0–1.7 | 0.0–11.7 |
| D3 + pesos do mérito aprendidos offline | 30 | 1.2 ± 1.6 | 0.0 | 0.0–1.7 | 0.0–6.7 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 1.1 ± 1.3 | 0.8 | 0.0–1.7 | 0.0–5.0 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 0.4 ± 0.9 | 0.0 | 0.0–0.0 | 0.0–3.3 |
| C2r controle: multirresolução sem Mérito | 30 | 2.0 ± 3.0 | 0.0 | 0.0–3.3 | 0.0–11.7 |

**perda_energia_%** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 0.2 ± 0.7 | 0.0 | 0.0–0.0 | 0.0–3.3 |
| D1a + restrições duras/escudo (60 m) | 30 | 9.1 ± 16.4 | 1.7 | 1.7–6.2 | 0.0–58.3 |
| D1b + Simplex/dualidade (60 m) | 30 | 9.1 ± 16.4 | 1.7 | 1.7–6.2 | 0.0–58.3 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 8.9 ± 16.0 | 2.5 | 0.0–6.7 | 0.0–60.0 |
| D2 + Multirresolução 60→5 m P90 | 30 | 3.0 ± 7.5 | 0.0 | 0.0–1.7 | 0.0–36.7 |
| D3 + pesos do mérito aprendidos offline | 30 | 2.8 ± 5.3 | 0.0 | 0.0–3.3 | 0.0–18.3 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 6.8 ± 19.2 | 0.0 | 0.0–0.0 | 0.0–86.7 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 12.8 ± 25.4 | 3.3 | 0.0–8.3 | 0.0–98.3 |
| C2r controle: multirresolução sem Mérito | 30 | 2.8 ± 7.7 | 0.0 | 0.0–1.7 | 0.0–38.3 |

**SOC_final_%** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 95.8 ± 1.6 | 95.9 | 94.8–97.1 | 91.7–98.1 |
| D1a + restrições duras/escudo (60 m) | 30 | 77.5 ± 10.8 | 79.9 | 73.4–85.8 | 52.1–92.0 |
| D1b + Simplex/dualidade (60 m) | 30 | 77.5 ± 10.8 | 79.9 | 73.4–85.8 | 52.1–92.0 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 77.3 ± 10.4 | 77.4 | 70.1–85.5 | 54.8–91.4 |
| D2 + Multirresolução 60→5 m P90 | 30 | 86.6 ± 7.8 | 88.6 | 80.6–92.3 | 67.2–99.9 |
| D3 + pesos do mérito aprendidos offline | 30 | 86.8 ± 7.1 | 88.7 | 82.2–91.6 | 69.5–99.7 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 85.3 ± 10.4 | 88.4 | 82.6–91.5 | 55.7–97.7 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 82.9 ± 11.7 | 85.3 | 78.5–89.8 | 57.7–98.1 |
| C2r controle: multirresolução sem Mérito | 30 | 85.7 ± 10.1 | 89.0 | 79.5–92.4 | 56.9–99.7 |

**tempo_travessia_h** — média ± dp | mediana | Q1–Q3 | mín–máx

| Degrau | N | média ± dp | mediana | IQR | mín–máx |
|---|---|---|---|---|---|
| D0 Base ingênua (rover A, 60 m) | 30 | 427.8 ± 143.6 | 393.8 | 358.2–471.3 | 270.0–1068.0 |
| D1a + restrições duras/escudo (60 m) | 30 | 427.8 ± 143.6 | 393.8 | 358.2–471.3 | 270.0–1068.0 |
| D1b + Simplex/dualidade (60 m) | 30 | 427.8 ± 143.6 | 393.8 | 358.2–471.3 | 270.0–1068.0 |
| D1c + Mérito: barreira log + Newton/KKT (60 m) | 30 | 401.0 ± 142.5 | 361.4 | 328.5–426.2 | 259.1–1068.0 |
| D2 + Multirresolução 60→5 m P90 | 30 | 279.8 ± 136.5 | 248.1 | 202.9–280.7 | 149.5–773.1 |
| D3 + pesos do mérito aprendidos offline | 30 | 261.9 ± 158.3 | 228.9 | 212.6–248.9 | 175.2–1068.0 |
| D4a + MLP 8→7→4 neuroevoluída sob escudo | 30 | 263.1 ± 130.5 | 213.5 | 195.8–266.0 | 157.6–736.9 |
| D4b + IA Híbrida 14→8→3 sob escudo | 30 | 427.2 ± 283.9 | 311.2 | 222.2–459.4 | 172.9–1068.0 |
| C2r controle: multirresolução sem Mérito | 30 | 291.6 ± 195.2 | 222.3 | 188.3–269.4 | 162.2–958.3 |


### Transições Com × Sem (pareadas)

Wilcoxon pareado por terreno (N = 30) na taxa de chegada à PSR e na % da rota; McNemar exato por rover pareado (30 × 60 = 1.800 pares; b = só o degrau anterior chega, c = só o novo chega). p ajustado por Holm sobre as transições listadas. r_rb = correlação rank-biserial pareada (−1 a +1).

| Transição | Δ PSR (pontos) [IC 95% bootstrap] | Wilcoxon p (Holm) | r_rb | Δ rota (pontos) | Wilcoxon p | McNemar b / c | McNemar p (Holm) | razão de chances c/b |
|---|---|---|---|---|---|---|---|---|
| D0 → D1a | +52.6 [+45.0; +60.1] | 1.7e-06 (1.6e-05) | +1.00 | +56.7 | 1.9e-09 | 1 / 948 | 4e-283 (3.6e-282) | 632.33 |
| D1a → D1b | +0.0 [+0.0; +0.0] | 1 (1) | +0.00 | +0.0 | 1 | 0 / 0 | 1 (1) | 1.00 |
| D1b → D1c | +3.3 [+0.2; +6.4] | 0.068 (0.34) | +0.39 | +2.1 | 0.077 | 301 / 360 | 0.024 (0.096) | 1.20 |
| D1c → D2 | +38.9 [+31.8; +46.4] | 1.7e-06 (1.6e-05) | +1.00 | +20.2 | 1.9e-09 | 47 / 748 | 2.1e-163 (1.4e-162) | 15.76 |
| D2 → D3 | +0.7 [-0.8; +2.6] | 0.81 (1) | +0.06 | +0.7 | 0.93 | 56 / 69 | 0.28 (0.85) | 1.23 |
| D3 → D4a | -5.1 [-11.6; -0.1] | 0.67 (1) | -0.10 | -3.8 | 0.5 | 146 / 55 | 1e-10 (5.2e-10) | 0.38 |
| D3 → D4b | -13.9 [-25.2; -3.9] | 0.025 (0.15) | -0.52 | -4.7 | 1 | 307 / 57 | 1.5e-42 (9e-42) | 0.19 |
| D1b → C2r | +42.2 [+34.8; +49.3] | 1.7e-06 (1.6e-05) | +1.00 | +21.9 | 1.9e-09 | 40 / 799 | 2.4e-184 (2e-183) | 19.74 |
| C2r → D2 | +0.1 [-1.1; +1.2] | 0.99 (1) | -0.00 | +0.4 | 0.48 | 66 / 67 | 1 (1) | 1.02 |


### O custo dos planejadores prevê o resultado?

Spearman ρ e Kendall τ entre terrenos: custo previsto da rota escolhida × taxa de chegada à PSR do time B. E, dentro de cada terreno, Kendall τ entre o custo previsto (grade ou tese) e o custo calculado com o relevo real nas 4 rotas (média entre terrenos): mede se o planejador ORDENA as rotas como a verdade.

| Degrau | planejador | ρ Spearman (p) | τ Kendall (p) | τ médio custo previsto × custo real nas 4 rotas |
|---|---|---|---|---|
| D1a | grade 60 m | +0.00 (0.99) | +0.01 (0.96) | +0.18 (n = 30) |
| D1b | tese/Simplex (b60) | +0.00 (0.99) | +0.01 (0.96) | +0.18 (n = 30) |
| D2 | tese/Simplex (t60) | +0.22 (0.25) | +0.15 (0.28) | +0.69 (n = 30) |
| D4b | tese/Simplex (t60) | -0.51 (0.0042) | -0.36 (0.0068) | +0.69 (n = 30) |

| Degrau | escolheu a rota de menor custo real |
|---|---|
| D1a | 5/30 |
| D1b | 5/30 |
| D2 | 20/30 |