#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_STAGING_DIR:?BACKUP_STAGING_DIR is required}"
: "${BACKUP_TARGET:?BACKUP_TARGET is required}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"

mkdir -p "${BACKUP_STAGING_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="${BACKUP_STAGING_DIR}/maxxy-me-${timestamp}.dump"
encrypted_file="${dump_file}.age"
checksum_file="${encrypted_file}.sha256"

pg_dump --format=custom --no-owner --no-acl --file="${dump_file}" "${DATABASE_URL}"
age --encrypt --recipients-file "${BACKUP_ENCRYPTION_KEY_FILE}" --output "${encrypted_file}" "${dump_file}"
sha256sum "${encrypted_file}" > "${checksum_file}"

echo "Backup artifact created: ${encrypted_file}"
echo "Upload target is configured as: ${BACKUP_TARGET}"
rm -f "${dump_file}"
