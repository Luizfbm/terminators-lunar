# Arquitetura proposta

> **Status: proposta, em discussão no grupo.** Nada aqui foi decidido.

## Contexto

- O desafio pede sítios curados **e coordenadas livres**, não só o polo sul. Isso quebra a ideia de "pré-calcular tudo para 10 sítios".
- Os Resources oficiais só saem em 13/11, um dia antes do hackathon.
- O DEM polar de 20 m tem ~3,7 GB em float32.
- O desafio enfatiza o tempo até o pôr do Sol e o "pôr da Terra", e a comparação rápida do tipo "e se?".
- **Concorrência (02/11):** pelo menos oito times já têm horizonte com DEM, SPICE e validação prontos, alguns com dois meses de trabalho. Rigor deixou de ser diferencial sozinho. O que ainda está livre: a contagem regressiva até o pôr do Sol e da Terra (que o desafio pede e nenhum README cita), os 130 sítios do Wueller 2026, a incerteza do DEM por sítio e a validação contra o Blue Ghost 1 e o IM-2. Detalhes em [concorrencia.md](concorrencia.md).

## Proposta

1. **Efemérides leves, cálculo no navegador.**
   - Pré-calcular, hora a hora e por alguns anos, só os **pontos subsolar e sub-Terra** (lat, lon, distância), com spiceypy e os kernels NAIF (ver [fontes.md](fontes.md)). Ficam alguns MB.
   - O azimute e a elevação em **qualquer coordenada** saem por trigonometria **no próprio navegador**, com correção da paralaxe da Terra (~0,26°).
2. **Máscara de horizonte no backend.**
   - Calculada sob demanda para coordenadas livres e guardada em cache para os sítios curados.
   - Segue a receita do Barker et al. 2021: **720 azimutes (0,5°)**, raios até **~200 km** no polo e **300 km** como limite geral (Mazarico 2018), com curvatura d²/(2R).
   - DEM em **grades aninhadas**: **5 m até 5 km** (o DEM de 5 m onde existir, senão o de 20 m), **80 m de 5 a 100 km** e **240 m além de 100 km**. Os DEMs `LDEM_80S_20/40/80MPP_ADJ` e `LDEM_60S_240MPP_ADJ` já existem prontos no PGDA 90 (Barker 2023).
   - Ler o DEM em janelas (memmap ou `rasterio`), sem carregar tudo na memória.
   - Fora do polo, usar o SLDEM2015.
   - O Sol é tratado como um disco: a fração visível é o corte horizontal do disco na altura do horizonte.
   - Métricas iguais às da NASA: iluminação média, **LCIP** e **LCSP**, calculadas a 1–2 m de altura e na altura do mastro escolhida.
   - Como a elipse de pouso tem 100 m de raio, mostrar também **a variação das métricas dentro de 100 m** do ponto.
3. **Fonte de dados isolada** atrás de interfaces simples ("um DEM", "um provedor de efemérides"), para trocar pelo que vier nos Resources de 13/11.
4. **Validação** contra o JPL Horizons, os mapas do PGDA 69, os dias de Sol e de Sol + Terra do Wueller 2026 e os números publicados: Gläser 2014 (92,27% / 95,65%), Bryant 2009 (92% de energia / 51% de DTE) e Mazarico 2011 (~240 dias seguidos). Ver [artigos.md](artigos.md).
   - Os artigos usam o referencial MOON_ME do DE421; nós usaremos o DE440. A diferença é de poucos metros e não afeta os resultados.
5. **Prioridade de escopo:**
   1. **Núcleo:** sítio + data → panorama 360°, elevação, margem acima do horizonte, horas de Sol e de DTE, **contagem regressiva até o pôr do Sol e o "pôr da Terra"**.
   2. **Comparação** lado a lado e modo **"e se?"** (data deslocada, sítio a 5 km).
   3. **Modo educativo:** a trilha do Sol no polo vs. no sítio da Apollo 11 vs. na Terra.
   4. **Otimização como diferencial:** janela deslizante + Pareto; PL para o plano de operações.
6. **"Modo Artemis III"**: filtros com os 6 requisitos oficiais (até 6° do polo; inclinação < 10° no pouso e < 20° na EVA; Terra ≥ 25%; Sol ≥ 5% e Sol durante os ~6,5 dias de estadia; pouso a até 100 m). Ver o item 12 de [artigos.md](artigos.md).
7. **"Porto seguro"** (ideia do VIPER): o sítio aguenta a fase sem Terra com sombra ≤ X horas? O VIPER usou 50 h.
   - **Incerteza do relevo sem custo:** a fórmula ε = a·R + b·S + c do Barker 2021 (ou os mapas de incerteza do Barker 2023) dá o erro esperado do DEM. Lembrar que o valor nominal é **otimista**: o erro do DEM quase sempre piora a iluminação.
   - **Limite de inclinação como parâmetro:** o requisito do HLS de 2019 é < 8° (meta < 5°), e a palestra do Space Apps 2025 diz < 10°. Usar 8° como padrão.
