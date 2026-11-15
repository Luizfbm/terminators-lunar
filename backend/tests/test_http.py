import json
import os
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
# The repository root, found by walking up: mutmut runs these tests from backend/mutants/.
REPO = next(p for p in Path(__file__).resolve().parents if (p / "contract").is_dir())


def test_contract_endpoints_and_catalog() -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/meta").json()["defaults"]["site_id"] == "001"
    assert "CR" in {region["id"] for region in client.get("/regions").json()}
    assert "001" in {site["id"] for site in client.get("/sites").json()}
    assert client.get("/sites/001").status_code == 200


def test_visibility_shape_period_tiling_and_metrics() -> None:
    response = client.get(
        "/visibility",
        params={"site_id": "001", "start": "2025-01-01T00:00:00Z", "duration_hours": 24},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["horizon"]["samples"]) == 720
    assert payload["timeline"]["step_minutes"] == 15
    assert payload["events"] == sorted(payload["events"], key=lambda event: event["t"])
    for body in ("sun", "earth"):
        periods = [p for p in payload["periods"] if p["body"] == body]
        assert periods[0]["start"] == payload["query"]["start"]
        assert periods[-1]["end"] == payload["query"]["end"]
        assert abs(sum(p["duration_hours"] for p in periods) - 24) < 1e-6


@pytest.mark.usefixtures("without_global_dem")
def test_custom_site_height_and_problem_codes() -> None:
    base = {
        "latitude_deg": -89.5,
        "longitude_deg": 20,
        "start": "2025-01-01T00:00:00Z",
        "duration_hours": 1,
    }
    low = client.get("/visibility", params={**base, "observer_height_m": 0}).json()
    high = client.get("/visibility", params={**base, "observer_height_m": 50}).json()
    assert low["query"]["site"]["source"] == "custom"
    assert (
        high["horizon"]["samples"][0]["elevation_deg"]
        < low["horizon"]["samples"][0]["elevation_deg"]
    )
    cases: list[tuple[dict[str, object], str]] = [
        ({"site_id": "001", "latitude_deg": -89, "longitude_deg": 20}, "ambiguous_site"),
        ({"site_id": "404"}, "missing_site"),
        ({"latitude_deg": -70, "longitude_deg": 20}, "outside_coverage"),
        (
            {"latitude_deg": -89, "longitude_deg": 20, "start": "2023-07-01T00:00:00Z"},
            "window_out_of_range",
        ),
    ]
    for params, code in cases:
        query = dict(params)
        query.setdefault("start", "2025-01-01T00:00:00Z")
        response = client.get("/visibility", params=query)
        assert response.status_code in (404, 422)
        assert response.headers["content-type"].startswith("application/problem+json")
        assert response.json()["code"] == code
    assert client.get("/sites/404").status_code == 404


def test_metrics_agree_with_periods_and_default_window_is_fast() -> None:
    import time

    started = time.perf_counter()
    payload = client.get(
        "/visibility", params={"site_id": "001", "start": "2025-01-01T00:00:00Z"}
    ).json()
    # mutmut wraps every function in a trampoline, which makes the engine a few times
    # slower; the speed budget is the normal CI's to check, not the mutation run's.
    if not os.environ.get("LUNAR_MUTATION_RUN"):
        assert time.perf_counter() - started < 2
    periods = payload["periods"]
    sun = [p for p in periods if p["body"] == "sun"]
    earth = [p for p in periods if p["body"] == "earth"]
    assert payload["metrics"]["sunlit_hours"] == sum(
        p["duration_hours"] for p in sun if p["state"] == "visible"
    )
    assert payload["metrics"]["lcip_hours"] == max(
        p["duration_hours"] for p in sun if p["state"] == "visible"
    )
    assert payload["metrics"]["lcsp_hours"] == max(
        (p["duration_hours"] for p in sun if p["state"] == "hidden"), default=0
    )
    intersection = 0.0
    for a in sun:
        for b in earth:
            if a["state"] == b["state"] == "visible":
                left = max(a["start"], b["start"])
                right = min(a["end"], b["end"])
                if left < right:
                    intersection += (
                        datetime.fromisoformat(right) - datetime.fromisoformat(left)
                    ).total_seconds() / 3600
    assert payload["metrics"]["sun_and_earth_hours"] == intersection


VALIDATION_KEYS = {
    "id",
    "title",
    "reference",
    "tolerance",
    "result",
    "status",
    "not_covered",
    "script_path",
    "run_at",
}


def test_validations_serve_the_latest_committed_run() -> None:
    entries = client.get("/validations").json()
    ids = [entry["id"] for entry in entries]
    assert ids[:2] == ["horizons-sun-azel", "horizons-earth-azel"]
    assert "negative-control-time-shift" in ids
    for entry in entries:
        assert set(entry) == VALIDATION_KEYS
        for field in ("title", "tolerance", "result", "not_covered"):
            assert entry[field]["en"] and entry[field]["pt"]
        assert entry["status"] in {"passed", "failed", "pending"}
        assert (REPO / entry["script_path"]).is_file()
        datetime.fromisoformat(entry["run_at"])


def test_validations_show_a_failed_run_as_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    run = [{"id": "horizons-sun-azel", "status": "failed", "result": {"en": "x", "pt": "x"}}]
    path = tmp_path / "validations.json"
    path.write_text(json.dumps(run))
    monkeypatch.setenv("LUNAR_VALIDATIONS_FILE", str(path))
    assert client.get("/validations").json() == run
    monkeypatch.setenv("LUNAR_VALIDATIONS_FILE", str(tmp_path / "missing.json"))
    assert client.get("/validations").json() == []


def test_the_window_reaches_back_to_august_2023_for_chandrayaan_3() -> None:
    # Chandrayaan-3 landed on 23/08/2023; the coverage used to start on 1/1/2025.
    inside = client.get(
        "/visibility",
        params={"site_id": "001", "start": "2023-09-01T00:00:00Z", "duration_hours": 24},
    )
    assert inside.status_code == 200, inside.text
    before = client.get(
        "/visibility",
        params={"site_id": "001", "start": "2023-07-31T00:00:00Z", "duration_hours": 24},
    )
    assert before.status_code == 422
    assert before.json()["code"] == "window_out_of_range"
    assert client.get("/meta").json()["coverage"]["window_min"] == "2023-08-01T00:00:00Z"
    # /year takes whole years only, and 2023 starts in August.
    assert client.get("/sites/001/year", params={"year": 2023}).status_code == 422
