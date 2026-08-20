# Phase 11 Completion Summary

Date: 2026-08-20
Branch: agent-orch-panel
Status: Repository deliverables completed; live VPS exit gates require operator-run evidence

## Goal

Prepare maxxy-me for a single-VPS production deployment with Caddy, Docker Compose, PostgreSQL, web, worker, one-shot migrations, a native host-agent service, encrypted database backups, deployment locking, smoke checks, rollback metadata, and an executable fresh-VPS runbook.

## Achievements

- Hardened the base Compose stack with log rotation, tmpfs for app containers, configurable PostgreSQL credentials, application secrets, and private service exposure.
- Hardened the production Compose override with immutable application image digest usage, persistent host bind mounts for PostgreSQL and Caddy, no published PostgreSQL port, read-only application containers, and `no-new-privileges` security options.
- Hardened Caddy with request body limits, redacted structured access logs, security headers, long-lived WebSocket-friendly reverse-proxy timeouts, compression, and private reverse proxying to `web:3000`.
- Reworked `scripts/deploy-vps.sh` to acquire a deployment lock, validate rendered Compose config, record previous/current image digests, run pre-migration backup, pull the immutable image, run migrations, update services, smoke test the deployment, and record the last successful deploy.
- Reworked `scripts/backup-postgres.sh` to create custom-format PostgreSQL dumps, validate dump readability with `pg_restore --list`, encrypt with `age`, write checksums and a manifest, support `file://` backup targets, and clean unencrypted staging artifacts.
- Added `scripts/smoke-production.sh` for post-deploy health verification against the configured production URL.
- Added `scripts/restore-postgres-check.sh` for restoring a dump into an isolated database.
- Added `.env.production.example` and `.env.host.production.example` with production-only placeholders and separation between control-plane secrets and host-agent credentials.
- Added `docs/production-vps-runbook.md` covering OS hardening, DNS/TLS, service users, persistent directories, permissions, deployment, host-agent installation, backups, restore checks, and Phase 11 exit validation evidence.
- Preserved the systemd host-agent and backup timer/service placement under `deploy/systemd`.

## Verification Completed Locally

Completed successfully:

```bash
bun run lint
bun run typecheck
bun test
bun run build
MAXXY_SITE_ADDRESS=workspace.example.com APP_URL=https://workspace.example.com APP_SECRET=dummy-secret POSTGRES_PASSWORD=dummy-password GITHUB_WEBHOOK_SECRET=dummy-webhook APP_IMAGE_DIGEST=example.com/maxxy-me@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa docker compose -f compose.yaml -f compose.production.yaml config --quiet
```

## Exit Criteria Status

The repository-side Phase 11 deliverables are complete and locally validated. The following Phase 11 exit criteria cannot be truthfully marked passed from this local workspace alone because they require a real fresh VPS, public DNS/HTTPS, firewall validation, systemd reboot behavior, host enrollment, and backup restore evidence:

- Fresh VPS built from the documented procedure.
- Only SSH, HTTP, and HTTPS publicly reachable.
- PostgreSQL and Codex App Server not publicly exposed.
- Container replacement preserves durable state on the VPS.
- Full VPS reboot restores Caddy, web, worker, PostgreSQL, and host agent automatically.
- Active task state remains visible and host reconciliation completes after restart.
- Database backup restores successfully into an isolated environment using production backup artifacts.
- Full fresh-VPS recovery drill succeeds without restoring Codex or GitHub credentials from the general backup.

## Handoff Notes

- Run `docs/production-vps-runbook.md` on the target VPS to collect the missing exit evidence.
- The local shell did not expose `pg_dump`, `pg_restore`, or `age`, so the encrypted backup script was not run end to end locally. The runbook requires those tools on the VPS.
- `BACKUP_TARGET=file://...` is implemented for a verifiable local/off-server mounted target. Remote transfer targets such as rsync or object storage should be added with site-specific credentials and tested before production launch.
- `APP_IMAGE_DIGEST` must be an immutable registry digest, not a mutable tag.
- Do not place Codex credentials, GitHub push credentials, host tokens, or API keys in the Compose production environment file.
