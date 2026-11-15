"""Run mutation testing and fail when the share of killed mutants drops below the floor.

    uv run python -m scripts.mutation_gate                  # everything, then the gate
    uv run python -m scripts.mutation_gate --shard horizon  # one shard, writes its counts
    uv run python -m scripts.mutation_gate --combine DIR    # the gate over shard counts

The floor in `mutation-baseline.json` is the percentage of mutants the tests kill, as
measured in CI. It only goes up: when a run kills more, raise it in the same change.
Lowering it needs Luiz. A percentage, not a count, so adding code to `only_mutate`
doesn't need a new baseline by itself.

The whole run does not fit in one GitHub runner (45 minutes cut every attempt), so the
workflow asks `--plan` for a list of shards and runs one job per shard. A shard is a
group of modules and a quarter of its mutants, picked by the last digit of the mutant
number. On a merge to main the plan has only the groups whose modules changed; the
full run is the manual dispatch. Every shard still runs every test that reaches its
mutants; only the mutants are split.

    uv run python -m scripts.mutation_gate --plan [--since REF]   # JSON list of shards
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
BASELINE = BACKEND / "mutation-baseline.json"
MUTANTS = BACKEND / "mutants"

# Mutant names start with the module path, e.g. "app.horizon.x__mask__mutmut_12".
# Grouped so the shards take about the same time; every module in `only_mutate` must
# be in exactly one shard (checked below).
SHARDS: dict[str, list[str]] = {
    "horizon": ["app.horizon.*"],
    "engine": ["app.engine.*", "app.visibility.*"],
    "sky": ["app.ephemeris.*", "app.geometry.*", "app.timeutil.*"],
    "cache": ["app.cache.*"],
    "names-year": ["app.features.*", "app.year.*"],
}
# Last digit of the mutant number: four parts of about the same size.
PARTS = ["[012]", "[345]", "[67]", "[89]"]
UNKILLED = ("survived", "no tests", "not checked")
BROKEN = ("suspicious", "segfault")


def shard_patterns(shard: str) -> list[str]:
    """ "horizon-2" -> the horizon group's patterns, restricted to the third part."""
    group, _, part = shard.rpartition("-")
    return [pattern + PARTS[int(part)] for pattern in SHARDS[group]]


def all_shards(groups: list[str] | None = None) -> list[str]:
    return [f"{g}-{i}" for g in (groups or list(SHARDS)) for i in range(len(PARTS))]


