"""
Gerador de pacote web leve (Fase 1) para o Navegador de Pouso Lunar + Motor Tático da Tese.

Lê:
  - sites/artemis_sitios_wueller2026.csv (130 sítios candidatos)
  - lroc_nac/pgda78_26/lroc_nac_sitios_resumo.csv (26 sítios PGDA 78)
  - simulacao_rover/monte_carlo_lola/resultados/resumo_sitios.csv (60->5 m)
  - simulacao_rover/monte_carlo_lola/resultados_20m/resumo_sitios.csv (20->5 m)
  - dados/acervo_tese/02_PGDA_78_5M/<sitio>/*_{surf,ldec,slp,slperr}.tif (recorte central 10x10 km)

Gera em src/assets/tese_bundle/:
  - sites_master.json (130 sítios + 26 sítios PGDA 78 com métricas MC, LROC NAC e flags P50/P90/P99)
  - pgda78/<sitio>.json (grade web 200x200 com surf Int16 + slp5, slp60, slp20, ldec_den, slperr Uint8 em base64)
"""

import base64
import csv
import glob
import json
import math
import os
import re
import time
import numpy as np
import tifffile
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "assets", "tese_bundle")
PGDA_OUT_DIR = os.path.join(OUT_DIR, "pgda78")
PGDA_SRC_DIR = os.path.join(ROOT, "dados", "acervo_tese", "02_PGDA_78_5M")
COCKPIT_HTML = os.path.join(ROOT, "src", "cockpit_missao_lunar.html")

CEL_M = 5.0
CROP_PX = 2000  # 2000 x 2000 px @ 5 m/px = 10 x 10 km central
WEB_N = 200     # 200 x 200 células web (50 m/célula, bloco 10x10 de 5 m)
LUNAR_R_KM = 1737.4


def angular_dist_km(lat1, lon1, lat2, lon2):
    r1, o1 = math.radians(lat1), math.radians(lon1)
    r2, o2 = math.radians(lat2), math.radians(lon2)
    dlat = r2 - r1
    dlon = ((o2 - o1 + math.pi) % (2 * math.pi)) - math.pi
    a = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 2 * LUNAR_R_KM * math.asin(min(1.0, math.sqrt(a)))


def declive(z):
    gy, gx = np.gradient(z, CEL_M)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)


def grade_grossa(z, bloco):
    ny, nx = z.shape
    by, bx = ny // bloco, nx // bloco
    zc = z[:by * bloco, :bx * bloco].reshape(by, bloco, bx, bloco).mean(axis=(1, 3))
    fy = np.clip((np.arange(ny) + 0.5) / bloco - 0.5, 0, by - 1)
    fx = np.clip((np.arange(nx) + 0.5) / bloco - 0.5, 0, bx - 1)
    return ndimage.map_coordinates(zc, np.meshgrid(fy, fx, indexing="ij"), order=1, mode="nearest").astype(np.float32)


def load_existing_cockpit_sites():
    with open(COCKPIT_HTML, "r", encoding="utf-8") as f:
        for line in f:
            if line.lstrip().startswith("const SITES ="):
                raw = line.split("=", 1)[1].strip().rstrip(";")
                return json.loads(raw)
    raise RuntimeError("Não foi possível localizar const SITES em cockpit_missao_lunar.html")


def load_csv_dict(rel_path, key_col):
    path = os.path.join(ROOT, rel_path)
    with open(path, "r", encoding="utf-8") as f:
        return {row[key_col]: row for row in csv.DictReader(f)}


def parse_mc_row(row):
    if not row:
        return None
    out = {}
    for k, v in row.items():
        if k == "sitio":
            continue
        try:
            out[k] = int(v) if k == "celulas_conferidas" else round(float(v), 4)
        except (ValueError, TypeError):
            out[k] = v
    return out


