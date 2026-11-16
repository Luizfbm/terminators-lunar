#!/usr/bin/env bash
# The heavy half of CI, run on Luiz's Mac (Apple M4, 10 cores): ruff, mypy, pytest, the validation
# suite, eslint, tsc, vitest, the generated-types check and the Playwright e2e. The light
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
#   frontend  npm ci, eslint, tsc, vitest, generated types
# Then, alone, the Playwright e2e with $LUNAR_E2E_WORKERS workers (3 unless set). Which tests run
# depends on where we are (decided by Luiz on 15/11/2026: a run took about 30 minutes, there is one
# runner, and every merge ran it a second time on main):
#   pull request   only the tests tagged @smoke (not @timing). If no test carries the tag yet, the
#                  whole suite runs instead and the log says so.
#   push to main   everything, unless the commit has the very tree of the merged pull request's head
#                  and that head has `mac-gates` green (see below): then the e2e tests the pull
#                  request did not run (neither @smoke nor @timing) run here, nothing else.
# The @timing tests assert how long something took, so they must not share the machine: they run
# alone, with one worker, once both groups are done, on a pull request and on main alike. Nothing
# is ever re-run until it passes. Before the @timing tests the script waits for the machine to
# calm down: while the 1-minute load average is above $LUNAR_TIMING_MAX_LOAD (6 on this 10-core Mac)
# it checks every 10 s, for at most $LUNAR_TIMING_WAIT_S (300) seconds, then runs them anyway and
# prints the load they ran at, so a failure can be read. The load is also logged at the start and
# before the e2e. Tolerances stay as they are and nothing is retried.
#
# A cancelled run must not leave anything behind (#159: a pytest with 6 xdist workers outlived its
# run by 6 minutes, load 76, and the next run's timing tests failed). Every group and step runs in
# its own process group (`set -m`; there is no setsid on macOS), and on a cancellation or a failure
# each group is killed by its PGID. On the runner (GITHUB_ACTIONS) the script also starts by
# running scripts/ci-sweep.sh, which kills what earlier runs left: only the processes of this user
# whose working directory is inside $GITHUB_WORKSPACE, never by name. mac.yml runs the same sweep as
# its last step, `if: always()`.
#
# Only the groups a change can break run (LUNAR_CI_BASE, set by mac.yml on a pull request, is the
# commit to compare with; without it everything runs, as on a push to main):
#   contract/, .github/, scripts/, fixtures/, or a file at the root   both groups
#   backend/ or validation/                                         the backend group
#   frontend/                                                       the frontend group
#   anything else (docs/, *.md)                                     no group
# The e2e is never cut by file: one header button broke phone tests in specs nobody touched.
#
# Reusing a pull request's run: on a push to main (no LUNAR_CI_BASE), the script asks GitHub for the
# pull request that was merged into this commit, fetches its head (refs/pull/<n>/head) and compares
# the two trees. If they are equal and the head's `mac-gates` status is `success`, the DEM
# fixtures, both groups and the smoke set are not run again (npm ci and the browser still are), and
# the final status says "reused #<n> head <sha>". No pull request, a different tree, a head that is
# not green, or any failed lookup: everything runs, as before. A failed lookup never reports success.
# LUNAR_CI_FULL=1 turns the reuse off, for a run by hand that must check the whole thing.
#
#   scripts/ci-mac.sh            # check HEAD and report
#   scripts/ci-mac.sh --no-report
#   LUNAR_E2E_WORKERS=4 scripts/ci-mac.sh
#   LUNAR_CI_BASE=origin/main scripts/ci-mac.sh   # only what changed since main, e2e @smoke only
#   LUNAR_CI_FULL=1 scripts/ci-mac.sh             # never reuse a pull request's run
set -Eeuo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
REPO=Luizfbm/terminators-lunar
REPORT=1
[ "${1:-}" = "--no-report" ] && REPORT=0

