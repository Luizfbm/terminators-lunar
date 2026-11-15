# Síntese técnica — como construir a ferramenta

Documento de trabalho. Números marcados com **[v]** foram verificados no texto do artigo baixado
ou no resumo público; **[d]** é derivação física direta.

---

## 1. O problema físico em cinco fatos

1. A obliquidade da Lua é **1,54°**. No polo sul geográfico, o Sol **nunca sobe mais que ~1,5°**
   acima do horizonte e nunca desce muito abaixo — ele **gira em torno do horizonte** ao longo de
   um mês. [v: NASA SVS 5228 + Gläser 2018]
2. Por isso, **o relevo é o relógio**. Uma elevação de 100 m a 5 km de distância subtende ~1,1° e
   pode bloquear o Sol por dias. Iluminação no polo é um problema de **máscara de horizonte**,
   não de latitude.
3. A precessão lunar tem período de **18,6 anos**. A "melhor data" de 2027 não é a melhor de 2035.
   Qualquer ferramenta séria precisa cobrir esse ciclo. [v: Gläser 2018]
4. A **Terra** vista do polo sul fica permanentemente **perto do horizonte**, oscilando em torno de
   uma direção fixa (longitude ~0°). Logo, DTE também é função pura do relevo — e é **escassa**.
   [v: NASA SVS 5228 + Bryant 2009]
5. Iluminação e comunicação **não coincidem** no mesmo ponto: o melhor sítio solar tem ~50% de DTE.
   [v: Bryant 2009 — 92% solar / ~50% DTE]

### 1.1 A armadilha que quase todo mundo cai

Com o Sol a 1,5° de elevação, a irradiância sobre um painel **horizontal** é proporcional a
cos(1,5°) ≈ **0,026** — cerca de 2,6% da nominal. Ou seja: **"92% de iluminação" não significa
"92% de energia"**. [d]

→ A ferramenta **não pode** mostrar apenas "iluminado / não iluminado". Precisa mostrar o
**ângulo de elevação** (e idealmente a geometria do painel: horizontal × vertical × rastreador).
Esse é o diferencial técnico mais forte que você pode oferecer sobre o que já existe.

---

## 2. Pipeline de cálculo (reproduz o método da literatura)

### Passo 1 — Máscara de horizonte
Para cada sítio candidato, e para cada bin de azimute (0,5° ou 1°):

```
h(az) = max sobre todos os pontos do DEM ao longo da direção az
        de [ atan2( z_p - z_s ,  d_p ) ]
```

Onde `z_s` é a altura do sítio **mais a altura do observador** (2 m para o mastro do lander,
10 m para uma torre). Ray-marching de 0,5–5 km é suficiente.

- DEM recomendado: **LOLA 20 m/pixel** (Gläser 2018) ou **SLDEM2015 59 m/px** para cobertura ampla.
- O erro da máscara deve ficar **abaixo de 0,2°**, senão a fração de iluminação erra vários pontos
  percentuais — porque toda a dinâmica do Sol cabe em ±1,5°.

### Passo 2 — Efemérides
Passo de tempo: **10 min** (1 h é o padrão da literatura e basta para estatística; 10 min é melhor
para as bordas das janelas DTE).

Para cada instante, obtenha os vetores Sol e Terra no referencial **lunar fixo** (frames `MOON_ME`
ou `MOON_PA`), transforme para o **ENU local do sítio** e calcule:

```
elevação  = asin( u_z )
azimute   = atan2( u_y , u_x )
```

### Passo 3 — Visibilidade
```
visível(t) = elevação(t) > h( azimute(t) )
```

Iluminação (%) = média temporal de `visível` sobre a janela escolhida.
DTE (%) = idem, com o vetor da Terra. **Janelas** = runs contíguos de `visível`, com duração mínima
configurável (ex.: ≥ 10 min para link de dados).

### Passo 4 — Agregação
- Fração de iluminação média, mínima e pior apagão contínuo (horas).
- Janelas DTE por dia, e o **maior intervalo sem DTE** (define buffer de dados e necessidade de relay).
- Série temporal por data de chegada: comparar 2027, 2028, …, 2045.

---

## 3. Dados (links verificados em 2026-10-22, todos HTTP 200)

| O que | Onde |
|---|---|
| SLDEM2015 / produtos LOLA da PGDA | https://pgda.gsfc.nasa.gov/products/78 |
| Arquivo LOLA (MIT) | https://imbrium.mit.edu/ |
| PDS — missão LRO | https://pds-geosciences.wustl.edu/missions/lro/ |
| SPICE (efemérides + frames) | https://naif.jpl.nasa.gov/naif/ |
| Moon Trek (referência de portal) | https://trek.nasa.gov/moon/ |
| LROC QuickMap (inspeção visual) | https://quickmap.lroc.asu.edu/ |
| NASA SVS 5228 (visualização) | https://svs.gsfc.nasa.gov/5228 |

**Kernels SPICE mínimos:** `de440s.bsp` (efemérides), `naif0012.tls` (leap seconds),
`pck00011.tpc` (constantes), e **um kernel de orientação lunar** (`moon_pa_de440_*.bpc`) — sem ele
a libração fica errada e a máscara de horizonte aponta para o azimute errado.
Biblioteca: **`spiceypy`** (Python) ou **`jspice`/`@nasa/spacekit`** (JS).

---

## 4. Números-âncora para validar sua implementação

