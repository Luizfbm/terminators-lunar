# Artigos: o que cada um diz, o que conferimos e o que muda no projeto

Revisão feita em 02/11/2026, em três blocos (18 textos), seguida de leitura completa de 16 deles ([leituras.md](leituras.md)). Para cada artigo: onde ler, quanto ele importa para nós, quais fatos foram **conferidos no texto original** e o que **corrigimos** nos nossos documentos.

Legenda: ✅ = conferido no texto original · ⚠️ = corrigido ou com ressalva · 📄 = só o resumo estava acessível.

> **Como os artigos foram lidos:** numa primeira passada, a leitura foi dirigida (resumo, seções-chave e busca). Depois, a pedido do Luiz, **16 dos 18 textos foram lidos inteiros, linha a linha** (menos as listas de referências). As notas dessa leitura completa, com o que ela acrescentou ou corrigiu, estão em **[leituras.md](leituras.md)**.
>
> **Ainda não lidos por inteiro (paywall da Elsevier, sem cópia aberta):** Mazarico 2011 (*Icarus* 211, DOI 10.1016/j.icarus.2010.10.030) e Gläser 2014 (*Icarus* 243, 78–90, DOI 10.1016/j.icarus.2014.08.013). Deles temos só os resumos oficiais e o que os outros artigos citam.

## Resumo para quem tem pressa

1. **Barker 2021** é a receita exata do que vamos construir: máscara de horizonte com 720 direções, DEM em três resoluções, passo de 1 h e o Sol como um disco. Nossa arquitetura agora segue essa receita.
2. **Barker 2023** mostra que a NASA já publica a família inteira de DEMs de que essa receita precisa (20, 40 e 80 m até 80°S e 240 m até 60°S), todos no mesmo padrão.
3. **Bryant 2009 (JPL)** é o trabalho mais parecido com o nosso, porque junta Sol + Terra + horizonte. Ele corrige dois números nossos: o DTE é de **51%** e a libração da Terra é de **±6,87°**.
4. **Vamos usar as métricas oficiais:** iluminação média, **LCIP** (maior período contínuo com Sol) e **LCSP** (maior período contínuo sem Sol). Com elas, o nosso app fala a mesma língua da NASA.
5. **Não existe "pico de luz eterna"** (Bryant). O melhor ponto conhecido, na borda de Shackleton, tem cerca de **240 dias seguidos de Sol por ano** e no máximo ~1,5 dia de escuridão (Mazarico).

---

## 1. Barker et al. 2021: Improved LOLA elevation maps for south pole landing sites

*Planetary and Space Science* 203, 105119 · [PDF grátis (NTRS)](https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf) · **Relevância: máxima**

**O que é:** DEMs de 5 m/px para 4 sítios do polo sul e o impacto do erro do relevo na iluminação.

**Fatos conferidos:**
- ✅ São 4 sítios, cada um com **16 × 16 km**. A numeração segue a Tabela 3 do Mazarico 2011:
  - Site 1 = Connecting Ridge (crista entre Shackleton e de Gerlache);
  - Site 4 = borda de Shackleton;
  - Site 7 = pico isolado perto de Shackleton, no lado oculto;
  - Site 11 = borda de Gerlache.
- ✅ O erro RMS é de **0,30–0,50 m** na altura e **1,5–2,5°** na inclinação.
- ✅ **~90% dos pixels de 5 m estão vazios** e foram preenchidos por interpolação. A cobertura real dos pixels depende da resolução: 7–10% a 5 m, 69–78% a 20 m e 96–98% a 40 m.
- ✅ Depois do ajuste dos traços do LOLA, a posição tem erro de ~10–20 cm na horizontal e ~2–4 cm na vertical.

