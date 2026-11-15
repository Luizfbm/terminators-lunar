"""Analise de cobertura LOLA, resolucoes disponiveis e pixels vazios para a tese.

Gera (em docs/figuras_tese e docs/tabelas_tese):
  - sitios_numerados.csv / .md  : 130 sitios numerados do mais ao norte (N1) ao mais ao sul
  - cobertura_multiescala.csv     : % de celulas com medicao real LOLA por resolucao (5..60 m)
  - fig_*.png                     : mapas e graficos

Todas as contas usam somente arquivos locais do acervo (LDEM/LDEC 5 m, PGDA 78, PGDA 69).
"""
import csv
import glob
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle
import numpy as np
import tifffile

ROOT = r"C:\NASA PROJETO 2026"
AC = os.path.join(ROOT, "dados", "acervo_tese")
FIG = os.path.join(ROOT, "docs", "figuras_tese")
TAB = os.path.join(ROOT, "docs", "tabelas_tese")
os.makedirs(FIG, exist_ok=True)
os.makedirs(TAB, exist_ok=True)

R = 1737400.0
N5 = 30336
S0_5 = 15167.5
STRIP = 96  # 96 px = 480 m (divisivel por 2, 4, 8, 12)


def ll2xy(lat, lon):
    d = np.radians(90.0 + np.asarray(lat, float))
    r = 2 * R * np.tan(d / 2)
    lo = np.radians(np.asarray(lon, float))
    return r * np.sin(lo), r * np.cos(lo)


def lat2r(lat):
    return 2 * R * np.tan(np.radians(90.0 + lat) / 2)


# ------------------------------------------------------------------ sitios
with open(os.path.join(ROOT, "sites", "artemis_sitios_wueller2026.csv"), encoding="utf-8") as f:
    sites = list(csv.DictReader(f))
for s in sites:
    s["lat"] = float(s["lat"]); s["lon"] = float(s["lon"])
sites.sort(key=lambda s: (-s["lat"], s["lon"]))  # mais ao norte = latitude menos negativa
for i, s in enumerate(sites, 1):
    s["n"] = i
    s["x"], s["y"] = [float(v) for v in ll2xy(s["lat"], s["lon"])]

# ------------------------------------------------------------------ recortes PGDA 78
tiles = {}
for d in sorted(glob.glob(os.path.join(AC, "02_PGDA_78_5M", "*"))):
    if not os.path.isdir(d):
        continue
    name = os.path.basename(d)
    surf = glob.glob(os.path.join(d, "*_surf.tif"))[0]
    with tifffile.TiffFile(surf) as t:
        p = t.pages[0]
        tags = {k.name: k.value for k in p.tags.values()}
        X0, Y0 = tags["ModelTiepointTag"][3:5]
        sc = tags["ModelPixelScaleTag"][0]
        h, w = p.shape
    tiles[name] = dict(dir=d, X0=X0, Y0=Y0, s=sc, w=w, h=h, X1=X0 + w * sc, Y1=Y0 - h * sc)


def tile_of(x, y, margin=150.0):
    for nm, t in tiles.items():
        if nm == "Site20v2":
            continue
        if t["X0"] + margin <= x <= t["X1"] - margin and t["Y1"] + margin <= y <= t["Y0"] - margin:
            return nm
    t = tiles["Site20v2"]
    if t["X0"] + margin <= x <= t["X1"] - margin and t["Y1"] + margin <= y <= t["Y0"] - margin:
        return "Site20v2"
    return ""


def read_tif(path):
    return tifffile.imread(path)


def disk(rad_px):
    yy, xx = np.mgrid[-rad_px:rad_px + 1, -rad_px:rad_px + 1]
    return (xx ** 2 + yy ** 2) <= rad_px ** 2


# ------------------------------------------------------------------ LDEM / LDEC 5 m
ldem = np.memmap(os.path.join(AC, "01_LDEM_5M_MIT", "LDEM_875S_5M.IMG"), dtype="<i2", mode="r", shape=(N5, N5))
ldec = np.memmap(os.path.join(AC, "01_LDEM_5M_MIT", "LDEC_875S_5M.IMG"), dtype="u1", mode="r", shape=(N5, N5))
R875 = lat2r(-87.5)
RAD = 20  # 100 m / 5 m
D = disk(RAD)


