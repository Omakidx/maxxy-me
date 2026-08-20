#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_DUMP_FILE:?BACKUP_DUMP_FILE is required}"

pg_restore --list "${BACKUP_DUMP_FILE}" >/dev/null
pg_restore --clean --if-exists --no-owner --no-acl --dbname "${RESTORE_DATABASE_URL}" "${BACKUP_DUMP_FILE}"
echo "Restore check complete into isolated database"
