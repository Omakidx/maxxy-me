#!/usr/bin/env bash
set -euo pipefail

cd /opt/maxxy-me

if [[ -z "${APP_IMAGE_DIGEST:-}" ]]; then
  echo "APP_IMAGE_DIGEST is required for production deployment" >&2
  exit 1
fi

lock_file=/tmp/maxxy-me-deploy.lock
exec 9>"${lock_file}"
flock -n 9

docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml pull
docker compose -f compose.yaml -f compose.production.yaml run --rm migrate
docker compose -f compose.yaml -f compose.production.yaml up -d web worker caddy
docker compose -f compose.yaml -f compose.production.yaml ps
