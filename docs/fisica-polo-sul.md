# Física do polo sul lunar: Sol, Terra, horizonte e energia

## Sol

- O eixo da Lua é inclinado só ~1,5°. No polo, o Sol **não nasce nem se põe** como aqui: ele **gira em volta do horizonte** uma vez a cada ~29,5 dias, com elevação entre **−1,5° e +1,5°**. Essa faixa muda ao longo do ano lunar (~346 dias).
- Por isso **é o relevo que decide se há luz**. Uma cordilheira a 50 km de distância já tapa o Sol.
- Bordas e picos têm muita luz: a borda de Shackleton, a crista entre Shackleton e de Gerlache, Malapert. O fundo das crateras são **PSRs** (sombra permanente), onde fica o gelo.
- A **altura do painel ou do mastro** conta muito. No Connecting Ridge, a luz sobe de 92,3% a 2 m de altura para 95,7% a 10 m (Gläser et al. 2014).
- O disco do Sol tem 0,53° (raio de 0,265°). Ele pode estar **parcialmente** visível atrás de uma crista.
- **Não existe "pico de luz eterna"** (Bryant 2009). O melhor ponto conhecido, perto da borda de Shackleton, fica **~240 dias seguidos** com Sol por ano, e o seu maior período no escuro é de **~1,5 dia** (Mazarico 2011).
- **Eclipses lunares** (a Terra tapando o Sol) causam algumas horas de escuridão.

## Terra

- Vista da Lua, a Terra fica quase parada no céu. Ela só oscila por causa da **libração**: **±6,87° em latitude e ±8,16° em longitude**, a cada ~27 dias (Bryant 2009). Ela desenha um "laço" e tem ~1,9° de diâmetro.
- No polo ela fica perto do horizonte e **some durante cerca de metade de cada mês sideral (~14 dias)**.
- **Malapert** fica de frente para a Terra e tem bom DTE. **Shackleton** tem muita luz, mas passa longos períodos sem ver a Terra. Esse é o trade-off clássico.
- A paralaxe da Terra é de ~0,26° (raio da Lua ÷ distância Terra–Lua). Ela conta quando a margem acima do horizonte é apertada. A paralaxe do Sol é desprezível.
- No polo, as antenas apontam para a Terra a no máximo ~10° de elevação.

## Máscara de horizonte

Usamos a receita do Barker et al. 2021, que segue o método do Mazarico 2011:

1. Para cada sítio, lançar raios em **720 azimutes (um a cada 0,5°)**, até **~200 km** de distância no polo (e até **300 km** como limite seguro em qualquer lugar da Lua, que é o horizonte mais distante possível segundo Mazarico 2018), sobre o DEM do LOLA.
   - Por que 200 km: a essa distância, uma montanha precisaria ter mais de 7.000 m para tapar o Sol de inverno, e a mais alta da região tem 6.055 m (Bryant 2009).
2. Usar o DEM em **grades aninhadas**: **5 m até 5 km**, **80 m de 5 a 100 km** e **240 m além de 100 km**. É bem mais eficiente que usar uma resolução só.
3. Em cada ponto do raio, calcular o ângulo de elevação do relevo **já descontando a curvatura**: a queda é ≈ d²/(2R), com R = 1737,4 km. A 100 km isso dá ~2,9 km, então não dá para ignorar.
4. A máscara é o maior ângulo em cada azimute. É a "silhueta" do relevo em volta do sítio.
5. Um astro está visível se `elevação > máscara(azimute)`. Para o Sol, a fração visível é calculada cortando o disco na horizontal na altura do horizonte, no azimute do centro do Sol.

O horizonte tem um **campo próximo**, a ~100 m, e um **campo distante**, a 50–200 km. O erro do DEM pesa sobretudo no campo próximo.

## Energia solar e por que a elevação importa

- Na Lua não há atmosfera, então chegam ~**1361 W/m²**. Com células de ~30% de eficiência, 1 m² virado para o Sol gera ~400 W.
- P = 1361 · área · eficiência · cos(ângulo de incidência) · fração do disco visível.
- **Painel deitado:** o fator é sin(elevação). Com o Sol a 1°, dá ~0,017, ou seja, ~7 W/m². Inútil.
- **Painel em pé, virado para o Sol:** o fator é ≈ cos(elevação) ≈ 1. Por isso os landers polares usam painéis verticais, que giram ou têm várias faces.

**O que exibir no app:**
1. A elevação do Sol.
2. A **margem acima do horizonte local** (elevação − máscara). Essa é a métrica que importa: margem pequena significa risco.
3. A fração do disco visível.
4. A partir delas, a potência estimada (W) e a energia na missão (Wh).
5. As métricas que a NASA usa (Barker 2021, Gläser 2018). **Atenção à diferença:**
   - **iluminação média** = média da fração do disco do Sol visível;
   - **visibilidade solar** = % do tempo com *algum* pedaço do Sol visível (sempre maior que a média);
   - os artigos misturam os dois; o "92,27%" do Gläser 2014 é visibilidade solar.

   As outras métricas:
   - **iluminação média**;
   - **LCIP**, o maior período contínuo com Sol;
   - **LCSP**, o maior período contínuo sem Sol, que é o que a bateria precisa aguentar.
6. Para a Terra, a **margem acima do horizonte**. No polo, a antena aponta a no máximo ~10°, e uma Terra rente à crista sofre com reflexões no chão (Sanchez Net 2019).

**Por que isso decide a missão:**
- **Sobrevivência:** na sombra a temperatura cai para ~−170 °C e os aquecedores esgotam a bateria. A métrica crítica é o **maior período contínuo sem Sol**, que precisa ser menor do que a autonomia da bateria.
- Ciência e comunicação dependem de energia.
- O Sol rasante faz sombras longas, que atrapalham as câmeras de navegação na descida.

## Validação

- O **JPL Horizons** aceita um observador na superfície da Lua. Usar para conferir o az/el que calcularmos.
- Os mapas de iluminação e de visibilidade da Terra do **PGDA 69** (Mazarico et al. 2011) servem de gabarito para as médias.
- Números de referência:
  - Bryant 2009: melhor sítio com **92% de energia solar e 51% de DTE**;
  - Gläser 2014: Connecting Ridge com **92,27% de Sol a 2 m e 95,65% a 10 m**;
  - Mazarico 2011: **~240 dias seguidos** de Sol na borda de Shackleton.

**Cuidado com as coordenadas dos artigos.** Os picos do polo são tão agudos que mover o ponto 51 m pode levar a luz de 0% a 72%. Os estudos que não usaram o LOLA, como o Bryant 2009 (radar de Goldstone), o Bussey 2010 (Kaguya) e o Speyerer 2013 (imagens), têm coordenadas que não batem com o mapa do LOLA. Para comparar números, usar o Gläser 2014/2018, o Barker 2021 e o PGDA 69, sempre na mesma altura de observador e com a mesma definição de métrica. Testar também o ponto mais alto a até 250 m da coordenada publicada. Detalhes em [licoes-concorrentes.md](licoes-concorrentes.md).

Os detalhes de cada artigo estão em [artigos.md](artigos.md).
