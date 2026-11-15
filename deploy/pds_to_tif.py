"""Turns LOLA's two PDS height maps into the GeoTIFFs the engine reads (the requirement).

    python pds_to_tif.py <dir with the .img and .lbl> <out dir>

Reads, from the PDS Geosciences LOLA archive (LRO-L-LOLA-4-GDR-V1.0, lrolol_1xxx/data/lola_gdr):

    ldem_128.img        cylindrical/img   2,123,366,400 B  23040 x 46080, 128 px/deg = 236.901 m
    ldem_60n_240m.img   polar/img           120,435,200 B  7760 x 7760, 240 m, north polar stereographic

and writes <out>/LDEM_128.TIF and <out>/LDEM_60N_240M.TIF: float32 metres above the
1737.4 km sphere (DN * 0.5, which is what the label says, no resampling, no filling), deflate
with the float predictor, 512 px tiles, on the grid the engine projects to
(backend/app/horizon.py): LDEM_128 is the simple cylindrical centred on 180°E, x = R * (lon - 180°)
from -pi*R at 0°E, y = R * lat; LDEM_60N_240M is the north polar stereographic with true
scale at the pole, x = rho sin(lon), y = -rho cos(lon), so 0°E points down the map.

The IMG is checked before the TIF is trusted: its size, the label's lines, samples, scaling and
offset, and that the file's pixels stay inside the label's minimum and maximum (a wrong byte
order or a cut file would not). A product that does not
match stops the run, and nothing is left under the final name. Rows are read and written in
bands of 512, so the 2.1 GB map never sits in memory (about 100 MB at a time).

Disk (the TIFs hold 4 bytes a pixel before compression; the sizes after it are an estimate,
not measured, because the DEMs have not been downloaded where this was written):
    LDEM_128.TIF      4.25 GB uncompressed, expected about 1.5 to 2.5 GB
    LDEM_60N_240M.TIF 0.24 GB uncompressed, expected about 0.1 to 0.2 GB
The files already there are kept: run it again and it skips what exists.
"""

from __future__ import annotations

import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.windows import Window

R = 1_737_400.0
BAND_ROWS = 512  # the TIFF's tile height: every band is whole tiles


@dataclass(frozen=True)
class Product:
    name: str  # the engine's product name, <name>.TIF
    img: str
    size: int  # bytes the PDS server announced on 2026-11-15
    lines: int
    samples: int
    minimum_key: str  # the label's key for the smallest DN ("MINIMUM", or "DERIVED_MINIMUM")
    maximum_key: str
    crs: str
    transform: Affine


_GLOBAL_PIXEL = 2.0 * math.pi * R / 46080  # 236.9005 m, east to west and north to south
_NORTH_PIXEL = 240.0

PRODUCTS = (
    Product(
        name="LDEM_128",
        img="ldem_128.img",
        size=2_123_366_400,
        lines=23040,
        samples=46080,
        minimum_key="MINIMUM",
        maximum_key="MAXIMUM",
        crs=f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 +R={R} +units=m +no_defs",
        transform=Affine(_GLOBAL_PIXEL, 0.0, -math.pi * R, 0.0, -_GLOBAL_PIXEL, math.pi * R / 2.0),
    ),
    Product(
        name="LDEM_60N_240M",
        img="ldem_60n_240m.img",
        size=120_435_200,
        lines=7760,
        samples=7760,
        minimum_key="DERIVED_MINIMUM",
        maximum_key="DERIVED_MAXIMUM",
        crs=f"+proj=stere +lat_0=90 +lat_ts=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={R} +units=m +no_defs",
        # The pole is the centre of the 7760 x 7760 map (the label's offsets are 3879.5).
        transform=Affine(
            _NORTH_PIXEL, 0.0, -3880 * _NORTH_PIXEL, 0.0, -_NORTH_PIXEL, 3880 * _NORTH_PIXEL
        ),
    ),
)


def _label(path: Path, key: str) -> float | str:
    """The first `KEY = value` of a PDS3 label, as a number when it is one."""
    match = re.search(rf"^\s*{key}\s*=\s*(\S+)", path.read_text(), re.MULTILINE)
    if match is None:
        raise SystemExit(f"{path} has no {key}")
    value = match.group(1).strip('"')
    try:
        return float(value)
    except ValueError:
        return value


def _check_label(product: Product, label: Path) -> tuple[int, int]:
    """The label says what this script assumes about the IMG; returns its (min, max) DN."""
    expected = {
        "LINES": product.lines,
        "LINE_SAMPLES": product.samples,
        "SAMPLE_BITS": 16,
        "SCALING_FACTOR": 0.5,
        "OFFSET": R,
    }
    for key, value in expected.items():
        if _label(label, key) != value:
            raise SystemExit(f"{label}: {key} is {_label(label, key)}, not {value}")
    if _label(label, "SAMPLE_TYPE") != "LSB_INTEGER":
        raise SystemExit(f"{label}: the samples are not little-endian integers")
    return int(_label(label, product.minimum_key)), int(_label(label, product.maximum_key))


def convert(product: Product, pds: Path, out: Path) -> None:
    final = out / f"{product.name}.TIF"
    if final.is_file():
        print(f"{final.name} is already here", flush=True)
        return
    img, label = pds / product.img, pds / product.img.replace(".img", ".lbl")
    if img.stat().st_size != product.size:
        raise SystemExit(f"{img} is {img.stat().st_size} bytes, not the {product.size} announced")
    want_min, want_max = _check_label(product, label)
    dn = np.memmap(img, dtype="<i2", mode="r", shape=(product.lines, product.samples))
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": 1,
        "width": product.samples,
        "height": product.lines,
        "crs": CRS.from_proj4(product.crs),
        "transform": product.transform,
        "nodata": float("nan"),
        "compress": "deflate",
        "predictor": 3,
        "tiled": True,
        "blockxsize": 512,
        "blockysize": 512,
        "BIGTIFF": "IF_SAFER",
    }
    part = out / f".{product.name}.part"
    low, high = 32767, -32768
    print(f"writing {final.name}", flush=True)
    try:
        with rasterio.open(part, "w", **profile) as target:
            for row in range(0, product.lines, BAND_ROWS):
                band = np.asarray(dn[row : row + BAND_ROWS])
                low, high = min(low, int(band.min())), max(high, int(band.max()))
                # DN * 0.5 is exact in float32 (a 16-bit integer over two).
                target.write(
                    band.astype(np.float32) * np.float32(0.5),
                    1,
                    window=Window(0, row, product.samples, band.shape[0]),
                )
            target.update_tags(
                SOURCE=f"PDS {product.img} (LRO-L-LOLA-4-GDR-V1.0), height above the 1737.4 km sphere",
                SCALING="DN * 0.5 m",
            )
        print(f"{final.name}: pixels {low} to {high} DN, label {want_min} to {want_max}", flush=True)
        if low < want_min or high > want_max:
            raise SystemExit(
                f"{img}: the pixels run {low} to {high}, outside the label's {want_min} to {want_max}"
            )
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    part.rename(final)


def main() -> None:
    pds, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for product in PRODUCTS:
        convert(product, pds, out)


if __name__ == "__main__":
    main()
