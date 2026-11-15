"""Eduardo's shadow engine against 486 LROC NAC photos: the rule and the arithmetic (issue #92).

Written before any result. Nothing here changes after one: if a number does not reproduce, the
entry says what came out and stays failed.

What is checked. Eduardo's report (`sfs_comparacao/entrega_relatorio/RESULTADOS-SFS.md`,
commit 2195fcb of his branch, "Resultado 2") says his horizon engine, run on five terrains,
predicts the lit and the dark pixels of 486 real LROC NAC photos with the accuracies, false
lights and false shadows of the table in `REFERENCE`. The per-photo counts behind that table
are `data/sfs_fotos_todas.csv` (byte for byte his `sfs_comparacao/fotos_todas.csv`): for each
photo, each terrain and each disc rule, the true and false positives and negatives of the
prediction against the photo. The check recomputes the table from those counts.

What the columns are, from his `photo2.py`:
- a photo pixel is lit when its brightness is above 0.001 (one threshold for every photo);
- the prediction is "lit" when the Sun's elevation is above the horizon in the Sun's
  azimuth: `_c` takes the centre of the Sun's disc, `_l` its upper limb (+0.267°). The
  table uses `_c`; the limb is only the negative control;
- true positive: predicted lit and lit; true negative: predicted dark and dark; false
  positive: predicted lit and dark ("false light", the dangerous error); false negative:
  predicted dark and lit ("false shadow");
- the pixels are every 8th row and column of each photo (`STRIDE=8`, 40 m apart), not all
  of them.

Definitions of the three numbers. His report does not spell them out; accuracy and false
light are the ones his `fig4.py` writes, and false shadow is the matching rate over the
lit pixels (the only reading under which his table follows from his counts). They were
settled before the tolerance was used and are not changed by a result:
- accuracy = (tp + tn) / all sampled pixels;
- false light = fp / (fp + tn): the share of the photo's dark pixels the model lights;
- false shadow = fn / (fn + tp): the share of the photo's lit pixels the model darkens.
Each is taken on the counts summed over the photos of the group, so a photo with more
sampled pixels weighs more. "Polar" is de Gerlache Rim and Peak Near Shackleton together.

Tolerance: a number reproduces when it is within 0.05 percentage points of the one he
prints, which is half of the last digit he writes (one decimal). The photo counts are exact.
"""

from __future__ import annotations

import csv
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
CSV_PATH = DATA / "sfs_fotos_todas.csv"
SOURCE_PATH = DATA / "sfs_fotos_todas.json"

TOLERANCE_PP = 0.05  # half of the last digit of the printed numbers
EPSILON = 1e-9  # float slack on the line itself

REGIONS = ("Leibnitz Beta", "de Gerlache Rim", "Peak Near Shackleton")
GROUPS = {
    "Leibnitz Beta": ("Leibnitz Beta",),
    "de Gerlache Rim": ("de Gerlache Rim",),
    "Peak Near Shackleton": ("Peak Near Shackleton",),
    "polar": ("de Gerlache Rim", "Peak Near Shackleton"),
}
TERRAINS = ("SfS 5 m", "LOLA 5 m", "LOLA 20 m", "LOLA 60 m", "LOLA 240 m")
CENTRE = "c"
LIMB = "l"

# --- What his report says --------------------------------------------------------------------

PHOTOS = {
    "Leibnitz Beta": 120,
    "de Gerlache Rim": 194,
    "Peak Near Shackleton": 172,
    "polar": 366,
}
TOTAL_PHOTOS = 486
TOTAL_PIXELS_MILLIONS = 8.87  # "8,87 milhões de pixels"

# (accuracy, false light, false shadow), in %, as printed in "Resultado 2".
REFERENCE: dict[str, dict[str, tuple[float, float, float]]] = {
    "SfS 5 m": {
        "Leibnitz Beta": (94.3, 7.7, 3.8),
        "de Gerlache Rim": (95.8, 2.1, 5.9),
        "Peak Near Shackleton": (95.7, 2.2, 6.1),
        "polar": (95.7, 2.1, 6.0),
    },
    "LOLA 5 m": {
        "Leibnitz Beta": (93.8, 8.8, 3.8),
        "de Gerlache Rim": (95.3, 3.0, 6.0),
        "Peak Near Shackleton": (94.9, 4.1, 5.9),
        "polar": (95.1, 3.6, 6.0),
    },
    "LOLA 20 m": {
        "Leibnitz Beta": (93.8, 9.5, 3.3),
        "de Gerlache Rim": (94.7, 2.9, 7.1),
        "Peak Near Shackleton": (93.7, 4.0, 8.3),
        "polar": (94.2, 3.4, 7.7),
    },
    "LOLA 60 m": {
        "Leibnitz Beta": (92.8, 11.0, 3.8),
        "de Gerlache Rim": (95.3, 4.2, 5.1),
        "Peak Near Shackleton": (94.0, 7.0, 5.1),
        "polar": (94.7, 5.7, 5.1),
    },
    "LOLA 240 m": {
        "Leibnitz Beta": (90.2, 13.8, 6.1),
        "de Gerlache Rim": (94.8, 6.5, 4.2),
        "Peak Near Shackleton": (92.5, 11.5, 4.1),
        "polar": (93.6, 9.1, 4.2),
    },
}

