"""Compact Eduardo's raw battery files into `data/traverse_outcomes.json`.

His battery (`simulacao_rover/testes/lola_dif_teto/` and `lola_dif_semteto/`, 32 files each,
about 10 MB per folder) holds one JSON per configuration and difficulty level, with every
simulated traverse of team B: 16 test lanes of real LOLA strips, 100 traverses per lane, each
with an outcome, a progress and a hazard share. The checks need only the outcome of each
traverse, in lane order, so this script keeps one character per traverse (the outcome code)
and the identity of each lane. It reads the files straight from his branch with `git show`, so
nothing large lands in the repository, and it records the SHA-256 of every file it read:

    git fetch origin eduardo/cockpit-multirresolucao
    uv run --project backend python validation/sfs/extract_battery.py

It refuses anything that is not commit 2195fcb of that branch, and any file whose outcomes
are not one of the five he writes, whose lanes do not line up across configurations, or whose
size is not 16 lanes of 100 traverses. Running it again must give a byte-identical output.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
OUTPUT = REPO / "validation" / "data" / "traverse_outcomes.json"

BRANCH = "origin/eduardo/cockpit-multirresolucao"
COMMIT = "2195fcb2d0ee447b1e72c877f4497b82371b917e"
ROOT = "simulacao_rover/testes"
BATTERIES = {"com_teto": "lola_dif_teto", "sem_teto": "lola_dif_semteto"}
CONFIGS = (
    "R60",
    "RT_nom",
    "R20",
    "R20_marg",
    "RT20",
    "RLOLA5",
    "RLOLA5_marg",
    "R_oraculo",
)
LEVELS = (0, 1, 2, 3)
LANES = 16
PER_LANE = 100

# The outcome strings his simulation writes, one code each. `ok` is META.
CODES = {
    "META": "M",
    "TEMPO ESGOTADO": "T",
    "FORA DO MAPA": "F",
    "TOMBAMENTO (acima do limite)": "B",
    "PRESO (sem progresso)": "P",
}


def git(*args: str) -> bytes:
    return subprocess.run(
        ["git", *args], cwd=REPO, check=True, capture_output=True
    ).stdout


def main() -> None:
    head = git("rev-parse", BRANCH).decode().strip()
    if head != COMMIT:
        sys.exit(
            f"{BRANCH} is {head}, not {COMMIT}: refusing to extract from another commit"
        )
    files: dict[str, str] = {}
    batteries: dict[str, Any] = {}
    for name, folder in BATTERIES.items():
        levels: dict[str, Any] = {}
        for level in LEVELS:
            lanes: list[list[Any]] | None = None
            configs: dict[str, str] = {}
            hazard = None
            for config in CONFIGS:
                path = f"{ROOT}/{folder}/{config}_N{level}.json"
                raw = git("show", f"{COMMIT}:{path}")
                files[path] = hashlib.sha256(raw).hexdigest()
                loaded = json.loads(raw)
                assert (
                    loaded["niv"] == level and loaded["cfg"] == f"{config}_N{level}"
                ), path
                assert loaded["pop"] == PER_LANE and len(loaded["terrenos"]) == LANES, (
                    path
                )
                this_lanes = [
                    [t["lola"]["sitio"], t["lola"]["faixa"], t["lola"]["teste"]]
                    for t in loaded["terrenos"]
                ]
                assert lanes is None or lanes == this_lanes, f"lanes differ in {path}"
                lanes = this_lanes
                assert hazard is None or hazard == loaded["pPerig"], (
                    f"hazard differs in {path}"
                )
                hazard = loaded["pPerig"]
                code = ""
                for terrain in loaded["terrenos"]:
                    assert len(terrain["B"]) == PER_LANE, path
                    for traverse in terrain["B"]:
                        assert traverse["ok"] == (
                            1 if traverse["m"] == "META" else 0
                        ), path
                        code += CODES[traverse["m"]]
                configs[config] = code
            levels[str(level)] = {
                "hazard_pct": hazard,
                "lanes": lanes,
                "configs": configs,
            }
        batteries[name] = {"folder": f"{ROOT}/{folder}", "levels": levels}
    out = {
        "source": {
            "branch": "eduardo/cockpit-multirresolucao",
            "commit": COMMIT,
            "what": (
                "Eduardo's battery of simulated traverses over 16 real LOLA test lanes, 100 per "
                "lane, team B of each file: one outcome character per traverse, lane by lane. "
                "Made by validation/sfs/extract_battery.py from the raw files listed in `files`"
            ),
            "generator": "validation/sfs/eduardo/exp_dif.js, rodar_dif_multi.js",
        },
        "lanes": LANES,
        "traverses_per_lane": PER_LANE,
        "codes": {code: name for name, code in CODES.items()},
        "batteries": batteries,
        "files": files,
    }
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"wrote {OUTPUT} from {len(files)} files at {COMMIT[:7]}")


if __name__ == "__main__":
    main()
