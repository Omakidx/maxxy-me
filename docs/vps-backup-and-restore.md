# VPS Backup and Restore

The production backup is an encrypted PostgreSQL custom-format dump copied off the VPS. Repository code remains in GitHub; project clones and worktrees are host state, not part of the database backup.

## What to Back Up

- encrypted PostgreSQL dumps, checksum, and manifest;
- deployment release metadata;
- separately managed TLS and infrastructure configuration needed to rebuild.

Do not include Codex credential lanes, GitHub push credentials, host tokens, owner sessions, API keys, SSH private keys, or unencrypted database dumps in general backups.

## Configure

Install `pg_dump`, `pg_restore`, `age`, and an off-server transfer mechanism. Store only age recipients on the VPS; keep the decryption identity offline.

Set these in root-readable `/etc/maxxy-me/backup.env`:

```text
POSTGRES_USER=maxxy
POSTGRES_DB=maxxy_me
BACKUP_STAGING_DIR=/var/lib/maxxy-me/backup-staging
BACKUP_TARGET=file:///mnt/offsite/maxxy-me
BACKUP_ENCRYPTION_KEY_FILE=/etc/maxxy-me/backup-age-recipients.txt
BACKUP_USE_COMPOSE=true
```

`BACKUP_USE_COMPOSE=true` runs `pg_dump` inside the private PostgreSQL container and streams the dump to encrypted host staging. Direct backup remains available with `BACKUP_USE_COMPOSE=false` and `DATABASE_URL`.

`file://` is implemented. An `rsync://` or `ssh://` value currently leaves the artifact in staging for site-specific transfer tooling; do not claim off-server backup success until transfer and retention are verified.

## Install Timer

```bash
sudo install -m 0644 deploy/systemd/maxxy-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/maxxy-backup.timer /etc/systemd/system/
sudo chmod 0600 /etc/maxxy-me/backup.env
sudo systemctl daemon-reload
sudo systemctl enable --now maxxy-backup.timer
sudo systemctl start maxxy-backup.service
```

Check `systemctl status maxxy-backup.timer` and `journalctl -u maxxy-backup.service`.

## Validate an Artifact

On the restore machine:

```bash
sha256sum --check maxxy-me-<timestamp>.dump.age.sha256
age --decrypt \
  --identity /secure/offline/maxxy-backup-identity.txt \
  --output /tmp/maxxy-me-restore.dump \
  maxxy-me-<timestamp>.dump.age
pg_restore --list /tmp/maxxy-me-restore.dump
```

Keep the decrypted dump on encrypted temporary storage and remove it after the drill.

## Isolated Restore Drill

Create an empty non-production database and run:

```bash
RESTORE_DATABASE_URL=postgres://maxxy:<password>@127.0.0.1:5432/maxxy_restore_check \
BACKUP_DUMP_FILE=/tmp/maxxy-me-restore.dump \
./scripts/restore-postgres-check.sh
```

Then run application database checks against the restored database and record:

- artifact timestamp and checksum;
- release commit/image digest;
- restore start and finish time;
- migration count and application health;
- confirmation that credential stores were absent;
- operator and cleanup result.

## Production Recovery

Stop web and worker before replacing production data. Take a final snapshot when safe, restore into a new database or volume first, verify it, then switch the application. Preserve the failed database until the incident is closed.

Never use the production database as the first target of a restore drill.

## Retention

Keep a documented daily, weekly, and monthly retention policy appropriate to personal recovery needs. Test the oldest retained format supported by the current release at least quarterly.

Launch requires a successful encrypted off-server backup and isolated restore using production-shaped artifacts.
