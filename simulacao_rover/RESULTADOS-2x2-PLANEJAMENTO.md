# Calibração do terreno e experimento 2×2 plano × execução (14/11/2026)

Arquivo: `animacao_tese_rover_neuroevolucao_v13.html` (v11/v12 intactos). Scripts: `testes/ilum.js`, `tune.js`, `teste15.js`, `teste16.js`.

## 1. Por que tudo dava "100% de perda por energia"
- **Escala de tempo:** na animação o Sol gira 2,4°/s e o rover cruza 2,9 km em ~226 s ⇒ vê ≈3 dias lunares. Sombras curtas viram dezenas de horas no escuro.
  Nova opção **"realista"**: o rover anda à velocidade média do VIPER (1 cm/s, NASA: https://ntrs.nasa.gov/api/citations/20220008301/downloads/2022-06-02-spaceops-viper-planning.pdf);
  1 s ≈ 0,356 h, Sol ≈ 0,18°/s (≈41° na travessia); todas as taxas %/s escalam por 0,0753 (VIPER: hibernação 0,71 %/s, 50 h = 141 s).
- **Terreno:** iluminação medida em 24 rotas (6 terrenos × 4 rotas) ao longo de uma volta do Sol. Terreno original: 45% (5 m) / 68% (60 m), escuridão contínua ≈300 h.
  Calibrado (picos 4,5–7,5 m a 110–240 m da rota): **86% em 60 m** (literatura 77–88%), escuridão contínua máx. ≈95 h (trajeto otimizado publicado: 101 h);
  em 5 m ≈53% (microcrateras de 5 m projetam sombras curtas locais, invisíveis nos mapas publicados).

## 2. Efeito do horário de saída (48 simulações, escala animação, terreno antigo)
Escolher o melhor horário por terreno: 8% → 21% da rota; perdas por energia 89% → 47% (metade vira "preso"); chegada à PSR 0% em todas.

## 3. 2×2 (escala realista, terreno calibrado, Padrão, hibernação real, regra fixa; 12 terrenos)
O horário de saída e a rota vêm do planejador de cada coluna (8 horários × 4 rotas, menor custo previsto).

| Plano feito com | Execução A (sem tese) | Execução B (com a tese) |
|---|---|---|
| Saída fixa 0° (planos originais) | 9% da rota / PSR 0% | 31% / PSR 12% |
| Grade 60 m | 12% / 0% | 34% / 13% |
| Tese (5 m + margem) | 10% / 0% | 28% / 14% |

- **Execução:** A→B ≈ +20 pontos de rota e PSR de 0% para 12–14%. É onde a tese entrega.
- **Plano:** sem diferença mensurável (grade 34% × tese 28% no B; 12% × 10% no A); só 4 de 12 terrenos escolheram a mesma rota. A fórmula de custo não prevê o resultado.
- **Perdas do B:** energia 0%, **preso 72–78%**, relevo 8–15%. O gargalo agora é o rover ficar preso (provável relação com a remoção do recuo em corredor estreito); em 7 de 12 terrenos B ≈ 6–15%.
- Uma rodada por célula, 12 terrenos: diferenças de poucos pontos estão dentro do ruído.
