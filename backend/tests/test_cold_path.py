"""The faster cold mask (the requirement) gives the answers it gave before, through the HTTP API.

Golden answers from main at 3d50cf9 on the DEM fixtures, for a ridge (CR05's coordinate),
a crater floor (Shackleton) and a plain custom Site, all custom so no cache is involved.
On the machine that wrote them the new code gives the same JSON exactly. Across machines
the last float bits differ, so this uses the ladder test's comparison: floats 1e-6
relative, instants 1 s, everything else (feature names included) exact.
"""

import json
from pathlib import Path

from tests.test_ladder import get, same

GOLDEN = Path(__file__).parent / "data" / "visibility_before_faster_mask.json"


def test_the_cold_path_answers_what_it_did_before() -> None:
    for name, case in json.loads(GOLDEN.read_text("utf-8")).items():
        after = get("/visibility", case["params"])
        # Added since the golden answers were written (the Earth by any part of its disc).
        assert "earth_visible_hours_any_part" in after["metrics"], name
        del after["metrics"]["earth_visible_hours_any_part"]
        # And every sample's apparent radius of the Sun and the Earth (Larissa's #80).
        for sample in after["timeline"]["samples"]:
            for body in ("sun", "earth"):
                assert sample[body]["angular_radius_deg"] > 0, name
                del sample[body]["angular_radius_deg"]
        same(case["answer"], after, name)
