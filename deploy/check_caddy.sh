#!/usr/bin/env bash
# Checks the cache rules of deploy/Caddyfile against the real Caddy, in a throwaway
# container with the same image as deploy/Dockerfile.web. Needs Docker and curl.
#
#   deploy/check_caddy.sh [Caddyfile]
#
# /moon/* sent its one-day Cache-Control on 404s too, so a browser
# that asked for a globe image before it existed kept the 404 for a day.
set -euo pipefail

caddyfile=$(cd "$(dirname "${1:-$(dirname "$0")/Caddyfile}")" && pwd)/$(basename "${1:-Caddyfile}")
image=$(sed -n 's/^FROM \(caddy:[^ ]*\).*/\1/p' "$(dirname "$0")/Dockerfile.web")
work=$(mktemp -d)
name=lunar-check-caddy-$$
trap 'docker rm -f "$name" >/dev/null 2>&1; rm -rf "$work"' EXIT

mkdir -p "$work/moon" "$work/www"
echo image >"$work/moon/there.webp"
echo page >"$work/www/index.html"
chmod -R a+rX "$work"

docker run -d --name "$name" -p 127.0.0.1::80 \
	-v "$caddyfile:/etc/caddy/Caddyfile:ro" \
	-v "$work/moon:/srv/moon:ro" -v "$work/www:/srv/www:ro" "$image" >/dev/null
port=$(docker port "$name" 80/tcp | sed -n '1s/.*://p')

# Status and Cache-Control of a path on the frontend host, as "status|cache-control".
answer() {
	curl -s -o /dev/null -D - -H 'Host: lunar.luizfbm.win' "http://127.0.0.1:$port$1" |
		tr -d '\r' | awk 'NR==1 {status=$2} tolower($1)=="cache-control:" {sub(/^[^:]*: */, ""); cache=$0} END {print status "|" cache}'
}

for _ in $(seq 30); do
	[ "$(answer /moon/there.webp | cut -d'|' -f1)" = 200 ] && break
	sleep 0.5
done

failed=0
expect() {
	got=$(answer "$1")
	if [ "$got" = "$2" ]; then
		echo "ok    $1 -> $got"
	else
		echo "FAIL  $1 -> $got (expected $2)"
		failed=1
	fi
}

expect /moon/there.webp '200|public, max-age=86400'
expect '/moon/there.webp?v=4' '200|public, max-age=86400'
expect /moon/missing.webp '404|no-store'
expect '/moon/missing.webp?v=4' '404|no-store'
exit $failed
