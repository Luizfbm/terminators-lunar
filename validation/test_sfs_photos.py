"""Eduardo's shadow engine against 486 LROC NAC photos: his table, recomputed (issue #92).

The rule, the tolerance and what is compared are in sfs/photos.py and were written before any
result. The data is his per-photo counts, `data/sfs_fotos_todas.csv`, byte for byte (the source
and SHA-256 are in `data/sfs_fotos_todas.json`). This is Eduardo's shadow engine, not ours:
the check shows that the tables of his report follow from his counts, and nothing about the
counts themselves, which need photos and elevation products that are not in the repository.
If a number does not reproduce, the entry says what came out and stays failed.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import proof
import pytest
from sfs import photos

SCRIPT = "validation/test_sfs_photos.py"
HERE = Path(__file__).resolve().parent
EDUARDO = HERE / "sfs" / "eduardo"

# His figure 4, as printed ("luz falsa" on the dark pixels of one photo, SfS 5 m, LOLA 20 m,
# LOLA 240 m): a re-run of the one photo at every second pixel, which the per-photo counts
# (every eighth) cannot reproduce. Shown in the result, never judged.
EXAMPLE_PHOTO = "M115416165LE"
EXAMPLE_PRINTED = (5.2, 8.7, 24.7)
EXAMPLE_TERRAINS = ("SfS 5 m", "LOLA 20 m", "LOLA 240 m")

REFERENCE = (
    "Eduardo's report sfs_comparacao/entrega_relatorio/RESULTADOS-SFS.md ('Resultado 2'), commit "
    "2195fcb of his branch eduardo/cockpit-multirresolucao (a research workspace with no common "
    "history with this repository): {what}. Ours: the same {what_ours} recomputed from his "
    "per-photo counts, data/sfs_fotos_todas.csv (byte for byte his fotos_todas.csv, SHA-256 "
    "4ecd4faa…, 486 photos in three regions: Leibnitz Beta 120, de Gerlache Rim 194, Peak Near "
    "Shackleton 172). His scripts that made the counts are in validation/sfs/eduardo/ "
    "(photo2.py, photo3.py, ray.c). It is Eduardo's shadow engine, not ours"
)

proof.declare(
    "eduardo-photos-sfs-table",
    title=proof.text(
        "Eduardo's shadow engine against 486 LROC NAC photos: his accuracy, false light and "
        "false shadow table",
        "Motor de sombras do Eduardo contra 486 fotos LROC NAC: a tabela dele de acerto, luz "
        "falsa e sombra falsa",
    ),
    reference=REFERENCE.format(
        what=(
            "accuracy, false light and false shadow of his horizon engine on five terrains "
            "(SfS 5 m, LOLA 5, 20, 60 and 240 m), per region and for the two polar regions "
            "together, against the real photos (a pixel is lit above brightness 0.001)"
        ),
        what_ours="table (60 numbers) and photo and pixel counts",
    ),
    tolerance=proof.text(
        "each of the 60 numbers within 0.05 percentage points of the one he prints (half of "
        "his last digit); photo counts exact, pixels to the 8.87 million he prints",
        "cada um dos 60 números a 0,05 ponto percentual do que ele imprime (metade do último "
        "dígito dele); contagens de fotos exatas, pixels nos 8,87 milhões que ele imprime",
    ),
    not_covered=proof.text(
        "It shows his table follows from his counts, and nothing about the counts: remaking "
        "them needs the 486 photos, the SfS elevation products and the DE440 kernels, none of "
        "which is here, so his scripts are kept and not run. Eduardo's engine, not ours: ours "
        "has not been run against these photos (not done). The SfS terrain was fitted to these "
        "same photos, so its row is not an independent test; the LOLA rows are. One brightness "
        "threshold for every photo; the pixels are every 8th row and column of each photo, not "
        "all of them; the 60 m and 240 m grids are block means of LOLA 20 m (polar) or LOLA 5 m "
        "(Leibnitz Beta), not official products; Leibnitz Beta (85.4°S) lies outside the polar "
        "LOLA 20 m map, so its absolute numbers are optimistic. His Sun for each photo (0.006° "
        "against 33 camera files) is not rechecked: the camera files are not here. His figure 4 "
        "example is a re-run at every 2nd pixel and is not judged. His horizon code is the "
        "exact one of ray.c; the 111,320 m/degree error he fixed later was in other code these "
        "scripts never used, and the file was committed before the fix.",
        "Mostra que a tabela dele segue das contagens dele, e nada sobre as contagens: refazê-las "
        "pede as 486 fotos, os produtos de elevação SfS e os kernels DE440, que não estão aqui; "
        "os scripts dele ficam guardados e não são rodados. Motor do Eduardo, não o nosso: o "
        "nosso não foi rodado contra estas fotos (não feito). O terreno SfS foi ajustado a "
        "estas mesmas fotos, então a linha dele não é um teste independente; as do LOLA são. Um "
        "único limiar de brilho para todas as fotos; os pixels são uma linha e coluna a cada 8 "
        "de cada foto, não todos; as grades de 60 m e 240 m são médias de blocos do LOLA 20 m "
        "(polares) ou do LOLA 5 m (Leibnitz Beta), não produtos oficiais; Leibnitz Beta (85,4°S) "
        "fica fora do mapa LOLA 20 m polar, então os absolutos dela são otimistas. O Sol de cada "
        "foto (0,006° contra 33 arquivos de câmera) não é conferido de novo: os arquivos de "
        "câmera não estão aqui. O exemplo da figura 4 dele é uma nova rodada a cada 2 pixels e "
        "não é julgado. O código de horizonte dele é o exato do ray.c; o erro de 111.320 m/grau "
        "que ele corrigiu depois estava em outro código que estes scripts nunca usaram, e o "
        "arquivo foi commitado antes da correção.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "eduardo-photos-sfs-vs-lola20",
    title=proof.text(
        "Eduardo's photos: how many beat LOLA 20 m, and the 20 m to 5 m gain",
        "Fotos do Eduardo: quantas superam o LOLA 20 m, e o ganho de 20 m para 5 m",
    ),
    reference=REFERENCE.format(
        what=(
            "photo by photo, in how many photos SfS 5 m and LOLA 5 m predict more pixels right "
            "than LOLA 20 m (polar 346 and 349 of 366; Leibnitz Beta 98 and 54 of 120), and the "
            "gains his text states: about 0.9 point of accuracy from 20 m to 5 m in the polar "
            "regions and none in Leibnitz Beta, about 0.6 more for SfS, and the polar LOLA "
            "60 m grid at least as accurate as LOLA 20 m"
        ),
        what_ours="photo counts (strictly more pixels right, same pixels for every terrain)",
    ),
    tolerance=proof.text(
        "photo counts exact; each gain within 0.1 point of the one his text states (the "
        "difference of two numbers rounded to 0.1); the 60 m grid at least as accurate as 20 m "
        "in de Gerlache Rim, in Peak Near Shackleton and in the two together",
        "contagens de fotos exatas; cada ganho a 0,1 ponto do que o texto dele afirma (a "
        "diferença de dois números arredondados a 0,1); a grade de 60 m com acerto pelo menos "
        "igual ao de 20 m em de Gerlache Rim, em Peak Near Shackleton e nas duas juntas",
    ),
    not_covered=proof.text(
        "Eduardo's engine, not ours, and counts of photos, not of how much better: a photo "
        "counts as better by one pixel. His sentence is ambiguous ('346 of 366, and LOLA 5 m in "
        "349'): it reads as LOLA 5 m against LOLA 20 m, and that is what is judged; SfS against "
        "LOLA 5 m, read literally, gives other numbers, shown in the result. SfS was fitted to "
        "these photos. In the polar regions the 60 m grid is as accurate as the 20 m one only "
        "because it trades false shadow for false light (his text says the cause was not "
        "investigated, and it is not here). The 20 m, 60 m and 240 m grids of Leibnitz Beta are "
        "block means of LOLA 5 m, so 'nothing there' is a statement about that construction.",
        "Motor do Eduardo, não o nosso, e contagens de fotos, não de quanto melhor: uma foto "
        "conta como melhor por um pixel. A frase dele é ambígua ('346 de 366, e o LOLA 5 m em "
        "349'): lê-se como LOLA 5 m contra LOLA 20 m, e é isso que se julga; SfS contra LOLA 5 m, "
        "lido literalmente, dá outros números, mostrados no resultado. O SfS foi ajustado a estas "
        "fotos. Nas regiões polares a grade de 60 m acerta tanto quanto a de 20 m só porque "
        "troca sombra falsa por luz falsa (o texto dele diz que a causa não foi investigada, e "
        "aqui também não). As grades de 20, 60 e 240 m de Leibnitz Beta são médias de blocos do "
        "LOLA 5 m, então 'nada ali' é uma afirmação sobre essa construção.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-eduardo-photos-limb",
    title=proof.text(
        "Negative control: the same table with the Sun's upper limb instead of its centre",
        "Controle negativo: a mesma tabela com a borda superior do Sol em vez do centro",
    ),
    reference=(
        "The 60 numbers of Eduardo's photo table, recomputed from the same per-photo counts "
        "but from the columns where the prediction uses the upper limb of the Sun's disc "
        "(+0.267°) instead of its centre"
    ),
    tolerance=proof.text(
        "must break the table: every one of the five terrain rows has at least one number "
        "more than 0.05 points from the one he prints",
        "tem que quebrar a tabela: cada uma das cinco linhas de terreno tem pelo menos um "
        "número a mais de 0,05 ponto do que ele imprime",
    ),
    not_covered=proof.text(
        "Shows the check can fail; says nothing about his engine.",
        "Mostra que a checagem pode falhar; não diz nada sobre o motor dele.",
    ),
    script_path=SCRIPT,
)


def comma(value: float, spec: str = ".1f") -> str:
    """A number as the Portuguese text writes it, with the decimal comma."""
    return format(value, spec).replace(".", ",")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows() -> list[photos.Photo]:
    return photos.load()


# --- The data is the data he made -------------------------------------------------------------


def test_the_csv_is_the_file_on_his_branch() -> None:
    source = json.loads(photos.SOURCE_PATH.read_text("utf-8"))
    assert sha256(photos.CSV_PATH) == source["sha256"]
    assert source["commit"] == "2195fcb2d0ee447b1e72c877f4497b82371b917e"
    assert source["rows"] == 486 == len(rows())


def test_his_scripts_are_kept_byte_for_byte() -> None:
    source = json.loads((EDUARDO / "SOURCE.json").read_text("utf-8"))
    assert set(source["files"]) == {
        p.name for p in EDUARDO.iterdir() if p.name in source["files"]
    }
    for name, meta in source["files"].items():
        assert sha256(EDUARDO / name) == meta["sha256"], name


def test_the_photo_scripts_never_used_the_earth_scale() -> None:
    # The 111,320 m/degree constant (the Earth's) that his commit 8dea6de fixed was in
    # precalc/horizon.py and precalc/engine.py. The scripts that made the photo counts use
    # his C ray-marcher on the stereographic plane with the Moon's radius, and import neither.
    for name in ("ray.c", "lib.py", "load.py", "eph.py", "photo2.py", "photo3.py"):
        text = (EDUARDO / name).read_text("utf-8")
        assert "111320" not in text and "111.32" not in text, name
        assert "precalc.horizon" not in text and "precalc.engine" not in text, name
        assert "import engine" not in text and "from engine" not in text, name
    assert "RM=1737400.0" in (EDUARDO / "lib.py").read_text("utf-8")
    ray = (EDUARDO / "ray.c").read_text("utf-8")
    assert (
        "double th=d/R" in ray and "(R+h)*cos(th)" in ray
    )  # spherical curvature, metres


def test_the_counts_are_what_the_report_says_they_are() -> None:
    photo_rows = rows()
    assert len(photo_rows) == photos.TOTAL_PHOTOS
    assert len({p["img"] for p in photo_rows}) == 486
    for group, expected in photos.PHOTOS.items():
        assert len(photos.in_group(photo_rows, group)) == expected, group
    assert round(photos.pixels(photo_rows) / 1e6, 2) == photos.TOTAL_PIXELS_MILLIONS
    for p in photo_rows:
        for terrain in photos.TERRAINS:
            for disc in (photos.CENTRE, photos.LIMB):
                total = sum(
                    photos.count(p, k, terrain, disc) for k in ("tp", "tn", "fp", "fn")
                )
                assert total == int(p["n"]), (p["img"], terrain, disc)


# --- The arithmetic, on counts small enough to do by hand --------------------------------------


def test_the_three_rates() -> None:
    # 40 lit and 60 dark pixels; the model gets 30 of the lit and 54 of the dark right.
    accuracy, light, shadow = photos.rates((30, 54, 6, 10))
    assert accuracy == pytest.approx(84.0)
    assert light == pytest.approx(
        10.0
    )  # 6 of the 60 dark pixels, not 6 of the 36 predicted lit
    assert shadow == pytest.approx(25.0)  # 10 of the 40 lit pixels


def test_a_group_is_summed_over_photos_and_not_averaged() -> None:
    small = {
        "region": "a",
        "n": "10",
        "tp_t_c": "1",
        "tn_t_c": "9",
        "fp_t_c": "0",
        "fn_t_c": "0",
    }
    large = {
        "region": "a",
        "n": "1000",
        "tp_t_c": "500",
        "tn_t_c": "0",
        "fp_t_c": "500",
        "fn_t_c": "0",
    }
    counts = photos.tally([small, large], "t")
    assert counts == (501, 9, 500, 0)
    accuracy, light, _ = photos.rates(counts)
    assert accuracy == pytest.approx(100.0 * 510 / 1010)  # the large photo dominates
    assert light == pytest.approx(100.0 * 500 / 509)


def test_better_is_strictly_better() -> None:
    def photo(t_right: int, u_right: int) -> photos.Photo:
        return {
            "n": "10",
            "tp_t_c": str(t_right),
            "tn_t_c": "0",
            "tp_u_c": str(u_right),
            "tn_u_c": "0",
        }

    group = [photo(5, 4), photo(5, 5), photo(3, 6)]
    assert photos.better(group, "t", "u") == 1  # the tie and the loss do not count
    assert photos.better(group, "u", "t") == 1


def test_the_comparison_flags_a_number_that_is_off() -> None:
    exact = {t: dict(g) for t, g in photos.REFERENCE.items()}
    assert photos.compare_table(exact) == []
    off = {t: dict(g) for t, g in photos.REFERENCE.items()}
    accuracy, light, shadow = off["LOLA 20 m"]["polar"]
    off["LOLA 20 m"]["polar"] = (
        accuracy,
        light + 0.06,
        shadow,
    )  # past half the last digit
    assert photos.compare_table(off) == [
        ("LOLA 20 m", "polar", "false light", light, light + 0.06)
    ]
    near = {t: dict(g) for t, g in photos.REFERENCE.items()}
    near["LOLA 20 m"]["polar"] = (accuracy, light + 0.049, shadow)
    assert photos.compare_table(near) == []


def test_the_reference_table_is_the_one_in_the_report() -> None:
    # Transcribed from "Resultado 2"; a typo here would otherwise read as a failure of his.
    assert set(photos.REFERENCE) == set(photos.TERRAINS)
    for terrain in photos.TERRAINS:
        assert set(photos.REFERENCE[terrain]) == set(photos.GROUPS)
    assert photos.REFERENCE["SfS 5 m"]["polar"] == (95.7, 2.1, 6.0)
    assert photos.REFERENCE["LOLA 240 m"]["Leibnitz Beta"] == (90.2, 13.8, 6.1)
    assert photos.REFERENCE["LOLA 60 m"]["Peak Near Shackleton"] == (94.0, 7.0, 5.1)


# --- The checks ---------------------------------------------------------------------------------


@proof.check("eduardo-photos-sfs-table")
def test_his_table_follows_from_his_counts() -> None:
    photo_rows = rows()
    ours = photos.table(photo_rows)
    off = photos.compare_table(ours)
    largest = max(
        abs(mine - theirs)
        for terrain, by_group in photos.REFERENCE.items()
        for group, printed in by_group.items()
        for theirs, mine in zip(printed, ours[terrain][group])
    )
    counts_ok = (
        len(photo_rows) == photos.TOTAL_PHOTOS
        and all(
            len(photos.in_group(photo_rows, g)) == n for g, n in photos.PHOTOS.items()
        )
        and round(photos.pixels(photo_rows) / 1e6, 2) == photos.TOTAL_PIXELS_MILLIONS
    )
    polar = {t: ours[t]["polar"] for t in photos.TERRAINS}
    sfs, lola20, lola240 = polar["SfS 5 m"], polar["LOLA 20 m"], polar["LOLA 240 m"]
    light = {
        g: (ours["SfS 5 m"][g][1], ours["LOLA 240 m"][g][1]) for g in photos.REGIONS
    }
    example = next(r for r in photo_rows if r["img"] == EXAMPLE_PHOTO)
    csv_example = [
        photos.rates(photos.tally([example], t))[1] for t in EXAMPLE_TERRAINS
    ]
    passed = not off and counts_ok
    pixel_total = photos.pixels(photo_rows)
    pixels_pt = f"{pixel_total:,}".replace(",", ".")
    en_example = (
        f"His figure 4 photo {EXAMPLE_PHOTO} gives "
        + " / ".join(f"{v:.1f}" for v in csv_example)
        + " % false light here (every 8th pixel) against "
        + " / ".join(f"{v:.1f}" for v in EXAMPLE_PRINTED)
        + " in his figure (every 2nd pixel), not judged"
    )
    pt_example = (
        f"A foto {EXAMPLE_PHOTO} da figura 4 dele dá "
        + " / ".join(comma(v) for v in csv_example)
        + " % de luz falsa aqui (um pixel a cada 8) contra "
        + " / ".join(comma(v) for v in EXAMPLE_PRINTED)
        + " na figura dele (um a cada 2), não julgado"
    )
    if passed:
        result = proof.text(
            f"All 60 numbers reproduce from his counts (largest difference {largest:.3f} "
            f"points), over {len(photo_rows)} photos and {pixel_total:,} sampled pixels. Polar "
            f"photos together, accuracy / false light / false shadow in %: SfS 5 m "
            f"{sfs[0]:.1f} / {sfs[1]:.1f} / {sfs[2]:.1f}; LOLA 20 m {lola20[0]:.1f} / "
            f"{lola20[1]:.1f} / {lola20[2]:.1f}; LOLA 240 m {lola240[0]:.1f} / "
            f"{lola240[1]:.1f} / {lola240[2]:.1f}. False light from SfS 5 m to LOLA 240 m: "
            + ", ".join(f"{g} {a:.1f} to {b:.1f}" for g, (a, b) in light.items())
            + f". {en_example}",
            f"Os 60 números reproduzem a partir das contagens dele (maior diferença "
            f"{comma(largest, '.3f')} ponto), em {len(photo_rows)} fotos e "
            f"{pixels_pt} pixels amostrados. Fotos polares juntas, acerto / luz falsa / "
            f"sombra falsa em %: SfS 5 m "
            f"{comma(sfs[0])} / {comma(sfs[1])} / {comma(sfs[2])}; LOLA 20 m {comma(lola20[0])} / "
            f"{comma(lola20[1])} / {comma(lola20[2])}; LOLA 240 m {comma(lola240[0])} / "
            f"{comma(lola240[1])} / {comma(lola240[2])}. Luz falsa do SfS 5 m ao LOLA 240 m: "
            + ", ".join(f"{g} {comma(a)} a {comma(b)}" for g, (a, b) in light.items())
            + f". {pt_example}",
        )
    else:
        listed = "; ".join(
            f"{t}, {g}, {m}: he prints {th:.1f}, we get {mi:.2f}"
            for t, g, m, th, mi in off[:8]
        )
        result = proof.text(
            f"{len(off)} of 60 numbers do not reproduce (counts ok: {counts_ok}): {listed}",
            f"{len(off)} dos 60 números não reproduzem (contagens ok: {counts_ok}): {listed}",
        )
    proof.record("eduardo-photos-sfs-table", "passed" if passed else "failed", result)
    assert passed, (off, counts_ok)


@proof.check("eduardo-photos-sfs-vs-lola20")
def test_photo_by_photo_and_the_gain_from_20_to_5_m() -> None:
    photo_rows = rows()
    ours = photos.table(photo_rows)
    counts = photos.compare_photo_by_photo(photo_rows)
    count_off = [
        (group, terrain, theirs, mine)
        for group, by_terrain in counts.items()
        for terrain, (theirs, mine) in by_terrain.items()
        if theirs != mine
    ]

    def accuracy(terrain: str, group: str) -> float:
        return ours[terrain][group][0]

    gain_polar = accuracy("LOLA 5 m", "polar") - accuracy("LOLA 20 m", "polar")
    gain_leibnitz = accuracy("LOLA 5 m", "Leibnitz Beta") - accuracy(
        "LOLA 20 m", "Leibnitz Beta"
    )
    gain_sfs = accuracy("SfS 5 m", "polar") - accuracy("LOLA 5 m", "polar")
    gains = (
        ("20 m to 5 m, polar", photos.GAIN_20_TO_5_POLAR_PP, gain_polar),
        ("20 m to 5 m, Leibnitz Beta", photos.GAIN_20_TO_5_LEIBNITZ_PP, gain_leibnitz),
        ("LOLA 5 m to SfS, polar", photos.GAIN_SFS_OVER_LOLA5_POLAR_PP, gain_sfs),
    )
    gain_off = [
        (name, theirs, mine)
        for name, theirs, mine in gains
        if abs(mine - theirs) > 0.1 + 1e-9
    ]
    sixty = {
        g: accuracy("LOLA 60 m", g) >= accuracy("LOLA 20 m", g)
        for g in ("de Gerlache Rim", "Peak Near Shackleton", "polar")
    }
    leibnitz_sixty = accuracy("LOLA 60 m", "Leibnitz Beta") < accuracy(
        "LOLA 20 m", "Leibnitz Beta"
    )
    passed = not count_off and not gain_off and all(sixty.values())
    polar_rows = photos.in_group(photo_rows, "polar")
    leibnitz_rows = photos.in_group(photo_rows, "Leibnitz Beta")
    literal_polar = photos.better(polar_rows, "SfS 5 m", "LOLA 5 m")
    literal_leibnitz = photos.better(leibnitz_rows, "SfS 5 m", "LOLA 5 m")
    mine = {g: {t: v[1] for t, v in by.items()} for g, by in counts.items()}
    if passed:
        result = proof.text(
            f"Photos with more pixels right than LOLA 20 m: SfS 5 m {mine['polar']['SfS 5 m']} "
            f"of {len(polar_rows)} polar and {mine['Leibnitz Beta']['SfS 5 m']} of "
            f"{len(leibnitz_rows)} in Leibnitz Beta; LOLA 5 m {mine['polar']['LOLA 5 m']} and "
            f"{mine['Leibnitz Beta']['LOLA 5 m']}, as he states. Accuracy gain from LOLA 20 m "
            f"to 5 m {gain_polar:+.2f} points polar and {gain_leibnitz:+.2f} in Leibnitz Beta; "
            f"SfS over LOLA 5 m {gain_sfs:+.2f} polar. The polar LOLA 60 m grid is at least "
            f"as accurate as 20 m in both regions and together; in Leibnitz Beta it is "
            f"{'less' if leibnitz_sixty else 'not less'} accurate. Read literally, SfS 5 m "
            f"beats LOLA 5 m in {literal_polar} of {len(polar_rows)} polar photos and "
            f"{literal_leibnitz} of {len(leibnitz_rows)} in Leibnitz Beta",
            f"Fotos com mais pixels certos que o LOLA 20 m: SfS 5 m {mine['polar']['SfS 5 m']} de "
            f"{len(polar_rows)} polares e {mine['Leibnitz Beta']['SfS 5 m']} de "
            f"{len(leibnitz_rows)} em Leibnitz Beta; LOLA 5 m {mine['polar']['LOLA 5 m']} e "
            f"{mine['Leibnitz Beta']['LOLA 5 m']}, como ele afirma. Ganho de acerto do LOLA 20 m "
            f"para 5 m de {comma(gain_polar, '+.2f')} ponto nas polares e "
            f"{comma(gain_leibnitz, '+.2f')} em Leibnitz Beta; SfS sobre o LOLA 5 m "
            f"{comma(gain_sfs, '+.2f')} nas polares. A grade LOLA 60 m polar acerta pelo menos "
            f"tanto quanto a de 20 m nas duas regiões e juntas; em Leibnitz Beta acerta "
            f"{'menos' if leibnitz_sixty else 'não menos'}. Lido literalmente, o SfS 5 m supera "
            f"o LOLA 5 m em {literal_polar} de {len(polar_rows)} fotos polares e "
            f"{literal_leibnitz} de {len(leibnitz_rows)} em Leibnitz Beta",
        )
    else:
        detail = f"counts {count_off}; gains {gain_off}; 60 m at least 20 m {sixty}"
        result = proof.text(f"does not reproduce: {detail}", f"não reproduz: {detail}")
    proof.record(
        "eduardo-photos-sfs-vs-lola20", "passed" if passed else "failed", result
    )
    assert passed, (count_off, gain_off, sixty)


@proof.check("negative-control-eduardo-photos-limb")
def test_the_negative_control_breaks_the_table() -> None:
    limb = photos.table(rows(), photos.LIMB)
    off = photos.compare_table(limb)
    rows_broken = {terrain for terrain, *_ in off}
    broke = rows_broken == set(photos.TERRAINS)
    sfs_polar = limb["SfS 5 m"]["polar"]
    en = (
        f"{len(off)} of 60 numbers off; polar SfS 5 m at the limb {sfs_polar[0]:.1f} / "
        f"{sfs_polar[1]:.1f} / {sfs_polar[2]:.1f} % against his 95.7 / 2.1 / 6.0"
    )
    pt_text = (
        f"{len(off)} dos 60 números fora; SfS 5 m polar na borda {comma(sfs_polar[0])} / "
        f"{comma(sfs_polar[1])} / {comma(sfs_polar[2])} % contra 95,7 / 2,1 / 6,0 dele"
    )
    proof.record(
        "negative-control-eduardo-photos-limb",
        "passed" if broke else "failed",
        proof.text(
            f"broke the table in all five terrain rows ({en})"
            if broke
            else f"did not break every terrain row ({en})",
            f"quebrou a tabela nas cinco linhas de terreno ({pt_text})"
            if broke
            else f"não quebrou todas as linhas de terreno ({pt_text})",
        ),
    )
    assert broke, rows_broken
