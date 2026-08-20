# Architecture

This document describes the implemented maxxy-me system. The longer documents in `docs/starter-MDs/` are design history and may describe future scope.

## System Boundary

maxxy-me is a private, single-owner control plane. The production shape is one VPS with a containerized control plane and one or more native execution hosts.

```text
Internet
  |
  v
Caddy (80/443)
  |
  +-- web: Next.js UI, auth, API, webhooks, WebSocket gateway
  +-- worker: scheduling, leases, recovery, reconciliation
  +-- migrate: one-shot database migrations
  +-- PostgreSQL: durable control-plane state

Execution host (the VPS can be the first host)
  +-- maxxy host agent, non-root systemd service
  +-- isolated Codex credential lanes
  +-- GitHub credentials
  +-- repository clones and task worktrees
  +-- project toolchains
```

The host agent opens an authenticated outbound WebSocket. No inbound host-agent, Codex, PostgreSQL, or Docker control port is public.

## Ownership

| Concern | Owner |
|---|---|
| Owner sessions, tasks, events, approvals, leases, PR metadata | PostgreSQL |
| HTTP, auth, APIs, webhooks, browser and host WebSockets | `apps/web` |
| Scheduling, dependency readiness, lease recovery | `apps/orchestrator` |
| Commands, Codex, Git, worktrees, host health | `apps/host-agent` |
| Repository and worktree files | Enrolled execution host |
| Pushed code and pull requests | GitHub |
| Codex and GitHub authentication | Isolated host credential directories |

## Task Lifecycle

```text
draft -> ready -> queued -> assigned -> claimed -> starting -> running
      -> validating -> pushing -> opening_pull_request -> awaiting_review
      -> completed
```

Tasks can also become blocked, cancelled, failed, or require changes. Every write task has its own branch and worktree. A runtime attempt records the selected host, Codex connection, capacity source, and runtime snapshot.

The scheduler chooses eligible work only when dependencies, ownership claims, host capacity, and Codex capacity allow it. Leases prevent duplicate concurrent ownership and are reconciled after interruption.

## Data and Event Rules

- Durable changes are committed before they are broadcast.
- Idempotency keys protect task creation, workflow commands, webhook deliveries, and pull-request creation paths.
- PostgreSQL is not exposed publicly and stores no raw Codex or GitHub credential stores.
- Web and worker containers are replaceable; PostgreSQL and explicit host paths are durable.
- Migration files are append-only once deployed.

## Trust Boundaries

The browser is unprivileged. It can request control-plane actions but cannot run shell commands, read host files, or receive long-lived execution credentials.

The control plane can schedule work but does not mount repositories, worktrees, credential stores, or the Docker socket.

The host agent is privileged only within its dedicated service account. It enforces:

- an explicit command deny list with deny-over-allow precedence;
- command profiles and executable allow lists;
- project and worktree path guards;
- execution timeouts and output limits;
- a filtered child-process environment;
- approval messages for sensitive workflow actions.

Agents can push a task branch and create or update a draft pull request. They cannot merge, push to the protected default branch, alter branch protection, or expose credentials to the browser.

## Codex Connections

Each Codex connection is an independent authentication and billing boundary with its own credential slot. Capacity pools route new attempts among healthy eligible connections. Existing threads remain attributed to the connection that created them; failover creates a new attempt instead of rewriting history.

ChatGPT included usage and API billing are distinct modes. Crossing into API billing requires explicit owner confirmation when that policy is enabled.

## Deployment and Recovery

Production uses `compose.yaml` plus `compose.production.yaml`:

- Caddy is the only application ingress.
- App images are selected by immutable digest.
- Web, worker, and migration containers are read-only with `no-new-privileges`.
- PostgreSQL, Caddy data, releases, projects, worktrees, and host state use explicit persistent paths.
- The native host service has no Docker group membership.

Deployments lock, validate Compose, back up PostgreSQL, migrate, replace services, and run a smoke check. Recovery uses lease reconciliation, host reconnect, encrypted database backup, and a documented fresh-VPS rebuild.

## Package Boundaries

Provider and privileged details stay behind packages:

- `@maxxy/contracts`: schemas and protocol messages.
- `@maxxy/database`: persistence, state transitions, scheduling, recovery.
- `@maxxy/codex-adapter`: Codex App Server protocol.
- `@maxxy/git`: branch, commit, and worktree operations.
- `@maxxy/github`: pull requests, checks, and webhook models.
- `@maxxy/security`: tokens, encryption, hashing, and redaction.
- `@maxxy/workspace-runtime`: execution command contracts.

See [user-flow.md](user-flow.md) for operator journeys and [docs/recovery.md](docs/recovery.md) for failure procedures.
