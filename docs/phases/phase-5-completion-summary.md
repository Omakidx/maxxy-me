# Phase 5 Completion Summary

Date: 2026-08-19
Branch: agent-orch-panel
Status: Completed

## Goal

Build the persistent maxxy host agent: a native execution-side service that enrolls with the control plane, connects outbound over authenticated WebSockets, reports host/tool/Codex capacity health, enforces local workspace path boundaries, and maintains isolated file-backed Codex credential lanes.

## Achievements

- Added a shared host protocol contract in `@maxxy/contracts` for host hello, heartbeat, reconnect reports, command envelopes, and command results.
- Defined the full Phase 5 command-name surface: host health, repository clone/fetch, worktree create/remove, Codex connection lifecycle, Codex runtime/turn controls, generic command execution, Git status/diff/commit/push, and GitHub pull-request commands.
- Implemented host WebSocket authentication with header-only credentials: `Authorization: Bearer <host-token>` plus `x-maxxy-host-id`. Host auth tokens are never accepted through URL query parameters.
- Extended the web WebSocket gateway to accept owner and host connections, persist host hello/heartbeat state, record host heartbeat rows, update Codex connection health, write capacity snapshots, and append reconnect/command-result events.
- Added telemetry sanitization before persistence so token-like, secret-like, password, authorization, and auth-json fields are redacted if they appear in host telemetry.
- Built the host-agent CLI modes:
  - `start` for foreground service/runtime operation;
  - `enroll --server <url> --token <one-time-token>` for one-time host enrollment exchange;
  - `doctor` for local tool inventory checks;
  - `registry` for local non-secret registry inspection.
- Added host-agent configuration for control-plane URL, host identity, protected data directories, project/worktree roots, Codex/Git/GH binaries, command timeouts, output caps, command profiles, and explicit generic-command allowlisting.
- Added host registration and heartbeat payloads covering OS, architecture, hostname, Bun/Codex/Git/GH tool health, project root, worktree root, Codex accounts directory, sandbox/path restrictions, active run IDs, connection readiness, active lease counts, capacity, disk availability, and timestamps.
- Implemented reconnect behavior that reauthenticates the outbound WSS session, reports active local runs, preserves orphan policy by default, and resumes heartbeat publication.
- Added a `PathGuard` that rejects traversal, paths outside configured roots, arbitrary root-level execution targets, and unsafe worktree deletion. Worktree deletion requires a direct child of the configured worktree root plus a maxxy-owned marker file.
- Built the host-local Codex connection registry:
  - one protected `CODEX_HOME` directory per Codex connection;
  - `cli_auth_credentials_store = "file"` written per lane;
  - credential directories created mode `0700` and config files mode `0600`;
  - duplicate labels allowed while connection IDs remain unique;
  - capacity-source mapping retained per connection;
  - ChatGPT concurrency defaults to one lane;
  - removal blocked while active leases exist;
  - removed connections do not delete or alter other credential directories;
  - no shared or copied `auth.json` seed behavior.
- Implemented safe Phase 5 command handlers for host health, repository clone/fetch, worktree create/remove, Git status/diff, explicit-allowlist `command.run`, and Codex connection allocate/login/status/reauthenticate/disable/remove.
- Kept Git history mutations, GitHub pull-request mutations, and Codex runtime/turn process control as protocol-recognized but explicitly unsupported until the later approval-aware runtime phases.
- Reused the existing hardened non-root `maxxy-host` systemd service definition for production placement.

## Verification

- `bun run lint` - passed.
- `bun run typecheck` - passed.
- `bun test` - passed: 14 pass, 11 skipped DB-gated integration tests.
- `bun run start:host -- doctor` - passed and reported Bun, Codex, Git, and gh availability.
- `bun run build` - passed.
- `docker compose config --quiet` - passed.
- `docker compose build` - passed for `maxxy-me-web`, `maxxy-me-worker`, and `maxxy-me-migrate`.
- Final disposable Postgres smoke database `maxxy_phase5_smoke_final` was created, migrated, used, and dropped.
- Final live WebSocket smoke on `127.0.0.1:3105` passed:
  - owner bootstrap;
  - host enrollment creation;
  - unauthenticated enrollment exchange;
  - outbound host WebSocket using header-only auth;
  - `host.hello`, `host.heartbeat`, and `host.reconnect_report`;
  - host online/protocol/capacity persistence;
  - heartbeat row persistence with disk availability;
  - duplicate-label Codex connections updated independently;
  - capacity snapshot creation;
  - host connected/reconnect events;
  - telemetry redaction for token-like health/tool fields.

## Handoff Notes

- Start a development host with `bun run start:host -- start` after either setting `MAXXY_HOST_ID`/`MAXXY_HOST_TOKEN` or running `bun run start:host -- enroll --server <url> --token <one-time-token>`.
- Generic `command.run` is denied unless both the command profile and executable are explicitly configured. Use `MAXXY_ALLOWED_COMMANDS` for the executable allowlist.
- The host agent owns repository/worktree/Codex paths locally; web and worker containers still do not mount repository roots, Codex credentials, or GitHub push credentials.
- Phase 6 should replace the current explicit unsupported responses for `codex.runtime.start`, `codex.turn.*`, and later approval-aware Git/GitHub mutations with actual runtime execution.
- The registry stores a secret reference label only, not API keys or ChatGPT credentials. Codex may refresh each lane in place; maxxy must not overwrite refreshed lane credentials with old seed files.
- Local smoke databases used in this phase were dropped after verification.
