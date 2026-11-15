#!/usr/bin/env bash
# The fast half of CI, run on Luiz's Mac (the slow half, Playwright and schemathesis, runs on
# our runners on the VPS: .github/workflows/ci.yml). It checks out nothing: run it on a clean
# checkout of the commit to check, from anywhere inside the repo. It reports the result to
# GitHub as the commit status `mac-gates`, so a pull request shows both halves.
#
#   scripts/ci-mac.sh            # check HEAD and report
#   scripts/ci-mac.sh --no-report
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

status() { # status <state> <description>
  [ "$REPORT" = 1 ] || return 0
  gh api -X POST "repos/$REPO/statuses/$SHA" -f state="$1" -f context=mac-gates \
    -f description="$2" >/dev/null
}
trap 'status failure "failed at: $step"; echo "mac-gates FAILED at: $step" >&2' ERR

run() { # run <step name> <command...>
  step=$1
  shift
  echo "== $step"
  "$@"
}

status pending "running on Luiz's Mac"

# The validation suite writes its results; keep them out of the checkout.
VALIDATIONS=$(mktemp)
cp backend/app/data/validations.json "$VALIDATIONS"
export LUNAR_VALIDATIONS_FILE="$VALIDATIONS"

run "DEM fixtures" bash fixtures/dem/fetch.sh
run "contract lint" npx --yes @redocly/cli@2.77.0 lint contract/openapi.yaml
run "backend sync" uv sync --locked --project backend --quiet
run "ruff check" uv run --project backend ruff check backend
run "ruff format" uv run --project backend ruff format --check backend
run "mypy" bash -c 'cd backend && uv run mypy .'
run "pytest" bash -c 'cd backend && uv run pytest -q -n auto --dist loadfile -p no:cacheprovider'
run "validation" uv run --project backend pytest validation -q -n auto --dist loadfile -p no:cacheprovider
run "npm ci" npm --prefix frontend ci --no-audit --no-fund --silent
run "eslint" npm --prefix frontend run --silent lint
run "tsc" npm --prefix frontend run --silent typecheck
run "vitest" npm --prefix frontend test --silent -- --run
run "generated types" bash -c 'npm --prefix frontend run --silent generate:types && git diff --exit-code -- frontend/src/api/schema.ts'

rm -f "$VALIDATIONS"
took=$(( $(date +%s) - started ))
status success "lint, types, pytest, validation, vitest, types check in ${took}s"
echo "mac-gates passed for $(git rev-parse --short HEAD) in ${took}s"