def b64_arr(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def process_pgda_site(sitio):
    sdir = os.path.join(PGDA_SRC_DIR, sitio)
    def read_crop(kind):
        matches = glob.glob(os.path.join(sdir, f"*_{kind}.tif"))
        if not matches:
            raise FileNotFoundError(f"Missing *_{kind}.tif in {sdir}")
        arr = tifffile.imread(matches[0]).astype(np.float32)
        ny, nx = arr.shape
        y0 = max(0, (ny - CROP_PX) // 2)
        x0 = max(0, (nx - CROP_PX) // 2)
        crop = arr[y0:y0 + CROP_PX, x0:x0 + CROP_PX]
        # Substituir eventuais NaNs/nodata pela mediana válida
        bad = ~np.isfinite(crop) | (crop < -1e10) | (crop > 1e10)
        if bad.any():
            med = float(np.median(crop[~bad])) if (~bad).any() else 0.0
            crop = np.where(bad, med, crop)
        return crop

    z = read_crop("surf")
    ldec = read_crop("ldec")
    slp5 = read_crop("slp")
    slperr = read_crop("slperr")

    # Grades grossas reais (60 m = bloco 12, 20 m = bloco 4)
    z60 = grade_grossa(z, 12)
    z20 = grade_grossa(z, 4)
    slp60 = declive(z60)
    slp20 = declive(z20)

    medido = (ldec > 0).astype(np.float32)
    # Densidade local de disparos LOLA (sigma = 10 células = 50 m)
    den = ndimage.gaussian_filter(medido, 10.0, mode="nearest")

    # Estatísticas reais do recorte 10x10 km
    stats = {
        "elev_min_m": round(float(z.min()), 1),
        "elev_max_m": round(float(z.max()), 1),
        "slp_median_deg": round(float(np.median(slp5)), 2),
        "slp_p90_deg": round(float(np.percentile(slp5, 90)), 2),
        "slp_max_deg": round(float(slp5.max()), 1),
        "pct_over_15_real": round(float((slp5 > 15.0).mean() * 100.0), 2),
        "pct_over_15_60m": round(float((slp60 > 15.0).mean() * 100.0), 2),
        "pct_over_15_20m": round(float((slp20 > 15.0).mean() * 100.0), 2),
        "pct_ldec_pos": round(float(medido.mean() * 100.0), 2),
        "slperr_median_deg": round(float(np.median(slperr)), 2),
    }

    # Reamostragem para grade web WEB_N x WEB_N (bloco 10 x 10 células de 5 m)
    b = CROP_PX // WEB_N
    def blk_mean(a):
        return a.reshape(WEB_N, b, WEB_N, b).mean(axis=(1, 3))
    def blk_p90(a):
        return np.percentile(a.reshape(WEB_N, b, WEB_N, b), 90, axis=(1, 3))
    def blk_max(a):
        return a.reshape(WEB_N, b, WEB_N, b).max(axis=(1, 3))

    z_w = blk_mean(z)
    z_base = float(z_w.min())
    z_span = max(1.0, float(z_w.max() - z_base))
    # Int16 em decímetros relativos ao centro para preservar precisão sub-métrica
    z_mid = float(np.median(z_w))
    surf_i16 = np.clip(np.round((z_w - z_mid) * 10.0), -32760, 32760).astype(np.int16)

    # slp5 preserva perigos reais de 5 m via P90 do bloco 10x10; slp60/slp20 via média do bloco
    slp5_w = blk_p90(slp5)
    slp60_w = blk_mean(slp60)
    slp20_w = blk_mean(slp20)
    den_w = blk_mean(den)
    ldec_any_w = blk_max(medido)
    slperr_w = blk_mean(slperr)

    # Codifica ldec: bit 0..6 = densidade (0..127), bit 7 (128) = tem disparo real no bloco
    den_q = np.clip(np.round(den_w * 127.0), 0, 127).astype(np.uint8)
    ldec_u8 = den_q | np.where(ldec_any_w > 0.5, 128, 0).astype(np.uint8)

    q_u8 = lambda a, scale: np.clip(np.round(a * scale), 0, 255).astype(np.uint8)

    payload = {
        "sitio": sitio,
        "n": WEB_N,
        "cell_m": int(CROP_PX * CEL_M / WEB_N),
        "span_km": 10.0,
        "z_mid_m": round(z_mid, 2),
        "z_min_m": round(z_base, 2),
        "z_max_m": round(float(z_w.max()), 2),
        "scales": {"surf": 0.1, "slp": 0.5, "slperr": 0.25},
        "surf_i16": b64_arr(surf_i16),
        "slp5_u8": b64_arr(q_u8(slp5_w, 2.0)),
        "slp60_u8": b64_arr(q_u8(slp60_w, 2.0)),
        "slp20_u8": b64_arr(q_u8(slp20_w, 2.0)),
        "ldec_u8": b64_arr(ldec_u8),
        "slperr_u8": b64_arr(q_u8(slperr_w, 4.0)),
    }

    out_path = os.path.join(PGDA_OUT_DIR, f"{sitio}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    return stats, os.path.getsize(out_path)


def main():
    t0 = time.time()
    os.makedirs(PGDA_OUT_DIR, exist_ok=True)

    cockpit_sites = load_existing_cockpit_sites()
    lroc_map = load_csv_dict("lroc_nac/pgda78_26/lroc_nac_sitios_resumo.csv", "site_nome")
    mc60_map = load_csv_dict("simulacao_rover/monte_carlo_lola/resultados/resumo_sitios.csv", "sitio")
    mc20_map = load_csv_dict("simulacao_rover/monte_carlo_lola/resultados_20m/resumo_sitios.csv", "sitio")

    pgda_list = []
    total_bytes = 0

    for sitio, lroc in lroc_map.items():
        lat = float(lroc["site_lat"])
        lon = float(lroc["site_lon"])
        mc60 = parse_mc_row(mc60_map.get(sitio))
        mc20 = parse_mc_row(mc20_map.get(sitio))
        stats, fsize = process_pgda_site(sitio)
        total_bytes += fsize

        # Encontra o sítio Wueller mais próximo
        best_w = min(cockpit_sites, key=lambda w: angular_dist_km(lat, lon, w["lat"], w["lon"]))
        best_d = angular_dist_km(lat, lon, best_w["lat"], best_w["lon"])

        def f_opt(val, nd=3):
            return round(float(val), nd) if val not in (None, "", "NA") else None

        pgda_entry = {
            "sitio": sitio,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "nearest_wueller": best_w["code"],
            "dist_km": round(best_d, 2),
            "lroc": {
                "n_produtos": int(lroc["n_produtos"] or 0),
                "n_cobrindo": int(lroc["n_cobrindo"] or 0),
                "melhor_res_m_px": f_opt(lroc["melhor_res_m_px"], 3),
                "melhor_inc": f_opt(lroc["melhor_inc"], 2),
                "melhor_produto": lroc["melhor_produto"] or None,
                "melhor_viewer": lroc["melhor_viewer"] or None,
                "cobertura": lroc["cobertura"],
            },
            "mc60": mc60,
            "mc20": mc20,
            "terrain_stats": stats,
            "bundle_file": f"pgda78/{sitio}.json",
        }
        pgda_list.append(pgda_entry)
        print(f"  [PGDA78] {sitio:10s} -> {fsize/1024:6.1f} KB | real>15°={stats['pct_over_15_real']:5.1f}% vs 60m={stats['pct_over_15_60m']:5.1f}% | LDEC+={stats['pct_ldec_pos']:4.1f}%")

    # Enriquece os 130 sítios com match PGDA78 (<= 15 km), LROC, MC e flags P50/P90/P99
    pgda_by_name = {p["sitio"]: p for p in pgda_list}
    enriched_sites = []
    for s in cockpit_sites:
        best_p = min(pgda_list, key=lambda p: angular_dist_km(s["lat"], s["lon"], p["lat"], p["lon"]))
        dist_p = angular_dist_km(s["lat"], s["lon"], best_p["lat"], best_p["lon"])
        matched = best_p if dist_p <= 15.0 else None

        # Avaliação multirresolução 60m vs Escudo P50 / P90 / P99 (limite nominal 15°)
        # Em 60m: usa declive publicado da grade.
        # No Escudo: adiciona incerteza real (PGDA78 slperr_median ou 1.8 * eps_barker) com Z_P50=0, Z_P90=1.282, Z_P99=2.326
        sigma_slope = matched["terrain_stats"]["slperr_median_deg"] if matched else round(1.8 * s["eps_barker"], 2)
        base_slope = matched["terrain_stats"]["slp_median_deg"] if matched else s["slope"]

        pass_60m = s["slope"] <= 15.0
        pass_p50 = (base_slope <= 15.0) and (not matched or matched["terrain_stats"]["pct_over_15_real"] < 25.0)
        pass_p90 = (s["slope"] + 1.282 * sigma_slope <= 15.0) and (not matched or matched["mc60"]["teseP90_perigo_nao_vetado"] < 5.0)
        pass_p99 = (s["slope"] + 2.326 * sigma_slope <= 15.0) and (not matched or matched["mc60"]["teseP90_perigo_nao_vetado"] < 3.5)

        entry = dict(s)
        entry["grids_avail"] = ["60m", "20m", "5m (PGDA78)"] if matched else ["60m", "20m"]
        entry["pgda78_match"] = matched["sitio"] if matched else None
        entry["pgda78_dist_km"] = round(dist_p, 2) if matched else None
        entry["sigma_slope_deg"] = sigma_slope
        entry["pass_60m"] = pass_60m
        entry["pass_p50"] = pass_p50
        entry["pass_p90"] = pass_p90
        entry["pass_p99"] = pass_p99
        if matched:
            entry["lroc"] = matched["lroc"]
            entry["mc60"] = {
                "grade_nv": matched["mc60"]["grade_perigo_nao_vetado"],
                "teseP90_nv": matched["mc60"]["teseP90_perigo_nao_vetado"],
                "grade_fa": matched["mc60"]["grade_falso_alarme"],
                "teseP90_fa": matched["mc60"]["teseP90_falso_alarme"],
                "erro_grade": matched["mc60"]["erro_mediano_grade"],
                "erro_tese": matched["mc60"]["erro_mediano_tese"],
            }
            entry["mc20"] = {
                "grade_nv": matched["mc20"]["grade_perigo_nao_vetado"],
                "teseP90_nv": matched["mc20"]["teseP90_perigo_nao_vetado"],
                "erro_grade": matched["mc20"]["erro_mediano_grade"],
                "erro_tese": matched["mc20"]["erro_mediano_tese"],
            }
        enriched_sites.append(entry)

    master = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_sites": len(enriched_sites),
        "total_pgda78": len(pgda_list),
        "sites": enriched_sites,
        "pgda78": pgda_list,
    }
    master_path = os.path.join(OUT_DIR, "sites_master.json")
    with open(master_path, "w", encoding="utf-8") as f:
        json.dump(master, f, ensure_ascii=False, separators=(",", ":"))
    master_sz = os.path.getsize(master_path)

    print(f"\nConcluído em {time.time() - t0:.1f}s:")
    print(f"  sites_master.json : {master_sz/1024:.1f} KB ({len(enriched_sites)} sítios, {len(pgda_list)} PGDA78)")
    print(f"  pgda78/*.json     : {total_bytes/1024/1024:.2f} MB total ({total_bytes/len(pgda_list)/1024:.1f} KB/sítio médio)")


if __name__ == "__main__":
    main()
