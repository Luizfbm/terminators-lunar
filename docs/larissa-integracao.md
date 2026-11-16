# Larissa, o que entra do seu #52 e o que fica para depois

15/11/2026. Seu trabalho no #52 foi trazido para a branch de integração aos pedaços, um PR por peça, para dar para revisar e testar cada uma sozinha. Tudo entra como você fez, inclusive o layout. A única condição é que os testes continuem rodando.

## O que entra do jeito que você fez

| Peça sua | PR | O que muda para o visitante |
|---|---|---|
| Costura em 0°E | #56 | O mapa não quebra na longitude zero |
| 17 pousos de missões (LROC) | #58 | Apollo, Surveyor, Chang'e e os outros aparecem no globo |
| Reserva de 60 m no polo | #59 | Exploração até 80°S onde o quadrado de 80 m não cobre os raios |
| Menu e câmera do globo | #60 | Giro, vistas, marcas de polo e equador |
| Luz de regolito na vista Do chão | #54 | O chão iluminado de um jeito que se lê melhor |
| Contrato: `/terrain/heights` e cobertura global | #73 | Base das peças abaixo. Acrescentamos o 503 Busy, porque a rota usa um slot do engine |
| `GET /terrain/heights` | #82 | Pixels do DEM sem reamostrar, 422 quando não há DEM. Acrescentamos o limite por IP e o slot do engine, por causa dos ~900 MB por pedido que você mediu |
| Cobertura global de ponto digitado | #86 | Qualquer ponto da Lua responde, com LDEM_128 (236,9 m) e LDEM_60N_240M (240 m). Corrigimos um bug: o LDEM_128 aparecia duas vezes em `uncovered` |
| Chão 3D medido | #81 | Fora do polo, a vista Do chão monta o relevo real. Dentro do polo, nada muda |
| Land e Back de verdade, com o status no palco | #85 | Clique pousa, "Pousando em…", Cancelar, Tentar de novo, Voltar. Pusemos o Back e a bolha também em português |
| Regras de camada (Site escolhido só com o anel, escopo polar, padrões) | #84 | Como você deixou. Missões abrem desligadas |
| Dados de produção (#64) | #83 | Scripts que baixam e convertem os dois DEMs globais do PDS e refazem Apollo 15 e Surveyor 6 e 7 |

## O layout: fica o seu

Decisão do Luiz, 15/11/2026: o app passa a abrir no seu layout.

- O globo ocupa a tela, sem a coluna da resposta ao lado.
- Sai o cabeçalho: Guia, Sobre (a capa) e o botão PT/EN. O idioma continua vindo do link e do navegador.
- No celular fica como você fez, com mais espaço para o globo.

## O que fica escondido por enquanto

Atualização (#55, 15/11/2026): a forma de trazer esses pontos de volta é um cartão com a resposta no canto do globo (a frase do Sol e da Terra, o Occluder de cada uma e a faixa de incerteza) e uma gaveta de detalhes, aberta pelo botão Detalhes (`details=1` no link), com o resto da lista abaixo. O layout clássico continua como era.

Nada disso foi apagado. Os componentes continuam no código, só não aparecem no seu layout. Vamos pensar em outra forma de trazer esses pontos de volta:

- o Occluder com nome e distância ("atrás de uma crista a 14 km a sudoeste");
- LCIP e LCSP;
- a faixa de incerteza do DEM;
- o link para a Prova;
- os outros painéis da coluna: horizonte plano ao lado, aviso de Site sensível, alcance do horizonte, quando pousar, bateria, plano A contra B, Estatísticas para nerds, dispersão do pouso, DSN, plano B do atraso, o vizinho que serve (#70), o resultado frágil (#69) e o resumo para imprimir (#72).

## Os testes continuam rodando

Esse é o único ponto que muda em relação ao #84 como estava: nenhum teste fica pulado. Hoje uns 20 arquivos de e2e testam a coluna e o cabeçalho, e a regra do repositório não deixa marcar checagem como `fixme`. O app ganha um parâmetro de link que abre o layout antigo, com a coluna e o cabeçalho. Esses e2e passam a abrir o app com ele, e os testes do seu layout abrem sem. Quem visita o site vê o seu layout. Os componentes escondidos continuam testados até a gente decidir como trazê-los de volta.

## Duas coisas que ainda estão em aberto no pouso global

- Escada de resolução num ponto global: os três degraus aparecem como 20, 80 e 240 m, mas todos usam o LDEM_128 de 237 m e dão o mesmo número. O campo `dems` diz a verdade, mas o rótulo engana. A ideia é esconder a escada quando todos os degraus usam o mesmo DEM.
- `/terrain` com o LDEM_128 real: com o raio padrão de 100 m, a resposta deve ser 422 ("DEM grosso demais"), porque o pixel tem 237 m. É coerente, mas a tela precisa explicar.

## O seu #80

O #80 põe o Sol e a Terra no tamanho angular de verdade na vista Do chão e acrescenta setas que giram a câmera até eles. A ciência está certa: o raio de cada disco vem do backend, a cada amostra (SPICE, `asin(raio/distância)`), e a direção continua sendo o azimute e a elevação da resposta. Nada é inventado no navegador.

| Peça | O que fazemos | Por quê |
|---|---|---|
| `angular_radius_deg` do Sol e da Terra na timeline (engine, contrato, teste) | Entra | Hoje a Terra tem um raio fixo de 0,95° e o Sol usa a média da Window. Com o seu, a Terra fica entre 0,90° e 0,91° e o Sol em ~0,27°, variando no tempo. É mudança de contrato, então vai num PR próprio |
| O disco por amostra (`discScale`, `ballScale`) | Entra | É a geometria certa para desenhar o disco e a esfera |
| Esconder o corpo quando falta o raio | Entra com ajuste | Em vez de sumir, cai para o raio médio que já existe. Sem isso, o e2e contra o mock (que ainda não tem os campos) fica sem Sol e sem Terra |
| Setas para o Sol e a Terra | Entra depois de dois ajustes | O texto está só em inglês, e "abaixo do horizonte" usa `fraction === 0`, que também vale num eclipse. Falta teste |
| Tirar o halo | Entra (decisão do Luiz) | Sem o halo, a borda do disco aparece no tamanho real |
| `stretch = 1` | Não entra (decisão do Luiz) | O exagero vertical fica como está, porque a ±1,5° do polo o horizonte ficaria quase plano na tela. O disco estica junto, e a legenda já avisa |
| Tirar a faixa do Horizon mask desenrolado | Entra (decisão do Luiz, #106, PR #128) | No seu layout a vista Do chão fica só com o céu e as setas. A faixa continua no layout antigo (`?layout=classic`), e os testes dela passaram a abrir esse layout |

O #80 entra depois do #81 (chão 3D medido), porque os dois mexem no `Sky.tsx`.
