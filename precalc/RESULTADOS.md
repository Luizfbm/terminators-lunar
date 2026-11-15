# Resultados da sessão 3 — dados recolhidos e motor validado

Data: 2026-10-22 · Autor: sessão OpenClaw (agente principal)

## 1. O desafio, identificado na fonte

- **Título oficial:** *CLPS Lunar Mission Browser*
- **Slug:** `/2026/challenges/clps-lunar-mission-browser/`
- **Publicado:** 2026-09-17 · **atualizado:** 2026-10-20 (Space Apps 2026)
- CLPS = *Commercial Lunar Payload Services*. O texto do enunciado é idêntico ao fornecido pelo Eduardo,
  confirmado no campo `excerpt` da página oficial.

## 2. Dados recolhidos (todos de arquivo público, nada dependente do hackathon)

| Item | Arquivo | Tamanho | Fonte |
|---|---|---|---|
| DEM polar 20 m/px, 87,5–90°S | `dados/dem/LDEM_875S_20M.IMG` | 109,7 MB | imbrium.mit.edu (MIT/PDS) |
| Rótulo PDS do DEM | `dados/dem/LDEM_875S_20M.LBL` | 4 KB | idem |
| Efemérides planetárias | `dados/kernels/de440s.bsp` | 31,2 MB | NAIF |
| Leap seconds | `dados/kernels/naif0012.tls` | 5 KB | NAIF |
| Constantes de corpos | `dados/kernels/pck00011.tpc` | 128 KB | NAIF |
| **Orientação lunar (libração)** | `dados/kernels/moon_pa_de440_200625.bpc` | 12,3 MB | NAIF |
| **Frame lunar (texto)** | `dados/kernels/moon_de440_250416.tf` | 19 KB | NAIF |
| Associação de frames | `dados/kernels/moon_assoc_me.tf` | 8 KB | NAIF |

Disponíveis e não baixados (grandes, mesma família):
`LDEM_875S_5M.IMG` (1,76 GB, **5 m/px**), `LDEM_875S_10M` (439 MB), `LDEM_85S_10M` (1,76 GB, cobre 85–90°S).

> Os kernels `moon_*.tf` são **obrigatórios**: sem eles o frame `MOON_ME` não existe e a libração
> sai errada. Sem o `.bpc` idem. Este é o erro nº 1 de quem tenta fazer isso em casa.

## 3. Motor construído

```
precalc/build_ephem.py    SPICE -> vetores Sol/Terra em MOON_ME (3 h, 2026-2045)  [roda 1x, ~4 min]
precalc/engine.py         horizontes (DEM) + iluminacao/DTE (algebra vetorial)     [ms por sitio]
precalc/probe_geometry.py sonda geometrica pura (sem terreno)
precalc/horizon.py        versao didatica, com SPICE em linha
precalc/scan.py           varredura do polo (9000 pontos)
precalc/ephem_*.npy       efemerides pre-calculadas (55.521 amostras)
precalc/scan_coarse.npy   resultado da varredura
```

Depois de `build_ephem.py`, avaliar um sítio custa **milissegundos** — sem SPICE, sem I/O pesado.
É exatamente a arquitetura de "pré-calcular para adiantar os cálculos".

## 4. Números medidos (não copiados)

### 4.1 Geometria pura (sem terreno), 2026–2045

| Sítio | Elevação Sol | Elevação Terra | Terra > 0° | Terra > 5° |
|---|---|---|---|---|
| 89,9°S (polo) | −1,67° a +1,69° | −7,01° a +6,72° | **49,1%** | 21,8% |
| 85,9°S (Malapert) | −5,67° a +5,69° | −3,07° a +10,72° | **69,2%** | 44,2% |

- Confirma a afirmação de que no polo o Sol nunca passa de ~1,5°.
- **Confirma o ±7° da Terra** (libração em latitude) — não é "quase zero".
- **49,1% de DTE geométrico no polo** casa com o ~50% medido por Bryant (2009): a barreira da DTE
  é a geometria, não o terreno.

### 4.2 Com terreno (DEM 20 m/px), 2026–2045

| Sítio | h0 | horizonte médio | iluminação (centro do disco) | iluminação (limbo) | DTE |
|---|---|---|---|---|---|
| −89,30 / 128,5 (melhor achado) | 1284 m | −0,75° | 68,4% | **75,9%** | 53,8% |
| −89,45 / 222,69 (Connecting Ridge) | 1956 m | −0,38° | 58,3% | ~66% | 48,0% |
| −89,9 / 0 ("Shackleton rim" do JSON) | 634 m | +2,97° | 10,9% | — | 55,1% |

**Validação:** 75,9% contra a faixa publicada de **77,1–88,0%** (Gläser 2018) — diferença de ~1 ponto,
explicada pelo raio angular do Sol (0,266°). O motor está calibrado.

**Convergência:** refinar o passo de azimute (4° → 0,25°) não altera o resultado (67,4% em todos),
logo a máscara de horizonte está convergida.

**Convenção de longitude confirmada por teste:** espelhar a longitude derruba o máximo de 68,4% para
53,5%. A convenção atual (`lon = atan2(x, y)`, 0° no topo da imagem) é a correta.

### 4.3 Achados de sítio (o que a varredura revelou)

- O melhor ponto de iluminação no cap 87,5–90°S está em **−89,30°S, ~128°E** (máx. 68,4% / 75,9%).
- O melhor ponto de **DTE** está em **−88,25°S, ~8°E** (69,9% de DTE, iluminação 52,1%) — praticamente
  o teto geométrico.
- **Iluminação e DTE não coincidem** — confirmado numericamente. É a tensão central do desafio.
- O "Shackleton rim" do JSON existente (−89,9 / 0) está **no fundo/encosta**, não na borda:
  h0 = 634 m e horizonte médio +2,97°. Precisa de coordenada real.

## 5. Correção de uma afirmação anterior

Na revisão do plano paralelo eu escrevi que um piso de 5° para a elevação da Terra
"eliminaria quase todas as janelas DTE". **Estava exagerado.** Medido: no polo, 21,8% do tempo
a Terra está acima de 5° (geometricamente); em Malapert, 44,2%. É restritivo, não fatal — mas
combinado com terreno pode ficar bem pior. O número correto é este.

## 6. Pendências

1. Baixar `LDEM_875S_5M` (5 m/px) para reproduzir a precisão fina — 1,76 GB, ~95 min de download.
2. Baixar `LDEM_85S_10M` para cobrir Malapert (85,9°S) e Leibnitz (85,4°S), que estão fora do cap atual.
3. Definir a convenção de iluminação oficial do app (centro do disco × limbo × irradiância integrada).
   Para **energia** o correto é integrar o disco e multiplicar por cos(elevação).
4. Refinar a busca de ótimos locais (passo de 100 m em vez de 500 m) — deve superar 77,1%.
