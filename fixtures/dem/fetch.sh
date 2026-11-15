#!/usr/bin/env bash
# Downloads the DEM fixtures into this folder and checks them: the polar windows
# (release asset fixtures-dem-v1) and the off-pole Site windows (fixtures-dem-offpole-v3,
# one tar of offpole/<site id>/<product>.TIF). Needs the GitHub CLI authenticated
# (GH_TOKEN in CI).
set -euo pipefail
cd "$(dirname "$0")"
if shasum -a 256 -c SHA256SUMS --status 2>/dev/null; then echo "DEM fixtures already present"; exit 0; fi
gh release download fixtures-dem-v1 --repo Luizfbm/terminators-lunar --pattern 'LDEM_*.TIF' --clobber
gh release download fixtures-dem-offpole-v3 --repo Luizfbm/terminators-lunar --pattern 'offpole.tar' --clobber
tar -xf offpole.tar && rm offpole.tar
shasum -a 256 -c SHA256SUMS
