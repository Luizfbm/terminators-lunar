"""Figura de sintese: panorama 360 do horizonte + trilhas do Sol e da Terra.

Saida: precalc/fig_panorama.png  e  precalc/fig_timeline.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import engine as E

LAT, LON = -89.30, 128.5   # melhor sitio de iluminacao encontrado
OUT = r"C:\NASA PROJETO 2026\precalc"

dem = E.load_dem()
_, sun, earth = E.load_ephem()
az, hor, h0 = E.horizon(dem, LAT, LON, 2.0, az_step=0.5)
sel, saz = E.el_az(LAT, LON, sun)
eel, eaz = E.el_az(LAT, LON, earth)

# ---------- figura 1: panorama ----------
fig, ax = plt.subplots(figsize=(13, 6.2), dpi=150)
ax.fill_between(az, -12, hor, color="#2b2b2b", zorder=2, label="terreno (máscara de horizonte)")
ax.plot(az, hor, color="#000000", lw=0.8, zorder=3)
ax.axhline(0, color="#666", lw=0.6, ls="--", zorder=1)

# envelope do Sol: para cada azimute, elevação min/max observada
bins = np.arange(0, 361, 1.0)
idx = np.digitize(saz, bins) - 1
sun_hi = np.full(360, np.nan)
sun_lo = np.full(360, np.nan)
for k in range(360):
    m = idx == k
    if m.any():
        sun_hi[k] = sel[m].max()
        sun_lo[k] = sel[m].min()
ax.fill_between(bins[:-1] + 0.5, sun_lo, sun_hi, color="#f5b301", alpha=0.55,
                zorder=4, label="faixa de elevação do Sol (2026–2045)")
ax.plot(saz[:2000], sel[:2000], color="#c98a00", lw=0.7, zorder=5, label="caminho do Sol (amostra de ~7 meses)")

# Terra: faixa
idx_e = np.digitize(eaz, bins) - 1
e_hi = np.full(360, np.nan); e_lo = np.full(360, np.nan)
for k in range(360):
    m = idx_e == k
    if m.any():
        e_hi[k] = eel[m].max(); e_lo[k] = eel[m].min()
ax.fill_between(bins[:-1] + 0.5, e_lo, e_hi, color="#2f6fd0", alpha=0.45,
                zorder=4, label="faixa de elevação da Terra (libração)")

ax.set_xlim(0, 360); ax.set_ylim(-12, 12)
ax.set_xticks(np.arange(0, 361, 45))
ax.set_xlabel("azimute (graus, norte = 0, leste = 90)")
ax.set_ylabel("elevação acima do horizonte local (graus)")
ax.set_title(f"Panorama do polo sul lunar — sítio {LAT:.2f}°S, {LON:.1f}°E  "
             f"(solo {h0:.0f} m, observador +2 m)\n"
             f"iluminação 75,9% (limbo) · DTE 53,8% · Sol nunca passa de "
             f"{sel.max():+.1f}°, Terra oscila entre {eel.min():+.1f}° e {eel.max():+.1f}°",
             fontsize=11)
ax.legend(loc="lower left", fontsize=8, framealpha=0.9)
ax.grid(alpha=0.25, zorder=0)
fig.text(0.99, 0.01, "dados: LOLA LDEM_875S_20M (20 m/px) + SPICE DE440/MOON_ME",
         ha="right", fontsize=7, color="#666")
fig.tight_layout()
fig.savefig(rf"{OUT}\fig_panorama.png")
print("panorama ok")

# ---------- figura 2: timeline ----------
lit = sel > np.interp(saz, az, hor, period=360.0)
dte = eel > np.interp(eaz, az, hor, period=360.0)
et = np.load(rf"{OUT}\ephem_et.npy")
days = (et - et[0]) / 86400.0

fig, ax = plt.subplots(figsize=(13, 4.2), dpi=150)
# 1 ano para leitura
n = int(365 * 24 / 3)
ax.fill_between(days[:n], 0, lit[:n].astype(float), step="mid",
                color="#f5b301", alpha=0.8, label="iluminado")
ax.fill_between(days[:n], 0, -dte[:n].astype(float), step="mid",
                color="#2f6fd0", alpha=0.8, label="Terra visível (DTE)")
ax.set_xlim(0, days[n - 1]); ax.set_ylim(-1.6, 1.6)
ax.set_yticks([-1, 0, 1]); ax.set_yticklabels(["DTE", "", "iluminado"])
ax.set_xlabel("dias desde 2026-01-01 (primeiro ano)")
ax.set_title("Janelas de energia e de comunicação — 2026 (passo de 3 h)", fontsize=11)
ax.legend(loc="upper right", fontsize=8, ncol=2)
ax.grid(axis="x", alpha=0.2)
fig.tight_layout()
fig.savefig(rf"{OUT}\fig_timeline.png")
print("timeline ok")