def changed_groups(since: str) -> list[str]:
    diff = subprocess.run(
        ["git", "diff", "--name-only", since, "HEAD", "--", "."],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    modules = {
        Path(path).with_suffix("").as_posix().removeprefix("backend/").replace("/", ".")
        for path in diff
    }
    return [
        g
        for g, patterns in SHARDS.items()
        if any(p.removesuffix(".*") in modules for p in patterns)
    ]


def _environment() -> dict[str, str]:
    env = dict(os.environ)
    # mutmut runs the tests from a copy of the code in `mutants/`, so the kernel and
    # DEM fixtures are no longer two folders up from the engine.
    env.setdefault("LUNAR_META_KERNEL", str(BACKEND.parent / "fixtures" / "kernels" / "meta.tm"))
    env.setdefault("LUNAR_DEM_DIR", str(BACKEND.parent / "fixtures" / "dem"))
    # Tells the speed checks they run under mutmut's trampolines (tests/test_http.py).
    env["LUNAR_MUTATION_RUN"] = "1"
    return env


def _run(patterns: list[str]) -> None:
    command = ["mutmut", "run"]
    # It uses every core by default. On a laptop: MUTATION_MAX_CHILDREN=2.
    if children := os.environ.get("MUTATION_MAX_CHILDREN"):
        command += ["--max-children", children]
    subprocess.run(command + patterns, cwd=BACKEND, env=_environment(), check=False)


def count(patterns: list[str]) -> Counter[str]:
    """Statuses of the mutants whose names match the patterns (all mutants if empty)."""
    from mutmut.stats import status_by_exit_code

    statuses: Counter[str] = Counter()
    for meta in MUTANTS.rglob("*.py.meta"):
        exit_codes = json.loads(meta.read_text())["exit_code_by_key"]
        for name, code in exit_codes.items():
            if not patterns or any(fnmatch.fnmatch(name, p) for p in patterns):
                statuses[status_by_exit_code[code]] += 1
    return statuses


def gate(statuses: Counter[str]) -> int:
    floor = float(json.loads(BASELINE.read_text())["min_killed_percent"])
    total = sum(statuses.values())
    # A mutant no test reaches is as alive as one that survived its tests.
    unkilled = sum(statuses[s] for s in UNKILLED)
    broken = sum(statuses[s] for s in BROKEN)
    print(f"mutants: {total} | " + " | ".join(f"{k}: {v}" for k, v in sorted(statuses.items())))
    if total == 0 or statuses["killed"] == 0:
        print("FAIL: mutation testing did not run. Check that the tests pass on their own.")
        return 1
    killed = 100.0 * (total - unkilled - broken) / total
    print(f"killed: {killed:.1f}% (timeouts count as killed) | floor: {floor:.1f}%")
    if broken:
        print(f"FAIL: {broken} mutants crashed or behaved oddly; see `mutmut results`.")
        return 1
    if killed < floor:
        print(f"FAIL: {floor - killed:.1f} points under the floor. `mutmut results` lists")
        print("the survivors; write the test that kills each new one.")
        return 1
    if int(killed * 10) > int(floor * 10):
        print(
            f"PASS, and the floor can go up to {int(killed * 10) / 10:.1f}. Raise it in this change."
        )
    else:
        print("PASS")
    return 0


def _check_shards() -> None:
    import tomllib

    config = tomllib.loads((BACKEND / "pyproject.toml").read_text())["tool"]["mutmut"]
    modules = [p.removesuffix(".py").replace("/", ".") + ".*" for p in config["only_mutate"]]
    covered = [p for patterns in SHARDS.values() for p in patterns]
    if sorted(modules) != sorted(covered):
        sys.exit(f"SHARDS and only_mutate disagree: {sorted(modules)} vs {sorted(covered)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shard", choices=all_shards())
    parser.add_argument("--combine", type=Path, help="folder of shard-*.json files")
    parser.add_argument("--expect", help="the JSON list from --plan, for --combine")
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--since", help="with --plan: only groups changed since this ref")
    args = parser.parse_args()
    _check_shards()

    if args.plan:
        groups = changed_groups(args.since) if args.since else list(SHARDS)
        print(json.dumps(all_shards(groups) if groups else []))
        return 0

    if args.combine:
        statuses: Counter[str] = Counter()
        files = sorted(args.combine.rglob("shard-*.json"))
        names = {f.stem.removeprefix("shard-") for f in files}
        expected = set(json.loads(args.expect)) if args.expect else set(all_shards())
        if not expected:
            print("PASS: no module in only_mutate changed, nothing to mutate.")
            return 0
        if missing := expected - names:
            print(f"FAIL: shard counts missing for {sorted(missing)}")
            return 1
        for file in files:
            part = Counter(json.loads(file.read_text()))
            print(f"{file.stem}: {dict(sorted(part.items()))}")
            if not part["killed"]:
                print(f"FAIL: {file.stem} never ran its mutants; read that job's log.")
                return 1
            statuses += part
        return gate(statuses)

    if args.shard:
        patterns = shard_patterns(args.shard)
        _run(patterns)
        statuses = count(patterns)
        out = MUTANTS / f"shard-{args.shard}.json"
        out.write_text(json.dumps(dict(statuses)))
        print(f"{args.shard}: {dict(sorted(statuses.items()))}")
        # Only a run that never started fails here; the floor is the combine step's.
        return 0 if statuses["killed"] else gate(statuses)

    _run([])
    return gate(count([]))


if __name__ == "__main__":
    sys.exit(main())
