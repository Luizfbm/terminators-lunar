"""Fetch the reference data of the three checks from Larissa's work (the requirement).

Needs the network, and for Larissa's file the branch of the independent work (`git fetch origin
227-moon-prototype`). Run from the repository root:

    uv run --project backend python validation/fetch_athena_refs.py

It writes, under validation/data/:
- `larissa_athena_horizon.csv`: Larissa's silhouette at the Athena point, byte for byte
  from her branch, and `larissa_athena_horizon.json` with where it came from.
- `lroc_athena.json`: the two LROC NAC images. The image labels carry the exposure times
  but no geometry; the incidence angle and the image centre come from the PDS index table
  of the same LROC volume (`INDEX.TAB`, described by `INDEX.LBL`), whose MD5 is checked
  against the label's. Only the two rows are kept, verbatim; the 16 MB table is not.
  The LROC articles 1408 and 1409 give the times the negative control uses.
- `espenak_2025mar14.json`: NASA's contacts of the 14/03/2025 eclipse. The PDF is a
  figure with no text layer, so the contacts are transcribed by hand (below) and the
  script only checks the PDF has not changed.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
import athena

DATA = Path(__file__).resolve().parent / "data"
REPO = Path(__file__).resolve().parents[1]
AGENT = {"User-Agent": "terminators-lunar-validation"}

# --- Larissa's silhouette ----------------------------------------------------------------

LARISSA_BRANCH = "227-moon-prototype"
LARISSA_COMMIT = "57664030d0b19df32bc5eb294b5e2365576dece3"
LARISSA_PATH = "prototypes/moon/building/relevo/horizonte_athena.csv"
LARISSA_SHA256 = "d9cd67610731b8fbefd27ea21e7c0f9e85502ef032a16f728bc2f23faca5bdcb"

# --- LROC ----------------------------------------------------------------------------------

PDS = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-2-EDR-V1.0/LROLRC_0062C"
INDEX_LBL = f"{PDS}/INDEX/INDEX.LBL"
INDEX_TAB = f"{PDS}/INDEX/INDEX.TAB"
IMAGE_LABELS = {
    "M1495922531LE": f"{PDS}/DATA/ESM5/2025065/NAC/M1495922531LE.IMG",
    "M1496181900LE": f"{PDS}/DATA/ESM5/2025068/NAC/M1496181900LE.IMG",
}
INDEX_COLUMNS = (
    "PRODUCT_ID",
    "START_TIME",
    "STOP_TIME",
    "INCIDENCE_ANGLE",
    "CENTER_LATITUDE",
    "CENTER_LONGITUDE",
)
# The times written in the LROC articles, quoted as published.
ARTICLES = {
    "M1495922531LE": {
        "url": "https://lroc.im-ldi.com/images/1408",
        "title": "IM-2 Athena Seen Obliquely",
        "quote": "acquired at 16:54:21 March 7",
        "time_utc": "2025-03-07T16:54:21Z",
    },
    "M1496181900LE": {
        "url": "https://lroc.im-ldi.com/images/1409",
        "title": "IM-2 Athena: A Closer View",
        "quote": "on 10 March at 14:52 UTC",
        "time_utc": "2025-03-10T14:52:00Z",
    },
}

# --- Espenak --------------------------------------------------------------------------------

ESPENAK_URL = "https://eclipse.gsfc.nasa.gov/LEplot/LEplot2001/LE2025Mar14T.pdf"
ESPENAK_SHA256 = "4df1efa14457a1e925c2e63c0d8a7a428d30627532abc11e5c15e3e219d2d166"
# Transcribed from the figure's "Eclipse Contacts" box, in UT.
ESPENAK_CONTACTS = {
    "P1": "2025-03-14T03:57:24Z",
    "U1": "2025-03-14T05:09:33Z",
    "U2": "2025-03-14T06:25:59Z",
    "U3": "2025-03-14T07:31:23Z",
    "U4": "2025-03-14T08:47:48Z",
    "P4": "2025-03-14T10:00:01Z",
}


def get(url: str, byte_range: str | None = None) -> bytes:
    headers = dict(AGENT)
    if byte_range:
        headers["Range"] = f"bytes={byte_range}"
    response = httpx.get(url, headers=headers, timeout=300, follow_redirects=True)
    response.raise_for_status()
    return response.content


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def label_value(label: str, key: str) -> str:
    match = re.search(rf"^\s*{key}\s*=\s*(.+?)\s*$", label, flags=re.MULTILINE)
    if match is None:
        raise ValueError(f"{key} not in the label")
    return match.group(1).strip().strip('"')


def larissa() -> None:
    body = subprocess.run(
        ["git", "show", f"{LARISSA_COMMIT}:{LARISSA_PATH}"],
        cwd=REPO,
        check=True,
        capture_output=True,
    ).stdout
    if sha256(body) != LARISSA_SHA256:
        raise SystemExit("Larissa's file is not the one reviewed in the reference set")
    (DATA / "larissa_athena_horizon.csv").write_bytes(body)
    meta = {
        "file": "larissa_athena_horizon.csv",
        "source": f"{LARISSA_PATH} on branch {LARISSA_BRANCH} (the independent work)",
        "commit": LARISSA_COMMIT,
        "sha256": LARISSA_SHA256,
        "credit": "Larissa, independent prototype shared in the independent work ",
        "columns_used": ["azimute_graus", "elevacao_terreno_graus", "distancia_bloqueio_km"],
        "never_used": "elevacao_graus (her floor rule, wrong for this Observer: see the requirement)",
        "lines": "data on lines 6 to 3605; lines 1 to 4 are her header of origin, line 5 the columns",
    }
    path = DATA / "larissa_athena_horizon.json"
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", "utf-8")


def index_columns(label: str) -> dict[str, tuple[int, int]]:
    """START_BYTE (1-based) and BYTES of each column in the index label."""
    columns: dict[str, tuple[int, int]] = {}
    for block in re.findall(r"OBJECT\s*=\s*COLUMN(.*?)END_OBJECT\s*=\s*COLUMN", label, re.DOTALL):
        name = label_value(block, "NAME")
        columns[name] = (int(label_value(block, "START_BYTE")), int(label_value(block, "BYTES")))
    return columns


def lroc() -> None:
    index_label = get(INDEX_LBL).decode("ascii")
    table = get(INDEX_TAB)
    md5 = hashlib.md5(table).hexdigest()  # the PDS label's own checksum
    if md5 != label_value(index_label, "MD5_CHECKSUM"):
        raise SystemExit("INDEX.TAB does not match the MD5 in INDEX.LBL")
    row_bytes = int(label_value(index_label, "ROW_BYTES"))
    columns = index_columns(index_label)
    rows = {
        line[columns["PRODUCT_ID"][0] - 1 :][: columns["PRODUCT_ID"][1]].strip().strip('"'): line
        for line in table.decode("ascii").split("\r\n")
        if line
    }
    images: dict[str, Any] = {}
    for product in athena.LROC_IMAGES:
        row = rows[product]
        assert len(row) + 2 == row_bytes, product
        fields = {}
        for name in INDEX_COLUMNS:
            start, size = columns[name]
            fields[name] = row[start - 1 : start - 1 + size].strip().strip('"')
        label_url = IMAGE_LABELS[product]
        head = get(label_url, "0-65535")
        record = int(label_value(head.decode("ascii", "replace"), "RECORD_BYTES"))
        label_bytes = head[
            : record * int(label_value(head.decode("ascii", "replace"), "LABEL_RECORDS"))
        ]
        label = label_bytes.decode("ascii", "replace")
        article = ARTICLES[product]
        page = get(article["url"])
        if article["quote"] not in re.sub(r"\s+", " ", page.decode("utf-8", "replace")):
            raise SystemExit(f"{article['url']} no longer says {article['quote']!r}")
        images[product] = {
            "index_row": row,
            "index_row_sha256": sha256(row.encode("ascii")),
            "start_time": fields["START_TIME"],
            "stop_time": fields["STOP_TIME"],
            "incidence_deg": float(fields["INCIDENCE_ANGLE"]),
            "center_latitude_deg": float(fields["CENTER_LATITUDE"]),
            "center_longitude_deg": float(fields["CENTER_LONGITUDE"]),
            "label_url": label_url,
            "label_bytes": len(label_bytes),
            "label_sha256": sha256(label_bytes),
            "label_start_time": label_value(label, "START_TIME"),
            "label_stop_time": label_value(label, "STOP_TIME"),
            "article": {**article, "page_sha256_at_fetch": sha256(page)},
        }
    output = {
        "fetched_at": now(),
        "credit": "NASA/GSFC/Arizona State University (LROC)",
        "volume": "LRO-L-LROC-2-EDR-V1.0 / LROLRC_0062C",
        "index_label_url": INDEX_LBL,
        "index_label_sha256": sha256(index_label.encode("ascii")),
        "index_table_url": INDEX_TAB,
        "index_table_bytes": len(table),
        "index_table_md5": md5,
        "index_table_sha256": sha256(table),
        "index_columns": {name: list(columns[name]) for name in INDEX_COLUMNS},
        "note": (
            "The image labels carry the exposure times only; the incidence angle and the "
            "image centre are the volume's PDS index columns for the same product. LROC's "
            "'Sub solar azimuth' is an angle in the image plane, so it is not compared."
        ),
        "images": images,
    }
    path = DATA / "lroc_athena.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=1) + "\n", "utf-8")


def espenak() -> None:
    pdf = get(ESPENAK_URL)
    if sha256(pdf) != ESPENAK_SHA256:
        raise SystemExit("the NASA eclipse figure changed: transcribe its contacts again")
    output = {
        "fetched_at": now(),
        "url": ESPENAK_URL,
        "sha256": ESPENAK_SHA256,
        "credit": "Eclipse Predictions by Fred Espenak, NASA's GSFC",
        "contacts_ut": ESPENAK_CONTACTS,
        "delta_t_s": 75,
        "shadow_rule": "CdT (Danjon): the Earth's shadow enlarged for its atmosphere",
        "ephemeris": "VSOP87/ELP2000-85",
        "note": (
            "Contacts of the whole Moon with the penumbra (P) and the umbra (U), transcribed "
            "by hand from the figure, which has no text layer. They are not contacts at a "
            "point, so the check uses them as intervals only."
        ),
    }
    path = DATA / "espenak_2025mar14.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=1) + "\n", "utf-8")


def main() -> None:
    larissa()
    lroc()
    espenak()
    print("wrote larissa_athena_horizon.csv/.json, lroc_athena.json, espenak_2025mar14.json")


if __name__ == "__main__":
    main()
