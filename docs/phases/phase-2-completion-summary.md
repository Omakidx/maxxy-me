# Phase 2 Completion Summary

Date: 2026-08-19
Branch: agent-orch-panel

## Goal

Implement the core data model and persistence foundation for the Maxxy orchestrator so future phases can rely on shared contracts, a fresh Postgres schema, repository APIs, deterministic migrations, development seed data, and automated checks for critical invariants.

## Achievements

- Added shared Phase 2 contracts in `@maxxy/contracts` for host, workspace, repository, task, Codex capacity, connection, lease, event, approval, PR, and API error payloads.
- Defined the task lifecycle transition map and `canTransitionTask` helper, including terminal states.
- Added the Drizzle Postgres schema for users/auth scaffolding, hosts, repositories, workspaces, agent profiles, Codex capacity sources/pools/connections, tasks, dependencies, leases, runtime attempts, worktrees, threads, turns, events, approvals, commands, Git operations, pull requests/checks, webhook deliveries, API tokens, audit logs, settings, and idempotency keys.
- Added SQL migrations:
  - `0000_phase0_spike.sql` preserves the Phase 0 migration and worker heartbeat tables.
  - `0001_phase2_core.sql` creates the core Phase 2 schema with foreign keys, status checks, unique constraints, partial lease indexes, event sequencing indexes, webhook idempotency, and lookup indexes.
- Replaced the Phase 0-only migration script with a reusable migration runner that records checksums in `schema_migrations` and refuses changed applied migrations.
- Added database client/repository modules for hosts, workspaces, tasks, events, approvals, PR/webhooks, audit logs, Codex capacity, Codex connections, runtime attempts, idempotency, seed data, lease recovery, and ready-connection lookup.
- Added development seed data for a local owner, host, repository, workspace, Codex capacity source/connection/pool, and default architect/backend/reviewer agent profiles.
- Added database utility scripts for migration, seed, connectivity/migration checks, and Drizzle config discovery.
- Updated CI to run a Postgres service, migrate/check the test database, and execute DB integration tests.
- Added tests for task transitions, migration-backed task status constraint presence, duplicate webhook delivery idempotency, and expired task lease recovery.

## Verification

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`
- `bun run db:generate`
- `docker compose config --quiet`
- `docker compose build`
- Fresh database verification inside Compose:
  - Created isolated database `maxxy_me_phase2_check`.
  - `docker compose run --rm --build -e DATABASE_URL=postgres://maxxy:maxxy@postgres:5432/maxxy_me_phase2_check -e RELEASE_VERSION=phase2-check migrate`
  - `docker compose run --rm --no-deps -e DATABASE_URL=postgres://maxxy:maxxy@postgres:5432/maxxy_me_phase2_check migrate bun scripts/db-check.ts`
  - `docker compose run --rm --no-deps -v /home/omakidx-desktop/Desktop/maxxy-me:/app -e DATABASE_URL=postgres://maxxy:maxxy@postgres:5432/maxxy_me_phase2_check -e APP_ENV=development migrate bun scripts/db-seed.ts`
  - `docker compose run --rm --no-deps -v /home/omakidx-desktop/Desktop/maxxy-me:/app -e TEST_DATABASE_URL=postgres://maxxy:maxxy@postgres:5432/maxxy_me_phase2_check migrate bun test`

## Handoff Notes

- Local Bun/Node commands in this environment need `PATH=/home/omakidx-desktop/.bun/bin:/home/omakidx-desktop/.nvm/versions/node/v24.19.0/bin:$PATH` prepended when run from Codex shells.
- Docker daemon commands should be run as `sg docker -c '...'` until the shell process picks up the user's Docker group membership.
- Local `bun test` skips database integration tests unless `TEST_DATABASE_URL` is set. CI now sets `TEST_DATABASE_URL` and runs migrations first.
- `scripts/db-seed.ts` refuses to run when `APP_ENV=production`.
- Migration files are checksum tracked. If an applied migration needs to change, add a new migration instead of modifying the existing one.
- The isolated verification database `maxxy_me_phase2_check` may remain in the local Compose Postgres container and can be dropped/recreated for future checks.