def slope_deg(z, s):
    gy, gx = np.gradient(z.astype(np.float64), s)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


tile_cache = {}
for s in sites:
    s.update(dict(in875="", tile="", ldec5="", S_mu="", S_sd="", P8="", eps="", fonte5=""))
    if s["lat"] <= -87.5:
        s["in875"] = "sim"
        c = int(round(S0_5 + s["x"] / 5.0)); r = int(round(S0_5 - s["y"] / 5.0))
        win_c = ldec[r - RAD:r + RAD + 1, c - RAD:c + RAD + 1]
        s["ldec5"] = 100.0 * float((win_c[D] > 0).mean())
        z = ldem[r - RAD - 1:r + RAD + 2, c - RAD - 1:c + RAD + 2].astype(np.float64) * 0.5
        S = slope_deg(z, 5.0)[1:-1, 1:-1][D]
        s["S_mu"], s["S_sd"], s["P8"] = float(S.mean()), float(S.std()), 100.0 * float((S <= 8.0).mean())
        s["fonte5"] = "LDEM_875S_5M"
    tn = tile_of(s["x"], s["y"])
    if tn:
        s["tile"] = tn
        t = tiles[tn]
        if tn not in tile_cache:
            base = glob.glob(os.path.join(t["dir"], "*_surf.tif"))[0].replace("_surf.tif", "")
            tile_cache[tn] = {k: read_tif(f"{base}_{k}.tif") for k in ("slp", "toterr", "ldec")}
        arr = tile_cache[tn]
        c = int((s["x"] - t["X0"]) / t["s"]); r = int((t["Y0"] - s["y"]) / t["s"])
        sl = arr["slp"][r - RAD:r + RAD + 1, c - RAD:c + RAD + 1][D]
        er = arr["toterr"][r - RAD:r + RAD + 1, c - RAD:c + RAD + 1][D]
        lc = arr["ldec"][r - RAD:r + RAD + 1, c - RAD:c + RAD + 1][D]
        s["S_mu"], s["S_sd"], s["P8"] = float(np.nanmean(sl)), float(np.nanstd(sl)), 100.0 * float(np.nanmean(sl <= 8.0))
        s["eps"] = float(np.nanmean(er))
        s["ldec5"] = 100.0 * float((lc > 0).mean())
        s["fonte5"] = f"PGDA 78 ({tn})"
    if len(tile_cache) > 6:
        tile_cache.pop(next(iter(tile_cache)))

    # melhor resolucao LOLA disponivel (grade) e produtos
    best = "5 m (PGDA 78 ajustado)" if s["tile"] else ("5 m (GDR 87,5S)" if s["in875"] else ("10 m (GDR 85S)*" if s["lat"] <= -85 else "20 m (GDR 80S)*"))
    s["best"] = best

