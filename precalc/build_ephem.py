"""Pre-calcula vetores do Sol e da Terra no frame MOON_ME (uma vez).

Saida: precalc/ephem_sun.npy, ephem_earth.npy, ephem_et.npy
Depois disso, qualquer sitio e avaliado sem SPICE (so algebra vetorial).
"""
import numpy as np
import spiceypy as sp

K = r"C:\NASA PROJETO 2026\dados\kernels"
OUT = r"C:\NASA PROJETO 2026\precalc"
T0, T1 = "2026-01-01T00:00:00", "2045-01-01T00:00:00"
STEP_H = 3.0

for f in ("naif0012.tls", "pck00011.tpc", "moon_de440_250416.tf",
          "moon_assoc_me.tf", "moon_pa_de440_200625.bpc", "de440s.bsp"):
    sp.furnsh(rf"{K}\{f}")

ets = np.arange(sp.str2et(T0), sp.str2et(T1), STEP_H * 3600.0)
sun = np.empty((ets.size, 3))
earth = np.empty((ets.size, 3))
for i, et in enumerate(ets):
    p, _ = sp.spkpos("SUN", et, "MOON_ME", "NONE", "MOON");   sun[i] = p
    p, _ = sp.spkpos("EARTH", et, "MOON_ME", "NONE", "MOON"); earth[i] = p

np.save(rf"{OUT}\ephem_et.npy", ets)
np.save(rf"{OUT}\ephem_sun.npy", sun)
np.save(rf"{OUT}\ephem_earth.npy", earth)
print("amostras:", ets.size, "| passo", STEP_H, "h |", T0[:10], "a", T1[:10])
print("Sun  |r| km:", round(float(np.linalg.norm(sun[0]))))
print("Earth|r| km:", round(float(np.linalg.norm(earth[0]))))
sp.kclear()
