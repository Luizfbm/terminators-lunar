"""
VALIDAÇÃO DA TESE COM A ROTA REAL DO PRAGYAN (Chandrayaan-3, setor da South Crater, 23–27/08/2023).

Ideia: o mesmo método do simulador (grade grossa → 5 m com 7,29% de células medidas, crateras conhecidas só se um ponto
medido cair nelas, margem P90 por célula) aplicado numa ESCALA REDUZIDA 12:1 — grade grossa de 3 m → 25 cm —, que é a
mesma razão de 60 m → 5 m. Pergunta: planejando de onde o Pragyan estava (23–24/08) até o sul, qual plano repete o erro
real (seguir reto até a cratera de 4 m e ter de voltar em 27/08) e qual desvia antes?

Fontes da cena (coordenadas em metros, x = leste, y = norte, origem no Vikram pré-salto):
  - Trilha, paradas e cratera A: LPSC 2025 #1025 (Stooke), Fig. 3, digitalizadas da grade de 5 m (≈65 px/m, erro ≈ 0,2–0,5 m).
  - Cratera de 4 m "3 m à frente" em 27/08: post da ISRO; posição INFERIDA = fim do ramo sul da Fig. 3 (0,77 E; 12,25 S)
    + depressão escura/clara no fundo OHRC da mesma figura centrada perto de (0,7 E; 16,5 S). Incerteza ±1 m (Monte Carlo).
  - South Crater 9 m: LPSC 2025 (texto) e Figs. 1/3; centro estimado (8 E; 14 S).
  - Duas depressões de ≈1,2 m a oeste (fundo OHRC da Fig. 3).
  - Relevo das crateras: perfil do simulador (tigela parabólica + borda gaussiana), profundidade d/D sorteada em [0,10; 0,20]
    (modelo morfológico, NÃO dado medido: não há DEM de 25 cm do local no projeto).
"""
import numpy as np, heapq, json, math, sys

CEL = 0.25; BLOCO = 12          # 25 cm; grade grossa 3 m = 12 células (mesma razão de 60 m → 5 m)
X0, X1, Y0, Y1 = -8.0, 14.0, -24.0, 0.0
NX, NY = int((X1 - X0) / CEL), int((Y1 - Y0) / CEL)
LIM = 15.0                       # limite de declive (graus), igual ao simulador/VIPER
import os
Z_P90 = float(os.environ.get('Z', 1.28))
FRAC_MEDIDA = float(os.environ.get('FRAC', 0.0729))             # 7,29% de células medidas (LDEM 5 m: 92,71% interpoladas)
INICIO = (0.0, -3.9)             # parada de 23–24/08
JUNCAO = (-0.12, -6.19)          # ponto de 25/08 e 27/08 (onde o rover voltou)
FIM_RAMO_SUL = (0.77, -12.25)    # fim do ramo 25–27/08 (de onde viu a cratera)
META = (0.8, -22.5)              # seguir para o sul além da cratera (direção do ramo)

CRATERAS_BASE = [  # x, y, diâmetro, incerteza de posição (m), nome
    (0.80, -16.9, 4.0, 1.0, 'cratera de 4 m (27/08, ISRO)'),
    (8.0, -14.0, 9.0, 0.7, 'South Crater (9 m)'),
    (3.6, -11.2, 1.0, 0.3, 'cratera A (1 m)'),
    (-1.9, -13.6, 1.2, 0.5, 'depressão O1'),
    (-2.3, -16.8, 1.2, 0.5, 'depressão O2'),
]

xs = X0 + (np.arange(NX) + 0.5) * CEL
ys = Y0 + (np.arange(NY) + 0.5) * CEL
XX, YY = np.meshgrid(xs, ys)     # [NY, NX]

def celula(p):
    return (int((p[1] - Y0) / CEL), int((p[0] - X0) / CEL))

def relevo(crs, rng):
    z = 0.02 * np.sin(XX * 0.9 + rng.uniform(0, 6)) * np.cos(YY * 0.7 + rng.uniform(0, 6))   # ondulação suave ±2 cm
    nogo = np.zeros_like(z, dtype=bool)
    for c in crs:
        r = c['D'] / 2; d = np.hypot(XX - c['x'], YY - c['y']) / r
        dentro = d < 1
        z = z - np.where(dentro, c['prof'] * (1 - d * d), 0)
        z = z + np.where((~dentro) & (d < 1.8), 0.04 * c['D'] * np.exp(-((d - 1.15) / 0.3) ** 2), 0)
        nogo |= dentro
    return z, nogo

