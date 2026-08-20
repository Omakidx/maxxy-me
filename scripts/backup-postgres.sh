#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_STAGING_DIR:=/var/lib/maxxy-me/backup-staging}"
: "${BACKUP_TARGET:?BACKUP_TARGET is required}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"

mkdir -p "${BACKUP_STAGING_DIR}"
find "${BACKUP_STAGING_DIR}" -type f -mtime +2 -delete

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="${BACKUP_STAGING_DIR}/maxxy-me-${timestamp}.dump"
encrypted_file="${dump_file}.age"
checksum_file="${encrypted_file}.sha256"
manifest_file="${encrypted_file}.manifest.json"

pg_dump --format=custom --no-owner --no-acl --file="${dump_file}" "${DATABASE_URL}"
pg_restore --list "${dump_file}" >/dev/null
age --encrypt --recipients-file "${BACKUP_ENCRYPTION_KEY_FILE}" --output "${encrypted_file}" "${dump_file}"
sha256sum "${encrypted_file}" > "${checksum_file}"

size_bytes="$(wc -c < "${encrypted_file}")"
cat > "${manifest_file}" <<JSON
{
  "createdAt": "${timestamp}",
  "artifact": "$(basename "${encrypted_file}")",
  "checksumFile": "$(basename "${checksum_file}")",
  "sizeBytes": ${size_bytes},
  "format": "pg_dump custom encrypted with age"
}
JSON

case "${BACKUP_TARGET}" in
  file://*)
    target_dir="${BACKUP_TARGET#file://}"
    mkdir -p "${target_dir}"
    cp "${encrypted_file}" "${checksum_file}" "${manifest_file}" "${target_dir}/"
    ;;
  rsync://*|ssh://*)
    echo "BACKUP_TARGET ${BACKUP_TARGET} requires site-specific transfer tooling; artifact left in staging" >&2
    ;;
  *)
    echo "Unsupported BACKUP_TARGET: ${BACKUP_TARGET}" >&2
    exit 1
    ;;
esac

rm -f "${dump_file}"
echo "Backup complete: ${encrypted_file}"