| Métrica | Valor publicado | Fonte |
|---|---|---|
| Iluminação na borda de Shackleton | **94%** do tempo | Speyerer & Robinson 2013 |
| Iluminação média, sítios de topo, superfície | **69,5% – 82,9%** | Gläser 2018 |
| Idem, a 2 m de altura | **77,1% – 88,0%** (máx. crista Shackleton–de Gerlache) | Gläser 2018 |
| Melhor sítio polo sul: solar / DTE | **92% / ~50%** | Bryant 2009 |
| Áreas com iluminação média > 80% | restritas, poucos km² | Mazarico 2011 |
| Ponto ótimo Artemis III (MCDM) | **DM2 Nobile Rim 2**, −84,20156°, 60,69989°E | Peña-Asensio 2024 |

**Teste de aceitação:** rode seu motor no sítio da crista Shackleton–de Gerlache com observador a
2 m, para 2017–2037, e você deve cair dentro de **77–88%**. Se der 60% ou 95%, há erro de máscara,
de frame ou de altura.

---

## 5. Critérios de decisão que a interface precisa expor

Do time LEAG, formalizados em Flahaut et al. 2019:

- *"A iluminação média dentro da área de pouso deve ser máxima."*
- *"A visibilidade da Terra (para radiocomunicação) dentro da área de pouso deve ser máxima."*
- Exclusão de encostas **> 7°** e de áreas com iluminação **< 40%**.

Do MCDM de Peña-Asensio et al. 2024, os critérios que viraram camadas de mapa:
iluminação solar · PSRs acessíveis · comunicação direta com a Terra · linha de visada
HLS–astronauta · unidades geológicas · abundância de minerais máficos.

→ Traduza cada um para um **toggle** na tela de ranking. O usuário vê o ranking mudar quando
mexe nos pesos. Isso é exatamente o que falta nas ferramentas atuais.

---

## 6. Arquitetura recomendada

```
[pré-processamento - offline, roda 1x]
  DEM 20 m/px --> ray-marching --> horizon_masks.parquet   (sítio x azimute x altura)
  SPICE        --> efemérides   --> ephem_sun_earth.parquet (10 min, 2026-2045)

[runtime - leve, roda no navegador ou num worker]
  máscara(az) -> interp -> compara com elevação(t) -> booleanos
  -> frações, janelas, piores apagões -> ranking

[UI]
  Modo PÚBLICO     : panorama 360° do horizonte com trilha do Sol e da Terra;
                     animação de 1 mês comprimido em ~30 s (gramática visual da SVS 5228)
  Modo ENGENHARIA  : heatmap tipo Gantt (x = tempo, y = sítio) de iluminação e DTE;
                     sliders de altura do mastro, limiar de declividade, duração mínima de janela
  Modo COMPARAÇÃO  : tabela sítio x data, ordenável, com export CSV/JSON
```

**Regra de ouro de UX:** a resposta tem que aparecer em **um olhar**. O erro do Moon Trek é exigir
que o usuário monte camadas antes de entender qualquer coisa.

Atalho inteligente: como o Sol varia só ±1,5°, você pode **pré-computar** a matriz
`sítio × azimute × elevação solar` e o app responde em milissegundos, sem SPICE no cliente.
SPICE só no pré-processamento.

---

## 7. Plano de validação (o que dizer aos jurados)

1. **Reprodução**: motor próprio → 77–88% na crista Shackleton–de Gerlache a 2 m. [Gläser 2018]
2. **Ordem de grandeza**: melhor sítio com solar alto e DTE ~50%. [Bryant 2009]
3. **Verdade-terreno independente**: comparar com iluminação derivada de imagens orbitais
   (0,69–1,97 m/px) na área de Chang'E-7. [Zhang 2023]
4. **Coerência geométrica**: elevação solar sempre em [−1,6°, +1,6°]; Terra sempre perto do
   horizonte, oscilando em torno da mesma direção. [SVS 5228]
5. **Sanidade física**: potência horizontal ≈ cos(elevação) × iluminação — deve ser ~2–9% do nominal.

---

## 8. Armadilhas catalogadas

| Armadilha | Consequência | Correção |
|---|---|---|
| Ignorar a altura do observador | subestima iluminação em ~8 pp (69,5% → 77,1%) | slider de altura, padrão 2 m |
| Ignorar a precessão de 18,6 anos | "melhor data" errada | cobrir 2026–2045 |
| Frame lunar errado (sem kernel de libração) | azimutes deslocados, máscara inútil | usar `MOON_ME`/`MOON_PA` + BPC |
| Confundir iluminação com potência | superestima energia em ~30× | mostrar elevação solar |
| Bin de azimute grosseiro (>2°) | iluminação "serrilhada" | 0,5–1° |
| Comparar sítios em datas diferentes | ranking inválido | fixar data, variar sítio; depois variar data |
| Usar só DTE média | ignora apagões longos | reportar pior intervalo sem DTE |

---

## 9. Diferenciais competitivos sugeridos (em ordem de impacto)

1. **Ângulo solar + potência real**, não só binário iluminado/sombra. (Ninguém faz bem.)
2. **Cobertura de 18,6 anos** com seletor de data — responde "qual o melhor ano para pousar?".
3. **Comparação pareada**: dois sítios, duas datas, lado a lado, com diff visual.
4. **Modo educativo** com a animação SVS-like e uma frase explicando *por que* o Sol rasante importa.
5. **Trajeto iluminado** (DIC3D-A*, Miao & Wei 2026) como feature opcional de engenharia.
6. **Exportação de janelas DTE** em CSV — o planejador leva para o seu próprio planejador de missão.
