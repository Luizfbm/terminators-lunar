#!/usr/bin/env bash
# Kills what a CI run left behind on the runner's Mac. Used by scripts/ci-mac.sh at the start of a
# run and by the last step of .github/workflows/mac.yml (`if: always()`, so it runs after a
# cancellation too). A cancelled run leaves pytest and its xdist workers, Playwright's web servers
# and the like running with PPID 1, and they load the machine for the next run (#159).
#
#   scripts/ci-sweep.sh <workspace>      # $GITHUB_WORKSPACE when the argument is left out
#   LUNAR_SWEEP_DRY_RUN=1 scripts/ci-sweep.sh <workspace>   # only prints what it would kill
#
# This Mac is shared with Luiz's own work, so the sweep only ever touches CI processes:
#   - the workspace must look like a runner's one (.../_work/<repo>/<repo>), or the script refuses;
#   - a process is a target only when it belongs to the current user AND its working directory is
#     the workspace or inside it, checked once over all processes and again right before each kill;
#   - this script, its parents (the step's shell, the runner) and its children are never targets;
#   - nothing is ever found by name: no pkill.
# SIGTERM first, then SIGKILL for what is still there after $LUNAR_SWEEP_TERM_WAIT_S (5) seconds.
# Each process it kills is logged: pid, how long it had been running, and its command (120 chars).
set -uo pipefail

WS_ARG=${1:-${GITHUB_WORKSPACE:-}}
if [ -z "$WS_ARG" ] || [ ! -d "$WS_ARG" ]; then
  echo "ci-sweep: no workspace directory (got \"$WS_ARG\")" >&2
  exit 2
fi
WS=$(cd "$WS_ARG" && pwd -P)
case "$WS" in
  */_work/?*/?*) ;;
  *)
    echo "ci-sweep: $WS is not a runner workspace (.../_work/<repo>/<repo>), refusing to sweep" >&2
    exit 2
    ;;
esac
DRY=${LUNAR_SWEEP_DRY_RUN:-0}
TERM_WAIT=${LUNAR_SWEEP_TERM_WAIT_S:-5}
ME_UID=$(id -u)
ME=$(id -un)

# Pids whose working directory is $WS or inside it, one per line.
inside_workspace() { # inside_workspace [lsof args...]
  lsof -a -w -n -P -d cwd -Fpn "$@" 2>/dev/null | awk -v ws="$WS" '
    /^p/ { pid = substr($0, 2) }
    /^n/ { n = substr($0, 2); if (n == ws || index(n, ws "/") == 1) print pid }' | sort -un
}

# The pids that must never be touched: this script, its ancestors, its descendants.
PROTECTED=" "
add_descendants() {
  local child
  PROTECTED="$PROTECTED$1 "
  for child in $(pgrep -P "$1" 2>/dev/null || true); do add_descendants "$child"; done
}
p=$$
while [ -n "$p" ] && [ "$p" -gt 1 ]; do
  PROTECTED="$PROTECTED$p "
  p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
done
add_descendants $$

describe() { # describe <pid>
  printf 'pid=%s up=%s cmd=%s' "$1" \
    "$(ps -o etime= -p "$1" 2>/dev/null | tr -d ' ')" \
    "$(ps -o command= -p "$1" 2>/dev/null | cut -c1-120)"
}
# Still ours and still inside the workspace? Looked at again right before a signal, so a pid that
# ended and was reused in the meantime is never hit.
still_target() { # still_target <pid>
  [ "$(ps -o uid= -p "$1" 2>/dev/null | tr -d ' ')" = "$ME_UID" ] || return 1
  case "$PROTECTED" in *" $1 "*) return 1 ;; esac
  [ -n "$(inside_workspace -p "$1")" ]
}

targets=()
for pid in $(inside_workspace -u "$ME"); do
  case "$PROTECTED" in *" $pid "*) continue ;; esac
  [ "$(ps -o uid= -p "$pid" 2>/dev/null | tr -d ' ')" = "$ME_UID" ] || continue
  targets+=("$pid")
done

if [ ${#targets[@]} -eq 0 ]; then
  echo "ci-sweep: nothing of ours is running inside $WS (user $ME)"
  exit 0
fi

echo "ci-sweep: ${#targets[@]} process(es) of $ME have their working directory inside $WS"
killed=()
for pid in "${targets[@]}"; do
  line=$(describe "$pid")
  if [ "$DRY" = 1 ]; then
    echo "ci-sweep: would kill $line"
  elif still_target "$pid"; then
    echo "ci-sweep: SIGTERM $line"
    kill -TERM "$pid" 2>/dev/null && killed+=("$pid")
  fi
done
[ "$DRY" = 1 ] && exit 0
[ ${#killed[@]} -gt 0 ] || exit 0

waited=0
while [ "$waited" -lt "$TERM_WAIT" ]; do
  alive=0
  for pid in "${killed[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
  [ "$alive" = 1 ] || break
  sleep 1
  waited=$((waited + 1))
done
for pid in "${killed[@]}"; do
  if kill -0 "$pid" 2>/dev/null && still_target "$pid"; then
    echo "ci-sweep: SIGKILL $(describe "$pid")"
    kill -KILL "$pid" 2>/dev/null || true
  fi
done
exit 0