8. **Otimização com TOPSIS** (Peña-Asensio 2024): os sliders de peso dão a nota de cada sítio pela distância à solução ideal e à anti-ideal.
9. **Motor de Otimização Reversa de Missão (Engenharia Inversa Hardware → Sítio):**
   - Em vez de exigir tentativa e erro manual de datas e coordenadas, o usuário informa suas restrições de projeto: **Ano (2025–2032)**, **Duração da missão (dias)**, **Massa de bateria disponível (kg)**, **Densidade energética (Wh/kg)** e **Consumo de sobrevivência na sombra (W)**.
   - O motor traduz a bateria em horas máximas de tolerância à escuridão ($T_{\text{sombra\_max}} = E_{\text{max}} / P_{\text{consumo}}$), filtra instantaneamente os 130 sítios oficiais (Wueller et al., 2026) e devolve:
     - **Sítio Mais Convidativo (Ótimo Global Pareto):** Maior folga energética e de DTE;
     - **Sítio Viável Mais Restritivo:** Opera no limite exato da bateria;
     - **Preço Sombra Dual (Sensibilidade):** Quantos novos sítios de pouso são desbloqueados por quilo adicional de bateria.
10. **Aceleração de Dados Pesados sem "Chutar" Relevo (Leitura em Janela + Equação de Incerteza de Barker 2021):**
    - **Por que NÃO usar ML para "adivinhar" relevo de 5 m:** O micro-relevo de crateras de um sítio não tem conexão causal com o de outro sítio distante; tentar prever feições de 5 m a partir de 240 m via IA geraria artefatos falsos.
    - **Solução exata para Coordenadas Livres:** Em vez de baixar os $2,6\text{ GB}$ do DEM de 20 m (`PGDA 90`), ler apenas a janela espacial necessária via *memmap* / *Cloud-Optimized GeoTIFF (HTTP Range Requests)* (~40 a 130 ms por sítio para os 720 raios).
    - **Correção Analítica de Incerteza (Barker et al., 2021):** Para quantificar o impacto das feições menores que a grade (onde o laser não bateu), aplicamos diretamente a equação empírica calibrada pela NASA na Tabela 1 de Barker (2021): $\varepsilon = 0,0210 \cdot R + 0,0051 \cdot S + 0,022\text{ m}$ (onde $R$ é a resolução efetiva e $S$ é a inclinação local), informando ao usuário a margem de segurança pessimista sem inventar topografia.
11. **Deploy:** um servidor próprio com túnel HTTPS, mais um frontend estático de reserva, para a demo não depender de um único servidor.

## O que foi descartado e por quê

- **Carregar o DEM inteiro na memória:** desnecessário e arriscado.
- **Calcular mapas de iluminação pixel a pixel de regiões inteiras:** pesado demais. Para isso, usamos os produtos prontos do PGDA 69.
- **Simplex ou algoritmo genético para escolher a janela de pouso:** força bruta resolve em milissegundos. Ver [curso-otimizacao.md](curso-otimizacao.md).
- **Cesium Moon Terrain para cálculo:** há relato de que ele fica ~2,5 km acima do LOLA. Serve só para visual.

## Cronograma sugerido (revisto pela regra do Space Apps)

> ⚠️ O FAQ oficial diz: **"Teams are not allowed to begin working on the challenges prior to the hackathon."** Antes de 14/11 o plano é só **estudo e preparação do time**, sem código do projeto. Ver [hackathon-referencias.md](hackathon-referencias.md).

| Quando | O que fazer |
|---|---|
| Até 13/11 | **Estudar**: ler os docs, aprender SPICE/spiceypy, DEMs (rasterio) e a receita do horizonte em tutoriais genéricos. Dividir os papéis, incluindo alguém para **pitch e design**. **Perguntar ao Local Lead** o que é permitido. Entrar no Space Apps Connect (abre 03/11). |
| 13/11 | Ler os Resources, o guia de Submissão e o guia de Julgamento oficiais. Ajustar o plano. |
| 14/11 (sábado) | Construir o núcleo: efemérides (pontos subsolar e sub-Terra), máscara de horizonte de 2–3 sítios, panorama, contagem regressiva até sunset/Earthset. Validar contra o Horizons. |
| 15/11 (domingo) manhã | Comparação, "e se?", lista curada, modo educativo e deploy estático (link público). |
| 15/11 (domingo) tarde | **Apresentação, que pesa igual aos outros critérios**: vídeo de 30 s ou 7 slides, página em inglês, seção de uso de IA e dados citados. Repositório público e open source. |
