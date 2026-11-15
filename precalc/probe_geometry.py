"""Sonda geometrica: elevacao aparente do Sol e da Terra no polo sul lunar.
Sem horizonte topografico - apenas geometria (libracao + obliquidade).
Objetivo: medir a faixa real de elevacao da Terra para decidir o piso de DTE.
"""
import numpy as np
import spiceypy as sp

K = r"C:\NASA PROJETO 2026\dados\kernels"
for f in ("naif0012.tls", "pck00011.tpc", "moon_de440_250416.tf",
          "moon_assoc_me.tf", "moon_pa_de440_200625.bpc", "de440s.bsp"):
    sp.furnsh(rf"{K}\{f}")

# escolhe o melhor frame lunar disponivel (namfrm devolve 0 quando nao existe,
# nao levanta excecao - por isso a checagem numerica)
frame = None
for cand in ("MOON_ME", "MOON_PA_DE440", "MOON_PA", "IAU_MOON"):
    if sp.namfrm(cand) != 0:
        try:
            sp.spkpos("SUN", sp.str2et("2026-01-01T00:00:00"), cand, "NONE", "MOON")
            frame = cand
            break
        except Exception:
            continue
if frame is None:
    raise SystemExit("nenhum frame lunar utilizavel")
print("frame lunar:", frame)

# ATENCAO: SPICE trabalha em KM. R em km; alt e convertida de metros.
R = 1737.4


def local_basis(lat_deg, lon_deg, alt_m=0.0):
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    r = R + alt_m / 1000.0
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.cross(up, east)
    return up * r, up, east, north


def angles(et, site_pos, up, east, north, target):
    p, _ = sp.spkpos(target, et, frame, "NONE", "MOON")
    v = np.array(p) - site_pos
    v = v / np.linalg.norm(v)
    el = np.degrees(np.arcsin(np.dot(v, up)))
    az = np.degrees(np.arctan2(np.dot(v, east), np.dot(v, north))) % 360.0
    return el, az


def probe(lat, lon, alt, t0="2026-01-01T00:00:00", t1="2045-01-01T00:00:00", step_h=3.0, label=""):
    et0, et1 = sp.str2et(t0), sp.str2et(t1)
    ets = np.arange(et0, et1, step_h * 3600.0)
    site, up, east, north = local_basis(lat, lon, alt)
    sun_el = np.empty(len(ets)); earth_el = np.empty(len(ets)); earth_az = np.empty(len(ets))
    for i, et in enumerate(ets):
        sun_el[i], _ = angles(et, site, up, east, north, "SUN")
        earth_el[i], earth_az[i] = angles(et, site, up, east, north, "EARTH")

    # direcao media da Terra por soma vetorial (o azimute no polo e instavel)
    ra, dec = np.radians(earth_az), np.radians(earth_el)
    vx = np.mean(np.cos(dec) * np.sin(ra)); vy = np.mean(np.cos(dec) * np.cos(ra))
    az_mean = np.degrees(np.arctan2(vx, vy)) % 360.0

    print(f"\n=== {label}  lat {lat} lon {lon} alt {alt:.0f} m  ({len(ets)} amostras, passo {step_h:g} h)")
    print(f"  Sol   : elevacao min {sun_el.min():+.2f}  max {sun_el.max():+.2f}  (amplitude {sun_el.max()-sun_el.min():.2f})")
    print(f"  Terra : elevacao min {earth_el.min():+.2f}  max {earth_el.max():+.2f}  (amplitude {earth_el.max()-earth_el.min():.2f})")
    print(f"  Terra : azimute medio {az_mean:.2f}  faixa {earth_az.min():.1f} - {earth_az.max():.1f}")
    for thr in (0, 1, 2, 3, 5, 7):
        frac = 100.0 * np.mean(earth_el >= thr)
        print(f"    fracao do tempo com Terra acima de {thr} graus: {frac:5.1f}%")
    # pior apagao geometrico de DTE
    below = earth_el < 0
    worst, cur = 0, 0
    for b in below:
        cur = cur + 1 if b else 0
        worst = max(worst, cur)
    print(f"  pior intervalo continuo com Terra abaixo de 0 graus: {worst*step_h:.0f} h")
    return sun_el, earth_el


probe(-89.9, 0.0, 0.0, label="Shackleton rim (geometrico)")
probe(-85.9, 2.7, 5000.0, label="Malapert (geometrico)")

sp.kclear()
