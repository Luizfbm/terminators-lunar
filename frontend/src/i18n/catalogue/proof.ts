export const en = {
  'proof.open': 'How we know these numbers',
  'proof.back': 'Back to the answer',
  'proof.title': 'How we know these numbers',
  'proof.summary': 'Of {total} checks: passing {passed}, failing {failed}, pending {pending}.',
  'proof.order': 'Failing checks come first, then pending ones, then the ones that pass.',
  'proof.status.passed': 'Passes',
  'proof.status.failed': 'Fails',
  'proof.status.pending': 'Pending',
  'proof.reference': 'Checked against',
  'proof.tolerance': 'Tolerance',
  'proof.result': 'Result',
  'proof.notCovered': 'Not covered',
  'proof.script': 'Script',
  'proof.runAt': 'Run on',
  'proof.provenance': 'Engine {engine}. Kernels: {kernels}. Terrain: {dems}.',
  'proof.dem': '{product} at {resolution} m',
  'proof.loading': 'Loading the checks…',
  'proof.error': 'Could not load the checks. {reason}',
  'proof.empty': 'No check has run yet. The list fills in after the validation suite runs on the server.',
  'proof.errors.title': 'Where a number can be wrong',
  'proof.errors.lead':
    'Each source of error, how big it is and what it does to the answer. Every size comes from a check on this page, a script, a decision record or a paper, named in the last column. Where we have no source for a size, the row has no number.',
  'proof.errors.col.source': 'Source of error',
  'proof.errors.col.size': 'Size',
  'proof.errors.col.effect': 'Effect on the answer',
  'proof.errors.col.from': 'Where the size comes from',
  'proof.err.dem.name': 'Resolution of the terrain map',
  'proof.err.dem.size':
    'Maps of 20 m out to 5 km, 80 m out to 100 km and 240 m out to 300 km. Sites off the pole: about 60 m out to 100 km, then 240 m.',
  'proof.err.dem.effect':
    'Relief smaller than a cell is not in the Horizon mask. The Resolution ladder shows how far the answer moves from one resolution to the next.',
  'proof.err.height.name': 'Height error of the terrain map',
  'proof.err.height.size': '0.3 to 0.5 m RMS on the adjusted LOLA maps (Barker et al. 2021).',
  'proof.err.height.effect':
    'Moves the Horizon mask by about atan(error ÷ distance): 1 m of height at an Occluder 16 km away is 0.004°, and more for a nearer one. ADR 0003 turns the known error into the Uncertainty band.',
  'proof.err.small.name': 'Relief smaller than the finest cell',
  'proof.err.small.size': 'A crater about 20 m across, the one IM-2 Athena tipped over in.',
  'proof.err.small.effect':
    'The engine cannot see it. At the resting point it gives Sun fraction 1.00 at both LROC images, while the lander lay with its panels facing away from the Sun.',
  'proof.err.reach.name': 'Horizon reach',
  'proof.err.reach.size': '300 km, the 240 m map from 100 km out.',
  'proof.err.reach.effect':
    'Terrain farther away is not in the Horizon mask. Wueller et al. 2026 stop at 150 km: at HW01 a walk cut there puts the mask up to 1.03° lower than ours (that walk also lacked the 20 m map).',
  'proof.err.step.name': 'Time step',
  'proof.err.step.size': '15 min between samples, each crossing found to about 1 s.',
  'proof.err.step.effect':
    'A Sunset or an Earthset is placed to the second. A shadow that starts and ends between two samples would be missed.',
  'proof.err.ephemeris.name': 'Sun and Earth positions (DE440)',
  'proof.err.ephemeris.size':
    'At worst 0.000001° for the Sun and 0.000312° for the Earth against JPL Horizons, with 0.02° allowed.',
  'proof.err.ephemeris.effect': 'Directions in the sky only: that check ran without terrain.',
  'proof.err.sun.name': 'The Sun as a disc',
  'proof.err.sun.size':
    'Days of Sun counting any part of the disc, its centre, the whole disc: 14.69, 14.54 and 14.24 at CR01; 9.11, 8.64 and 7.81 at HW01. At a flat horizon our Sunset is within 0.00014° of JPL Horizons; by the Sun’s centre it would be 0.262° off.',
  'proof.err.sun.effect':
    'The Sun counts as up while any part of its disc is above the Horizon mask, and the Sunset is when the last edge goes. Another rule would shorten the sunlit time.',
  'proof.err.earth.name': 'The Earth by its centre',
  'proof.err.earth.size':
    'Against NASA’s 18.6-year map, ours minus the map: −0.53 points on average counting any part of the Earth’s disc, −5.72 points counting the centre, as the app does.',
  'proof.err.earth.effect':
    'Earth visible is shorter than it would be for a rule that counts any part of the Earth’s disc.',
  'proof.err.landing.name': 'Where the lander lands',
  'proof.err.landing.size':
    'A Landing ellipse of 100 m radius by default. IM-2 Athena missed by about 250 m, the miss Intuitive Machines reported.',
  'proof.err.landing.effect':
    'Each answer is for the Site’s published coordinate. Where the lander ends up is a separate error, kept apart from the map’s.',
  'proof.todo.title': 'What we have not checked yet',
  'proof.todo.lead': 'Gaps for the whole page, not for one check. Each one names where it comes from.',
  'proof.todo.ladder':
    'The Resolution ladder stops at 20 m. A 5 m LOLA map exists for a few Sites (16 × 16 km windows) and the engine does not use it, so we do not know how much those answers move below 20 m. It is about 90 % interpolated, so it would be a better estimate, not a reference.',
  'proof.todo.lola':
    'Errors every LOLA map shares. Our horizon was compared with an independent one, but both are LOLA altimetry, and the slope checks use synthetic terrain only. A 20 m map cannot show rocks or craters a few metres across.',
  'proof.todo.instants':
    'A measured Sunset to compare with. Blue Ghost 1 has only the time of its last data, and its check fails. Chandrayaan-3 has only the day ISRO put it to sleep, so that check tests the order, not an instant. IM-2 Athena did not end at a terrain Sunset.',
  'proof.todo.wueller':
    'Only 75 of 130 Artemis Sites are within 1 day of the sunlit days Wueller et al. 2026 publish. For 40 Sites we have found no cause, and the paper’s method is not in any open source we could reach.',
  'proof.todo.ridges':
    'Bright ridges, and any height above the ground. NASA’s 18.6-year map was compared at smooth points at the surface (0 m), not at a mast. On 18 bright ridges the map cannot place a value inside a 60 m pixel; the difference there (RMSE 25.40 points) is shown, never judged.',
  'proof.todo.dsn':
    'The DSN link is geometry only: no antenna schedule, no link budget, no terrain around the stations, no refraction, and only the three 70 m antennas.',
  'proof.todo.panels':
    'The panel and battery model beyond the Sun’s angle and distance, which have outside references: no heat, no tracking error, no shadow of the lander on its own panels, constant load.',
  'proof.todo.eclipse':
    'The Earth’s atmosphere in an eclipse: it is not in the model, so the real shadow of the Earth is larger than ours.',
}

