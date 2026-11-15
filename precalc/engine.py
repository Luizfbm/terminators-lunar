"""Motor rapido: horizontes e iluminacao.

Depois de build_ephem.py, nao precisa mais de SPICE: a geometria e algebra vetorial.
"""
import numpy as np

DEM_PATH = r"C:\NASA PROJETO 2026\dados\dem\LDEM_875S_20M.IMG"
EPH = r"C:\NASA PROJETO 2026\precalc"

LINES = SAMPLES = 7584
SCALE_M = 20.0
L0 = S0 = 3791.5
R_M = 1737400.0
RAD_DEG = 0.5
DEM_EDGE_M = L0 * SCALE_M          # raio da cobertura (87.5 S)


def load_dem(path=DEM_PATH):
    return np.fromfile(path, dtype="<i2").reshape(LINES, SAMPLES).astype(np.float32) * RAD_DEG


def latlon_to_pix(lat, lon):
    delta = np.radians(90.0 + np.asarray(lat, dtype=np.float64))
    r = 2.0 * R_M * np.tan(delta / 2.0)
    lonr = np.radians(np.asarray(lon, dtype=np.float64))
    return L0 - r * np.cos(lonr) / SCALE_M, r * np.sin(lonr) / SCALE_M + S0


def sample_dem(dem, row, col):
    ri = np.clip(np.rint(row).astype(np.int32), 0, LINES - 1)
    ci = np.clip(np.rint(col).astype(np.int32), 0, SAMPLES - 1)
    return dem[ri, ci]


def sample_dem_bilinear(dem, row, col):
    """Amostragem bilinear no DEM; retorna (altura, mascara_valida)."""
    ny, nx = dem.shape
    r0 = np.floor(row).astype(np.int32)
    c0 = np.floor(col).astype(np.int32)
    inside = (r0 >= 0) & (c0 >= 0) & (r0 < ny - 1) & (c0 < nx - 1)
    r0c = np.clip(r0, 0, ny - 2)
    c0c = np.clip(c0, 0, nx - 2)
    fr = row - r0c
    fc = col - c0c
    h = ((dem[r0c, c0c] * (1.0 - fc) + dem[r0c, c0c + 1] * fc) * (1.0 - fr) +
         (dem[r0c + 1, c0c] * (1.0 - fc) + dem[r0c + 1, c0c + 1] * fc) * fr)
    return h, inside


def horizon(dem, lat, lon, obs_m=2.0, az_step=1.0, d_step=20.0, d_max=75000.0):
    """Perfil de horizonte 360 graus no plano estereografico polar com curvatura lunar."""
    delta = np.radians(90.0 + float(lat))
    r_site = 2.0 * R_M * np.tan(delta / 2.0)
    lam = np.radians(float(lon))
    sx = r_site * np.sin(lam)
    sy = r_site * np.cos(lam)

    row0 = L0 - sy / SCALE_M
    col0 = sx / SCALE_M + S0
    h0_arr, ok0 = sample_dem_bilinear(dem, np.array([row0]), np.array([col0]))
    h0 = float(h0_arr[0]) if ok0[0] else float(sample_dem(dem, row0, col0))

    az = np.arange(0.0, 360.0, az_step)
    ds = np.arange(d_step, d_max + d_step, d_step)

    ang_rad = lam + np.radians(az)[:, None]
    x = sx + np.sin(ang_rad) * ds[None, :]
    y = sy + np.cos(ang_rad) * ds[None, :]
    row = L0 - y / SCALE_M
    col = x / SCALE_M + S0

    h, inside = sample_dem_bilinear(dem, row, col)
    th = ds[None, :] / R_M
    t = ((R_M + h) * np.cos(th) - (R_M + h0 + obs_m)) / ((R_M + h) * np.sin(th))
    t = np.where(inside, t, -1e30)
    best = t.max(axis=1)
    hor = np.where(best < -1e29, -90.0, np.degrees(np.arctan(best)))
    return az, hor, h0


def load_ephem():
    return (np.load(rf"{EPH}\ephem_et.npy"),
            np.load(rf"{EPH}\ephem_sun.npy"),
            np.load(rf"{EPH}\ephem_earth.npy"))


def el_az(lat, lon, vec):
    """Elevacao e azimute de um vetor (N,3) visto de (lat,lon). Vetorizado."""
    latr, lonr = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(latr) * np.cos(lonr), np.cos(latr) * np.sin(lonr), np.sin(latr)])
    east = np.array([-np.sin(lonr), np.cos(lonr), 0.0])
    north = np.cross(up, east)
    # ephem esta em KM; R_M esta em METROS -> converter o sitio para km
    site = up * (R_M / 1000.0)
    v = vec - site
    v /= np.linalg.norm(v, axis=1)[:, None]
    el = np.degrees(np.arcsin(v @ up))
    az = np.degrees(np.arctan2(v @ east, v @ north)) % 360.0
    return el, az


def evaluate(dem, lat, lon, obs_m=2.0, az_step=1.0, step_h=3.0, ephem=None):
    _, sun, earth = ephem if ephem is not None else load_ephem()
    az, hor, h0 = horizon(dem, lat, lon, obs_m, az_step=az_step)
    sel, saz = el_az(lat, lon, sun)
    eel, eaz = el_az(lat, lon, earth)
    lit = sel > np.interp(saz, az, hor, period=360.0)
    dte = eel > np.interp(eaz, az, hor, period=360.0)
    return dict(lat=lat, lon=lon, h0=h0,
                hor_mean=float(hor.mean()), hor_max=float(hor.max()),
                illum=100 * float(lit.mean()), dte=100 * float(dte.mean()),
                sun_max=float(sel.max()), earth_max=float(eel.max()))