def declive(z, passo):
    """Declive em graus por diferença central com meia-largura `passo` células (1 = fino; BLOCO = como o planejador grosso)."""
    gx = np.zeros_like(z); gy = np.zeros_like(z)
    a = np.clip(np.arange(NX) - passo, 0, NX - 1); b = np.clip(np.arange(NX) + passo, 0, NX - 1)
    gx = (z[:, b] - z[:, a]) / ((b - a) * CEL)[None, :]
    a = np.clip(np.arange(NY) - passo, 0, NY - 1); b = np.clip(np.arange(NY) + passo, 0, NY - 1)
    gy = (z[b, :] - z[a, :]) / ((b - a) * CEL)[:, None]
    return np.degrees(np.arctan(np.hypot(gx, gy)))

def grosso(z):
    """Média por bloco de 3 m + interpolação bilinear entre centros (igual ao simulador)."""
    nbx, nby = math.ceil(NX / BLOCO), math.ceil(NY / BLOCO)
    med = np.zeros((nby, nbx))
    for by in range(nby):
        for bx in range(nbx):
            med[by, bx] = z[by*BLOCO:(by+1)*BLOCO, bx*BLOCO:(bx+1)*BLOCO].mean()
    fx = np.clip((np.arange(NX) + 0.5) / BLOCO - 0.5, 0, nbx - 1); fy = np.clip((np.arange(NY) + 0.5) / BLOCO - 0.5, 0, nby - 1)
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int); x1 = np.minimum(nbx - 1, x0 + 1); y1 = np.minimum(nby - 1, y0 + 1)
    tx = fx - x0; ty = fy - y0
    a = med[y0][:, x0] * (1 - tx) + med[y0][:, x1] * tx
    b = med[y1][:, x0] * (1 - tx) + med[y1][:, x1] * tx
    return a * (1 - ty)[:, None] + b * ty[:, None]

def mapa_tese(z, crs, medido, zg, rng):
    """Mesma regra do simulador: cratera só entra no mapa se ≥1 célula medida cair em 1,35·r; fidelidade k; medidas exatas."""
    delta = np.zeros_like(z); nogo = np.zeros_like(z, dtype=bool); detectadas = []
    for c in crs:
        r = c['D'] / 2; dist = np.hypot(XX - c['x'], YY - c['y'])
        tiros = int((medido & (dist <= 1.35 * r)).sum())
        if tiros == 0: detectadas.append(False); continue
        detectadas.append(True)
        k = min(1.0, max(0.75, 0.68 + 0.12 * tiros)); d = dist / r
        dentro = d < 1
        delta += k * np.where(dentro, -c['prof'] * (1 - d * d), np.where(d < 1.8, 0.04 * c['D'] * np.exp(-((d - 1.15) / 0.3) ** 2), 0))
        nogo |= dentro
    ruido = 0.01 * np.sin(XX * 0.6 + rng.uniform(0, 6)) * np.cos(YY * 0.5 + rng.uniform(0, 6))
    zm = np.where(medido, z, zg + delta + ruido)
    s = declive(zm, 1)
    margem = 1.0 + Z_P90 * np.where(medido, 0.8, 2.0)
    return s, margem, nogo, detectadas

def dijkstra(custo_passo, bloq):
    """Caminho de custo mínimo (8 vizinhos) do INICIO à META; custo = comprimento × (1 + 2·declive/limite). Mesma função nos 3 mapas."""
    si, sj = celula(INICIO); gi, gj = celula(META)
    bloq = bloq.copy(); bloq[si, sj] = False; bloq[gi, gj] = False
    INF = 1e18; dist = np.full((NY, NX), INF); prev = {}
    dist[si, sj] = 0; h = [(0.0, si, sj)]
    viz = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    while h:
        d, i, j = heapq.heappop(h)
        if d > dist[i, j]: continue
        if (i, j) == (gi, gj): break
        for di, dj in viz:
            a, b = i + di, j + dj
            if 0 <= a < NY and 0 <= b < NX and not bloq[a, b]:
                nd = d + CEL * math.hypot(di, dj) * (1 + 2 * custo_passo[a, b] / LIM)
                if nd < dist[a, b]: dist[a, b] = nd; prev[(a, b)] = (i, j); heapq.heappush(h, (nd, a, b))
    if dist[gi, gj] >= INF: return None
    p = [(gi, gj)]
    while p[-1] != (si, sj): p.append(prev[p[-1]])
    return p[::-1]

