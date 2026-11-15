"""Varredura do polo sul: onde estao os melhores sitios de iluminacao?

Usa o DEM polar e as efemerides pre-calculadas. Varredura grossa, depois refino.
"""
import numpy as np
import engine as E

dem = E.load_dem()
eph = E.load_ephem()

COARSE_LAT = np.arange(-90.0, -87.5, 0.05)
COARSE_LON = np.arange(0.0, 360.0, 2.0)

rows = []
for lat in COARSE_LAT:
    for lon in COARSE_LON:
        r = E.evaluate(dem, float(lat), float(lon), 2.0, az_step=4.0, ephem=eph)
        rows.append((r["illum"], float(lat), float(lon), r["h0"], r["hor_mean"], r["dte"]))

rows.sort(reverse=True)
print(f"varredura grossa: {len(rows)} pontos")
print(" top 15 por iluminacao:")
print("   ilum%   lat      lon      h0(m)  hor_meio  DTE%")
for illum, lat, lon, h0, hmean, dte in rows[:15]:
    print(f"  {illum:6.2f}  {lat:7.2f}  {lon:7.2f}  {h0:6.0f}  {hmean:+6.2f}  {dte:5.1f}")

print("\n top 5 por DTE (entre os 300 melhores em iluminacao):")
best = sorted(rows[:300], key=lambda t: -t[5])[:5]
for illum, lat, lon, h0, hmean, dte in best:
    print(f"  ilum {illum:6.2f}  DTE {dte:5.1f}  lat {lat:7.2f} lon {lon:7.2f}  h0 {h0:6.0f}")

np.save(r"C:\NASA PROJETO 2026\precalc\scan_coarse.npy", np.array(rows, dtype=float))
print("\nsalvo em precalc/scan_coarse.npy")