RUN_BACKEND=1
RUN_FRONTEND=1
if [ -n "${LUNAR_CI_BASE:-}" ]; then
  RUN_BACKEND=0
  RUN_FRONTEND=0
  while IFS= read -r path; do
    case "$path" in
      contract/* | .github/* | scripts/* | fixtures/*) RUN_BACKEND=1 RUN_FRONTEND=1 ;;
      backend/* | validation/*) RUN_BACKEND=1 ;;
      frontend/*) RUN_FRONTEND=1 ;;
      docs/* | *.md) ;;
      */*) ;;
      *) RUN_BACKEND=1 RUN_FRONTEND=1 ;; # a file at the root (lock files, tool config)
    esac
  done < <(git diff --name-only "$(git merge-base "$LUNAR_CI_BASE" HEAD)" HEAD)
fi
echo "groups: backend=$RUN_BACKEND frontend=$RUN_FRONTEND"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "The checkout has uncommitted changes: the result would not belong to $(git rev-parse --short HEAD)." >&2
  exit 2
fi
SHA=$(git rev-parse HEAD)
step=start
started=$(date +%s)

# On a push to main, can the run of the merged pull request's head stand for this one? Sets REUSED_PR
# and REUSED_HEAD and returns 0 only when the head has this commit's tree and `mac-gates` is
# `success` on it. Every other outcome, errors included, returns 1 and the caller runs everything.
REUSED_PR=
REUSED_HEAD=
find_reusable_head() {
  local pr head tree head_tree state
  pr=$(gh api "repos/$REPO/commits/$SHA/pulls" \
    --jq "[.[] | select(.merge_commit_sha == \"$SHA\")] | first | .number // empty") || {
    echo "reuse: could not list the pull requests of ${SHA:0:7}" >&2
    return 1
  }
  if [ -z "$pr" ]; then
    echo "reuse: no merged pull request has ${SHA:0:7} as its merge commit"
    return 1
  fi
  git fetch --quiet origin "refs/pull/$pr/head" || {
    echo "reuse: could not fetch the head of #$pr" >&2
    return 1
  }
  head=$(git rev-parse --verify "FETCH_HEAD^{commit}") || return 1
  tree=$(git rev-parse --verify "$SHA^{tree}") || return 1
  head_tree=$(git rev-parse --verify "$head^{tree}") || return 1
  if [ "$tree" != "$head_tree" ]; then
    echo "reuse: #$pr head ${head:0:7} has tree ${head_tree:0:7}, ${SHA:0:7} has ${tree:0:7}"
    return 1
  fi
  state=$(gh api "repos/$REPO/commits/$head/status" \
    --jq '[.statuses[] | select(.context == "mac-gates")] | first | .state // empty') || {
    echo "reuse: could not read the statuses of ${head:0:7}" >&2
    return 1
  }
  if [ "$state" != success ]; then
    echo "reuse: mac-gates on #$pr head ${head:0:7} is \"${state:-missing}\", not success"
    return 1
  fi
  REUSED_PR=$pr
  REUSED_HEAD=$head
}

REUSED=0
if [ -z "${LUNAR_CI_BASE:-}" ] && [ "${LUNAR_CI_FULL:-0}" != 1 ]; then
  if find_reusable_head; then
    REUSED=1
    echo "reuse: same tree as #$REUSED_PR head ${REUSED_HEAD:0:7}, mac-gates success there: the groups and the smoke set are skipped"
    RUN_BACKEND=0
  else
    echo "reuse: not possible, everything runs"
  fi
fi

