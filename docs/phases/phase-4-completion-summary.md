# Phase 4 Completion Summary

Date: 2026-08-19
Branch: agent-orch-panel
Status: Completed

## Goal

Build the durable Maxxy coordination layer without starting Codex execution yet: owner-protected control-plane APIs, a task state-transition service, a Postgres-backed scheduler/queue, capacity-aware Codex connection leasing, and ordered replayable events.

## Achievements

- Added the Phase 4 control-plane API surface:
  - `GET /api/health`;
  - `GET /api/me`;
  - host listing, enrollment, revocation, and Codex connection setup/actions;
  - Codex capacity pool CRUD and capacity summary;
  - workspace listing, creation, read, and patch;
  - task listing, creation, read, start, cancel, and retry;
  - event listing and approval decision handling.
- Added `ControlPlaneRepository` for durable host, Codex connection, capacity pool, workspace, task, event, and approval operations.
- Added `TaskStateMachine` so task lifecycle changes flow through one validating transition service and emit events.
- Added `SchedulerService` backed by Postgres rows and leases:
  - marks dependency-resolved queued tasks as ready;
  - atomically claims eligible ready tasks with `FOR UPDATE SKIP LOCKED`;
  - assigns work to online, non-revoked hosts within host capacity;
  - selects workspace/task-allowed Codex pool members;
  - enforces per-connection and shared capacity-source limits;
  - creates task leases, Codex connection leases, and runtime attempts;
  - expires stale leases and recovers abandoned active tasks;
  - fails tasks assigned to revoked hosts;
  - avoids duplicate execution by checking active leases.
- Integrated the scheduler into the orchestrator worker with configurable poll interval and assignment limit.
- Exported the database handle, control-plane repository, scheduler, and task state machine from `@maxxy/database`.
- Reused Phase 3 owner/session/API-token security for the new control-plane routes with CSRF protection on unsafe session-authenticated requests and scoped API-token enforcement.
- Preserved unauthenticated host enrollment exchange by excluding `/api/hosts/exchange-enrollment` from the new owner-protected route matcher.
- Added Postgres-backed integration coverage for task transitions, scheduler assignment, dependency resolution, and revoked-host recovery.

## Verification

- `bun run typecheck` - passed.
- `bun run lint` - passed.
- `bun test` - passed with DB tests skipped locally when `TEST_DATABASE_URL` is unset: 7 pass, 11 skip.
- Compose-backed DB integration suite with `TEST_DATABASE_URL=postgres://maxxy:maxxy@postgres:5432/maxxy_me_phase4_check` - passed: 18 pass, 0 fail.
- Fresh smoke database `maxxy_me_phase4_api_smoke` was created and migrated from zero with `0000_phase0_spike.sql` and `0001_phase2_core.sql`.
- Live HTTP smoke on `127.0.0.1:3104` passed:
  - health check;
  - owner bootstrap and authenticated `/api/me`;
  - host enrollment and unauthenticated enrollment exchange;
  - Codex connection setup, list, reauthenticate, disable, and delete;
  - capacity summary, capacity pool create/list/patch;
  - workspace create/list/read/patch;
  - task create/list/read/start/cancel;
  - event listing with numeric ordered sequences;
  - approval decision with `approve_once`.
- `bun run build` - passed after restoring ownership of Docker-generated `apps/web/.next` files.
- `docker compose config --quiet` - passed.
- `docker compose build` - passed for `maxxy-me-web`, `maxxy-me-worker`, and `maxxy-me-migrate`.

## Handoff Notes

- Phase 4 intentionally stops at durable coordination. The scheduler creates assignments and leases but does not start Codex execution yet.
- The orchestrator worker now polls the scheduler. Tune `SCHEDULER_POLL_INTERVAL_MS` and `SCHEDULER_ASSIGNMENT_LIMIT` for local or deployment behavior.
- The scheduler assumes active host heartbeats and ready Codex connection statuses such as `ready_chatgpt`, `ready_api_key`, or `ready_enterprise_access_token`.
- Event rows are ordered per workspace using an advisory transaction lock and can be replayed from `/api/events?workspaceId=...&afterSequence=...`.
- Approval decisions must use the database contract values: `approve_once`, `approve_for_session`, `decline`, or `cancel`.
- Local Docker smoke runs may leave root-owned files in `apps/web/.next`; repair with a Docker `chown` before local builds if needed.
- The smoke databases `maxxy_me_phase4_check` and `maxxy_me_phase4_api_smoke` may remain in the local Compose Postgres container and can be dropped/recreated for future checks.
