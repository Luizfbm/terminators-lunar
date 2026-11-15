"""Gera comparativo multiescala (5 m a 120 m) do mosaico de cobertura real LOLA (LDEC_875S_5M)."""
import csv
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = r"C:\NASA PROJETO 2026"
LDEC_PATH = os.path.join(ROOT, "dados", "acervo_tese", "01_LDEM_5M_MIT", "LDEC_875S_5M.IMG")
SITES_CSV = os.path.join(ROOT, "sites", "artemis_sitios_wueller2026.csv")
OUT_PNG = os.path.join(ROOT, "docs", "figuras_tese", "fig_mosaico_multiescala_ldec.png")

R_LUA = 1737400.0
N5 = 30336
S0_5 = 15167.5
STRIP = 96  # 480 m por bloco; divisivel por 1, 2, 4, 8, 12, 24, 48
FACTORS = {5: 1, 10: 2, 20: 4, 40: 8, 60: 12, 120: 24}
NOTES = {
    5: "LDEM_875S_5M / PGDA 78",
    10: "GDR 85°S",
    20: "PGDA 90 base contínua",
    40: "transição contínua LOLA",
    60: "Wueller 2026 / PGDA 69",
    120: "PGDA 69; 240 m ≈ 100%",
}


def ll2xy(lat, lon):
    d = np.radians(90.0 + np.asarray(lat, float))
    r = 2.0 * R_LUA * np.tan(d / 2.0)
    lo = np.radians(np.asarray(lon, float))
    return r * np.sin(lo), r * np.cos(lo)


R875 = 2.0 * R_LUA * np.tan(np.radians(2.5) / 2.0)

sites_in = []
with open(SITES_CSV, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        lat = float(row["lat"])
        if lat <= -87.5:
            x, y = ll2xy(lat, float(row["lon"]))
            sites_in.append((x / 1000.0, y / 1000.0))

ldec = np.memmap(LDEC_PATH, dtype="u1", mode="r", shape=(N5, N5))
nb = N5 // STRIP  # 316 blocos de 480 m
cen = (np.arange(nb) + 0.5) * STRIP * 5.0 - S0_5 * 5.0
XX, YY = np.meshgrid(cen, -cen)
inside_blk = np.hypot(XX, YY) <= R875

maps = {res: np.zeros((nb, nb), np.float32) for res in FACTORS}
meas = {res: 0 for res in FACTORS}
tot = {res: 0 for res in FACTORS}

for i in range(nb):
    strip = np.asarray(ldec[i * STRIP:(i + 1) * STRIP, :]) > 0
    for res, k in FACTORS.items():
        # Mapa em blocos de 480 m (% de celulas de tamanho res x res com >= 1 tiro)
        sb = STRIP // k
        sub = strip.reshape(sb, k, nb, sb, k).any(axis=(1, 4))
        maps[res][i] = sub.mean(axis=(0, 2)) * 100.0

        # Contagem circular exata dentro de 87.5S-90S
        bb = strip.reshape(sb, k, N5 // k, k).any(axis=(1, 3))
        rows = np.arange(i * STRIP, (i + 1) * STRIP, k) + k / 2.0
        cols = np.arange(0, N5, k) + k / 2.0
        yv = (S0_5 - rows) * 5.0
        xv = (cols - S0_5) * 5.0
        m = np.hypot(xv[None, :], yv[:, None]) <= R875
        meas[res] += int(bb[m].sum())
        tot[res] += int(m.sum())

cob = {res: 100.0 * meas[res] / tot[res] for res in FACTORS}
print("Cobertura medida (%):", {r: round(v, 3) for r, v in cob.items()})

half5 = N5 * 5.0 / 2.0 / 1000.0
fig, axes = plt.subplots(2, 3, figsize=(15.8, 11.4), sharex=True, sharey=True)
fig.set_constrained_layout(True)
fig.set_constrained_layout_pads(w_pad=0.06, h_pad=0.12, hspace=0.08, wspace=0.04)

sx = [p[0] for p in sites_in]
sy = [p[1] for p in sites_in]

im = None
for ax, res in zip(axes.flat, FACTORS):
    fr = np.where(inside_blk, maps[res], np.nan)
    im = ax.imshow(fr, cmap="RdYlGn", vmin=0.0, vmax=100.0, extent=[-half5, half5, -half5, half5], origin="upper")
    ax.plot(sx, sy, "o", ms=3.0, mfc="white", mec="black", mew=0.6)
    med = cob[res]
    interp = 100.0 - med
    fmt_med = f"{med:.3f}" if res == 120 else f"{med:.1f}"
    fmt_int = f"{interp:.3f}" if res == 120 else f"{interp:.1f}"
    ax.set_title(
        f"Grade {res} m/px ({NOTES[res]})\nmedidos: {fmt_med}%  |  interpolados: {fmt_int}%",
        fontsize=10.2,
        fontweight="bold",
        pad=7,
    )
    ax.set_aspect("equal")

for ax in axes[1, :]:
    ax.set_xlabel("x estereográfico polar (km)", fontsize=9.8, labelpad=6)
for ax in axes[:, 0]:
    ax.set_ylabel("y estereográfico polar (km)", fontsize=9.8, labelpad=6)

cb = fig.colorbar(im, ax=axes, shrink=0.88, pad=0.02, aspect=35)
cb.set_label("% de células da grade com ≥ 1 tiro real LOLA (escala única 0% a 100%; blocos de 480 m)\n"
             "0% = totalmente interpolado  |  100% = cobertura direta completa", fontsize=10)

fig.suptitle(
    "LDEC_875S_5M agregado na mesma escala de cores (0% → 100%): medido pelo laser LOLA vs. interpolado matematicamente\n"
    "Calota polar 87,5°S–90°S com os 42 sítios Artemis internos marcados em branco",
    fontsize=13,
    fontweight="bold",
    y=1.02,
)
fig.savefig(OUT_PNG, dpi=180, bbox_inches="tight", pad_inches=0.25)
plt.close(fig)
print("Salvo em:", OUT_PNG)
