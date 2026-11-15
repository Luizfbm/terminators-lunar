# O desafio

Página oficial: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=details

- **Nome atual:** Lunar Landing Site Navigator ("Navegador do Local de Pouso Lunar"). O nome antigo, que aparece nos primeiros prints do grupo, era "CLPS Lunar Mission Browser".
- **Dificuldade:** Advanced / Intermediate.
- **Temas:** Human Exploration, Moon, Software, Space Exploration.
- **Resources:** a aba diz que os recursos ficam disponíveis na **sexta, 13/11/2026**. Até lá, usamos dados públicos (ver [fontes.md](fontes.md)).

## O que pedem

Criar uma ferramenta que permita a planejadores de missão, educadores e ao público **comparar sítios e datas de pouso rapidamente**, mostrando **Sol e Terra em relação ao horizonte** para avaliar a **geração de energia** e as janelas de **comunicação direta com a Terra (DTE)**.

Objetivos sugeridos (todos opcionais):

- **Escolha e comparação de sítios:** uma lista curada (Apollo, alvos do CLPS, outras missões comerciais, sítios de outros países) **e coordenadas digitadas pelo usuário**, com comparação lado a lado.
- **Flexibilidade de data e hora:** ver como as condições mudam entre dias lunares e estações.
- **Sol e Terra no horizonte** do sítio, mais o **tempo restante até o pôr do Sol e o "pôr da Terra"**. O desafio chama isso de *critical operational information* e cita duas vezes.
- **Métricas:** elevação solar (eficiência da geração), duração da luz solar e janelas de visibilidade da Terra.
- **Várias formas de visualização:** mapas 2D, superfícies 3D ou outras representações criativas.
- **Dinâmica no tempo:** animações e linhas do tempo ao longo do dia lunar.
- **Acessível para todos os níveis:** do planejador de missão ao público curioso.
- **Formato livre:** web, mobile, visualização interativa ou até **jogo educativo**.

## Considerações técnicas citadas

- Efemérides via **JPL Horizons** ou dados pré-calculados.
- Topografia do **LOLA** para calcular o horizonte.
- **Sem atmosfera, sem refração:** o horizonte é o relevo mais a borda da esfera lunar.
- Considerar a **libração** da Terra e as variações orbitais da Lua.
- Encostas íngremes e crateras profundas criam sombras extremas no polo sul.
- Deixar claras as diferenças extremas entre a Lua e a Terra.
- Mostrar **por que pequenas mudanças de local ou de data têm grande impacto**.

## Cenário central

O texto enfatiza a **remarcação**. Quando o hardware atrasa ou o lançamento escorrega, a equipe precisa avaliar rápido um sítio vizinho ou uma data alternativa. Um modo **"e se?"** responde direto a isso.

## Concorrentes citados

O desafio cita três: **LROC Quickmap**, **Moon Trek** e **JPL Horizons**. Para o pitch:
- cronometrar de verdade quanto tempo leva para responder uma pergunta simples em cada um;
- antes de afirmar que o Moon Trek "não tem" ferramenta de iluminação, conferir.

## Briefing original do grupo (resumo)

**Problema:** o Moon Trek é um SIG pesado. Leva de 15 a 20 minutos de configuração antes de ver qualquer dado, o Sol e a Terra são calculados em ferramentas separadas e a curva de aprendizado deixa de fora quem não é especialista.

**Arquitetura imaginada pelo grupo:**
- **Backend (Python):** física e efemérides; relevo e máscara de horizonte (LOLA DEM); motor de otimização (janelas, Pareto, PL).
- **Frontend:** panorama 360° do horizonte; linha do tempo colorida (luz, rádio, apagões); sliders de pesos e filtros; comparador de sítios e botão "Otimizar Missão".