**A receita do horizonte (Seção 5), que é o que mais importa para nós:**
- ✅ Para cada ponto, calcular a elevação do horizonte em **720 direções, uma a cada 0,5°** (método do Mazarico 2011).
- ✅ Usar o DEM em **grades aninhadas**: **5 m até 5 km** de distância, **80 m de 5 a 100 km** e **240 m além de 100 km**. Os autores dizem que é muito mais eficiente que uma resolução única.
- ✅ Cálculo com **passo de 1 hora**.
- ✅ O **Sol é tratado como um disco**, com escurecimento de borda. A fração visível é calculada cortando o disco na horizontal na altura do horizonte, medido no azimute do centro do Sol.
- ✅ O horizonte tem duas partes: o **campo próximo**, a ~100 m (às vezes dezenas de metros, até ~1 km), e o **campo distante**, a **50–200 km**. O erro do DEM afeta principalmente o campo próximo.
- ✅ Métricas usadas: **iluminação média** (fração do disco visível, em média), **LCIP** (*longest continuous illumination period*) e **LCSP** (*longest continuous shadow period*), calculadas a 1 m e a 5 m de altura.
- ✅ Requisito do HLS: elipse de pouso com **100 m de raio**.
- ✅ Referencial: MOON_ME do DE421, com incerteza de alguns metros.

**O que muda no projeto:**
- ⚠️ A nossa arquitetura dizia "5–20 m perto, 120–240 m longe, raios de 150–300 km". **Corrigido** para a receita do Barker: 5/80/240 m com cortes em 5 km e 100 km, raios até ~200 km e 720 direções.
- Vamos adotar **LCIP e LCSP** como métricas. Elas respondem direto às perguntas "quanto tempo tenho de Sol?" e "quanto tempo a bateria precisa aguentar?".
- Como o pouso tem uma elipse de 100 m, o app pode mostrar **a variação das métricas dentro de 100 m**, e não só no ponto exato.

## 2. Barker et al. 2023: A New View of the Lunar South Pole from LOLA

