#!/usr/bin/env bash
# Registers the runner the first time (the token is good for an hour) and then just runs it.
# /runner is a named volume, so the registration survives restarts and image rebuilds keep it.
set -euo pipefail
cd /runner
if [ ! -f .runner ]; then
  : "${RUNNER_TOKEN:?RUNNER_TOKEN missing: get one with gh api -X POST repos/Luizfbm/terminators-lunar/actions/runners/registration-token}"
  ./config.sh --unattended --replace \
    --url https://github.com/Luizfbm/terminators-lunar \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-lunar-vps}" --labels lunar-vps \
    --work /runner/_work
fi
exec ./run.sh