# ------------------------------------------------------------------ cobertura multiescala do cap 87,5S
factors = {5: 1, 10: 2, 20: 4, 40: 8, 60: 12}
meas = {k: 0 for k in factors}; tot = {k: 0 for k in factors}
nb = N5 // STRIP
frac480 = np.zeros((nb, nb), np.float32)
cen = (np.arange(nb) + 0.5) * STRIP * 5.0 - S0_5 * 5.0
XX, YY = np.meshgrid(cen, -cen)
inside_blk = np.hypot(XX, YY) <= R875
for i in range(nb):
    strip = np.asarray(ldec[i * STRIP:(i + 1) * STRIP, :]) > 0
    b = strip.reshape(STRIP, nb, STRIP)
    frac480[i] = b.mean(axis=(0, 2))
    for res, k in factors.items():
        bb = strip.reshape(STRIP // k, k, N5 // k, k).any(axis=(1, 3))
        # mascara de dentro do circulo 87,5S para essa resolucao
        rows = (np.arange(i * STRIP, (i + 1) * STRIP, k) + k / 2.0)
        cols = (np.arange(0, N5, k) + k / 2.0)
        yv = (S0_5 - rows) * 5.0; xv = (cols - S0_5) * 5.0
        m = np.hypot(xv[None, :], yv[:, None]) <= R875
        meas[res] += int(bb[m].sum()); tot[res] += int(m.sum())

cob = {res: 100.0 * meas[res] / tot[res] for res in factors}
with open(os.path.join(TAB, "cobertura_multiescala.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["resolucao_m", "celulas_com_medicao_pct", "celulas_interpoladas_pct"])
    for res in factors:
        w.writerow([res, f"{cob[res]:.2f}", f"{100 - cob[res]:.2f}"])
print("Cobertura multiescala (cap 87,5S):", {k: round(v, 2) for k, v in cob.items()})

# ------------------------------------------------------------------ figuras
REG_COL = {}
regs = sorted(set(s["regiao"] for s in sites))
cmap = plt.get_cmap("tab20")
for i, rg in enumerate(regs):
    REG_COL[rg] = cmap(i % 20)

# Fig 1: mapa de resolucoes (estilo mapa tematico)
bg = np.memmap(os.path.join(AC, "03_PGDA_69_Iluminacao", "AVGVISIB_75S_120M_201608.IMG"), dtype="<i2", mode="r", shape=(7624, 7624))
st = 8
bgs = np.asarray(bg[::st, ::st]).astype(np.float32) * 0.00004
half = 7624 / 2 * 120 / 1000
fig, ax = plt.subplots(figsize=(11, 11))
ax.imshow(bgs, cmap="gray", extent=[-half, half, -half, half], origin="upper", vmin=0, vmax=0.8)
zones = [(-80.0, "#ffd166", "20 m GDR (80°S–90°S, não baixado)"),
         (-82.9, "#06d6a0", "60 m PGDA 69 / 60 m GDR (82,9°S–90°S)"),
         (-85.0, "#118ab2", "10 m GDR (85°S–90°S, não baixado)"),
         (-87.5, "#ef476f", "5 m / 20 m GDR locais (87,5°S–90°S)")]
for lat, col, lab in zones:
    ax.add_patch(Circle((0, 0), lat2r(lat) / 1000, fill=True, alpha=0.13, color=col, label=lab))
    ax.add_patch(Circle((0, 0), lat2r(lat) / 1000, fill=False, lw=1.6, color=col))
for nm, t in tiles.items():
    ax.add_patch(Rectangle((t["X0"] / 1000, t["Y1"] / 1000), (t["X1"] - t["X0"]) / 1000, (t["Y0"] - t["Y1"]) / 1000,
                           fill=True, alpha=0.45, color="#7b2cbf", lw=1.2))
    ax.text((t["X0"] + t["X1"]) / 2000, t["Y0"] / 1000 + 1.5, nm, fontsize=6.5, color="#e0aaff", ha="center")
ax.add_patch(Rectangle((0, 0), 0, 0, color="#7b2cbf", alpha=0.6, label="5 m PGDA 78 (27 recortes ajustados)"))
for s in sites:
    ax.plot(s["x"] / 1000, s["y"] / 1000, "o", ms=3.2, color=REG_COL[s["regiao"]], mec="k", mew=0.3)
    ax.text(s["x"] / 1000 + 1.2, s["y"] / 1000 + 1.2, str(s["n"]), fontsize=4.8, color="white")
lim = lat2r(-82.6) / 1000
ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim)
ax.set_xlabel("x estereográfico polar (km)"); ax.set_ylabel("y estereográfico polar (km)")
ax.set_title("Resoluções LOLA disponíveis no Polo Sul e os 130 sítios (Nº 1 = mais ao norte)\nfundo: iluminação média PGDA 69 a 120 m")
ax.legend(loc="lower left", fontsize=8, framealpha=0.85)
fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_mapa_resolucoes_polo.png"), dpi=180); plt.close(fig)

# Fig 2: mosaico de pixels medidos x interpolados (5 m) no cap 87,5S
half5 = N5 / 2 * 5 / 1000
fr = np.where(inside_blk, frac480 * 100, np.nan)
fig, ax = plt.subplots(figsize=(10, 9))
im = ax.imshow(fr, cmap="RdYlGn", vmin=0, vmax=40, extent=[-half5, half5, -half5, half5], origin="upper")
cb = fig.colorbar(im, ax=ax, shrink=0.8); cb.set_label("% de pixels de 5 m com tiro real do LOLA (bloco de 480 m)")
for s in sites:
    if s["in875"]:
        ax.plot(s["x"] / 1000, s["y"] / 1000, "o", ms=3.5, color="k", mfc="white", mew=0.6)
        ax.text(s["x"] / 1000 + 0.8, s["y"] / 1000 + 0.8, str(s["n"]), fontsize=6)
ax.set_title(f"LDEC_875S_5M: onde o mapa de 5 m é medido vs. interpolado\n"
             f"medidos {cob[5]:.1f}% | interpolados {100 - cob[5]:.1f}% (dentro de 87,5°S)")
ax.set_xlabel("x (km)"); ax.set_ylabel("y (km)")
fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_mosaico_ldec_5m.png"), dpi=180); plt.close(fig)

# Fig 3: zoom 2x2 km no sitio 001 (5 m vs 20 m)
s001 = [s for s in sites if s["sitio"] == "001"][0]
c = int(round(S0_5 + s001["x"] / 5)); r = int(round(S0_5 - s001["y"] / 5))
w5 = np.asarray(ldec[r - 200:r + 200, c - 200:c + 200])
w20 = (w5 > 0).reshape(100, 4, 100, 4).any(axis=(1, 3))
fig, axs = plt.subplots(1, 2, figsize=(12, 6))
axs[0].imshow(np.where(w5 > 0, 1, 0), cmap="RdYlGn", vmin=0, vmax=1, extent=[-1, 1, -1, 1])
axs[0].set_title(f"Sítio 001 (Nº {s001['n']}) — grade 5 m\nverde = tiro real ({100 * (w5 > 0).mean():.1f}%) | vermelho = interpolado")
axs[1].imshow(np.where(w20, 1, 0), cmap="RdYlGn", vmin=0, vmax=1, extent=[-1, 1, -1, 1])
axs[1].set_title(f"Mesma área agregada a 20 m\ncélulas com ao menos 1 tiro: {100 * w20.mean():.1f}%")
for a in axs:
    a.add_patch(Circle((0, 0), 0.1, fill=False, color="blue", lw=1.5)); a.set_xlabel("km"); a.set_ylabel("km")
fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_zoom_001_5m_vs_20m.png"), dpi=180); plt.close(fig)

# Fig 4: cobertura por resolucao (grafico)
fig, ax = plt.subplots(figsize=(8, 4.8))
xs = list(factors); ys = [cob[k] for k in xs]
ax.bar([str(k) + " m" for k in xs], ys, color=["#ef476f", "#f78c6b", "#ffd166", "#06d6a0", "#118ab2"])
for i, v in enumerate(ys):
    ax.text(i, v + 1, f"{v:.1f}%", ha="center")
ax.set_ylim(0, 105); ax.set_ylabel("% de células com medição real LOLA")
ax.set_title("Quanto do mapa é medido (e não interpolado) em cada resolução — cap 87,5°S–90°S")
fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_cobertura_por_resolucao.png"), dpi=180); plt.close(fig)

# Fig 5: linha do tempo (espacamento em multiplos niveis sem sobreposicao)
ev = [
    (2009.46, 2008.15,  1.25, "left",   "jun/2009: Lançamento da LRO\nLOLA inicia em 13/07/2009"),
    (2011.69, 2008.70, -1.25, "left",   "set/2011: Lançamento da missão GRAIL"),
    (2012.96, 2012.40,  2.40, "center", "dez/2012: Fim da GRAIL\n(campo de gravidade lunar)"),
    (2013.70, 2013.60, -2.40, "center", "set/2013: Fim dos traços LOLA\nsobre o Polo Sul lunar"),
    (2016.62, 2016.20,  1.10, "center", "ago/2016: PGDA 69\nIluminação 60 / 120 / 240 m"),
    (2017.45, 2017.55, -1.15, "center", "jun/2017: LDEM_875S_5M\nGrade contínua 5 m (~92,7% interp.)"),
    (2021.00, 2019.60,  2.45, "center", "2021 (Barker): PGDA 78\n27 recortes 5 m pós-GRAIL"),
    (2022.60, 2020.00, -2.45, "center", "ago/2022: KPLO/Danuri (ShadowCam)\ne 13 regiões Artemis III originais"),
    (2022.88, 2022.40,  1.15, "center", "nov/2022: Artemis I\n(sobrevoo sem tripulação)"),
    (2023.50, 2023.80, -1.15, "center", "2023 (Barker): PGDA 90\nDEM base 20 m ajustado"),
    (2024.83, 2024.50,  2.45, "center", "out/2024: NASA atualiza\npara 9 regiões Artemis III"),
    (2026.10, 2025.95, -2.45, "center", "2026 (Wueller): Catálogo\n130 sítios a 60 m/px"),
    (2026.26, 2026.70,  1.15, "center", "abr/2026: Artemis II\n(sobrevoo lunar tripulado)"),
    (2027.50, 2028.05, -1.15, "center", "2027 (plan.): Artemis III\nteste HLS em órbita terrestre"),
    (2028.25, 2028.80,  2.45, "center", "2028 (plan.): Artemis IV\n1º pouso tripulado no Polo Sul"),
]
fig, ax = plt.subplots(figsize=(16, 7.6))
ax.axhline(0, color="#1e293b", lw=1.2)
ax.axvspan(2009.53, 2013.70, color="#ffd166", alpha=0.35, label="Janela ativa de traços LOLA sobre o Polo Sul (2009–2013)")
for t, xt, yt, ha, lab in ev:
    ax.plot(t, 0, "o", ms=6, color="#0284c7", zorder=5)
    ax.annotate(
        lab, xy=(t, 0), xytext=(xt, yt), ha=ha,
        va="bottom" if yt > 0 else "top", fontsize=8.0,
        bbox=dict(boxstyle="round,pad=0.32", fc="white", ec="#94a3b8", lw=0.8),
        arrowprops=dict(arrowstyle="-", color="#64748b", lw=0.9, shrinkA=0, shrinkB=4),
        zorder=4,
    )
ax.set_ylim(-3.45, 3.45); ax.set_yticks([]); ax.set_xlim(2007.8, 2031.2)
ax.set_xlabel("Ano")
ax.set_title("Linha do tempo: dados LOLA/LRO, GRAIL, LROC/ShadowCam e missões Artemis (2009–2028)")
ax.legend(loc="upper left", framealpha=0.95)
fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_linha_do_tempo.png"), dpi=180); plt.close(fig)

# Fig 6: detalhamento 5 m / 10 m / 20 m pelas 16 regioes Artemis
from collections import Counter
REG_INFO = {
    "PCB":  ("Peak Near Cabeus B", True),
    "SP":   ("Slater Plain", True),
    "MMP":  ("Mons Mouton Plateau", True),
    "MMO":  ("Mons Mouton", True),
    "MMA":  ("Malapert Massif", True),
    "HW":   ("Haworth", True),
    "NR1":  ("Nobile Rim 1", True),
    "NR2":  ("Nobile Rim 2", True),
    "dGR2": ("de Gerlache Rim 2", True),
    "AR":   ("Amundsen Rim", False),
    "CRE":  ("Connecting Ridge Ext.", False),
    "CR":   ("Connecting Ridge", False),
    "dGKM": ("de Gerlache–Kocher Massif", False),
    "dGR1": ("de Gerlache Rim 1", False),
    "FRA":  ("Faustini Rim A", False),
    "PNS":  ("Peak Near Shackleton", False),
}
order_regs = ["PCB", "SP", "MMP", "MMA", "HW", "MMO", "NR1", "NR2", "dGR2", "dGR1", "dGKM", "FRA", "PNS", "CR", "CRE", "AR"]
by_reg = {r: Counter(s["best"] for s in sites if s["regiao"] == r) for r in order_regs}
y_pos = np.arange(len(order_regs))[::-1]
v5  = np.array([by_reg[r]["5 m (PGDA 78 ajustado)"] for r in order_regs])
v10 = np.array([by_reg[r]["10 m (GDR 85S)*"] for r in order_regs])
v20 = np.array([by_reg[r]["20 m (GDR 80S)*"] for r in order_regs])
fig, ax = plt.subplots(figsize=(11.5, 7.2))
ax.barh(y_pos, v5,  color="#7b2cbf", height=0.68, label="5 m — PGDA 78 ajustado (104 sítios)")
ax.barh(y_pos, v10, left=v5, color="#118ab2", height=0.68, label="10 m — GDR 85°S–90°S* (12 sítios)")
ax.barh(y_pos, v20, left=v5 + v10, color="#ffd166", height=0.68, label="20 m — GDR 80°S–90°S* (14 sítios)")
ax.axhline(6.5, color="#dc2626", ls="--", lw=1.2)
ax.text(11.3, 6.75, "9 regiões atuais NASA (out/2024)", color="#dc2626", fontsize=8.5, ha="right", va="bottom", fontweight="bold")
ax.text(11.3, 6.20, "7 regiões adicionais do catálogo 2022/2026", color="#475569", fontsize=8.2, ha="right", va="top")
ylabels = [f"{r} — {REG_INFO[r][0]}" + (" ★" if REG_INFO[r][1] else "") for r in order_regs]
ax.set_yticks(y_pos); ax.set_yticklabels(ylabels, fontsize=9)
for idx, r in enumerate(order_regs):
    yy = y_pos[idx]
    tot_r = v5[idx] + v10[idx] + v20[idx]
    if v5[idx] > 0:
        ax.text(v5[idx] / 2, yy, str(v5[idx]), va="center", ha="center", color="white", fontsize=8.5, fontweight="bold")
    if v10[idx] > 0:
        ax.text(v5[idx] + v10[idx] / 2, yy, str(v10[idx]), va="center", ha="center", color="white", fontsize=8.5, fontweight="bold")
    if v20[idx] > 0:
        ax.text(v5[idx] + v10[idx] + v20[idx] / 2, yy, str(v20[idx]), va="center", ha="center", color="#1e293b", fontsize=8.5, fontweight="bold")
    ax.text(tot_r + 0.18, yy, f"total {tot_r}", va="center", ha="left", color="#334155", fontsize=8)
ax.set_xlim(0, 12.6); ax.set_xlabel("Número de sítios candidatos do catálogo Wueller et al. (2026)")
ax.set_title("Cobertura da melhor grade LOLA por região Artemis (130 sítios; ★ = 9 regiões atuais NASA out/2024)\n"
             "Todos os 26 sítios sem recorte 5 m PGDA 78 pertencem a PCB, SP e MMP")
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.10), ncol=3, framealpha=0.95, fontsize=8.5)
fig.tight_layout(); fig.savefig(os.path.join(FIG, "fig_resolucao_por_regiao_artemis.png"), dpi=180, bbox_inches="tight"); plt.close(fig)