[PDF grátis (NTRS)](https://ntrs.nasa.gov/api/citations/20230014419/downloads/BarkernewviewSTIupdated.pdf) · Dados: [PGDA 90](https://pgda.gsfc.nasa.gov/products/90) · **Relevância: máxima (são os dados que vamos usar)**

**Fatos conferidos:**
- ✅ Novos mapas de topografia, rugosidade e PSRs do polo sul. O mapa de PSRs a **20 m/px** é o mais detalhado até hoje.
- ✅ PSRs menores que 1 km² somam **15 ± 5%** da área total de PSR.
- ✅ **A família completa de DEMs ajustados** (Tabela 1):
  - até 80°S, ±304 km: `LDEM_80S_20MPP_ADJ`, `_40MPP_ADJ` e `_80MPP_ADJ`;
  - até 75°S: `LDEM_75S_30MPP_ADJ`;
  - até 60°S, ±931 km: `LDEM_60S_60MPP_ADJ`, `_120MPP_ADJ` e `_240MPP_ADJ`;
  - mais uma versão de 10 m até 83°S.
- ✅ O DEM de 20 m foi processado em 64 blocos de 80 km com 2 km de sobreposição. Nas áreas de sobreposição, a diferença entre blocos é de 0,00 ± 0,70 m.
- ✅ Referencial: MOON_ME do DE421.

**O que muda no projeto:** a receita do Barker 2021 pede DEMs de 80 m e de 240 m, e **eles existem prontos e consistentes no PGDA 90**. Não precisamos reamostrar nada. Para o campo próximo usamos o de 20 m (ou o de 5 m, onde houver).

## 3. Bryant 2009 (JPL): Lunar Pole Illumination and Communications Maps from GSSR Elevation Data

*IPN Progress Report* 42-176, **15/02/2009** · [HTML](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.html) · [PDF](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.pdf) · **Relevância: alta (é o mais parecido com o nosso projeto)**

**Fatos conferidos:**
- ✅ Usa o DEM do radar de Goldstone (2006): 40 m na horizontal, ~5 m de precisão vertical relativa. As máscaras de horizonte cobrem a área até 100 km do polo.
- ⚠️ O melhor sítio tem **92% de disponibilidade de energia solar e 51% de DTE**, em média de vários anos (2009–2028). **Nós tínhamos escrito "~50%". Corrigido.**
- ⚠️ A Terra se move **±6,87° em latitude e ±8,16° em longitude** no céu lunar. **Nós tínhamos escrito ±6,7°. Corrigido.** Por isso o DTE no polo só é possível em cerca de metade de cada mês sideral (27,3 dias).
- ✅ O eixo da Lua está inclinado **1,54°** em relação à eclíptica. No meio do inverno, o Sol fica a **−1,54°** visto do polo sul.
- ✅ **Por que basta olhar até ~200 km:** a 200 km do polo, uma montanha precisaria ter mais de 7.000 m para tapar o Sol de inverno. A mais alta da região, Leibnitz β, tem 6.055 m.
- ✅ O cálculo usou "torres" de **2 m** de altura.
- ✅ **Não há "pico de luz eterna"** em nenhum dos polos, mas há vários pontos com **mais de 90%** de iluminação média em vários anos.
- ✅ O disco da Terra visto da Lua mede ~**1,9°**. O raio do disco do Sol mede **0,265°**.
- ✅ Tabela de picos (torre de 2 m, iluminação solar e "iluminação" da Terra): o pico **B1 tem 97,5% de Sol e 65,1% de Terra**, e o A1 tem 95,6% e 62,5%. Malapert α fica em −86,04°, 1,70°, com 4.207 m de altitude.
- ✅ Duas conclusões úteis para nós:
  - pequenas mudanças de inclinação do terreno, **a centenas de metros** de um pico, já derrubam muito a iluminação;
  - o ponto mais alto de uma área quase sempre é o mais iluminado e também o que mais vê a Terra.

**O que muda no projeto:**
- Os números de validação certos agora são **92% de energia e 51% de DTE** no melhor sítio.
- O limite de **200 km** para os raios do horizonte agora tem justificativa física, que serve até para o pitch.
- O efeito "a centenas de metros a iluminação despenca" é exatamente o "por que pequenas mudanças de local importam" que o desafio pede.

## 4. Mazarico et al. 2011: Illumination conditions of the lunar polar regions using LOLA topography

*Icarus* 211, 1066–1081 · [Registro no NTRS](https://ntrs.nasa.gov/citations/20120010094) (sem PDF; 📄 conferido pelo resumo oficial) · Dados: [PGDA 69](https://pgda.gsfc.nasa.gov/products/69) · **Relevância: alta (é a origem do método)**

**Fatos conferidos (pelo resumo):**
- ✅ Calcula a elevação do horizonte em várias direções a partir de DEMs polares de **240 m**, que vão até 75° de latitude, e com isso a iluminação para qualquer geometria até 80°.
- ✅ Validação com imagens da câmera WAC da LRO.
- ✅ A área de PSR é de **12.866 km² no norte e 16.055 km² no sul**.
- ✅ **Toda PSR recebe alguma luz espalhada** durante o ano.
- ⚠️ As simulações longas (vários ciclos de 18,6 anos) usaram **passo de 6 h**. Os produtos do PGDA 69 são descritos com passo de 1 h. Não é contradição, mas **nós tínhamos atribuído "1 h ao longo de 18,6 anos" ao artigo**. Corrigido com a ressalva.
- ✅ **Um ponto perto da borda de Shackleton fica iluminado sem parar por 240 dias por ano**, e o seu maior período no escuro é de **~1,5 dia**.
- ✅ Ganhar **≤ 10 m de altura** pode melhorar muito a iluminação média e encurtar a noite.

**O que muda no projeto:** os números "240 dias seguidos" e "1,5 dia de escuro" servem de referência para os melhores pontos possíveis. O argumento do slider de altura do mastro ganha a fonte original.

## 5. Gläser et al. 2014: Illumination conditions at the lunar south pole using high resolution DTMs from LOLA

*Icarus* 243 · DOI 10.1016/j.icarus.2014.08.013 · [Registro no DLR](https://elib.dlr.de/94240/) (o DLR diz que "não pode fornecer o texto completo"; 📄 conferido pelo resumo) · **Relevância: média-alta (números de validação)**

**Fatos conferidos:**
- ✅ Usa um DTM de 20 m/px do LOLA, validado com imagens da câmera NAC.
- ✅ Analisou 20 × 20 km por um ano (22/10/2018 a 22/10/2019), na superfície e a 2 m de altura. Depois, **19 anos** (mais que o ciclo de precessão) no **Connecting Ridge**, na superfície, a 2 m e a 10 m.
- ✅ **92,27% de Sol a 2 m e 95,65% a 10 m.** Nesses pontos, o maior período contínuo no escuro é de **3–5 dias**.
- ⚠️ As páginas aparecem como 78 (ADS) ou 79–90 (DLR). Citamos só "Icarus 243" com o DOI.

## 6. Wueller et al. 2026: Assessing Potential Landing Sites… within Artemis Candidate Landing Regions

*JGR Planets* 131(3), e2025JE009434 · [Artigo](https://doi.org/10.1029/2025JE009434) (bloqueado por anti-robô) · [Dados no Zenodo](https://doi.org/10.5281/zenodo.17084058) (CC-BY 4.0) · **Relevância: alta (lista curada + gabarito)**

**Fatos conferidos (pelo resumo e pela descrição dos dados):**
- ✅ São **130 sítios candidatos** que atendem aos requisitos do HLS e têm acesso a PSRs a até **2 km**, o limite atual de caminhada sem rover.
- ✅ Os dados de iluminação cobrem **todas as 16 regiões candidatas do Artemis** (as 13 originais + extensões), para os **meios de verão de 2025 a 2032**.
- ✅ Autores: Wueller, Berger, Christopher, Sugimoto, Thaker, Carton, Jo, Lee, Pedrelli, Sanchez e **Kring**. O trabalho saiu do programa de estágio de verão do LPI de 2024.
- ✅ Os códigos de região CR, CRE, dGR1 e PNS aparecem na própria descrição dos dados. **AR = Amundsen Rim** é confirmado por outro resumo do mesmo autor (EPSC 2024).
- ⚠️ **Não conseguimos ler a definição exata de "dias de Sol"** (o tamanho da janela de "meio do verão", a altura considerada). Até ler o artigo completo, use esses números para **comparar sítios entre si**, não como valor absoluto.

## 7. Smith et al. 2016: Summary of the Results from LOLA after Seven Years

*Icarus* (2016), DOI 10.1016/j.icarus.2016.06.006 · [PDF grátis](https://ntrs.nasa.gov/api/citations/20160008718/downloads/20160008718.pdf) · **Relevância: média (contexto do instrumento)**

- ✅ O LOLA fez **quase 7 bilhões de medições** de altitude.
- ✅ Dispara **28 vezes por segundo** e cada pulso ilumina **5 pontos** no chão.
- ✅ A referência de altitude é a esfera de **1.737,4 km** de raio (IAU). É o R que usamos na correção de curvatura.

## 8. Barker et al., LEAG 2021: New High-Resolution Polar Topographic Models (slides)

[PDF](https://ntrs.nasa.gov/api/citations/20210020639/downloads/leag2021_MikeBarker_v01_STI.pdf) · **Relevância: baixa (é a versão em slides do Barker 2021)**

- ✅ Repete os números do artigo (0,3–0,5 m e 1,5–2,5°) e mostra as figuras dos 4 sítios e da análise com 100 "clones" do DEM. É bom para entender visualmente; não traz nada novo.

## 9. George et al., LPSC 2026 #1901: Artemis III Site Selection Update

[PDF](https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf) · **Relevância: média (é o contexto oficial do Artemis)**

- ✅ Lista das 9 regiões (out/2024), reduzida das 13 de 2022.
- ✅ Estadia na superfície de **~5,75 a 6,25 dias**, a partir de órbita NRHO.
- ✅ A iluminação no polo **se desloca ~2–3 semanas por ano**.
- ✅ Com DTE, regiões com mais visibilidade da Terra são preferidas, e é preciso manter **mais de uma região** para ter disponibilidade anual.
- ✅ A lista de 9 vale **só para o Artemis III**; não restringe o Artemis IV em diante.

## 10. NASA: Lunar Communications and Navigation Architecture (white paper, 2024)

[PDF](https://www.nasa.gov/wp-content/uploads/2024/01/lunar-communications-and-navigation-architecture.pdf) · **Relevância: média (comunicação)**

- ✅ Do polo sul, a Terra fica visível só **cerca de metade de cada mês sideral (~14 dias)**, por causa da inclinação da órbita e do eixo da Lua. Por isso a NASA planeja satélites de relay para fechar os buracos (LCRNS / LunaNet).
- ✅ Além da geometria, o terreno também atrapalha o sinal quando a Terra está visível.

## 11. Sanchez Net 2019 (JPL): Analysis of the Fading Channel in Downlinks from the Lunar South Pole to the DSN

*IPN Progress Report* 42-216, 15/02/2019 · [HTML](https://ipnpr.jpl.nasa.gov/progress_report/42-216/42-216C.html) · **Relevância: baixa-média (detalhe de rádio)**

- ✅ No polo sul, a antena do lander aponta para a Terra a **no máximo 10°** de elevação. Com antenas de baixo ganho, o sinal reflete no chão e sofre **desvanecimento por multipercurso**.
- ✅ Não existem medições reais desse canal; o artigo é teórico.

**O que muda no projeto:** além de "a Terra está acima do horizonte?", o app pode mostrar **a margem da Terra acima do horizonte**. Uma Terra a 0,5° acima de uma crista é um enlace pior do que uma Terra a 5°.

---

# Bloco 3: artigos encontrados depois (02/11/2026)

## 12. Ortiz (NASA), "Artemis Human Landing System Overview", NASA 2025 International Space Apps Challenge

[PDF (NTRS 20250009323)](https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf) · **Relevância: máxima (a NASA fez essa apresentação para o próprio Space Apps)**

**Os 6 requisitos de pouso do Artemis III** (✅ conferidos nos slides):
1. Pousar a até **6° de latitude do polo sul** (ou seja, abaixo de 84°S).
2. Inclinação do terreno de pouso (em 100 m) **< 10°**.
3. Inclinação para atividade extraveicular (EVA, em 2 km) **< 20°**.
4. Comunicação direta com a Terra (DWE), **sem relay**. Áreas com **visibilidade da Terra < 25%** são descartadas.
5. Iluminação:
   - a superfície precisa estar iluminada **durante toda a estadia**;
   - áreas com **visibilidade do Sol < 5%** são descartadas;
   - a aproximação também deve ter boa luz.
6. Pousar a até **100 m** do alvo (área de 100 × 100 m). Para comparar: a elipse da Apollo 11 era de 17 × 5 km.

**Outros fatos:**
- ✅ Sol e Terra sobem só **~2° a 7°** acima do horizonte. A Terra aparece "de cabeça para baixo" e girando ao contrário. Ela fica visível duas semanas e invisível outras duas.
- ✅ O pico de iluminação anda **2–3 semanas mais cedo a cada ano**. Em 2030 ele fica por volta de **agosto**.
- ✅ Órbita NRHO de ~6,5 dias, 100% visível da Terra. Isso dá ~55 oportunidades de pouso por ano, mas só **~28 partidas para a NRHO por ano** por causa das limitações do SLS e da Orion.

**O que muda no projeto:** esses 6 requisitos viram um **"modo Artemis III"** no app, com filtros prontos: latitude ≤ −84°, inclinação, Terra ≥ 25%, Sol ≥ 5%, iluminação na janela de ~6,5 dias. Como a palestra foi feita para o Space Apps, é bem provável que os jurados conheçam esses critérios.

## 13. NASA, "Lunar Site Selection" (white paper, 2023)

[PDF (NTRS 20230016267)](https://ntrs.nasa.gov/api/citations/20230016267/downloads/Lunar%20Site%20Selection.pdf) · **Relevância: média-alta**

- ✅ Separa "aonde queremos ir" (objetivos científicos) de "aonde conseguimos ir" (pouso seguro).
- ✅ O primeiro pouso humano deve ter Sol por **~6–6,5 dias**.
- ✅ **Não se conhece nenhum ponto do polo sul com Sol contínuo**, o que confirma o Bryant 2009.
- ✅ Um sítio com terreno bom pode estar no escuro por "semanas ou meses", dependendo da data.

## 14. Lim et al. 2024 (LPSC) e Ennico-Smith et al. 2023: planejamento de rota do VIPER

[Lim 2024 (NTRS 20240001709)](https://ntrs.nasa.gov/api/citations/20240001709/downloads/20240001709-LPSC2024_Lim%20et%20al_vFINAL.pdf) · [Ennico 2023 (NTRS 20230004239)](https://ntrs.nasa.gov/api/citations/20230004239/downloads/SSR2023-VIPER-Planning-Ennico.pdf) · **Relevância: alta (é o caso de uso real)**

- ✅ O VIPER planejou a rota em torno de duas restrições: Sol e comunicação com a Terra.
- ✅ Os **"Safe Havens"** são lugares com Sol prolongado e **sombra de no máximo 50 h**, onde o rover hiberna enquanto a Terra está abaixo do horizonte, que é ~metade de cada mês.
- ✅ A operação acontece na janela de **~14 dias** em que há Sol e DTE ao mesmo tempo. Cada "perna" da rota dura um dia lunar.
- ✅ A ferramenta do VIPER acompanhava, entre outras coisas, o **"tempo até a sombra do Sol"** e o **"tempo até a sombra da DSN"**. É exatamente a contagem regressiva até sunset e Earthset que o desafio pede, e que a NASA usa na operação real.
- ✅ Rotas estratégicas feitas sobre mapas de **20 m/px**. Missão de mais de 90 dias terrestres, até 20 km de rota. ⚠️ O "DTE de 256 kbps" que estava aqui não aparece nesses textos (veio de um resumo de busca) e foi removido.

**O que muda no projeto:**
- A contagem regressiva deixa de ser só uma "ideia boa": ela é **o que a NASA mede na operação real**. Dá para citar no pitch.
- Também dá para incluir uma métrica de **"porto seguro"**: o sítio aguenta a fase sem Terra com sombra de no máximo X horas?

## 15. Peña-Asensio, Neira-Acosta e Sánchez-Lozano 2024: Artemis III com decisão multicritério

[arXiv 2406.19863](https://arxiv.org/abs/2406.19863) (aberto) · **Relevância: alta para a parte de otimização**

- ✅ Avalia **1.247 locais** que atendem aos requisitos do HLS, dentro das 13 regiões + o Site 004. Junta SIG com o método **TOPSIS** de decisão multicritério.
- ✅ Critérios: visibilidade da superfície, linha de visada entre o HLS e o astronauta, PSRs, exposição ao Sol, comunicação direta com a Terra, unidades geológicas e minerais máficos.
- ✅ O melhor local ficou em **Nobile Rim 2, em −84,20156°, 60,69989°**. A análise de sensibilidade mostra que a escolha se mantém mesmo mudando o método e os pesos.

**O que muda no projeto:** é a referência acadêmica para os **sliders de peso** e o botão "Otimizar". O TOPSIS é simples (distância à solução ideal e à anti-ideal) e conversa com o curso do Prof. Marcato. Esse ponto do Nobile Rim 2 vira um sítio extra para a lista curada.

## 16. Gläser et al. 2018: Illumination conditions at the lunar poles: implications for future exploration

*Planetary and Space Science* 162, 170–178 · [PDF grátis (NTRS 20170007365)](https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf) · 📄 conferido pelo resumo · **Relevância: média (mais um gabarito)**

- ✅ DTMs de 400 × 400 km a 20 m/px. Iluminação em regiões de 50 × 50 km, com **passo de 1 h, de 2017 a 2037**.
- ✅ Polo sul: borda de Shackleton e dois pontos na crista entre Shackleton e de Gerlache. Iluminação média de **69,5% a 82,9%** na superfície (os dois polos juntos) e de **77,1% a 88,0% a 2 m**. O máximo fica na crista Shackleton–de Gerlache.
- ⚠️ **Cuidado na validação:** o Gläser 2014 deu 92,27% a 2 m no mesmo Connecting Ridge. O DTM, o período e o ponto exato mudam o número em vários pontos percentuais. Ao comparar com o nosso cálculo, a meta é **chegar na mesma faixa**, não acertar a casa decimal.

## 17. Mazarico, Barker e Nicholas 2018: Advanced illumination modeling for data analysis and calibration (IllumNG)

*Advances in Space Research* 62(11), 3214–3228 · [Texto aberto (PMC6398960)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6398960/) · **Relevância: média (ferramenta da NASA, mais avançada que a nossa)**

- ✅ Descreve o **IllumNG**, a ferramenta de iluminação do Goddard. Ela usa *raytracing* e trata o Sol como vários pontos de luz.
- ✅ Ela inclui luz espalhada uma ou duas vezes, além de estrelas e da "luz da Terra".
- ✅ O próprio artigo explica que o método do Mazarico 2011, que **pré-calcula o horizonte de cada ponto**, é o mais eficiente para simular longos períodos. É exatamente o que vamos fazer.

---

## Correções aplicadas nos nossos documentos

| Onde | Antes | Agora | Fonte |
|---|---|---|---|
| Física / Glossário | Terra oscila ±~6,7° | **±6,87° em latitude, ±8,16° em longitude** | Bryant 2009 |
| Fontes | Bryant: "~50% de DTE" | **51%** (e 92% de energia solar) | Bryant 2009 |
| Fontes | Bryant sem data | **IPN 42-176, fev/2009** | Bryant 2009 |
| Arquitetura | 5–20 m perto, 120–240 m longe, raios de 150–300 km | **5 m (<5 km), 80 m (5–100 km), 240 m (>100 km); 720 direções; ~200 km no polo, até 300 km como limite seguro** | Barker 2021, Bryant 2009, Mazarico 2018 |
| Física / Fontes | Gläser 2014: "92,27% de iluminação" | É **% do tempo com algum Sol** ("solar visibility"). A iluminação média no mesmo lugar é de ~88% (Gläser 2018) | Gläser 2018 |
| Fontes | Bryant: 92% / 51% | Vale para o sítio B1 (≈ Connecting Ridge), com uma simplificação de distribuição uniforme. Com efemérides reais de 2009–2028: ~92% de Sol inteiro e **~54% de Terra inteira** | Bryant 2009 |
| Sítios | "dias de Sol" sem definição | **Máximo de dias seguidos com Sol** no meio do verão (latitude subsolar ≤ −1,5°), a 2 m, em mapa de 60 m, passos de 12 h | Wueller 2026 |
| Artigos | VIPER com DTE de 256 kbps | Removido; não está nos textos | Lim 2024, Ennico 2023 |
| Fontes | DEMs de 5 m "20 × 20 km" no artigo | Sítios de **16 × 16 km** no artigo; o mosaico do PGDA 81 é que usa campos de 20 × 20 km | Barker 2021 |
| Fontes | Mazarico: "passo de 1 h ao longo de 18,6 anos" | Artigo: simulações longas a **6 h**; os produtos do PGDA 69 são descritos com 1 h | Mazarico 2011 |
| Física | Disco do Sol "0,5°" | **0,53°** (raio de 0,265°); disco da Terra **~1,9°** | Bryant 2009 |
