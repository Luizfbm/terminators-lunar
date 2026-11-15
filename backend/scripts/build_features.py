"""Rebuild app/data/features.json from the IAU/USGS Gazetteer of Planetary Nomenclature.

Usage: uv run python -m scripts.build_features <path to MOON_nomenclature_center_pts.dbf>

The input is the Moon center-points shapefile of the Gazetteer (public domain), from
https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip
Only its .dbf is read. We keep the features the Occluders can land on: everything south
of 60°S, plus boxes around Apollo 11 and Mare Crisium (Chandrayaan-3, at 69.4°S, is
already in the south cut), so the landers we validate against get names too.
"""

import json
import struct
import sys
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "features.json"
SOURCE = (
    "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip"
)
CREDIT = (
    "Gazetteer of Planetary Nomenclature, International Astronomical Union (IAU) "
    "Working Group for Planetary System Nomenclature (WGPSN) and USGS Astrogeology "
    "Science Center, https://planetarynames.wr.usgs.gov (public domain)"
)

# IAU feature type (as the Gazetteer spells it) -> the `type` we serve. Lettered
# satellite features and astronaut-named features on the Moon are craters. Linear
# features (rimae, dorsa, catenae, valles, rupes) are left out on purpose: the
# Gazetteer gives them one "diameter", which is their length, and a circle that size
# would put names on terrain far from the feature.
TYPES = {
    "Crater, craters": "crater",
    "Satellite Feature": "crater",
    "Astronaut-named features": "crater",
    "Mons, montes": "mons",
    "Mare, maria": "mare",
    "Lacus, lacūs": "lacus",
    "Sinus, sinūs": "sinus",
    "Palus, paludes": "palus",
    "Planitia, planitiae": "planitia",
    "Oceanus, oceani": "oceanus",
    "Promontorium, promontoria": "promontorium",
}


def keep(latitude: float, longitude: float) -> bool:
    if latitude < -60:
        return True
    apollo_11 = -5 <= latitude <= 5 and 18 <= longitude <= 29
    crisium = 0 <= latitude <= 32 and 40 <= longitude <= 78
    return apollo_11 or crisium


def read_dbf(path: Path) -> list[dict[str, str]]:
    raw = path.read_bytes()
    count, header_length, record_length = struct.unpack("<IHH", raw[4:12])
    fields = []
    offset = 32
    while raw[offset] != 0x0D:
        name = raw[offset : offset + 11].split(b"\0")[0].decode()
        fields.append((name, raw[offset + 16]))
        offset += 32
    rows = []
    for i in range(count):
        record = raw[header_length + i * record_length : header_length + (i + 1) * record_length]
        position = 1
        row = {}
        for name, length in fields:
            row[name] = record[position : position + length].decode("utf-8").strip()
            position += length
        rows.append(row)
    return rows


def main(dbf: Path) -> None:
    features = []
    for row in read_dbf(dbf):
        kind = TYPES.get(row["type"])
        if kind is None or row["approval"] != "Adopted by IAU":
            continue
        latitude = float(row["center_lat"])
        longitude = float(row["center_lon"])
        longitude = longitude - 360 if longitude > 180 else longitude
        if not keep(latitude, longitude):
            continue
        features.append(
            {
                "name": row["name"],
                "type": kind,
                "latitude_deg": round(latitude, 4),
                "longitude_deg": round(longitude, 4),
                "diameter_km": round(float(row["diameter"]), 3),
                "link": row["link"],
            }
        )
    features.sort(key=lambda feature: str(feature["name"]))
    document = {
        "source": SOURCE,
        "downloaded": date.today().isoformat(),
        "credit": CREDIT,
        "features": features,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"{len(features)} features -> {OUT}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
