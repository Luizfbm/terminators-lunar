# Glossário

## Relevo

- **DEM** (Digital Elevation Model, ou Modelo Digital de Elevação): uma grade em que cada pixel guarda uma **altura**, não uma cor.
- **Resolução (m/px):** o tamanho do chão que cada pixel cobre. "20 m/px" é um quadrado de 20 × 20 m.
- **Raster:** dado em grade de pixels. O contrário é **vetor** (pontos, linhas, polígonos).
- **LRO** (Lunar Reconnaissance Orbiter): sonda da NASA que orbita a Lua desde 2009.
- **LOLA** (Lunar Orbiter Laser Altimeter): o laser da LRO. Ele dispara contra a superfície e mede a altitude pelo tempo de ida e volta da luz.
- **DEM LOLA:** o DEM feito com os dados do LOLA. É a fonte do relevo do projeto. No polo sul chega a 5–20 m/px.
- **SLDEM2015:** DEM que junta o LOLA com a câmera da sonda japonesa Kaguya. Cobre ±60° de latitude, com ~59 m/px.
- **Projeção estereográfica polar:** a Lua vista de cima do polo, com pouca distorção ali. É a projeção dos DEMs polares.
- **Hillshade:** um DEM sombreado artificialmente para parecer 3D. Serve só para visualização.

## Onde os dados ficam

- **PDS** (Planetary Data System): o arquivo público oficial da NASA para dados planetários.
- **PGDA** (Planetary Geodesy Data Archive, NASA Goddard): onde ficam os DEMs de 5 m e os mapas de iluminação.
- **Moon Trek / LROC Quickmap:** portais web de mapas lunares. São os concorrentes.

## Sol e Terra

- **Efeméride:** a posição de um astro num certo instante.
- **SPICE:** o sistema da NASA para calcular geometria espacial (posições, orientações, instantes). É mantido pela **NAIF**, um grupo do JPL. A biblioteca Python é a **spiceypy**.
- **Kernels SPICE:** os arquivos de dados que o SPICE carrega.
  - `.tls`: leap seconds, os ajustes do relógio;
  - `.bsp`: as posições dos planetas e da Lua (o `de440` é a versão atual);
  - `.bpc` / `.tf`: a orientação da Lua, ou seja, para onde ela está virada.
- **JPL Horizons:** um serviço web de efemérides. Útil para validar o que calcularmos.

## O céu do sítio

- **Azimute:** a direção na bússola, de 0° a 360° (0° = norte, 90° = leste).
- **Elevação:** o ângulo acima do horizonte. 0° é o horizonte, 90° é bem acima da cabeça (zênite), e valores negativos ficam abaixo do horizonte.
- **Máscara de horizonte:** em cada azimute, o ângulo do relevo mais alto naquela direção. É a "silhueta" das montanhas em volta.
- **Ponto subsolar / sub-Terra:** o ponto da Lua onde o Sol (ou a Terra) está exatamente no zênite.
- **Paralaxe:** a diferença na direção de um astro conforme o lugar de onde se olha.
- **Libração:** o "balanço" aparente da Lua. Visto da Lua, é a Terra que oscila no céu: ±6,87° em latitude e ±8,16° em longitude.
- **LCIP / LCSP** (*longest continuous illumination / shadow period*): o maior período contínuo com Sol e o maior sem Sol. São as métricas que a NASA usa para avaliar sítios.
- **Campo próximo / campo distante:** as duas partes do horizonte. O campo próximo fica a ~100 m (pedras, bordas de pequenas crateras); o campo distante fica a 50–200 km (montanhas e bordas de grandes crateras).
- **Elipse de pouso:** a área onde o lander pode acabar pousando, por causa da imprecisão da descida. A do HLS tem 100 m de raio.
- **Terminador:** a linha que separa o dia da noite na superfície.
- **PSR** (Permanently Shadowed Region): crateras polares que nunca recebem Sol. É onde fica o gelo de água.

## Missões

- **DTE** (Direct-to-Earth): comunicação direta com a Terra, sem satélite de relay. Exige a Terra acima do horizonte.
- **DSN** (Deep Space Network): as grandes antenas da NASA na Terra que falam com as sondas.
- **CLPS** (Commercial Lunar Payload Services): o programa em que a NASA contrata empresas (Intuitive Machines, Astrobotic, Firefly…) para levar cargas à Lua.
- **Artemis:** o programa de volta de humanos à Lua, com foco no polo sul.
- **HLS** (Human Landing System): o módulo que vai pousar os astronautas do Artemis.
- **Dia lunar:** ~29,5 dias terrestres. No polo, o Sol gira rasante em volta do horizonte em vez de nascer e se pôr.

## O pipeline nesse vocabulário

O **DEM LOLA**, baixado do PGDA ou do PDS, gera a **máscara de horizonte**. O **SPICE**, com seus kernels, dá o **azimute e a elevação** do Sol e da Terra. Cruzando os dois, sabemos quando há luz e quando há **DTE**.
