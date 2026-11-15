# Simulação Rover: Sombras + Neuroevolução (cópia local, 13/11/2026)

Tudo aqui funciona sem internet. Abra o HTML com duplo clique.

| Arquivo / pasta | O que é |
|---|---|
| `animacao_tese_rover_neuroevolucao.html` | Animação atual (v8: rota de 3 km, nota densa, teste em terrenos inéditos, VIPER calibrado). Arquivo único, sem dependências externas. |
| `APRENDIZADOS-VIDEO-DINO.md` | Lições do vídeo "IA no Dino Chrome 2.0" e recomendações pendentes |
| `LINHA-DO-TEMPO.md` | **Exportar manualmente** (ver abaixo) |
| `testes/` | Testes sem navegador (Node.js). Rode de dentro da pasta `testes`, ex.: `node teste9.js 24` |
| `nucleo_missao/` | Núcleo de cálculo tipado em TypeScript (cronômetro, bateria, funil) para o app principal. `node testes_nucleo.js` |
| `versoes_anteriores/` | v1 a v7 da animação, para comparar e voltar atrás |

## Testes principais

| Script | Mede |
|---|---|
| `teste9.js [gerações]` | Aprendizado na rota longa + teste em 3 terrenos inéditos (IA, mérito, regra fixa) |
| `teste10.js [gerações] [modelo]` | Se o alerta da tese teria avisado o rover que segue o plano inicial |
| `teste5.js` / `teste6.js` | Fontes de previsão de sombra (60 m, 20 m, tese, oráculo) |
| `teste8.js viper 1` | VIPER calibrado com custo real da hibernação |
| `teste4.js` | Modelos de rover × cérebros |

Os testes 2 a 8 foram escritos para a rota curta (até a v7); na v8 rodam, mas cada geração leva ~5 s.

## Linha do Tempo

O documento vivo está em https://claude.ai/artifact/PsctsNSKpJvMthV6vyzvGu.
Para ter a cópia offline: abra o documento, menu com o nome do documento → Exportar → Markdown (ou Word), e salve aqui como `LINHA-DO-TEMPO.md`.

## Avisos

- Números da simulação valem para o modelo ilustrativo, não para missões reais.
- O treino não é salvo: recarregar a página zera os cérebros (refazer 24 gerações leva ~2 min no Turbo).
- A animação publicada online é a mesma deste arquivo: https://claude.ai/artifact/4WngfEtThPBP7KCB5jA4c6
