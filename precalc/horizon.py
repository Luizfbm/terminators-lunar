"""Mascara de horizonte + iluminacao, a partir do DEM polar LOLA.

Reproduz o metodo de Mazarico et al. (2011) / Glaser et al. (2018):
  horizonte(azimute) = max sobre o terreno de atan2(dz, distancia)
  visivel(t)         = elevacao_sol(t) > horizonte(azimute_sol(t))

Uso:
  python horizon.py --lat -89.4 --lon 222 --alt 2 --label "Connecting Ridge"
"""
import argparse
import numpy as np
import spiceypy as sp

DEM_PATH = r"C:\NASA PROJETO 2026\dados\dem\LDEM_875S_20M.IMG"
K = r"C:\NASA PROJETO 2026\dados\kernels"

# --- metadados lidos do LBL (PDS) ---
LINES = SAMPLES = 7584
SCALE_M = 20.0          # MAP_SCALE
L0 = S0 = 3791.5        # LINE/SAMPLE_PROJECTION_OFFSET
R_M = 1737400.0         # A_AXIS_RADIUS em metros
RAD_DEG = 0.5           # height = DN * 0.5  (metros)


def load_dem(path=DEM_PATH):
    dn = np.fromfile(path, dtype="<i2").reshape(LINES, SAMPLES)
    return dn.astype(np.float32) * RAD_DEG


def latlon_to_pix(lat, lon):
    """lat/lon (graus) -> (row, col) float na projecao estereografica polar."""
    delta = np.radians(90.0 + np.asarray(lat, dtype=np.float64))   # colatitude
    r = 2.0 * R_M * np.tan(delta / 2.0)
    lonr = np.radians(np.asarray(lon, dtype=np.float64))
    x = r * np.sin(lonr)
    y = r * np.cos(lonr)
    col = x / SCALE_M + S0
    row = L0 - y / SCALE_M
    return row, col


def sample_dem(dem, row, col):
    ri = np.clip(np.rint(row).astype(np.int32), 0, LINES - 1)
    ci = np.clip(np.rint(col).astype(np.int32), 0, SAMPLES - 1)
    return dem[ri, ci]


def build_horizon(dem, lat, lon, obs_m=2.0, az_step=0.5, d_step=100.0, d_max=75000.0):
    """Devolve (azimutes, horizonte_em_graus, altura_do_sitio)."""
    h0 = float(sample_dem(dem, *latlon_to_pix(lat, lon)))
    az = np.arange(0.0, 360.0, az_step)
    ds = np.arange(d_step, d_max + d_step, d_step)
    horizon = np.full(az.size, -90.0)

    # deslocamento local por metro (aprox. esferica)
    latr = np.radians(lat)
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * np.cos(latr)

    for i, a in enumerate(az):
        ar = np.radians(a)
        dlat = ds * np.cos(ar) / m_per_deg_lat
        dlon = ds * np.sin(ar) / max(m_per_deg_lon, 1e-6)
        la = lat + dlat
        lo = lon + dlon
        # descarta o que cai fora da cobertura do DEM (fora do circulo de 87.5S)
        inside = la >= -90.0
        r = np.hypot(*(np.array([0.0, 0.0])))
        delta = np.radians(90.0 + la)
        rp = 2.0 * R_M * np.tan(delta / 2.0)
        inside &= rp <= (L0 * SCALE_M)
        if not inside.any():
            continue
        la, lo, dd = la[inside], lo[inside], ds[inside]
        row, col = latlon_to_pix(la, lo)
        h = sample_dem(dem, row, col)
        ang = np.degrees(np.arctan2(h - (h0 + obs_m), dd))
        horizon[i] = ang.max()
    return az, horizon, h0


def load_kernels():
    for f in ("naif0012.tls", "pck00011.tpc", "moon_de440_250416.tf",
              "moon_assoc_me.tf", "moon_pa_de440_200625.bpc", "de440s.bsp"):
        sp.furnsh(rf"{K}\{f}")


def sun_angles(lat, lon, t0, t1, step_h=6.0):
    """Elevacao e azimute do Sol no referencial local ENU, no frame MOON_ME."""
    et0, et1 = sp.str2et(t0), sp.str2et(t1)
    ets = np.arange(et0, et1, step_h * 3600.0)
    latr, lonr = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(latr) * np.cos(lonr), np.cos(latr) * np.sin(lonr), np.sin(latr)])
    east = np.array([-np.sin(lonr), np.cos(lonr), 0.0])
    north = np.cross(up, east)
    site = up * R_M / 1000.0
    el = np.empty(ets.size)
    azim = np.empty(ets.size)
    for i, et in enumerate(ets):
        p, _ = sp.spkpos("SUN", et, "MOON_ME", "NONE", "MOON")
        v = np.array(p) - site
        v /= np.linalg.norm(v)
        el[i] = np.degrees(np.arcsin(np.dot(v, up)))
        azim[i] = np.degrees(np.arctan2(np.dot(v, east), np.dot(v, north))) % 360.0
    return el, azim


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--alt", type=float, default=2.0)
    ap.add_argument("--label", default="sitio")
    ap.add_argument("--t0", default="2017-01-01T00:00:00")
    ap.add_argument("--t1", default="2037-01-01T00:00:00")
    ap.add_argument("--step", type=float, default=6.0)
    ap.add_argument("--az", type=float, default=0.5)
    args = ap.parse_args()

    print(f"DEM: {DEM_PATH}")
    dem = load_dem()
    print(f"  {dem.shape} px | min {dem.min():.0f} m | max {dem.max():.0f} m")

    az, hor, h0 = build_horizon(dem, args.lat, args.lon, args.alt, az_step=args.az)
    print(f"\n=== {args.label}  lat {args.lat} lon {args.lon} | altura do solo {h0:.0f} m | observador +{args.alt:.0f} m")
    print(f"  horizonte: min {hor.min():+.2f}  max {hor.max():+.2f}  medio {hor.mean():+.2f} graus")
    worst = np.argsort(hor)[-5:][::-1]
    print("  azimutes mais bloqueados:", [(round(float(az[i]), 1), round(float(hor[i]), 2)) for i in worst])

    load_kernels()
    el, saz = sun_angles(args.lat, args.lon, args.t0, args.t1, args.step)
    h_at = np.interp(saz, az, hor, period=360.0)
    lit = el > h_at
    print(f"\n  janela {args.t0[:10]} a {args.t1[:10]}, passo {args.step:g} h ({el.size} amostras)")
    print(f"  Sol: elevacao {el.min():+.2f} a {el.max():+.2f} graus")
    print(f"  ILUMINACAO MEDIA: {100*lit.mean():.2f}%")
    # pior apagao
    worst_run = cur = 0
    for b in ~lit:
        cur = cur + 1 if b else 0
        worst_run = max(worst_run, cur)
    print(f"  pior apagao continuo: {worst_run*args.step:.0f} h ({worst_run*args.step/24:.1f} dias)")
    print(f"  fracao iluminada por ano:")
    sp.kclear()


if __name__ == "__main__":
    main()
