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


def horizon(dem, lat, lon, obs_m=2.0, az_step=1.0, d_step=200.0, d_max=70000.0):
    """Perfil de horizonte 360 graus, vetorizado."""
    h0 = float(sample_dem(dem, *latlon_to_pix(lat, lon)))
    az = np.arange(0.0, 360.0, az_step)
    ds = np.arange(d_step, d_max + d_step, d_step)
    latr = np.radians(lat)
    m_lat = 111320.0
    m_lon = 111320.0 * abs(np.cos(latr))

    A = np.radians(az)[:, None]
    D = ds[None, :]
    la = lat + D * np.cos(A) / m_lat
    lo = lon + D * np.sin(A) / m_lon
    inside = (2.0 * R_M * np.tan(np.radians(90.0 + la) / 2.0)) <= DEM_EDGE_M
    la = np.where(inside, la, lat)
    lo = np.where(inside, lo, lon)
    row, col = latlon_to_pix(la, lo)
    h = sample_dem(dem, row, col)
    ang = np.degrees(np.arctan2(h - (h0 + obs_m), D))
    ang = np.where(inside, ang, -90.0)
    return az, ang.max(axis=1), h0


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