def avaliar(cam, s_real, nogo_real):
    """Percorre o caminho na VERDADE: metros até o 1º perigo real (declive > 15° ou dentro de cratera), comprimento total."""
    comp = 0.0; ate = None
    for k in range(1, len(cam)):
        (a, b), (c, d) = cam[k-1], cam[k]; comp += CEL * math.hypot(a - c, b - d)
        if ate is None and (s_real[c, d] > LIM or nogo_real[c, d]): ate = comp
    return comp, ate

def um_sorteio(rng, dD=None):
    crs = []
    for (x, y, D, inc, nome) in CRATERAS_BASE:
        crs.append({'x': x + rng.normal(0, inc / 2), 'y': y + rng.normal(0, inc / 2), 'D': D,
                    'prof': (dD if dD is not None else rng.uniform(0.10, 0.20)) * D, 'nome': nome})
    z, nogo_real = relevo(crs, rng)
    s_real = declive(z, 1)
    medido = rng.random(z.shape) > (1 - FRAC_MEDIDA)
    zg = grosso(z); s_g = declive(zg, BLOCO)
    s_t, marg, nogo_t, det = mapa_tese(z, crs, medido, zg, rng)
    planos = {
        'grade_3m': dijkstra(s_g, s_g > LIM),
        'tese_P90': dijkstra(s_t, (s_t + marg > LIM) | nogo_t),
        'verdade': dijkstra(s_real, (s_real > LIM) | nogo_real),
    }
    res = {'det4m': det[0], 'detTodas': det}
    for k, cam in planos.items():
        if cam is None: res[k] = {'ok': False}; continue
        comp, ate = avaliar(cam, s_real, nogo_real)
        res[k] = {'ok': True, 'comp': comp, 'perigo_em': ate, 'cam': cam}
    # maior declive real dentro da cratera de 4 m e o que a grade de 3 m "vê" ali
    c = crs[0]; m = np.hypot(XX - c['x'], YY - c['y']) <= c['D'] / 2 + 0.5
    res['decl4m_real_max'] = float(s_real[m].max()); res['decl4m_grade_max'] = float(s_g[m].max())
    res['decl4m_tese_max'] = float((s_t + marg)[m].max())
    return res, crs, z

if __name__ == '__main__':
    NSORT = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    rng = np.random.default_rng(20230827)
    L = []
    for n in range(NSORT):
        r, crs, z = um_sorteio(rng, float(os.environ['DD']) if os.environ.get('DD') else None)
        if n == 0:
            json.dump({'crs': crs, 'planos': {k: r[k].get('cam') for k in ('grade_3m', 'tese_P90', 'verdade')}, 'z': z.tolist(),
                       'ext': [X0, X1, Y0, Y1]}, open('exemplo.json', 'w'))
        for k in ('grade_3m', 'tese_P90', 'verdade'):
            if 'cam' in r[k]: del r[k]['cam']
        L.append(r)
    json.dump(L, open('sorteios.json', 'w'))
    def resumo(k):
        ok = [r[k] for r in L if r[k]['ok']]; perig = [r for r in ok if r['perigo_em'] is not None]
        comp = np.array([r['comp'] for r in ok])
        return (f"{k:9s} plano achado {len(ok)}/{len(L)} | entra em perigo REAL {len(perig)}/{len(ok)} ({100*len(perig)/max(1,len(ok)):.0f}%)"
                f" | comprimento mediana {np.median(comp):.1f} m (IQR {np.percentile(comp,25):.1f}–{np.percentile(comp,75):.1f})"
                + (f" | 1º perigo a mediana {np.median([r['perigo_em'] for r in perig]):.1f} m do início" if perig else ''))
    for k in ('grade_3m', 'tese_P90', 'verdade'): print(resumo(k))
    nomes=[c[4] for c in CRATERAS_BASE]
    print('detecção por cratera:', ', '.join(f"{nomes[i]} {100*np.mean([r['detTodas'][i] for r in L]):.0f}%" for i in range(len(nomes))))
    print(f"cratera de 4 m detectada no mapa da tese (≥1 célula medida nela): {100*np.mean([r['det4m'] for r in L]):.0f}% dos sorteios")
    print(f"declive máx. na cratera de 4 m: real {np.median([r['decl4m_real_max'] for r in L]):.0f}° | grade 3 m {np.median([r['decl4m_grade_max'] for r in L]):.1f}° | tese+margem {np.median([r['decl4m_tese_max'] for r in L]):.0f}° (medianas)")
