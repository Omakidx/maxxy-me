# Phase 11 Containerized VPS Drill

Date: 2026-08-20
Environment: local Docker Compose project `maxxy-vps-drill`

## Scope

This drill simulates the single-VPS Compose control plane in isolated Docker state. It verifies production-image build, production Compose rendering, fresh database migration, Caddy-to-web health, private PostgreSQL exposure, container replacement, simulated stack reboot, and logical database restore.

It does not prove public DNS, public TLS, cloud firewall rules, true systemd boot behavior, native host-agent enrollment, Codex runtime on a VPS service user, or a full fresh-VPS recovery drill. Those remain real-VPS Phase 11 exit evidence.

## Commands Run

```bash
sg docker -c 'docker build -t maxxy-me-drill:phase11 .'
MAXXY_SITE_ADDRESS=:80 APP_URL=http://127.0.0.1:18080 APP_SECRET=dummy-secret POSTGRES_PASSWORD=dummy-password GITHUB_WEBHOOK_SECRET=dummy-webhook APP_IMAGE_DIGEST=maxxy-me-drill:phase11 sg docker -c 'docker compose -p maxxy-vps-drill -f compose.yaml -f compose.production.yaml -f /tmp/maxxy-drill.override.yaml config --quiet'
MAXXY_SITE_ADDRESS=:80 APP_URL=http://127.0.0.1:18080 APP_SECRET=dummy-secret POSTGRES_PASSWORD=dummy-password GITHUB_WEBHOOK_SECRET=dummy-webhook APP_IMAGE_DIGEST=maxxy-me-drill:phase11 sg docker -c 'docker compose -p maxxy-vps-drill -f compose.yaml -f compose.production.yaml -f /tmp/maxxy-drill.override.yaml up -d postgres migrate web worker caddy'
APP_URL=http://127.0.0.1:18080 ./scripts/smoke-production.sh
MAXXY_SITE_ADDRESS=:80 APP_URL=http://127.0.0.1:18080 APP_SECRET=dummy-secret POSTGRES_PASSWORD=dummy-password GITHUB_WEBHOOK_SECRET=dummy-webhook APP_IMAGE_DIGEST=maxxy-me-drill:phase11 sg docker -c 'docker compose -p maxxy-vps-drill -f compose.yaml -f compose.production.yaml -f /tmp/maxxy-drill.override.yaml up -d --force-recreate web worker caddy'
APP_URL=http://127.0.0.1:18080 ./scripts/smoke-production.sh
MAXXY_SITE_ADDRESS=:80 APP_URL=http://127.0.0.1:18080 APP_SECRET=dummy-secret POSTGRES_PASSWORD=dummy-password GITHUB_WEBHOOK_SECRET=dummy-webhook APP_IMAGE_DIGEST=maxxy-me-drill:phase11 sg docker -c 'docker compose -p maxxy-vps-drill -f compose.yaml -f compose.production.yaml -f /tmp/maxxy-drill.override.yaml stop && docker compose -p maxxy-vps-drill -f compose.yaml -f compose.production.yaml -f /tmp/maxxy-drill.override.yaml up -d postgres migrate web worker caddy'
APP_URL=http://127.0.0.1:18080 ./scripts/smoke-production.sh
sg docker -c 'docker exec maxxy-vps-drill-postgres-1 sh -lc "pg_dump -U maxxy -d maxxy_me --format=custom --no-owner --no-acl --file=/tmp/maxxy-drill.dump && dropdb -U maxxy --if-exists maxxy_restore_check && createdb -U maxxy maxxy_restore_check && pg_restore -U maxxy --dbname=maxxy_restore_check --no-owner --no-acl /tmp/maxxy-drill.dump && psql -U maxxy -d maxxy_restore_check -Atc "select count(*) from schema_migrations;""'
```

## Results

- Local production image build passed.
- Rendered production Compose config passed.
- Fresh isolated stack started successfully.
- Migrations applied from zero; `schema_migrations` count was `3`.
- Caddy health smoke passed at `http://127.0.0.1:18080/health`.
- Postgres had no host port mapping; Caddy alone published `18080 -> 80`.
- Forced web/worker/Caddy replacement preserved database state; smoke passed after startup settled.
- Full stack stop/start simulated reboot restored Postgres, migration, web, worker, and Caddy; smoke passed and migration state remained visible.
- Logical custom-format dump restored into isolated database `maxxy_restore_check`; restored migration count was `3`.

## Remaining Real-VPS Evidence

- Public DNS and HTTPS certificate validation.
- HTTP-to-HTTPS redirect on ports 80/443.
- Firewall scan showing only SSH, HTTP, and HTTPS.
- Native systemd host-agent startup after VPS reboot.
- Host enrollment over production WSS.
- Codex health check under the `maxxy-host` user.
- Encrypted off-server backup transfer with production credentials.
- Full fresh-VPS recovery drill without restoring Codex or GitHub credentials.