# ------------------------------------------------------------------ tabelas
def fmt(v, nd=1):
    return "—" if v == "" else f"{v:.{nd}f}".replace(".", ",")

cols = ["n", "regiao", "sitio", "lat", "lon", "best", "fonte5", "ldec5", "S_mu", "S_sd", "P8", "eps", "dias_sol_2026", "dias_sol_terra_2026"]
with open(os.path.join(TAB, "sitios_numerados.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(cols)
    for s in sites:
        w.writerow([s[k] if not isinstance(s[k], float) else round(s[k], 4) for k in cols])

lines = ["| Nº | Região | Sítio | Lat (°) | Lon (°) | Melhor grade LOLA | Fonte 5 m | Pixels medidos 5 m (%) | $\\bar S$ (°) | $\\sigma_S$ (°) | $P(S\\le 8^\\circ)$ (%) | $\\bar\\varepsilon$ (m) | Dias Sol 2026 |",
         "|---:|---|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|"]
for s in sites:
    lines.append(f"| {s['n']} | {s['regiao']} | {s['sitio']} | {fmt(s['lat'], 4)} | {fmt(s['lon'], 4)} | {s['best']} | {s['fonte5'] or '—'} | "
                 f"{fmt(s['ldec5'])} | {fmt(s['S_mu'])} | {fmt(s['S_sd'])} | {fmt(s['P8'])} | {fmt(s['eps'], 2)} | {s['dias_sol_2026']} |")
with open(os.path.join(TAB, "sitios_numerados.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

# resumo de contagens
from collections import Counter
cnt = Counter(s["best"] for s in sites)
n_tile = sum(1 for s in sites if s["tile"])
tiles_with = Counter(s["tile"] for s in sites if s["tile"])
summary = {"cobertura": cob, "best": dict(cnt), "n_tile": n_tile, "tiles_with": dict(tiles_with),
           "n875": sum(1 for s in sites if s["in875"]), "n85": sum(1 for s in sites if s["lat"] <= -85),
           "north": (sites[0]["sitio"], sites[0]["lat"]), "south": (sites[-1]["sitio"], sites[-1]["lat"])}
import json
with open(os.path.join(TAB, "resumo.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False, default=str)
print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
