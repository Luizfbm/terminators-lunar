#!/usr/bin/env bash
# The heavy half of CI, run on Luiz's Mac (Apple M4, 10 cores): ruff, mypy, pytest, the validation
# suite, eslint, tsc, vitest, the generated-types check and the full Playwright e2e suite. The light
# half (contract lint and schemathesis, plus a nightly e2e as a second opinion) runs on our runners
# on the VPS: .github/workflows/ci.yml. On a pull request this script runs by itself, through the
# self-hosted runner on this Mac: .github/workflows/mac.yml. You can also run it by hand.
#
# It checks out nothing: run it on a clean checkout of the commit to check, from anywhere inside
# the repo. It reports the result to GitHub as the commit status `mac-gates`, so a pull request
# shows both halves.
#
# Two groups run at the same time, each writing its own log in a temp dir:
#   backend   uv sync, ruff, ruff format, mypy, pytest, validation
#   frontend  npm ci, eslint, tsc, vitest, generated types, Playwright e2e
# The e2e runs every test but the ones tagged @timing with $LUNAR_E2E_WORKERS workers (6 unless
# set). The @timing tests assert how long something took, so they must not share the machine:
# they run alone, with one worker, once both groups are done. Nothing is ever re-run until it passes.
#
#   scripts/ci-mac.sh            # check HEAD and report
#   scripts/ci-mac.sh --no-report
#   LUNAR_E2E_WORKERS=4 scripts/ci-mac.sh
set -Eeuo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
REPO=Luizfbm/terminators-lunar
REPORT=1
[ "${1:-}" = "--no-report" ] && REPORT=0

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "The checkout has uncommitted changes: the result would not belong to $(git rev-parse --short HEAD)." >&2
  exit 2
fi
SHA=$(git rev-parse HEAD)
step=start
started=$(date +%s)

# Dedicated ports, so the e2e never meets a dev server (4010 and 4173 are the usual ones).
export E2E_MOCK_PORT=${E2E_MOCK_PORT:-4710}
export E2E_APP_PORT=${E2E_APP_PORT:-4773}
E2E_WORKERS=${LUNAR_E2E_WORKERS:-6}

exec 3>&1 # progress lines go to the terminal even while a group's output goes to its log

status() { # status <state> <description>
  [ "$REPORT" = 1 ] || return 0
  gh api -X POST "repos/$REPO/statuses/$SHA" -f state="$1" -f context=mac-gates \
    -f description="$(printf '%s' "$2" | cut -c1-140)" >/dev/null
}

LOGS=$(mktemp -d)
# The validation suite writes its results; keep them out of the checkout.
VALIDATIONS=$(mktemp)
cp backend/app/data/validations.json "$VALIDATIONS"
export LUNAR_VALIDATIONS_FILE="$VALIDATIONS"

kill_tree() { # kill_tree <pid>: the process and everything under it
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
interrupted() {
  trap - ERR INT TERM
  local job
  for job in $(jobs -p); do kill_tree "$job"; done
  status error "cancelled at: $step"
  echo "mac-gates cancelled at: $step" >&2
  exit 130
}
trap 'rm -f "$VALIDATIONS"' EXIT
trap 'status failure "failed at: $step"; echo "mac-gates FAILED at: $step" >&2' ERR
trap interrupted INT TERM

# GROUP is set inside the two background groups, so each one remembers its current step.
run() { # run <step name> <command...>
  step=$1
  shift
  [ -z "${GROUP:-}" ] || echo "$step" >"$LOGS/$GROUP.step"
  echo "== [${GROUP:-main}] $step" >&3
  echo "== $step"
  local from=$SECONDS
  "$@"
  echo "   $step: $((SECONDS - from))s" >&3
}

# Playwright against the Prism mock. CI=1 is the repo's own setting for a CI machine (a longer
# expect timeout, and it fails instead of reusing a server already on the port). The list reporter
# keeps the log readable.
e2e() { # e2e <playwright args...>
  (cd frontend && CI=1 npx playwright test --reporter=list "$@")
}

backend_group() {
  run "backend sync" uv sync --locked --project backend --quiet
  run "ruff check" uv run --project backend ruff check backend
  run "ruff format" uv run --project backend ruff format --check backend
  run "mypy" bash -c 'cd backend && uv run mypy .'
  # 6 workers, not all 10 cores: test_catalog waits at most 60 s for the background warm-up,
  # and with every core busy that warm-up ran past it.
  run "pytest" bash -c 'cd backend && uv run pytest -q -n 6 --dist loadfile -p no:cacheprovider'
  run "validation" uv run --project backend pytest validation -q -n auto --dist loadfile -p no:cacheprovider
}

frontend_group() {
  run "npm ci" npm --prefix frontend ci --no-audit --no-fund --silent
  run "eslint" npm --prefix frontend run --silent lint
  run "tsc" npm --prefix frontend run --silent typecheck
  run "vitest" npm --prefix frontend test --silent -- --run
  run "generated types" bash -c 'npm --prefix frontend run --silent generate:types && git diff --exit-code -- frontend/src/api/schema.ts'
  run "playwright browser" bash -c 'cd frontend && npx playwright install chromium'
  run "e2e" e2e --grep-invert @timing --workers="$E2E_WORKERS"
}

group() { # group <name> <function>: runs in a subshell, everything it prints goes to its log
  (
    trap - ERR
    set -Eeuo pipefail
    GROUP=$1
    "$2"
  ) >"$LOGS/$1.log" 2>&1
}

status pending "running on Luiz's Mac"

run "DEM fixtures" bash fixtures/dem/fetch.sh
run "contract lint" npx --yes @redocly/cli@2.77.0 lint contract/openapi.yaml

step="backend and frontend groups"
group backend backend_group &
backend_pid=$!
group frontend frontend_group &
frontend_pid=$!
backend_rc=0
frontend_rc=0
wait "$backend_pid" || backend_rc=$?
wait "$frontend_pid" || frontend_rc=$?

failed=()
for name in backend frontend; do
  rc=${name}_rc
  if [ "${!rc}" != 0 ]; then
    where=$(cat "$LOGS/$name.step" 2>/dev/null || echo start)
    failed+=("$name: $where")
    echo "---- $name failed at \"$where\", the end of its log:" >&2
    tail -n 60 "$LOGS/$name.log" >&2
  fi
done

if [ ${#failed[@]} -eq 0 ]; then
  step="e2e @timing"
  echo "== [main] $step" >&3
  timing_rc=0
  e2e --grep @timing --workers=1 >"$LOGS/timing.log" 2>&1 || timing_rc=$?
  cat "$LOGS/timing.log"
  if [ "$timing_rc" != 0 ]; then
    failed+=("e2e @timing")
    echo "---- e2e @timing failed, the end of its log:" >&2
    tail -n 60 "$LOGS/timing.log" >&2
  fi
fi

if [ ${#failed[@]} -gt 0 ]; then
  summary=$(printf '%s; ' "${failed[@]}")
  trap - ERR
  status failure "failed at: ${summary%; }"
  echo "mac-gates FAILED at: ${summary%; } (logs in $LOGS)" >&2
  exit 1
fi

rm -rf "$LOGS"
took=$(( $(date +%s) - started ))
status success "lint, types, pytest, validation, vitest, e2e in ${took}s"
echo "mac-gates passed for $(git rev-parse --short HEAD) in ${took}s"