# "Foto a foto", same section: how many photos each terrain gets a higher accuracy on than
# LOLA 20 m. His sentence reads "nas polares o SfS acerta mais que o LOLA 20 m em 346 de 366
# fotos, e o LOLA 5 m em 349. Em Leibnitz, 98 e 54 de 120": the second figure of each pair
# is LOLA 5 m against LOLA 20 m. (Read as SfS against LOLA 5 m it would be a different
# number, which `compare_photo_by_photo` also reports.) Strictly higher: ties do not count.
PHOTO_BY_PHOTO: dict[str, dict[str, int]] = {
    "polar": {"SfS 5 m": 346, "LOLA 5 m": 349},
    "Leibnitz Beta": {"SfS 5 m": 98, "LOLA 5 m": 54},
}
LADDER_REFERENCE = "LOLA 20 m"

# "Resultado 2" and "Resumo", the statements about the table, in percentage points.
GAIN_20_TO_5_POLAR_PP = (
    0.9  # "de 20 m para 5 m o acerto sobe cerca de 0,9 ponto nas polares"
)
GAIN_20_TO_5_LEIBNITZ_PP = 0.0  # "... e nada em Leibnitz"
GAIN_SFS_OVER_LOLA5_POLAR_PP = 0.6  # "o SfS acrescenta mais ~0,6 ponto"


# --- The counts -------------------------------------------------------------------------------

Photo = dict[str, str]
Tally = tuple[int, int, int, int]  # tp, tn, fp, fn


def load(path: Path = CSV_PATH) -> list[Photo]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def in_group(photos: list[Photo], group: str) -> list[Photo]:
    return [p for p in photos if p["region"] in GROUPS[group]]


def count(photo: Photo, kind: str, terrain: str, disc: str) -> int:
    return int(photo[f"{kind}_{terrain}_{disc}"])


def tally(photos: list[Photo], terrain: str, disc: str = CENTRE) -> Tally:
    sums = [
        sum(count(p, k, terrain, disc) for p in photos)
        for k in ("tp", "tn", "fp", "fn")
    ]
    return sums[0], sums[1], sums[2], sums[3]


def rates(counts: Tally) -> tuple[float, float, float]:
    """Accuracy, false light and false shadow, in %, from summed counts."""
    tp, tn, fp, fn = counts
    return (
        100.0 * (tp + tn) / (tp + tn + fp + fn),
        100.0 * fp / (fp + tn),
        100.0 * fn / (fn + tp),
    )


def table(
    photos: list[Photo], disc: str = CENTRE
) -> dict[str, dict[str, tuple[float, float, float]]]:
    return {
        terrain: {g: rates(tally(in_group(photos, g), terrain, disc)) for g in GROUPS}
        for terrain in TERRAINS
    }


def compare_table(
    ours: dict[str, dict[str, tuple[float, float, float]]],
) -> list[tuple[str, str, str, float, float]]:
    """The numbers of `REFERENCE` that `ours` does not reproduce, with both values.

    Each item is (terrain, group, measure, his value, ours). Empty means all 60 reproduce.
    """
    off: list[tuple[str, str, str, float, float]] = []
    for terrain, by_group in REFERENCE.items():
        for group, printed in by_group.items():
            for name, theirs, mine in zip(
                ("accuracy", "false light", "false shadow"),
                printed,
                ours[terrain][group],
            ):
                if abs(mine - theirs) > TOLERANCE_PP + EPSILON:
                    off.append((terrain, group, name, theirs, mine))
    return off


def correct(photo: Photo, terrain: str, disc: str = CENTRE) -> int:
    """Correctly predicted sampled pixels of a photo. Same pixels for every terrain."""
    return count(photo, "tp", terrain, disc) + count(photo, "tn", terrain, disc)


def better(photos: list[Photo], terrain: str, other: str, disc: str = CENTRE) -> int:
    """Photos where `terrain` predicts more pixels right than `other`: strictly more."""
    return sum(correct(p, terrain, disc) > correct(p, other, disc) for p in photos)


def compare_photo_by_photo(
    photos: list[Photo],
) -> dict[str, dict[str, tuple[int, int]]]:
    """For each group and terrain: (his count, ours) of photos better than LOLA 20 m."""
    return {
        group: {
            terrain: (
                theirs,
                better(in_group(photos, group), terrain, LADDER_REFERENCE),
            )
            for terrain, theirs in by_terrain.items()
        }
        for group, by_terrain in PHOTO_BY_PHOTO.items()
    }


def pixels(photos: list[Photo]) -> int:
    return sum(int(p["n"]) for p in photos)