export const pt: Record<keyof typeof en, string> = {
  'proof.open': 'Como sabemos estes números',
  'proof.back': 'Voltar para a resposta',
  'proof.title': 'Como sabemos estes números',
  'proof.summary': 'De {total} checagens: passam {passed}, falham {failed}, pendentes {pending}.',
  'proof.order': 'As checagens que falham vêm primeiro, depois as pendentes, depois as que passam.',
  'proof.status.passed': 'Passa',
  'proof.status.failed': 'Falha',
  'proof.status.pending': 'Pendente',
  'proof.reference': 'Conferido contra',
  'proof.tolerance': 'Tolerância',
  'proof.result': 'Resultado',
  'proof.notCovered': 'Não cobre',
  'proof.script': 'Script',
  'proof.runAt': 'Executado em',
  'proof.provenance': 'Motor {engine}. Kernels: {kernels}. Relevo: {dems}.',
  'proof.dem': '{product} a {resolution} m',
  'proof.loading': 'Carregando as checagens…',
  'proof.error': 'Não foi possível carregar as checagens. {reason}',
  'proof.empty': 'Nenhuma checagem rodou ainda. A lista se preenche depois que a suíte de validação roda no servidor.',
  'proof.errors.title': 'Onde um número pode errar',
  'proof.errors.lead':
    'Cada fonte de erro, o tamanho dela e o que faz com a resposta. Todo tamanho vem de uma checagem desta página, de um script, de um registro de decisão ou de um artigo, citado na última coluna. Onde não temos fonte para um tamanho, a linha fica sem número.',
  'proof.errors.col.source': 'Fonte de erro',
  'proof.errors.col.size': 'Tamanho',
  'proof.errors.col.effect': 'Efeito na resposta',
  'proof.errors.col.from': 'De onde vem o tamanho',
  'proof.err.dem.name': 'Resolução do mapa de relevo',
  'proof.err.dem.size':
    'Mapas de 20 m até 5 km, 80 m até 100 km e 240 m até 300 km. Locais fora do polo: cerca de 60 m até 100 km, depois 240 m.',
  'proof.err.dem.effect':
    'Relevo menor que uma célula não entra na máscara do horizonte. A escada de resolução mostra quanto a resposta muda de uma resolução para a seguinte.',
  'proof.err.height.name': 'Erro de altura do mapa de relevo',
  'proof.err.height.size': '0,3 a 0,5 m de RMS nos mapas LOLA ajustados (Barker et al. 2021).',
  'proof.err.height.effect':
    'Desloca a máscara do horizonte em cerca de atan(erro ÷ distância): 1 m de altura num obstáculo a 16 km dá 0,004°, e mais num mais próximo. O ADR 0003 transforma o erro conhecido na faixa de incerteza.',
  'proof.err.small.name': 'Relevo menor que a célula mais fina',
  'proof.err.small.size': 'Uma cratera de cerca de 20 m de largura, a em que a IM-2 Athena tombou.',
  'proof.err.small.effect':
    'O motor não a enxerga. No ponto de repouso ele dá fração do Sol 1,00 nas duas imagens da LROC, enquanto a sonda estava com os painéis virados para longe do Sol.',
  'proof.err.reach.name': 'Alcance do horizonte',
  'proof.err.reach.size': '300 km, com o mapa de 240 m a partir de 100 km.',
  'proof.err.reach.effect':
    'O relevo mais distante não entra na máscara do horizonte. Wueller et al. 2026 param em 150 km: em HW01 uma caminhada cortada ali põe a máscara até 1,03° abaixo da nossa (essa caminhada também não tinha o mapa de 20 m).',
  'proof.err.step.name': 'Passo do tempo',
  'proof.err.step.size': '15 min entre amostras, cada cruzamento achado até cerca de 1 s.',
  'proof.err.step.effect':
    'Um pôr do Sol ou o sumiço da Terra é posicionado ao segundo. Uma sombra que começa e termina entre duas amostras passaria despercebida.',
  'proof.err.ephemeris.name': 'Posições do Sol e da Terra (DE440)',
  'proof.err.ephemeris.size':
    'No pior caso 0,000001° para o Sol e 0,000312° para a Terra contra o JPL Horizons, com 0,02° permitido.',
  'proof.err.ephemeris.effect': 'Só as direções no céu: essa checagem rodou sem relevo.',
  'proof.err.sun.name': 'O Sol como disco',
  'proof.err.sun.size':
    'Dias de Sol contando qualquer parte do disco, o centro, o disco inteiro: 14,69, 14,54 e 14,24 em CR01; 9,11, 8,64 e 7,81 em HW01. Num horizonte plano nosso pôr do Sol fica a 0,00014° do JPL Horizons; pelo centro do Sol erraria 0,262°.',
  'proof.err.sun.effect':
    'O Sol conta como visível enquanto qualquer parte do disco está acima da máscara do horizonte, e o pôr do Sol é quando a última borda some. Outra regra encurtaria o tempo de Sol.',
  'proof.err.earth.name': 'A Terra pelo centro',
  'proof.err.earth.size':
    'Contra o mapa de 18,6 anos da NASA, nosso menos o mapa: −0,53 ponto em média contando qualquer parte do disco da Terra, −5,72 pontos contando o centro, como o app faz.',
  'proof.err.earth.effect':
    'A Terra visível dura menos do que numa regra que conta qualquer parte do disco da Terra.',
  'proof.err.landing.name': 'Onde a sonda pousa',
  'proof.err.landing.size':
    'Uma elipse de pouso de 100 m de raio por padrão. A IM-2 Athena errou por cerca de 250 m, o erro que a Intuitive Machines informou.',
  'proof.err.landing.effect':
    'Cada resposta vale para a coordenada publicada do Local. Onde a sonda acaba é outro erro, separado do erro do mapa.',
  'proof.todo.title': 'O que ainda não conferimos',
  'proof.todo.lead': 'Lacunas da página inteira, não de uma checagem só. Cada uma diz de onde vem.',
  'proof.todo.ladder':
    'A escada de resolução para em 20 m. Existe um mapa LOLA de 5 m para alguns Locais (janelas de 16 × 16 km) e o motor não o usa, então não sabemos quanto essas respostas mudam abaixo de 20 m. Ele é cerca de 90 % interpolado, então seria uma estimativa melhor, não uma referência.',
  'proof.todo.lola':
    'Erros que todo mapa LOLA compartilha. Comparamos nosso horizonte com um independente, mas os dois são altimetria LOLA, e as checagens de inclinação usam só relevo sintético. Um mapa de 20 m não mostra pedras nem crateras de poucos metros.',
  'proof.todo.instants':
    'Um pôr do Sol medido para comparar. A Blue Ghost 1 tem só a hora dos últimos dados, e a checagem dela falha. A Chandrayaan-3 tem só o dia em que a ISRO a pôs para dormir, então essa checagem testa a ordem, não um instante. A IM-2 Athena não terminou num pôr do Sol causado pelo relevo.',
  'proof.todo.wueller':
    'Só 75 de 130 Locais Artemis ficam a 1 dia dos dias de Sol que Wueller et al. 2026 publicam. Em 40 Locais não achamos a causa, e o método do artigo não está em nenhuma fonte aberta que alcançamos.',
  'proof.todo.ridges':
    'Cristas brilhantes e qualquer altura acima do chão. O mapa de 18,6 anos da NASA foi comparado em pontos lisos na superfície (0 m), não num mastro. Em 18 cristas brilhantes o mapa não consegue pôr um valor dentro de um pixel de 60 m; a diferença ali (RMSE 25,40 pontos) é mostrada, nunca julgada.',
  'proof.todo.dsn':
    'O link DSN é só geometria: sem agenda de antena, sem orçamento de enlace, sem relevo em volta das estações, sem refração, e só as três antenas de 70 m.',
  'proof.todo.panels':
    'O modelo de painel e bateria além do ângulo e da distância do Sol, que têm referência externa: sem calor, sem erro de apontamento, sem sombra da sonda nos próprios painéis, carga constante.',
  'proof.todo.eclipse':
    'A atmosfera da Terra num eclipse: ela não está no modelo, então a sombra real da Terra é maior que a nossa.',
}