# Dedicated ports, so the e2e never meets a dev server (4010 and 4173 are the usual ones).
export E2E_MOCK_PORT=${E2E_MOCK_PORT:-4710}
export E2E_APP_PORT=${E2E_APP_PORT:-4773}
# 3 workers: with 6, alongside pytest and the validation suite, the Mac reached load 97 and 49 e2e
# timed out (15/11/2026). With 3, only the known failures were left.
E2E_WORKERS=${LUNAR_E2E_WORKERS:-3}

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
# Each group and step runs as its own process group, so one signal to the group reaches uv, python,
# the xdist workers and the rest. PGIDS lists the groups still running (a leader's pid is its PGID).
PGIDS=""
forget_group() { # forget_group <pgid>: it has ended, its number may be reused
  local g new=""
  for g in $PGIDS; do [ "$g" = "$1" ] || new="$new $g"; done
  PGIDS=$new
}
kill_groups() {
  [ -n "${PGIDS# }" ] || return 0
  local g
  for g in $PGIDS; do kill -TERM -- "-$g" 2>/dev/null || true; done
  sleep 3
  for g in $PGIDS; do kill -KILL -- "-$g" 2>/dev/null || true; done
  PGIDS=""
}
# Run a command as its own process group and wait for it: isolated <command...>
isolated() {
  local pid rc=0
  set -m
  (
    trap - ERR
    "$@"
  ) </dev/null &
  pid=$!
  set +m
  PGIDS="$PGIDS $pid"
  wait "$pid" || rc=$?
  forget_group "$pid"
  return "$rc"
}
# Whatever started its own session or changed directory escapes the group: the sweep gets those.
sweep() {
  [ "${GITHUB_ACTIONS:-}" = true ] && [ -n "${GITHUB_WORKSPACE:-}" ] || return 0
  "$ROOT/scripts/ci-sweep.sh" "$GITHUB_WORKSPACE" || true
}
load() { # load <where>: the 1-minute load average, in the log
  echo "load at $1: $(uptime | sed 's/.*load averages*: //') ($(sysctl -n hw.ncpu) cores)" >&3
}
# Before the @timing tests: wait while the 1-minute load is above LUNAR_TIMING_MAX_LOAD, at most
# LUNAR_TIMING_WAIT_S seconds, then go on anyway. Never a retry and never a looser tolerance.
wait_for_calm() {
  local max=${LUNAR_TIMING_MAX_LOAD:-6} limit=${LUNAR_TIMING_WAIT_S:-300} waited=0 now
  while :; do
    now=$(sysctl -n vm.loadavg | awk '{print $2}')
    if awk -v l="$now" -v m="$max" 'BEGIN { exit !(l <= m) }'; then
      echo "load $now (1 min) is at or below $max: running @timing" >&3
      return 0
    fi
    if [ "$waited" -ge "$limit" ]; then
      echo "load $now (1 min) still above $max after ${waited}s: running @timing anyway, read a failure with this load in mind" >&3
      return 0
    fi
    echo "load $now (1 min) is above $max: waiting (${waited}s of $limit)" >&3
    sleep 10 &
    wait $! || true
    waited=$((waited + 10))
  done
}
interrupted() {
  trap - ERR INT TERM
  local job
  for job in $(jobs -p); do kill_tree "$job"; done
  kill_groups
  sweep
  status error "cancelled at: $step"
  echo "mac-gates cancelled at: $step" >&2
  exit 130
}
trap 'rm -f "$VALIDATIONS"; kill_groups' EXIT
trap 'status failure "failed at: $step"; echo "mac-gates FAILED at: $step" >&2; kill_groups' ERR
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
  if [ "$REUSED" = 0 ]; then
    # The cache lives in frontend/node_modules, which the runner keeps between runs.
    run "eslint" npm --prefix frontend run --silent lint -- --cache --cache-location node_modules/.cache/eslint/
    run "tsc" npm --prefix frontend run --silent typecheck
    run "vitest" npm --prefix frontend test --silent -- --run
    run "generated types" bash -c 'npm --prefix frontend run --silent generate:types && git diff --exit-code -- frontend/src/api/schema.ts'
  fi
  run "playwright browser" bash -c 'cd frontend && npx playwright install chromium'
}

