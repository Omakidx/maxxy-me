# Phase 6 Completion Summary

Date: 2026-08-19
Branch: agent-orch-panel
Status: Completed

## Goal

Run one Codex task reliably on an enrolled host by replacing the Phase 5 protocol stubs with a stable Codex App Server adapter, normalized runtime events, approval round-trips, isolated connection startup checks, persisted runtime state, and scheduler capacity/failover guarantees.

## Achievements

- Added Phase 6 host protocol contracts for normalized runtime events, approval decision control messages, and Codex capacity signal names.
- Implemented `@maxxy/codex-adapter` with pinned tested Codex version metadata, internal-only raw JSONL protocol schemas, request IDs, process startup, JSONL framing, thread create/resume, turn start/steer/interrupt, approval resolution, terminal waiters, graceful shutdown, malformed-event failure handling, and process-crash disconnection events.
- Added fixture-only Codex App Server scenarios for normal completion, approval pause/resume, command failure, malformed output, process crash, interrupted turn, and resumed thread. The normal fixture writes `README.md` in a disposable working directory to prove an execution run can edit a repository path.
- Wired host-agent runtime commands: `codex.runtime.start`, `codex.turn.start`, `codex.turn.steer`, and `codex.turn.interrupt` now drive an adapter instance instead of returning unsupported responses.
- Added host runtime startup validation that rejects unknown, disabled, policy-blocked, expired, revoked, or over-capacity local Codex connections and refuses payloads containing raw token/secret/password/API-key/auth fields.
- Strengthened the host-local Codex connection registry so active runnable connections cannot share the same credential slot, credential directories must remain inside the configured accounts root, and runtime resolution returns a sanitized credential-lane record without secret references.
- Extended the web WebSocket gateway to persist `host.runtime_event` messages into events, threads, turns, commands, approvals, task status changes, and task-runtime attempt thread attribution.
- Serialized per-socket WebSocket message handling so ordered host JSONL/runtime events cannot race each other during persistence.
- Completed approval pause flow: host emits `approval.requested`, control plane persists and audits the approval, owner decision API broadcasts `control.approval_decision`, host routes the decision back into the active Codex runtime, and `approval.resolved` is persisted.
- Added telemetry sanitization to runtime event and approval payload persistence so token-like fields are redacted before storage.
- Added durable capacity signal events from host connection reports: `codex.capacity.observed`, `codex.connection.ready`, `codex.connection.authentication_required`, `codex.connection.policy_blocked`, `codex.capacity.limited`, `codex.capacity.cooldown_started`, and `codex.capacity.cooldown_ended`.
- Added `codex.connection.lease_released` event emission when stale Codex connection leases expire.
- Updated the scheduler to skip `limited` capacity sources as well as active cooldowns while selecting eligible pool members.
- Added DB-backed scheduler coverage proving limited connections are skipped when another pool member is eligible, and failover/retry creates a new attempt without rewriting the original thread's Codex connection ID.

## Verification

- `bun run lint` - passed.
- `bun run typecheck` - passed.
- `TEST_DATABASE_URL=postgres://maxxy:maxxy@127.0.0.1:55432/maxxy_phase6_all bun test` - passed: 39 pass, 0 fail.
- `bun test packages/codex-adapter/src/app-server.test.ts apps/host-agent/src/command-runner.test.ts apps/host-agent/src/registry.test.ts` - passed: 16 pass, 0 fail.
- `TEST_DATABASE_URL=postgres://maxxy:maxxy@127.0.0.1:55432/maxxy_phase6 bun test packages/database/src/scheduler.test.ts` - passed: 6 pass, 0 fail.
- `bun run build` - passed.
- `docker compose config --quiet` - passed.
- `docker compose build` - passed for `maxxy-me-web`, `maxxy-me-worker`, and `maxxy-me-migrate`.
- Local end-to-end Phase 6 smoke on `127.0.0.1:3106` passed using disposable database `maxxy_phase6_web`:
  - owner bootstrap;
  - host enrollment and token exchange;
  - host WebSocket authentication with header bearer token;
  - runtime `approval.requested` persistence with secret redaction;
  - owner approval decision API;
  - `control.approval_decision` broadcast back to host WebSocket;
  - `approval.resolved`, command start/output/completion, and turn completion persistence;
  - task moved to `validating`;
  - thread and turn marked `completed`;
  - approval decision audit row recorded.

## Handoff Notes

- The live Codex App Server launch path defaults to `CODEX_BINARY` plus `CODEX_APP_SERVER_ARGS` (`codex app-server` by default). Fixture scenarios are test-only through `fixtureScenario` payloads.
- Raw Codex protocol schemas live in `packages/codex-adapter/src/internal-raw.ts` and are intentionally not exported from the package index.
- Host runtime payloads must reference a registered Codex connection ID and must not carry raw credentials. Credential material stays in the per-connection `CODEX_HOME` lane.
- Runtime events are ordered per WebSocket connection in the web process. If a later worker adds replay/offline buffering, preserve this ordering guarantee when flushing events.
- The scheduler still creates fresh task-runtime attempts on assignment; failover is represented by append-only attempts and preserved thread attribution rather than rewriting prior attempts.
- Git history mutation, GitHub push, and pull-request creation remain outside Phase 6 runtime execution and should be implemented through the later approval-aware workflow phases.
- Disposable smoke databases used in this phase were `maxxy_phase6`, `maxxy_phase6_web`, and `maxxy_phase6_all`; the disposable Postgres container was used only for verification.
