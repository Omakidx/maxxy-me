# Phase 7 Completion Summary

Date: 2026-08-19
Branch: agent-orch-panel
Status: Completed

## Goal

Complete the first true vertical slice: an assigned Maxxy task is claimed by a host, prepared from a registered repository, executed in an isolated branch worktree, validated, committed, pushed, opened as a draft GitHub pull request, and then synchronized through GitHub webhook events without allowing agents to merge their own work.

## Achievements

- Added git helper APIs in `@maxxy/git` for Maxxy branch naming, Phase 7 worktree paths, changed-file parsing, Git remote normalization, and protected branch detection.
- Added GitHub helper APIs in `@maxxy/github` for HMAC SHA-256 webhook verification, draft PR body generation, and normalized pull request/review/check webhook payloads.
- Extended the host protocol with `repository.prepare` and `git.validate` command names.
- Implemented host-side repository preparation: clone existing local repos when missing, verify the configured remote URL, fetch/prune the base remote, detect the default branch, record the base SHA, and report clean-state status.
- Implemented Phase 7 worktree lifecycle commands on the host: create one branch/worktree per task from the intended base ref, reject existing worktree paths, reject protected branch names, mark Maxxy-owned worktrees, and allow nested workspace/task worktree cleanup.
- Implemented host git commands for status, diff, whitespace validation, commit, and non-force branch push. Protected branches and force pushes are rejected.
- Implemented host PR creation through the local `gh` CLI using draft pull requests and structured metadata from the web workflow.
- Added a web Phase 7 workflow dispatcher that claims assigned tasks, records branch/base/worktree metadata, starts the Codex runtime in the worktree, waits for terminal completion, runs validation, tracks changed files, commits, pushes, opens a draft PR, releases leases, and preserves dirty worktrees on failure.
- Wired web websocket command correlation so the control plane can send `control.command` messages to connected hosts and resolve matching `host.command_result` responses.
- Triggered Phase 7 dispatch from host hello and heartbeat messages so assigned tasks move automatically once an enrolled host is online.
- Added GitHub webhook endpoint `/api/github/webhooks` with raw-body signature verification, delivery dedupe, PR opened/synchronized/closed/merged sync, review status sync, and check run/suite sync.
- Enforced the user-controlled merge boundary in Phase 7: agents can create/update/push PR branches through host commands, but there is no merge command path and force/protected branch operations are rejected.
- Added host lifecycle tests using a real local bare Git remote and a fake `gh` executable to prove clone, worktree create, validate, commit, push, and draft PR command behavior.
- Added a database-gated Phase 7 workflow integration test proving assigned task claim through draft PR persistence, git operation records, worktree row creation, changed-file tracking, and lease release.

## Verification

- `bun run lint` - passed.
- `bun run typecheck` - passed.
- `bun test` - passed: 33 pass, 14 skip, 0 fail. Database-gated tests skip without `TEST_DATABASE_URL`.
- `TEST_DATABASE_URL=postgres://maxxy:maxxy@127.0.0.1:55437/maxxy_phase7 bun test apps/web/src/phase7-workflow.test.ts` - passed: 1 pass, 0 fail, using a disposable Postgres container.
- `bun run build` - passed.
- `docker compose config --quiet` - passed.
- `docker compose build` - passed for `maxxy-me-web`, `maxxy-me-worker`, and `maxxy-me-migrate`.

## Handoff Notes

- Phase 7 branch names are generated as `maxxy/<task-id>/<agent-role>` and worktrees as `<worktree-root>/<workspace-id>/<task-id>-<agent-role>` through `@maxxy/git` helpers.
- The control-plane GitHub App shape is represented by webhook verification/sync and PR metadata helpers; actual PR creation/push is host-driven through existing local git and `gh` credentials.
- `GITHUB_WEBHOOK_SECRET` must be set for `/api/github/webhooks`; unsigned or invalid deliveries are persisted as unverified and rejected with `401`.
- The workflow preserves worktrees as `preserved` and `dirty=true` when a task fails after worktree creation, so another agent can inspect or recover the state.
- Validation currently always runs `git diff --check`, plus any workspace `validation_profile.commands` via host `command.run` in the task worktree.
- User-controlled merge remains intentional: there is no Phase 7 command that merges PRs, deletes the default branch, force-pushes, or bypasses review.
- The DB-backed Phase 7 integration test is gated on `TEST_DATABASE_URL`; local `bun test` skips it unless a Postgres URL is supplied.