# The e2e runs after both groups, never beside pytest and the validation suite: on 15/11/2026, with
# the two overlapping, the backend's timed tests (test_http's 2 s, test_catalog's 60 s warm-up) and
# 32 e2e tests timed out on load alone, even at 3 workers.
e2e_main() {
  if [ "$REUSED" = 1 ]; then
    # The pull request ran the smoke set on this very tree; this is the rest.
    echo rest >"$LOGS/e2e.mode"
    run "e2e (all but @smoke and @timing)" e2e --grep-invert "@smoke|@timing" --workers="$E2E_WORKERS"
  elif [ -n "${LUNAR_CI_BASE:-}" ]; then
    # A pull request: the smoke set. The tags may not be in the suite yet, then the whole suite runs.
    local listed
    listed=$(cd frontend && CI=1 npx playwright test --list --grep @smoke --grep-invert @timing 2>&1) || true
    if grep -qE "Total: [1-9][0-9]* test" <<<"$listed"; then
      echo smoke >"$LOGS/e2e.mode"
      run "e2e @smoke" e2e --grep @smoke --grep-invert @timing --workers="$E2E_WORKERS"
    else
      echo "no test is tagged @smoke yet: running the whole suite" >&3
      echo full >"$LOGS/e2e.mode"
      run "e2e (whole suite, no @smoke tag found)" e2e --grep-invert @timing --workers="$E2E_WORKERS"
    fi
  else
    echo full >"$LOGS/e2e.mode"
    run "e2e" e2e --grep-invert @timing --workers="$E2E_WORKERS"
  fi
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
load start
sweep

if [ "$RUN_BACKEND" = 1 ]; then
  step="DEM fixtures"
  isolated run "DEM fixtures" bash fixtures/dem/fetch.sh
fi
step="contract lint"
isolated run "contract lint" npx --yes @redocly/cli@2.77.0 lint contract/openapi.yaml

step="backend and frontend groups"
backend_rc=0
frontend_rc=0
# set -m makes each background job its own process group (PGID = the job's pid); it is off again
# right after, so nothing else changes.
set -m
if [ "$RUN_BACKEND" = 1 ]; then
  group backend backend_group &
  backend_pid=$!
  PGIDS="$PGIDS $backend_pid"
fi
if [ "$RUN_FRONTEND" = 1 ]; then
  group frontend frontend_group &
  frontend_pid=$!
  PGIDS="$PGIDS $frontend_pid"
fi
set +m
if [ "$RUN_BACKEND" = 1 ]; then
  wait "$backend_pid" || backend_rc=$?
  forget_group "$backend_pid"
fi
if [ "$RUN_FRONTEND" = 1 ]; then
  wait "$frontend_pid" || frontend_rc=$?
  forget_group "$frontend_pid"
fi

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

if [ "$RUN_FRONTEND" = 1 ] && [ "$frontend_rc" = 0 ]; then
  step="e2e"
  load "the e2e"
  e2e_rc=0
  isolated group e2e e2e_main || e2e_rc=$?
  if [ "$e2e_rc" != 0 ]; then
    failed+=("frontend: e2e")
    echo "---- e2e failed, the end of its log:" >&2
    tail -n 60 "$LOGS/e2e.log" >&2
  fi
fi

if [ ${#failed[@]} -eq 0 ] && [ "$RUN_FRONTEND" = 1 ]; then
  step="e2e @timing"
  echo "== [main] $step" >&3
  load "the @timing step"
  wait_for_calm
  timing_rc=0
  isolated e2e --grep @timing --workers=1 >"$LOGS/timing.log" 2>&1 || timing_rc=$?
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

e2e_mode=$(cat "$LOGS/e2e.mode" 2>/dev/null || true)
rm -rf "$LOGS"
took=$(( $(date +%s) - started ))
if [ "$REUSED" = 1 ]; then
  status success "reused #$REUSED_PR head ${REUSED_HEAD:0:7}: contract lint, e2e rest and @timing in ${took}s"
  echo "mac-gates passed for $(git rev-parse --short HEAD) in ${took}s (reused #$REUSED_PR head ${REUSED_HEAD:0:7})"
  exit 0
fi
# `|| true`: a group that did not run leaves the test false, and set -e would take that for a failure.
ran=$([ "$RUN_BACKEND" = 1 ] && printf 'backend ' || true)$([ "$RUN_FRONTEND" = 1 ] && printf 'frontend+e2e%s ' "${e2e_mode:+ ($e2e_mode)}" || true)
status success "contract lint, ${ran:-no group (docs only) }in ${took}s"
echo "mac-gates passed for $(git rev-parse --short HEAD) in ${took}s"
