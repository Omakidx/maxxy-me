#!/usr/bin/env bash
set -euo pipefail

: "${APP_URL:?APP_URL is required}"

health_url="${APP_URL%/}/health"
http_code="$(curl --silent --show-error --location --max-time 20 --output /tmp/maxxy-health.json --write-out '%{http_code}' "${health_url}")"
if [[ "${http_code}" != "200" ]]; then
  echo "Health check failed with HTTP ${http_code}" >&2
  cat /tmp/maxxy-health.json >&2 || true
  exit 1
fi

if ! grep -q '"ok":true' /tmp/maxxy-health.json; then
  echo "Health response did not report ok=true" >&2
  cat /tmp/maxxy-health.json >&2
  exit 1
fi

echo "Production smoke passed: ${health_url}"
