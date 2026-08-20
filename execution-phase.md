# Execution Status

This is the current implementation index. The original detailed plan is retained in [docs/starter-MDs/execution-phase.md](docs/starter-MDs/execution-phase.md).

## Status Meaning

- **Complete:** repository objectives and exit criteria have evidence.
- **Repository complete:** code and local/container evidence pass, but production-host evidence remains.
- **In progress:** required implementation or evidence remains.

## Phases

| Phase | Scope | Status | Evidence |
|---:|---|---|---|
| 0 | Production-shape spike | Complete | [Goal and gates](docs/phases/phase-0-development-goal.md) |
| 1 | Foundation and contracts | Complete | [Summary](docs/phases/phase-1-completion-summary.md) |
| 2 | Database and durable state | Complete | [Summary](docs/phases/phase-2-completion-summary.md) |
| 3 | Security and authentication | Complete | [Summary](docs/phases/phase-3-completion-summary.md) |
| 4 | Host protocol and enrollment | Complete | [Summary](docs/phases/phase-4-completion-summary.md) |
| 5 | Codex connection lanes | Complete | [Summary](docs/phases/phase-5-completion-summary.md) |
| 6 | Git/worktree execution | Complete | [Summary](docs/phases/phase-6-completion-summary.md) |
| 7 | Task-to-pull-request workflow | Complete | [Summary](docs/phases/phase-7-completion-summary.md) |
| 8 | Owner dashboard | Complete | [Summary](docs/phases/phase-8-completion-summary.md) |
| 9 | Multi-agent planning and routing | Complete | [Summary](docs/phases/phase-9-completion-summary.md) |
| 10 | Review experience | Complete | [Summary](docs/phases/phase-10-completion-summary.md) |
| 11 | VPS deployment | Repository complete | [Summary](docs/phases/phase-11-completion-summary.md), [container drill](docs/phases/phase-11-containerized-drill.md) |
| 12 | Recovery basics | Complete | [Summary](docs/phases/phase-12-completion-summary.md) |
| 13 | Security hardening | Repository complete | [Summary](docs/phases/phase-13-completion-summary.md) |
| 14 | Beta, documentation, launch | In progress | [Launch readiness](docs/launch-readiness.md) |

## Phase 14 Objectives

Phase 14 prepares maxxy-me for dependable daily use:

- maintain one clear GitHub-facing README and focused operator docs;
- guide deployment choice, owner setup, GitHub authorization, host enrollment, Codex health, repository import, and the first task;
- run the beta scenario matrix through the product itself;
- launch only after every production gate has dated evidence.

The implementation and repository documentation are complete. Phase 14 remains in progress until the live beta and production drills in [docs/launch-readiness.md](docs/launch-readiness.md) pass.

## Standard Repository Gates

```bash
bun run lint
bun run typecheck
bun test
bun run build
bun run security:check
```

Production Compose must also render with required values and an immutable application image digest.

## Launch Decision

The project is not launch-ready merely because CI is green. Launch requires:

- repeated successful task-to-PR workflows using real Codex and GitHub authorization;
- requested-change, cancellation, failed validation, auth failure, conflict, and multi-lane scenarios;
- container replacement, PostgreSQL restart, full VPS reboot, and fresh-VPS rebuild;
- encrypted off-server backup and isolated restore;
- external security and port scans with no unresolved high-severity result or unapproved service;
- no routine database edits or interactive root shell work.

Record evidence in [docs/launch-readiness.md](docs/launch-readiness.md), then update Phase 14 to Complete only when every launch gate is Pass.
