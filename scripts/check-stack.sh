#!/bin/sh
# Proves a running container stack answers through the web proxy as the seeded
# demo user, not merely that its processes are alive.
#
# Usage: scripts/check-stack.sh [base-url]   (default http://localhost:8080)
set -u

base="${1:-http://localhost:${WEB_PORT:-8080}}"
# The seeded demo user that Demo:UserId names in the API's appsettings.json.
demo_user="${DEMO_USER_ID:-10000000-0000-4000-8000-000000030001}"

fail() {
  echo "check-stack: FAIL: $1" >&2
  exit 1
}

# Prints the response body, then the status code on its own last line.
fetch() {
  curl -s --max-time 10 -w '\n%{http_code}' "$base$1"
}

status_of() { printf '%s\n' "$1" | tail -n 1; }
body_of() { printf '%s\n' "$1" | sed '$d'; }

response=$(fetch /api/health)
code=$(status_of "$response")
[ "$code" = 200 ] || fail "GET /api/health through the proxy returned $code, expected 200"
echo "check-stack: ok: /api/health through the proxy"

response=$(fetch /api/current-user)
code=$(status_of "$response")
[ "$code" = 200 ] || fail "GET /api/current-user returned $code, expected 200 as the demo user"
body_of "$response" | grep -q "\"userId\":\"$demo_user\"" ||
  fail "GET /api/current-user did not identify the seeded demo user $demo_user"
echo "check-stack: ok: /api/current-user is the seeded demo user"

response=$(fetch /)
code=$(status_of "$response")
[ "$code" = 200 ] || fail "GET / returned $code, expected 200"
body_of "$response" | grep -q '<app-root' || fail "GET / did not serve the application shell"
echo "check-stack: ok: / serves the application shell"

echo "check-stack: passed against $base"
