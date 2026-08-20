#!/usr/bin/env bash
set -euo pipefail

cd "${MAXXY_DEPLOY_DIR:-/opt/maxxy-me}"

: "${APP_IMAGE_DIGEST:?APP_IMAGE_DIGEST is required for production deployment}"
: "${APP_URL:?APP_URL is required}"
: "${DATABASE_URL:?DATABASE_URL is required for backup}"

compose=(docker compose -f compose.yaml -f compose.production.yaml)
lock_file=/tmp/maxxy-me-deploy.lock
release_dir=/var/lib/maxxy-me/releases
mkdir -p "${release_dir}"

exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "Another maxxy-me deployment is already running" >&2
  exit 1
fi

previous_digest=""
if [[ -f "${release_dir}/current-image" ]]; then
  previous_digest="$(cat "${release_dir}/current-image")"
fi
echo "${previous_digest}" > "${release_dir}/previous-image"
echo "${APP_IMAGE_DIGEST}" > "${release_dir}/current-image.pending"

"${compose[@]}" config --quiet

if [[ -x ./scripts/backup-postgres.sh ]] && [[ -n "$("${compose[@]}" ps --status running -q postgres)" ]]; then
  ./scripts/backup-postgres.sh
else
  echo "Pre-deploy backup skipped: no running PostgreSQL service"
fi

"${compose[@]}" pull
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d postgres web worker caddy
"${compose[@]}" ps

APP_URL="${APP_URL}" ./scripts/smoke-production.sh

mv "${release_dir}/current-image.pending" "${release_dir}/current-image"
date -u +%Y-%m-%dT%H:%M:%SZ > "${release_dir}/last-successful-deploy"
echo "Deployment complete: ${APP_IMAGE_DIGEST}"
