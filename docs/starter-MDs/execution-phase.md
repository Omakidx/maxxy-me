# maxxy-me Execution Phase

## 1. Purpose

This document defines the complete implementation order for **maxxy-me**, from an empty repository to a production-ready personal Codex workspace with isolated multi-account capacity routing.

It answers four questions:

1. What must be built first?
2. Which features depend on earlier work?
3. What is required before moving to the next phase?
4. Which configuration variables and secrets must be provided?

The plan is intentionally ordered around risk. The highest-risk assumptions—single-VPS deployment, Bun container packaging, PostgreSQL persistence, reverse-proxy WebSockets, Codex process control, Git worktrees, and GitHub pull requests—are validated before significant dashboard polish.

---

## 2. Final Deployment Decision

## 2.1 One VPS hosts the complete production system

The primary production topology is a single persistent Linux VPS. It hosts:

- the Caddy reverse proxy and automatic TLS endpoint;
- the maxxy-me web dashboard;
- the authenticated HTTP API;
- browser and host-agent WebSocket gateways;
- the scheduler and orchestration worker;
- PostgreSQL and all durable control-plane state;
- database migrations;
- GitHub webhook handling;
- the maxxy host agent;
- Codex App Server processes and isolated Codex credential lanes;
- Git repositories, branches, and worktrees;
- Git and GitHub push credentials;
- project runtimes, compilers, and validation toolchains;
- local operational logs and backup staging.

The deployment keeps control-plane and execution-plane responsibilities separate even though they share one server. This preserves clear process, credential, network, and filesystem boundaries and allows an execution host to move to another machine later without redesigning the protocol.

```text
Internet
   │
   │ HTTPS / WSS on 443
   ▼
Custom domain
   │
   ▼
Single production VPS
├── Caddy reverse proxy
│   └── TLS, HTTPS redirect, WebSocket proxying
├── Docker Compose application network
│   ├── web container
│   ├── worker container
│   ├── PostgreSQL container
│   └── one-shot migration container
├── maxxy-host systemd service
│   ├── Codex connection manager
│   ├── isolated credential lanes
│   ├── Codex App Server child processes
│   ├── Git repositories and worktrees
│   └── project toolchains
└── backup systemd timer
    └── encrypted off-server backup target
```

## 2.2 Process placement

| Component | Placement | Reason |
|---|---|---|
| Caddy | Docker Compose | Owns ports 80/443, TLS certificates, HTTPS redirects, and reverse proxying |
| Web | Docker Compose | Reproducible Next.js/Bun runtime and isolated deployment lifecycle |
| Worker | Docker Compose | Independent restart and resource limits for scheduling work |
| PostgreSQL | Docker Compose with a dedicated persistent volume | Private database network and explicit backup/upgrade lifecycle |
| Migrations | One-shot container using the release image | Runs exactly once before web and worker replacement |
| Host agent | Native non-root systemd service | Needs controlled access to Git, Codex, worktrees, and host toolchains without Docker-socket access |
| Codex processes | Children of the host-agent service | Preserves connection-specific environments, process cancellation, and audit ownership |
| Backup job | systemd service and timer | Runs independently of application containers and copies encrypted backups off the VPS |

The host agent must not receive the Docker socket. The web and worker containers must not receive repository, worktree, Codex credential, or Git push-credential mounts.

## 2.3 Persistent filesystem layout

Use explicit host paths rather than anonymous runtime state:

```text
/opt/maxxy-me/
├── compose.yaml
├── compose.production.yaml
├── Caddyfile
├── env/
│   └── production.env          # root-owned, mode 0600
└── releases/                   # optional deployment metadata

/var/lib/maxxy-me/
├── postgres/                   # PostgreSQL data volume or bind-mount target
├── caddy-data/                 # certificates and ACME state
├── host-agent/
│   ├── state/
│   ├── codex-accounts/         # mode 0700; credential files mode 0600
│   └── command-state/
├── projects/                   # main repository clones
├── worktrees/                  # per-task worktrees
└── backup-staging/             # temporary, size-limited, cleaned after upload

/var/log/maxxy-me/              # only if journald/container logs are insufficient
```

Data ownership must be assigned to dedicated service users and numeric container UIDs before first startup. Do not run the host agent or Codex as root.

PostgreSQL is the source of truth for control-plane state. GitHub is the durable source for pushed branches and pull requests. The VPS preserves active or dirty worktrees until they are reconciled, but unpushed worktrees are not a substitute for off-server backup.

The general backup job must exclude live Codex credentials and GitHub credential stores. A rebuilt VPS should reauthenticate those credentials instead of restoring them from a broad infrastructure backup.

## 2.4 PostgreSQL is the production database

Use:

```text
Development: PostgreSQL
Testing: PostgreSQL test database or isolated schemas
Production: self-hosted PostgreSQL on the VPS
ORM: Drizzle ORM
Driver: postgres.js or another Bun-compatible PostgreSQL driver
```

Production rules:

- pin a supported PostgreSQL major version;
- expose port 5432 only to the private Compose network;
- use a dedicated application role that is not a superuser;
- use a separate migration role if elevated DDL privileges are required;
- store data in a named volume or validated bind mount under `/var/lib/maxxy-me/postgres`;
- configure container health checks and restart policy;
- create scheduled logical backups and test `pg_restore` into an isolated database;
- define a deliberate major-version upgrade procedure.

SQLite may be used only for isolated fixtures or a future embedded edition. It is not the VPS production database.

## 2.5 Container and native-runtime strategy

Use Docker Compose for the control plane because it supports a complete multi-container application on a single server.

Repository deployment files:

```text
Dockerfile
compose.yaml
compose.production.yaml
Caddyfile
.dockerignore
scripts/deploy-vps.sh
scripts/backup-postgres.sh
deploy/systemd/maxxy-host.service
deploy/systemd/maxxy-backup.service
deploy/systemd/maxxy-backup.timer
```

The shared application image contains:

- Bun;
- the built Next.js application;
- the orchestration worker;
- Drizzle migrations;
- required certificates and runtime utilities.

Use the same immutable image digest for web, worker, and migration jobs, with different startup commands. The native host agent uses a pinned packaged binary or a checked-out release with a pinned Bun runtime.

## 2.6 Network exposure

Public inbound ports:

```text
22/tcp   SSH administration, restricted by key and source policy
80/tcp   ACME challenge and redirect to HTTPS
443/tcp  Dashboard, API, GitHub webhooks, and WebSockets
```

Do not publish PostgreSQL, Bun development ports, Codex App Server, Docker API, or host-agent control ports to the internet.

Caddy is the only public application entry point. It proxies the web container, preserves upgrade headers for WebSockets, sets trusted forwarding headers, and applies request-size and timeout policy. Caddy's data directory must persist so certificate state survives container replacement.

## 2.7 Single-server failure boundary

One VPS is simple and appropriate for the first personal deployment, but it is one failure and maintenance boundary. A VPS outage stops the dashboard, scheduler, database, and local Codex execution together.

Mitigations:

- push completed task branches to GitHub promptly;
- copy encrypted database and configuration backups off the VPS;
- monitor disk, memory, database health, container restarts, host-agent health, and certificate expiry;
- use automatic service restart after reboot;
- test a full restore onto a fresh VPS;
- keep infrastructure definitions and recovery instructions in Git.

High availability, database replication, and a second execution host are later extensions, not version-one requirements.

---

## 3. System Delivery Priorities

The implementation priorities are:

### Priority 0 — Prove the platform

Confirm the VPS can run the Compose stack, persist PostgreSQL and Caddy data, execute migrations, run the native host agent, start Codex, and maintain authenticated WebSocket connections through the reverse proxy.

### Priority 1 — Prove one complete agent task

Before building a complex dashboard, prove this exact path:

```text
Create task
→ assign execution host
→ create worktree
→ start Codex
→ edit files
→ run validation
→ push branch
→ open GitHub pull request
→ display result
```

### Priority 2 — Make the workflow recoverable

Persist every important state transition so container replacement, service restart, or VPS reboot does not lose task ownership, events, approvals, or pull-request links.

### Priority 3 — Add concurrency safely

Only after one task works reliably should maxxy-me support several isolated Codex connections, account-aware capacity leases, parallel agents, dependency graphs, parallel worktrees, and per-host capacity.

### Priority 4 — Improve the dashboard

Advanced visual polish, Monaco, terminal emulation, graphs, animations, and desktop packaging come after the execution path is reliable.

---

## 4. Implementation Strategy

Build maxxy-me as a sequence of vertical slices.

Do not build all database tables, all screens, or all agent roles at once.

The first usable vertical slice should support:

- one owner;
- one workspace;
- one execution host;
- one GitHub repository;
- one backend-style Codex agent;
- one task;
- one branch;
- one worktree;
- one pull request;
- one user review.

The next vertical slice adds a second authorized Codex connection and proves that two independent task attempts can be attributed, leased, and routed without sharing a credential store.

After that works, generalize the implementation.

---

# Phase 0 — Architecture Lock and VPS Risk Spike

## Objective

Prove that the chosen deployment platform and runtime combination works before building product features.

## Work items

### 0.1 Confirm architecture decisions

Lock these decisions:

- Bun monorepo.
- Next.js App Router.
- TypeScript strict mode.
- One persistent Linux VPS for production.
- Docker Compose for Caddy, web, worker, PostgreSQL, and one-shot migrations.
- Native non-root systemd service for the host agent and Codex child processes.
- One web container and one worker container.
- Persistent host paths for PostgreSQL, Caddy, repositories, worktrees, and host-agent state.
- Off-server encrypted backups.
- Codex-only agent provider.
- Multiple authorized Codex connections exposed as a logical capacity pool.
- Separate host-local credential namespace per connection.
- The production VPS enrolled as the first execution host.
- GitHub pull requests as the review boundary.
- One branch and worktree per write task.

### 0.2 Create a deployment spike

Build a temporary minimal application containing:

- a Bun HTTP server;
- a minimal Next.js page;
- a `/health` endpoint;
- a WebSocket endpoint with heartbeat;
- a worker loop;
- a Postgres connection;
- one test migration;
- a release command;
- structured logs.

### 0.3 Deploy the spike to a disposable VPS

Validate:

- Docker image builds successfully.
- Docker Compose starts Caddy, web, worker, and PostgreSQL.
- Web process listens only on the private application network.
- Worker starts independently.
- One-shot migration container runs and exits successfully.
- PostgreSQL is reachable internally and is not published publicly.
- Caddy obtains or loads TLS state from a persistent directory.
- WebSocket remains connected through Caddy when heartbeat frames are sent.
- The native host-agent systemd service enrolls and reconnects after restart.
- A Codex smoke task can start under the non-root service account.
- Repositories and worktrees persist across application-container replacement.
- Deploy rollback works with a previous immutable image tag or digest.
- VPS reboot does not corrupt database, task, or credential-lane state.

### 0.4 Record the tested deployment method

Add:

```text
Dockerfile
compose.yaml
compose.production.yaml
Caddyfile
.dockerignore
scripts/release.ts
scripts/deploy-vps.sh
scripts/backup-postgres.sh
deploy/systemd/maxxy-host.service
deploy/systemd/maxxy-backup.service
deploy/systemd/maxxy-backup.timer
```

Pin:

- Bun version;
- Node compatibility version if required by Next.js tooling;
- base image version;
- Postgres driver version.

## Deliverables

- Working single-VPS spike.
- Documented build and release commands.
- Verified database migration.
- Verified WSS connection.
- Confirmed DNS, TLS, reverse-proxy, and firewall process.
- Confirmed host-agent and Codex systemd process.
- Tested backup and restore command.
- Initial deployment checklist.

## Exit criteria

Do not continue until:

- the Compose stack deploys twice successfully;
- a database migration succeeds;
- a rollback is tested;
- the web and worker processes both boot;
- the WebSocket reconnects after web-container replacement;
- the host agent and containers return after a VPS reboot;
- a database dump restores into an isolated PostgreSQL instance.

---

# Phase 1 — Repository and Monorepo Foundation

## Objective

Create the permanent project structure and development standards.

## Work items

### 1.1 Create repository

Create the GitHub repository:

```text
maxxy-me
```

Protect the default branch:

- require pull requests;
- block force pushes;
- block branch deletion;
- require checks before merge;
- require conversation resolution;
- disallow agents from bypassing protection.

### 1.2 Create monorepo

```text
maxxy-me/
├── apps/
│   ├── web/
│   ├── orchestrator/
│   └── host-agent/
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── codex-adapter/
│   ├── workspace-runtime/
│   ├── git/
│   ├── github/
│   ├── logger/
│   ├── security/
│   ├── ui/
│   └── config/
├── docs/
├── deploy/
│   └── systemd/
├── scripts/
├── Dockerfile
├── compose.yaml
├── compose.production.yaml
├── Caddyfile
├── package.json
├── bun.lock
├── biome.json
├── tsconfig.json
└── README.md
```

### 1.3 Configure TypeScript

Enable:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "useUnknownInCatchVariables": true
}
```

### 1.4 Add code quality

Configure:

- Biome formatting;
- Biome linting;
- Bun test;
- commit hooks if useful;
- GitHub Actions;
- dependency update policy;
- conventional commit guidance.

### 1.5 Define scripts

At minimum:

```text
bun run dev
bun run dev:web
bun run dev:orchestrator
bun run dev:host
bun run build
bun run start:web
bun run start:worker
bun run db:generate
bun run db:migrate
bun run db:check
bun run lint
bun run format
bun run typecheck
bun run test
bun run test:e2e
```

## Deliverables

- Compiling monorepo.
- Shared TypeScript configuration.
- CI pipeline.
- Container builds locally.
- Empty web, worker, and host-agent applications start.

## Exit criteria

- `bun install` succeeds from a clean clone.
- Lint, type check, unit tests, and build pass in CI.
- Docker image builds reproducibly.
- No application package imports another package through private file paths.

---

# Phase 2 — Contracts, Database, and Persistent State

## Objective

Define the product's stable domain model before implementing runtime behavior.

## Work items

### 2.1 Create core contracts

Define Zod schemas and TypeScript types for:

- users;
- sessions;
- hosts;
- workspaces;
- repositories;
- agent profiles;
- agent sessions;
- tasks;
- task dependencies;
- task leases;
- worktrees;
- Codex threads;
- Codex turns;
- events;
- approvals;
- commands;
- Git operations;
- GitHub pull requests;
- webhook deliveries;
- host heartbeats;
- API errors.
- Codex connections;
- Codex capacity sources representing provider-side account, API-project, or workspace boundaries;
- Codex capacity pools and memberships;
- capacity snapshots and cooldowns;
- Codex connection leases;
- task runtime attempts and failover handoffs.

### 2.2 Create Postgres schema

Initial tables:

```text
users
sessions
accounts
verification_tokens

hosts
host_tokens
host_heartbeats

workspaces
repositories

agent_profiles
agent_sessions

codex_connections
codex_capacity_sources
codex_capacity_pools
codex_capacity_pool_members
codex_capacity_snapshots
codex_connection_leases
task_runtime_attempts

tasks
task_dependencies
task_leases

worktrees
threads
turns

events
approvals
commands

git_operations
pull_requests
pull_request_checks
github_webhook_deliveries

personal_api_tokens
audit_logs
settings
```

`accounts` is the owner-authentication provider table used by the selected web authentication library. Codex runtime identities are represented by `codex_connections` and must never reuse the authentication-library table.

### 2.3 Add database rules

Implement:

- foreign keys;
- unique constraints;
- created and updated timestamps;
- UTC timestamps;
- enum or constrained status values;
- idempotency keys;
- event sequence numbers;
- task lease expiration;
- webhook delivery deduplication.

### 2.4 Build database repositories

Do not call Drizzle directly from route handlers.

Create repository modules such as:

```text
HostRepository
WorkspaceRepository
TaskRepository
EventRepository
ApprovalRepository
PullRequestRepository
AuditRepository
CodexConnectionRepository
CodexCapacityRepository
CodexCapacitySourceRepository
TaskAttemptRepository
```

### 2.5 Implement migrations

Use the one-shot migration service before replacing application containers:

```text
docker compose run --rm migrate
```

Migration requirements:

- migration is safe to run once per release;
- deployment fails if migration fails;
- migration logs do not expose secrets;
- destructive migrations require a documented rollout strategy.

### 2.6 Seed development data

Provide a development-only seed containing:

- owner account;
- local host;
- example workspace;
- default agent profiles.

## Deliverables

- Postgres schema.
- Migration workflow.
- Database repository layer.
- Seed script.
- Database tests.

## Exit criteria

- Fresh database can be created from zero.
- Migrations run locally and through the VPS migration container.
- Schema constraints prevent invalid task states.
- Duplicate webhook deliveries are safely ignored.
- Task leasing can recover after a worker crash.

---

# Phase 3 — Authentication and Security Foundation

## Objective

Secure the control plane before adding system-level execution features.

## Work items

### 3.1 Add maxxy-me owner authentication

Use Better Auth or the final selected auth package.

Support:

- first-owner bootstrap;
- sign in;
- sign out;
- session expiration;
- secure cookies;
- password reset or owner recovery strategy;
- public signup disabled after owner creation.

### 3.2 Secure HTTP routes

Add:

- authenticated route middleware;
- role check for owner-only actions;
- CSRF protection where applicable;
- trusted-origin validation;
- rate limiting;
- structured validation errors.

### 3.3 Secure WebSockets

Use:

- `wss://` in production;
- short-lived WebSocket tickets;
- authenticated handshake;
- origin validation;
- connection expiry;
- heartbeat;
- maximum message size;
- Zod validation for every message;
- explicit message types.

### 3.4 Create host enrollment

A host must be enrolled using a one-time token.

Flow:

```text
Owner creates host enrollment token
→ installs maxxy host agent
→ host exchanges token
→ server stores token hash
→ host receives host identity
→ token becomes unusable
```

### 3.5 Create personal API tokens

Implement:

- named tokens;
- expiration;
- scopes;
- secure hash storage;
- revocation;
- last-used timestamp;
- rate limits.

### 3.6 Add audit logging

Record:

- sign-ins;
- host enrollment;
- task creation;
- approvals;
- token creation and revocation;
- GitHub connection changes;
- branch pushes;
- Codex connection addition, reauthentication, disablement, routing, and removal;
- capacity-lease acquisition, release, expiry, and failover;
- pull-request creation;
- merge requests;
- destructive operations.

## Deliverables

- Owner authentication.
- Authenticated API.
- Authenticated WebSocket connection.
- Host enrollment.
- Personal API tokens.
- Audit trail.

## Exit criteria

- Unauthenticated requests cannot access workspace data.
- A stolen database does not expose usable host or API tokens.
- A browser cannot open a privileged WebSocket without a valid ticket.
- Public signup is disabled.

---

# Phase 4 — Control-Plane API and Scheduler

## Objective

Build the durable coordination layer without starting Codex yet.

## Work items

### 4.1 Implement core API

Initial endpoints:

```text
GET    /api/health
GET    /api/me

GET    /api/hosts
POST   /api/hosts/enrollment
POST   /api/hosts/:id/revoke
GET    /api/hosts/:id/codex-connections
POST   /api/hosts/:id/codex-connections/setup
POST   /api/codex-connections/:id/reauthenticate
POST   /api/codex-connections/:id/disable
DELETE /api/codex-connections/:id

GET    /api/codex-capacity-pools
POST   /api/codex-capacity-pools
PATCH  /api/codex-capacity-pools/:id
GET    /api/codex-capacity/summary

GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:id
PATCH  /api/workspaces/:id

GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/:id
POST   /api/tasks/:id/start
POST   /api/tasks/:id/cancel
POST   /api/tasks/:id/retry

GET    /api/events
GET    /api/approvals
POST   /api/approvals/:id/decision
```

### 4.2 Implement task state machine

```text
draft
planning
awaiting_plan_approval
queued
ready
assigned
claimed
starting
running
awaiting_approval
blocked
validating
pushing
opening_pull_request
awaiting_review
changes_requested
merged
failed
cancelled
```

All state changes must go through a state-transition service.

### 4.3 Build scheduler

Scheduler responsibilities:

- resolve task dependencies;
- assign eligible tasks to hosts;
- enforce host capacity;
- select a workspace-allowed Codex pool member;
- group connections that share one provider capacity source;
- enforce per-connection capacity and cooldowns;
- acquire and release Codex connection leases;
- create leases;
- expire stale leases;
- retry retryable failures;
- avoid duplicate execution;
- stop tasks assigned to revoked hosts.

### 4.4 Use Postgres as the initial queue

For the first personal release, avoid adding Redis.

Use:

- task rows;
- lease rows;
- Codex connection lease rows;
- capacity-source identifiers on snapshots and leases so duplicate host logins share one budget boundary;
- atomic claims;
- `SELECT ... FOR UPDATE SKIP LOCKED` where appropriate;
- Postgres notifications as an optimization;
- polling fallback.

### 4.5 Implement events

Every important transition creates an event before live broadcast.

Events must be:

- ordered per workspace;
- replayable;
- deduplicated;
- associated with task, host, agent, and run identifiers.
- associated with the selected Codex connection and task-attempt identifiers.

## Deliverables

- Durable task API.
- Scheduler worker.
- Dependency resolution.
- Host assignment.
- Task leasing.
- Event persistence and replay.

## Exit criteria

- Two worker instances cannot execute the same task.
- Restarting the worker does not lose queued tasks.
- Expired leases are recovered.
- Task history can be reconstructed from persisted state.

---

# Phase 5 — maxxy Host Agent

## Objective

Create the persistent execution component that runs on local computers and remote servers.

## Why this phase is required

A containerized control plane must not execute arbitrary project workloads or own Codex and Git credentials. The native host agent supplies a narrow execution boundary, even when it runs on the same VPS.

The maxxy host agent solves:

- NAT and inbound-connectivity problems;
- persistent repository storage;
- Codex credential ownership;
- isolation of several Codex credential namespaces;
- per-connection capacity and cooldown reporting;
- GitHub credential ownership;
- worktree persistence;
- local toolchain access;
- reconnection after control-plane restarts.

The host agent makes an authenticated WSS connection to the maxxy-me control plane through the VPS custom domain. It may traverse the local reverse proxy, but it must use the same host protocol and credentials as any future remote execution host.

## Work items

### 5.1 Create host-agent service

The host agent runs as:

- a foreground development process;
- a hardened systemd system service under a dedicated non-root Linux user in production;
- a future desktop background service on other systems.

### 5.2 Implement host registration

Host reports:

- operating system;
- architecture;
- Bun version;
- Codex version;
- Git version;
- GitHub CLI version;
- available capacity;
- configured Codex connection IDs, authentication modes, and non-secret health;
- per-connection active lease counts and supported usage observations;
- project root;
- worktree root;
- supported sandbox features.

### 5.3 Implement heartbeat

Host sends:

- online status;
- active task count;
- capacity;
- connection readiness, cooldown, and reset observations;
- active run IDs;
- tool health;
- disk availability;
- timestamp.

### 5.4 Implement command protocol

Control-plane commands:

```text
host.health_check
repository.clone
repository.fetch
worktree.create
worktree.remove
codex.connection.allocate
codex.connection.login
codex.connection.status
codex.connection.reauthenticate
codex.connection.disable
codex.connection.remove
codex.runtime.start
codex.turn.start
codex.turn.steer
codex.turn.interrupt
command.run
git.status
git.diff
git.commit
git.push
github.pull_request.create
github.pull_request.update
```

### 5.5 Add reconnect behavior

After reconnecting, the host agent must:

1. authenticate again;
2. report active local runs;
3. compare runs with server leases;
4. resume valid runs;
5. stop orphaned runs only according to policy;
6. upload missing events;
7. continue heartbeats.

### 5.6 Restrict paths

The host agent must reject:

- paths outside configured project roots;
- path traversal;
- arbitrary root-level execution;
- worktree paths not owned by maxxy-me;
- unsafe deletion targets.

### 5.7 Build the host-local Codex connection registry

The registry maps an opaque `codexConnectionId` to a protected local credential slot.

Requirements:

- one file-backed `CODEX_HOME` per ChatGPT connection with `cli_auth_credentials_store = "file"`;
- one declared capacity-source mapping per connection so the same provider identity on two hosts is not double-counted;
- one independent secret reference per API-key or enterprise access-token connection;
- credential-directory permissions limited to the host-agent user and credential-file permissions limited to that user;
- no credentials in heartbeat, events, command payloads, or logs;
- duplicate labels allowed, but connection IDs remain unique;
- a connection cannot be deleted while it owns an active lease;
- ChatGPT connection concurrency defaults to one active task lane;
- the same `auth.json` is never copied into concurrent lanes or shared across machines.
- Codex may refresh each lane's file in place; maxxy-me must not overwrite refreshed credentials with an old seed.

## Deliverables

- Installable host agent.
- One-time enrollment.
- Outbound WSS connection.
- Heartbeat and tool inventory.
- Command execution protocol.
- Reconnection and reconciliation.
- Isolated Codex connection registry and health reporting.

## Exit criteria

- The VPS host agent can connect through the production WSS endpoint.
- The control plane can assign a task without exposing SSH or Codex to the web containers.
- A host reconnects after internet loss.
- No command can escape the configured workspace roots.
- Two test connections resolve to different credential namespaces.
- Revoking one connection does not change or delete another connection's credentials.

---

# Phase 6 — Codex Runtime Adapter

## Objective

Run one Codex task reliably on an enrolled host.

## Work items

### 6.1 Install and detect Codex

The host agent verifies:

- Codex binary exists;
- version is supported;
- authentication is valid;
- selected login method is ChatGPT, API key, or supported enterprise access token;
- the user has explicitly configured Codex on that host;
- the selected `codexConnectionId` resolves to exactly one authorized local credential lane.

### 6.2 Build Codex App Server adapter

The adapter owns:

- process startup;
- JSONL framing;
- request IDs;
- thread creation;
- thread resume;
- turn start;
- turn steer;
- interruption;
- approval responses;
- event normalization;
- process shutdown;
- crash handling.

### 6.3 Generate and pin schemas

Pin the tested Codex version.

Generate matching schemas when supported.

Raw Codex protocol types must not leak outside `packages/codex-adapter`.

### 6.4 Normalize events

Normalize into:

```text
agent.status_changed
agent.message_delta
agent.message_completed
command.started
command.output
command.completed
file_change.started
file_change.completed
approval.requested
approval.resolved
turn.completed
turn.failed
runtime.disconnected
```

### 6.5 Add approval pause

When Codex requests approval:

- host pauses the operation;
- control plane persists approval;
- browser receives event;
- owner chooses decision;
- host receives decision;
- Codex continues or stops.

### 6.6 Create Codex fixture tests

Record sanitized JSONL fixtures.

Test:

- normal completion;
- approval request;
- command failure;
- malformed event;
- process crash;
- interrupted turn;
- resumed thread.

### 6.7 Add connection-aware process startup

Before starting App Server or SDK work, the adapter receives a `codexConnectionId` from the host agent and resolves it locally. It launches Codex with only the selected connection's credential namespace and a sanitized environment.

The adapter must reject:

- unknown, disabled, policy-blocked, expired, or revoked connections;
- a ChatGPT lane that already owns its maximum active lease;
- a credential directory outside the configured accounts root;
- attempts to pass raw tokens through the control-plane command.

### 6.8 Normalize capacity and limit signals

Normalize only signals supported by the tested Codex version:

```text
codex.connection.ready
codex.connection.authentication_required
codex.connection.policy_blocked
codex.capacity.observed
codex.capacity.limited
codex.capacity.cooldown_started
codex.capacity.cooldown_ended
codex.connection.lease_released
```

Every observation stores its source, timestamp, and optional reset time. If exact remaining usage is unavailable, store `unknown` and let the dashboard label totals as estimated.

### 6.9 Add account-aware leases and failover

The scheduler must atomically acquire both the task lease and the selected connection lease before dispatch.

Failover rules:

- do not migrate a live turn;
- keep a thread pinned to the connection that created it;
- automatically reroute only idempotent failures that occur before a turn starts;
- otherwise create a new task attempt and thread with an explicit handoff summary;
- preserve task, branch, worktree, and pull request only after host reconciliation;
- record source connection, destination connection, reason, and billing-mode change;
- require owner confirmation when policy says an API-billed lane would replace included ChatGPT usage.

## Deliverables

- Stable Codex adapter.
- One task can run through the host agent.
- Live events appear in the database.
- Approvals work end-to-end.
- Multiple isolated Codex connections can be registered and selected.
- Capacity observations, connection leases, and attempt attribution are persisted.

## Exit criteria

- A Codex task can edit a disposable test repository.
- App Server crashes produce a recoverable task error.
- Approval decisions are audited.
- Adapter tests do not require live Codex usage.
- Two mock connections cannot resolve to the same credential slot.
- A limited connection receives no new work while another eligible pool member can be selected.
- A failover produces a new attempt and never rewrites the original thread's connection ID.

---

# Phase 7 — Repository, Worktree, and GitHub Pull-Request Workflow

## Objective

Complete the first true maxxy-me vertical slice.

## Work items

### 7.1 Repository registration

Support:

- existing local repository;
- clone from GitHub;
- remote verification;
- default branch detection;
- clean-state validation.

### 7.2 Worktree service

For every write task:

```text
one task
→ one branch
→ one worktree
→ one Codex thread
→ one pull request
```

Branch format:

```text
maxxy/<task-id>/<agent-role>
```

Worktree format:

```text
<worktree-root>/<workspace-id>/<task-id>-<agent-role>
```

### 7.3 Git ownership rules

Before execution:

- fetch base branch;
- confirm worktree does not already exist;
- create branch from intended base;
- record branch base SHA;
- record worktree path.

During execution:

- never write to main checkout;
- prevent another active task from claiming same worktree;
- track changed files.

After execution:

- run validation;
- create commit;
- push branch;
- preserve worktree on failure.

### 7.4 GitHub integration

Preferred control-plane integration:

- GitHub App for repository metadata, webhooks, pull requests, and checks.

Execution-host push options:

- host's existing GitHub CLI login;
- host Git credential manager;
- short-lived GitHub App installation credentials if safely implemented later.

### 7.5 Pull-request creation

Create draft PR after the first successful push.

PR contains:

- task summary;
- agent role;
- changed files;
- validation results;
- known risks;
- dependency PRs;
- maxxy task ID;
- execution host name.

### 7.6 Pull-request synchronization

Handle webhooks for:

- opened;
- synchronized;
- review submitted;
- checks updated;
- closed;
- merged.

Use webhook signature verification and delivery deduplication.

### 7.7 User-controlled merge

Agents may:

- push branches;
- open PRs;
- update PRs;
- respond to requested changes.

Agents may not:

- merge their own PRs;
- bypass branch protection;
- force-push protected branches;
- delete the default branch.

## Deliverables

- Repository connection.
- Branch/worktree lifecycle.
- Git validation.
- Branch push.
- Draft PR creation.
- Webhook synchronization.

## Exit criteria

This exact flow must succeed:

```text
User creates task
→ host claims task
→ worktree created
→ Codex modifies files
→ tests pass
→ branch pushed
→ draft PR created
→ user sees PR in maxxy-me
```

This is the first major product milestone.

---

# Phase 8 — Functional Dashboard

## Objective

Build the minimum dashboard required to control the proven execution flow.

## Work items

### 8.1 Authentication screens

Build:

- first-owner setup;
- sign in;
- session-expired state;
- account security.

### 8.2 Workspace screens

Build:

- workspace list;
- create workspace;
- repository connection;
- execution-host selection;
- workspace health.

### 8.3 Host screens

Build:

- enrollment instructions;
- host status;
- Codex status;
- GitHub status;
- capacity;
- active tasks;
- revoke host.
- add, reauthenticate, disable, reprioritize, and remove Codex connections;
- show per-connection mode, status, active leases, cooldown, and last observation;
- configure capacity-pool membership and routing policy.

### 8.4 Task screens

Build:

- create task;
- assign agent profile;
- task status;
- event timeline;
- command output;
- changed files;
- retry;
- cancel;
- request changes.

### 8.5 Approval screens

Build:

- pending approvals;
- operation details;
- risk level;
- approve once;
- approve for session;
- decline.

### 8.6 Pull-request screens

Build:

- open PRs;
- checks;
- review status;
- changed-file summary;
- link to GitHub;
- request agent changes;
- merged state.

### 8.7 Live-event behavior

Use:

- authenticated WebSocket;
- heartbeat;
- reconnect;
- sequence tracking;
- event replay;
- polling fallback.

## Deliverables

- Usable dashboard.
- Real-time task monitoring.
- Approval controls.
- Pull-request review status.

## Exit criteria

The user can operate the full workflow without opening a terminal, except for the one-time installation and authentication of the host agent.

---

# Phase 9 — Multi-Agent Planning and Safe Concurrency

## Objective

Expand from one task to coordinated parallel agents.

## Work items

### 9.1 Add default agent profiles

```text
manager
architect
frontend
backend
testing
reviewer
integrator
```

### 9.2 Add manager planning

Manager:

- analyzes the user goal;
- proposes tasks;
- identifies dependencies;
- recommends agent roles;
- proposes file or directory ownership;
- estimates which tasks may run in parallel.

The user approves or edits the plan before execution.

### 9.3 Add dependency graph

Scheduler starts tasks only when dependencies are complete.

### 9.4 Add concurrency controls

Enforce:

- per-host capacity;
- per-Codex-connection capacity;
- one active ChatGPT task lane per connection by default;
- atomic task and connection leases;
- per-workspace capacity;
- one task per worktree;
- one destructive Git operation per repository;
- exclusive ownership declarations;
- dependency locks.

### 9.5 Add dependent pull-request strategies

Support:

1. wait for parent PR to merge;
2. stack child branch on parent branch;
3. create final integration branch;
4. ask integrator agent to resolve combined changes.

Start with strategy 1.

Add stacked or integration PRs later.

### 9.6 Add reviewer loop

Reviewer agent:

- reads combined changes;
- runs validation;
- reports findings;
- does not merge;
- may create a review task.

## Deliverables

- Plan approval.
- Task dependencies.
- Parallel agents.
- Capacity management.
- Connection-level attribution and pool failover.
- Reviewer agent.

## Exit criteria

- Independent frontend and backend tasks can run at the same time.
- Overlapping write tasks are blocked.
- Each task creates an independent pull request.
- Dependency failures prevent invalid downstream execution.

---

# Phase 10 — Validation, Diff, and Developer Experience

## Objective

Make pull requests trustworthy and task results easy to inspect.

## Work items

### 10.1 Validation profiles

Workspace defines:

```text
install command
lint command
type-check command
unit-test command
integration-test command
build command
```

### 10.2 Validation policy

Allow:

- required commands;
- optional commands;
- timeout;
- retry;
- command-specific approval;
- fail-fast or complete-all behavior.

### 10.3 Diff experience

Add:

- file tree;
- unified diff;
- side-by-side diff;
- binary-file indicator;
- changed-line totals;
- generated-file flag.

Add Monaco only after basic diff rendering works.

### 10.4 Terminal output

Start with structured command logs.

Add xterm.js later for a richer read-only terminal presentation.

Do not expose an unrestricted browser shell in version one.

### 10.5 Task summary

At task completion, generate:

- implementation summary;
- changed files;
- test results;
- skipped checks;
- known risks;
- migration notes;
- PR link.

## Deliverables

- Configurable validation.
- Clear diff review.
- Structured command logs.
- Completion report.

## Exit criteria

The user can decide whether to merge without manually inspecting the execution host.

---

# Phase 11 — Single-VPS Production Deployment

## Objective

Deploy the complete maxxy-me control plane and execution plane on one persistent VPS under a custom HTTPS domain.

## Work items

### 11.1 Select and provision the VPS

Use a current supported Linux LTS or stable release with:

- root or console recovery access held by the owner;
- SSD-backed persistent storage;
- enough CPU and RAM for PostgreSQL, the web and worker services, Codex, project builds, and concurrent validation;
- provider snapshots only as a secondary recovery mechanism;
- a static public IPv4 address and IPv6 when configured correctly.

Starting points, not guarantees:

| Intended workload | vCPU | RAM | Persistent disk |
|---|---:|---:|---:|
| One light Codex task at a time | 4 | 8 GB | 100 GB SSD |
| Two to four normal concurrent tasks | 8 | 16 GB | 160 GB or more SSD |
| Large builds or more concurrency | benchmark first | 32 GB or more | size from repository, worktree, image, and database growth |

Set `MAX_GLOBAL_ACTIVE_TASKS`, host capacity, and per-connection capacity below measured CPU, memory, and disk limits. Capacity must degrade safely instead of allowing the kernel out-of-memory killer to terminate PostgreSQL or the control plane.

### 11.2 Harden and bootstrap the operating system

Perform:

- all security updates and a reboot before installation;
- SSH key authentication;
- disabled direct root SSH and disabled password SSH after recovery access is verified;
- a named administrator account with `sudo`;
- firewall rules allowing only the required public ports;
- automatic security updates with a controlled reboot policy;
- correct hostname, timezone, NTP synchronization, and DNS resolution;
- a dedicated non-root `maxxy-host` service user;
- Docker Engine and the Docker Compose plugin;
- Git, Codex, GitHub CLI, Bun or the packaged host agent, and required project toolchains;
- disk-space, inode, memory, and load monitoring.

Do not install the web application directly as root and do not add the `maxxy-host` user to a group that grants unrestricted Docker control.

### 11.3 Configure DNS, firewall, Caddy, and TLS

Before starting Caddy:

1. point the domain's A record to the VPS IPv4 address;
2. add an AAAA record only when IPv6 routing and firewall rules are working;
3. open ports 80 and 443;
4. ensure nothing else owns those ports;
5. persist the Caddy data and configuration volumes.

Minimal production `Caddyfile` shape:

```caddyfile
workspace.example.com {
    encode zstd gzip
    reverse_proxy web:3000
}
```

The final configuration must also define:

- access-log retention and redaction;
- maximum request-body sizes;
- security response headers owned by Caddy versus the application;
- reverse-proxy timeouts that permit long-lived WebSockets;
- forwarding-header trust limited to the local proxy path;
- a health endpoint that does not disclose secrets.

Caddy owns public TLS and HTTP-to-HTTPS redirects. The web container remains private and must not publish port 3000 on the public interface.

### 11.4 Create service users and persistent directories

Create and validate:

```text
/opt/maxxy-me
/var/lib/maxxy-me/postgres
/var/lib/maxxy-me/caddy-data
/var/lib/maxxy-me/host-agent/state
/var/lib/maxxy-me/host-agent/codex-accounts
/var/lib/maxxy-me/projects
/var/lib/maxxy-me/worktrees
/var/lib/maxxy-me/backup-staging
```

Required permission checks:

- Compose deployment files are writable only by administrators;
- production secrets are mode `0600`;
- PostgreSQL and Caddy directories match their container UIDs;
- the host-agent data, projects, worktrees, and Codex account directories belong to `maxxy-host`;
- Codex account directories are mode `0700` and credential files are mode `0600`;
- backup staging cannot grow without a size or cleanup policy;
- web and worker containers cannot mount the project, worktree, or credential directories.

### 11.5 Configure production secrets

Store control-plane secrets in a root-owned production environment file or dedicated secret files outside Git.

Generate separate values for:

```text
POSTGRES_PASSWORD
AUTH_SECRET
WS_TICKET_SECRET
INTERNAL_SERVICE_SECRET
TOKEN_PEPPER
DATA_ENCRYPTION_KEY
GITHUB_WEBHOOK_SECRET
```

Store the GitHub App private key as a protected file mounted read-only into only the services that require it. Keep host token, Git push credentials, Codex `auth.json` files, API keys, and enterprise access tokens outside the Compose application secret set.

### 11.6 Build the production Compose stack

Required services:

| Service | Public ports | Persistent storage | Startup rule |
|---|---|---|---|
| `caddy` | 80, 443 | Caddy data and config | Start after Docker; restart unless stopped |
| `web` | none | none | Start only after PostgreSQL is healthy and migration succeeds |
| `worker` | none | none | Start only after PostgreSQL is healthy and migration succeeds |
| `postgres` | none | PostgreSQL data | Health check required; restart unless stopped |
| `migrate` | none | none | One-shot command, never a continuously restarting service |

Compose requirements:

- a private application network;
- no published PostgreSQL port;
- immutable application image tag or digest;
- one shared application image for web, worker, and migrations;
- service-specific commands;
- health checks;
- restart policies for long-running services;
- log-size rotation;
- CPU and memory limits or reservations supported by the chosen Compose runtime;
- read-only root filesystems where compatible;
- `tmpfs` for disposable temporary files where compatible;
- no Docker socket mount;
- explicit volume and bind-mount declarations;
- a production override file separate from development configuration.

Validate the rendered configuration before each release:

```bash
docker compose -f compose.yaml -f compose.production.yaml config --quiet
```

### 11.7 Install the native host-agent service

Install `maxxy-host.service` under systemd with a dedicated user.

Minimum unit shape:

```ini
[Unit]
Description=maxxy-me execution host agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=maxxy-host
Group=maxxy-host
WorkingDirectory=/var/lib/maxxy-me/host-agent
EnvironmentFile=/etc/maxxy-me/host-agent.env
ExecStart=/usr/local/bin/maxxy-host start
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/maxxy-me/host-agent /var/lib/maxxy-me/projects /var/lib/maxxy-me/worktrees

[Install]
WantedBy=multi-user.target
```

The final hardening settings must be tested against Codex, Git, project build tools, network access, and sandbox behavior. Do not copy an untested unit that prevents required execution and then weaken it globally; grant only the specific paths and capabilities the host agent needs.

Enroll the VPS host through the normal one-time enrollment flow. Set its control-plane URL to the production HTTPS domain so the same authenticated WSS path is tested as a future remote host.

### 11.8 Implement the release workflow

Preferred delivery model:

1. GitHub Actions runs lint, type checks, tests, and production build;
2. CI builds and signs or records the application image digest;
3. CI pushes the image to a private container registry;
4. an authenticated deployment job connects to the VPS;
5. the VPS acquires a deployment lock;
6. it pulls the exact image digest;
7. it creates a pre-migration database backup;
8. it runs the one-shot migration container;
9. it replaces web and worker containers;
10. it verifies Caddy, web, worker, PostgreSQL, host agent, and WebSocket health;
11. it records the deployed digest and migration version;
12. it releases the deployment lock.

CI order:

```text
install
→ lint
→ type check
→ tests
→ production build
→ container build
→ image publish
→ VPS deploy lock
→ pre-migration backup
→ migration
→ Compose update
→ smoke tests
```

The deployment account must use a restricted SSH key. It must not expose production environment files, database passwords, Codex credentials, or Git push credentials to ordinary CI logs.

### 11.9 Add PostgreSQL and VPS backups

At minimum:

- create a scheduled custom-format PostgreSQL dump;
- fail the job on warnings or command failure;
- encrypt the dump before off-server transfer;
- upload to a separate storage account or backup server;
- record checksum, database version, schema version, size, and completion time;
- apply daily, weekly, and monthly retention;
- alert when a backup is late or unexpectedly small;
- remove local staging files after verified upload;
- test `pg_restore` regularly into an isolated database;
- perform a full fresh-VPS recovery drill before launch.

Repository branches should be pushed to GitHub. Back up deployment configuration and non-secret host-agent metadata. Exclude active Codex credentials, API keys, GitHub tokens, Docker runtime files, caches, dependency directories, and rebuildable container images.

If recovery-point requirements later become stricter than scheduled logical dumps provide, add PostgreSQL physical backups and WAL archiving as a separate, tested design.

### 11.10 Add monitoring and operational checks

Monitor:

- public HTTPS availability and certificate expiry;
- `/health` and authenticated deep-health status;
- web and worker container health and restart count;
- PostgreSQL connectivity, storage growth, and backup freshness;
- host-agent heartbeat and systemd state;
- active Codex runs and orphaned processes;
- disk capacity and inodes for database, repositories, worktrees, Docker, and logs;
- memory, swap pressure, load, and out-of-memory events;
- GitHub webhook failures;
- clock drift.

Logs must be structured, rotated, and redacted. Never log environment dumps, authorization headers, database URLs, Codex credential files, GitHub credentials, or command environments containing secrets.

### 11.11 Add smoke tests and rollback

After every deployment verify:

- the custom domain serves a valid HTTPS certificate;
- HTTP redirects to HTTPS;
- the login page loads;
- `/health` responds;
- PostgreSQL is reachable only from the private service network;
- the worker heartbeat is fresh;
- browser and host-agent WebSocket handshakes work;
- GitHub webhook validation works;
- the VPS host agent is online;
- one read-only Codex health check succeeds;
- repositories and worktrees remain mounted and owned correctly.

Rollback rules:

- keep the previous application image digest;
- prefer backward-compatible expand-and-contract migrations;
- never assume application rollback can reverse a destructive database migration;
- restore the pre-migration backup only through an explicit recovery procedure;
- stop new task assignment during incompatible recovery;
- reconcile active runs, leases, and worktrees after rollback;
- document the host-agent compatibility matrix.

## Deliverables

- Production single-VPS deployment.
- Custom HTTPS domain and WSS endpoint.
- Docker Compose control-plane stack.
- Native systemd host agent and Codex execution runtime.
- Persistent PostgreSQL, Caddy, repository, worktree, and host-agent storage.
- Automated CI/CD with deployment locking and release migrations.
- Encrypted off-server backups and tested restore.
- Monitoring, smoke tests, reboot recovery, and rollback procedure.

## Exit criteria

- A fresh VPS can be built from the documented procedure.
- Only SSH, HTTP, and HTTPS are publicly reachable.
- PostgreSQL and Codex App Server are not publicly exposed.
- A container replacement preserves all durable state.
- A full VPS reboot restores Caddy, web, worker, PostgreSQL, and host agent automatically.
- Active task state remains visible and host reconciliation completes after restart.
- A database backup restores successfully into an isolated environment.
- A full fresh-VPS recovery drill succeeds without restoring Codex or GitHub credentials from the general backup.

---

# Phase 12 — Reliability and Recovery

## Objective

Make the system trustworthy during process, network, and host failures.

## Work items

### 12.1 Reconciliation

On worker startup:

1. find active leases;
2. inspect host heartbeats;
3. request host run inventory;
4. reconcile server and host state;
5. resume valid tasks;
6. expire abandoned leases;
7. preserve uncertain worktrees;
8. notify the user.
9. expire orphaned Codex connection leases and preserve current cooldown observations.

### 12.2 Idempotency

Add idempotency to:

- task creation;
- host command dispatch;
- event ingestion;
- Git push request;
- PR creation;
- webhook processing;
- approval decisions.

### 12.3 Failure classification

Classify failures as:

```text
retryable
requires_authentication
requires_approval
requires_user_action
conflict
permanent
cancelled
```

Connection-limit and authentication failures must identify the affected connection without leaking account credentials. A task may be rerouted only at a safe attempt boundary under the configured failover policy.

### 12.4 Backup and restore

Use the scheduled encrypted PostgreSQL and configuration backup workflow defined in Phase 11.

Test both:

- restoring a database dump into an isolated PostgreSQL instance;
- rebuilding the complete stack on a fresh VPS from Git, deployment configuration, and off-server backups.

### 12.5 Event retention

Define:

- detailed event retention;
- command output retention;
- audit log retention;
- pruning schedule;
- user export.

### 12.6 Compatibility

Track:

- control-plane version;
- host-agent version;
- Codex version;
- schema version;
- protocol version.

## Deliverables

- Recovery logic.
- Idempotent operations.
- Backup/restore test.
- Compatibility checks.
- Failure diagnostics.

## Exit criteria

- Restarting every container and rebooting the VPS does not lose durable state.
- Duplicate GitHub webhooks do not duplicate records.
- A disconnected host can safely reconnect.
- A failed PR-creation request can be retried without creating duplicate PRs.

---

# Phase 13 — Security Hardening

## Objective

Reduce the risk created by remote code execution, repository access, and account credentials.

## Work items

### 13.1 Threat model

Cover:

- stolen browser session;
- stolen host token;
- malicious repository;
- prompt injection in repository files;
- unsafe shell command;
- path traversal;
- webhook forgery;
- dependency compromise;
- leaked logs;
- malicious pull-request content;
- unauthorized host enrollment;
- cross-account credential-slot confusion;
- accidental reuse of one `auth.json` across connections or machines;
- silent switching from included ChatGPT usage to API billing;
- misleading pooled-capacity estimates;
- routing around provider suspension or policy enforcement;
- public PostgreSQL, Docker API, Codex, or development-port exposure;
- stolen VPS deployment SSH key;
- malicious or compromised container image;
- container escape into host data;
- host-agent privilege escalation;
- unencrypted or publicly accessible backup;
- disk exhaustion affecting PostgreSQL and worktrees;
- unpatched host operating system;
- complete loss of the single VPS.

### 13.2 Secret handling

Rules:

- no raw API tokens in Postgres unless encrypted and unavoidable;
- store token hashes when verification is sufficient;
- keep Codex credentials on execution hosts;
- isolate each Codex connection in a separate protected host-local namespace;
- never place ChatGPT `auth.json`, refresh tokens, API keys, or enterprise access tokens in PostgreSQL;
- resolve opaque connection IDs only inside the authenticated host agent;
- redact account hints and capacity diagnostics where they could expose sensitive identity data;
- stop assignment to a suspended or enforcement-blocked lane instead of rotating around the provider response;
- keep Git push credentials on execution hosts;
- redact environment values from logs;
- never broadcast secrets through WebSocket events.
- keep deployment, registry, PostgreSQL, and backup credentials separate;
- encrypt off-server backups and restrict the backup principal to its required destination;
- exclude Codex and GitHub credential stores from broad filesystem backups.

### 13.3 Command policy

Implement:

- command allow and deny rules;
- workspace-root restriction;
- environment filtering;
- maximum runtime;
- output limit;
- process-tree cancellation;
- user approval by risk category.

### 13.4 Dependency and image security

Add:

- lockfile verification;
- dependency audit;
- pinned base image;
- scheduled image rebuild;
- container vulnerability scan;
- secret scan;
- CodeQL or equivalent analysis.

### 13.5 Web security

Add:

- CSP;
- HSTS;
- secure cookie configuration;
- CSRF protection;
- clickjacking protection;
- rate limits;
- request size limits;
- WebSocket ticket expiry;
- origin checks.

### 13.6 VPS and container-host security

Add and verify:

- SSH keys only and disabled direct root login;
- firewall default-deny inbound policy;
- public port scan showing only the approved ports;
- PostgreSQL and application ports bound only to private networks;
- no Docker socket mounts in application or host-agent services;
- a restricted deployment account and pinned SSH host key;
- automatic security updates with an owner-reviewed reboot policy;
- systemd hardening for the host agent and backup jobs;
- container image digest pinning, vulnerability scanning, and provenance recording;
- filesystem ownership and permission tests;
- encrypted off-server backups and restore authorization;
- disk, inode, memory, and out-of-memory alerts;
- incident steps for revoking deploy, registry, host, GitHub, Codex, and backup credentials.

## Deliverables

- Threat model.
- Security test suite.
- Secret redaction.
- Command policy.
- Hardened web headers.
- Dependency and image scans.

## Exit criteria

- Security checklist passes.
- No secret appears in normal logs.
- Host tokens can be revoked immediately.
- Dangerous operations always require approval.
- External security scans find no high-severity unresolved issues.
- An external port scan finds no unapproved service.
- Web, worker, PostgreSQL, and host-agent processes do not run as root.
- The Docker socket is unavailable to maxxy-me application and execution processes.
- Backup contents are encrypted and do not contain Codex or GitHub credential stores.

---

# Phase 14 — Beta, Documentation, and Launch

## Objective

Prepare maxxy-me for dependable personal daily use.

## Work items

### 14.1 Documentation

Complete:

```text
README.md
ARCHITECTURE.md
user-flow.md
execution-phase.md
CONTRIBUTING.md
SECURITY.md
docs/host-installation.md
docs/vps-deployment.md
docs/vps-backup-and-restore.md
docs/github-app.md
docs/recovery.md
docs/troubleshooting.md
```

### 14.2 Guided onboarding

Build:

- deployment-mode selection;
- owner setup;
- GitHub setup;
- host enrollment;
- Codex health check;
- repository import;
- first task wizard.

### 14.3 Beta checklist

Use maxxy-me to implement a feature in maxxy-me itself.

This validates the product through its intended workflow.

Required beta scenarios:

- one successful task;
- requested changes;
- cancelled task;
- failed validation;
- host disconnect;
- Codex reauthentication;
- GitHub authentication failure;
- merge conflict;
- web and worker container replacement;
- PostgreSQL container restart;
- full VPS reboot;
- fresh-VPS rebuild;
- database restore drill.
- second Codex connection onboarding;
- two tasks routed to different connection lanes;
- one connection limited while a new task routes to another;
- expired authentication on one connection without affecting the others;
- failover from included ChatGPT usage to API billing requiring confirmation.

### 14.4 Launch criteria

Launch only when:

- critical workflow succeeds repeatedly;
- no manual database edits are needed;
- no routine task requires an interactive root shell on the VPS;
- host recovery works;
- PR creation is idempotent;
- security checklist is complete;
- backup strategy is tested.

---

# 5. Recommended Milestones

## Milestone 1 — Platform proven

Includes:

- Phase 0.
- single-VPS Compose deployment.
- Caddy, TLS, firewall, and private service networking.
- Postgres.
- worker.
- WebSocket.
- custom-domain test.

## Milestone 2 — First Codex pull request

Includes:

- Phases 1–7.
- One host.
- One task.
- One worktree.
- One Codex run.
- One GitHub PR.

This is the most important milestone.

## Milestone 3 — Terminal-free operation

Includes:

- Phase 8.
- Dashboard.
- live events.
- approvals.
- PR tracking.
- multi-connection onboarding and pool status.

## Milestone 4 — Multi-agent workspace

Includes:

- Phases 9–10.
- planning.
- dependencies.
- concurrency.
- account-aware capacity routing.
- per-attempt connection attribution.
- reviewer.
- rich diffs.

## Milestone 5 — Production personal workspace

Includes:

- Phases 11–14.
- single-VPS production deployment.
- off-server backup and fresh-VPS restore.
- recovery.
- hardening.
- launch documentation.

---

# 6. What Not to Prioritize Early

Do not build these before Milestone 2:

- polished landing page;
- drag-and-drop task board;
- advanced animations;
- mobile application;
- Tauri desktop packaging;
- voice control;
- plugin marketplace;
- multiple AI providers;
- cost analytics;
- exact quota aggregation before a supported provider signal exists;
- team collaboration;
- organization roles;
- Redis;
- Kubernetes;
- microservices;
- unrestricted browser terminal;
- complex stacked pull requests;
- automatic merging.

The first priority is reliable code delivery to a reviewable pull request.

---

# 7. Environment Variables and Secrets

This section defines the configuration required by each maxxy-me component.

## 7.1 Configuration rules

1. Never commit real secrets.
2. Commit only `.env.example` files.
3. VPS production values belong in root-owned environment or secret files outside Git.
4. Codex, host-agent, Git push, and API-key credentials belong only in the protected execution-host directories.
5. CI deployment credentials belong in GitHub Actions secrets.
6. `NEXT_PUBLIC_*` variables are visible to browsers and must never contain secrets.
7. Prefer relative browser URLs so custom-domain changes do not require rebuilding the frontend.
8. Compose supplies the internal web port and private PostgreSQL hostname; neither is published directly to the internet.
9. Keep production environment files mode `0600` and owned by root or the dedicated deployment administrator.
10. Mount large private keys as read-only secret files instead of multiline values when practical.
11. Rotate secrets after accidental exposure.
12. Exclude production secrets and Codex/GitHub credentials from general VPS backups.

---

## 7.2 Control-plane variables

These variables are used by the VPS web, worker, and migration containers.

| Variable | Required | Secret | Process | Description |
|---|---:|---:|---|---|
| `NODE_ENV` | Yes | No | web, worker | Use `production` on the VPS |
| `APP_ENV` | Yes | No | web, worker | `development`, `staging`, or `production` |
| `APP_NAME` | Yes | No | web, worker | Display and log name, normally `maxxy-me` |
| `APP_URL` | Yes | No | web, worker | Canonical HTTPS custom-domain URL |
| `DATABASE_URL` | Yes | Yes | web, worker, release | Private Compose-network PostgreSQL connection string |
| `PORT` | Yes | No | web | Internal container port, normally `3000`; published only through Caddy |
| `AUTH_SECRET` | Yes | Yes | web | Session/authentication signing secret |
| `AUTH_URL` | Yes | No | web | Canonical authentication URL, normally same as `APP_URL` |
| `AUTH_ALLOW_SIGNUP` | Yes | No | web | Must be `false` after owner bootstrap |
| `OWNER_BOOTSTRAP_EMAIL` | Initial setup | Sensitive | web | Email allowed to create the first owner |
| `SESSION_MAX_AGE_SECONDS` | Yes | No | web | Session lifetime |
| `SESSION_COOKIE_NAME` | Yes | No | web | Secure session cookie name |
| `TRUSTED_ORIGINS` | Yes | No | web | Comma-separated allowed origins |
| `CORS_ALLOWED_ORIGINS` | Yes | No | web | Allowed API origins; usually only `APP_URL` |
| `WS_PATH` | Yes | No | web | WebSocket route, e.g. `/api/ws` |
| `WS_TICKET_SECRET` | Yes | Yes | web | Signs short-lived WebSocket tickets |
| `WS_HEARTBEAT_INTERVAL_MS` | Yes | No | web | Ping interval to prevent idle connections |
| `WS_CONNECTION_TTL_SECONDS` | Yes | No | web | Maximum ticket/connection policy lifetime |
| `INTERNAL_SERVICE_SECRET` | Yes | Yes | web, worker | Authenticates internal control-plane operations |
| `TOKEN_PEPPER` | Yes | Yes | web | Added when hashing personal and host tokens |
| `DATA_ENCRYPTION_KEY` | Yes | Yes | web, worker | Encrypts sensitive metadata that must be stored |
| `LOG_LEVEL` | Yes | No | web, worker, release | `info` in production |
| `LOG_FORMAT` | Yes | No | web, worker | `json` in production |
| `TRUSTED_PROXY_HOPS` | Yes | No | web | `1` for the direct Caddy-to-web path; do not trust arbitrary forwarding headers |
| `SHUTDOWN_GRACE_PERIOD_SECONDS` | Yes | No | web, worker | Time to stop accepting work and close cleanly during container replacement |
| `EVENT_RETENTION_DAYS` | Yes | No | worker | Detailed event retention |
| `AUDIT_RETENTION_DAYS` | Yes | No | worker | Audit-record retention |
| `TASK_LEASE_SECONDS` | Yes | No | worker | Lease duration for claimed tasks |
| `TASK_HEARTBEAT_TIMEOUT_SECONDS` | Yes | No | worker | Time before a task is considered stale |
| `SCHEDULER_POLL_INTERVAL_MS` | Yes | No | worker | Poll interval when notifications are unavailable |
| `MAX_GLOBAL_ACTIVE_TASKS` | Yes | No | worker | Control-plane global task cap |
| `HOST_OFFLINE_AFTER_SECONDS` | Yes | No | worker | Host heartbeat timeout |
| `COMMAND_OUTPUT_MAX_BYTES` | Yes | No | web, worker | Maximum persisted output per command |
| `PUBLIC_API_ENABLED` | Yes | No | web | Enables personal API endpoints |
| `PERSONAL_API_RATE_LIMIT` | Yes | No | web | Requests per configured window |
| `GITHUB_INTEGRATION_MODE` | Yes | No | web, worker | Normally `github_app` |
| `GITHUB_APP_ID` | Yes | No | web, worker | GitHub App numeric ID |
| `GITHUB_APP_SLUG` | Yes | No | web | GitHub App slug |
| `GITHUB_APP_PRIVATE_KEY_FILE` | Yes in production | Sensitive path | web, worker | Read-only mounted path to the protected PEM file |
| `GITHUB_APP_PRIVATE_KEY` | Local development only | Yes | web, worker | Inline PEM fallback; do not use in VPS production when file mounting is available |
| `GITHUB_CLIENT_ID` | If user OAuth is used | No | web | GitHub App/OAuth client ID |
| `GITHUB_CLIENT_SECRET` | If user OAuth is used | Yes | web | GitHub App/OAuth client secret |
| `GITHUB_WEBHOOK_SECRET` | Yes | Yes | web | Verifies GitHub webhook signatures |
| `GITHUB_CALLBACK_URL` | If OAuth is used | No | web | GitHub callback URL |
| `GITHUB_API_BASE_URL` | No | No | web, worker | Defaults to public GitHub API |
| `GITHUB_WEB_BASE_URL` | No | No | web | Defaults to public GitHub website |
| `SENTRY_DSN` | Optional | Yes | web, worker | Error monitoring |
| `SENTRY_ENVIRONMENT` | Optional | No | web, worker | Error-monitoring environment |
| `RELEASE_VERSION` | Required in production | No | web, worker | Deployed Git commit, tag, or image identifier |
| `PROTOCOL_VERSION` | Yes | No | web, worker | Host-agent protocol version |

### VPS deployment metadata

Compose or the deployment script supplies:

| Variable | Required | Description |
|---|---:|---|
| `DEPLOYMENT_MODE` | Yes | `vps_single_host` |
| `RELEASE_VERSION` | Yes | Git commit or release identifier |
| `APP_IMAGE` | Yes | Registry image name |
| `APP_IMAGE_DIGEST` | Recommended | Exact immutable digest recorded by the deployment |
| `VPS_INSTANCE_NAME` | Yes | Non-secret server identifier for logs and diagnostics |

---

## 7.3 Host-agent variables

These variables exist on every persistent execution host, not in the browser.

| Variable | Required | Secret | Description |
|---|---:|---:|---|
| `MAXXY_CONTROL_PLANE_URL` | Yes | No | VPS custom-domain HTTPS URL, even when the host agent runs on the same server |
| `MAXXY_HOST_ID` | After enrollment | No | Assigned host identifier |
| `MAXXY_HOST_TOKEN` | Yes | Yes | Host authentication token |
| `MAXXY_HOST_NAME` | Yes | No | Human-readable host name |
| `MAXXY_HOST_DATA_DIR` | Yes | No | Persistent host-agent state directory |
| `MAXXY_PROJECT_ROOT` | Yes | No | Allowed repository parent directory |
| `MAXXY_WORKTREE_ROOT` | Yes | No | Dedicated maxxy worktree directory |
| `MAXXY_MAX_CONCURRENT_AGENTS` | Yes | No | Host concurrency cap |
| `MAXXY_CODEX_ACCOUNTS_DIR` | Yes | Sensitive | Protected parent for isolated Codex credential directories |
| `MAXXY_CODEX_CHATGPT_LANE_CONCURRENCY` | Yes | No | Default `1`; maximum active tasks per ChatGPT credential lane |
| `MAXXY_CODEX_USAGE_POLL_INTERVAL_MS` | Yes | No | Minimum interval for supported status observations |
| `MAXXY_CODEX_FAILOVER_ENABLED` | Yes | No | Allows policy-controlled rerouting before a new turn |
| `MAXXY_CODEX_REQUIRE_BILLING_MODE_CONFIRMATION` | Yes | No | Requires approval before switching between included ChatGPT usage and API billing |
| `MAXXY_HEARTBEAT_INTERVAL_MS` | Yes | No | Heartbeat frequency |
| `MAXXY_RECONNECT_MIN_DELAY_MS` | Yes | No | Initial reconnect delay |
| `MAXXY_RECONNECT_MAX_DELAY_MS` | Yes | No | Maximum reconnect backoff |
| `MAXXY_COMMAND_TIMEOUT_MS` | Yes | No | Default command timeout |
| `MAXXY_OUTPUT_MAX_BYTES` | Yes | No | Local command-output limit |
| `MAXXY_PROTOCOL_VERSION` | Yes | No | Must match supported server protocol |
| `CODEX_BINARY` | Yes | No | Path or command for Codex |
| `CODEX_HOME` | Optional legacy default | Sensitive | Used only for the initial single connection; multi-connection runs resolve a connection-specific directory under `MAXXY_CODEX_ACCOUNTS_DIR` |
| `CODEX_REQUIRED_VERSION` | Yes | No | Version tested by maxxy-me |
| `CODEX_AUTH_MODE` | Yes | No | Legacy default: `chatgpt`, `api_key`, or `enterprise_access_token`; each registered connection stores its own mode |
| `OPENAI_API_KEY` | Only legacy API-key mode | Yes | Kept only on the execution host; multi-connection keys belong in separate host secret slots |
| `GIT_BINARY` | Yes | No | Path or command for Git |
| `GH_BINARY` | Recommended | No | Path or command for GitHub CLI |
| `SSH_BINARY` | Optional | No | Required only if host manages further SSH targets |
| `GIT_AUTHOR_NAME` | Yes | No | Commit author name for agent commits |
| `GIT_AUTHOR_EMAIL` | Yes | No | Commit author email |
| `GIT_COMMITTER_NAME` | Yes | No | Commit committer name |
| `GIT_COMMITTER_EMAIL` | Yes | No | Commit committer email |
| `HOST_LOG_LEVEL` | Yes | No | Host-agent log level |
| `HOST_LOG_DIR` | Yes | No | Persistent local logs |
| `HOST_ALLOWED_COMMAND_PROFILES` | Yes | No | Allowed command policy set |

The execution host should use its existing GitHub credential manager or `gh auth` session.

Do not put a long-lived GitHub personal access token into maxxy-me Postgres solely to push branches.

---

## 7.4 Browser-visible variables

Keep browser-visible configuration minimal.

| Variable | Required | Secret | Description |
|---|---:|---:|---|
| `NEXT_PUBLIC_APP_NAME` | Yes | No | Display name |
| `NEXT_PUBLIC_RELEASE_VERSION` | Optional | No | UI release label |
| `NEXT_PUBLIC_SUPPORT_URL` | Optional | No | Documentation/help URL |

Prefer:

```text
API URL = current origin + /api
WebSocket URL = current origin converted from https to wss
```

This avoids a build-time domain dependency.

Never expose:

```text
AUTH_SECRET
DATABASE_URL
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_PRIVATE_KEY_FILE
GITHUB_CLIENT_SECRET
GITHUB_WEBHOOK_SECRET
MAXXY_HOST_TOKEN
OPENAI_API_KEY
POSTGRES_PASSWORD
BACKUP_ENCRYPTION_KEY
TOKEN_PEPPER
DATA_ENCRYPTION_KEY
INTERNAL_SERVICE_SECRET
```

---

## 7.5 Release-process variables

The release process needs:

```text
DATABASE_URL
APP_ENV
LOG_LEVEL
```

It may also need:

```text
MIGRATION_LOCK_TIMEOUT_SECONDS
MIGRATION_STATEMENT_TIMEOUT_SECONDS
```

It must not require:

- browser session secrets;
- GitHub private keys;
- host tokens;
- Codex credentials.

---

## 7.6 Local development `.env.example`

```dotenv
NODE_ENV=development
APP_ENV=development
APP_NAME=maxxy-me
APP_URL=http://127.0.0.1:3000
PORT=3000

DATABASE_URL=postgres://maxxy:maxxy@127.0.0.1:5432/maxxy_me

AUTH_SECRET=replace-with-a-long-random-value
AUTH_URL=http://127.0.0.1:3000
AUTH_ALLOW_SIGNUP=true
OWNER_BOOTSTRAP_EMAIL=owner@example.com
SESSION_MAX_AGE_SECONDS=604800
SESSION_COOKIE_NAME=maxxy_session

TRUSTED_ORIGINS=http://127.0.0.1:3000
CORS_ALLOWED_ORIGINS=http://127.0.0.1:3000
TRUSTED_PROXY_HOPS=0
SHUTDOWN_GRACE_PERIOD_SECONDS=30

WS_PATH=/api/ws
WS_TICKET_SECRET=replace-with-a-long-random-value
WS_HEARTBEAT_INTERVAL_MS=25000
WS_CONNECTION_TTL_SECONDS=3600

INTERNAL_SERVICE_SECRET=replace-with-a-long-random-value
TOKEN_PEPPER=replace-with-a-long-random-value
DATA_ENCRYPTION_KEY=replace-with-a-32-byte-key

LOG_LEVEL=debug
LOG_FORMAT=pretty

EVENT_RETENTION_DAYS=30
AUDIT_RETENTION_DAYS=365
TASK_LEASE_SECONDS=120
TASK_HEARTBEAT_TIMEOUT_SECONDS=90
SCHEDULER_POLL_INTERVAL_MS=2000
MAX_GLOBAL_ACTIVE_TASKS=4
HOST_OFFLINE_AFTER_SECONDS=45
COMMAND_OUTPUT_MAX_BYTES=10485760

PUBLIC_API_ENABLED=true
PERSONAL_API_RATE_LIMIT=60

GITHUB_INTEGRATION_MODE=github_app
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=
GITHUB_CALLBACK_URL=http://127.0.0.1:3000/api/github/callback

PROTOCOL_VERSION=1
NEXT_PUBLIC_APP_NAME=maxxy-me
```

---

## 7.7 Host-agent `.env.host.example`

```dotenv
MAXXY_CONTROL_PLANE_URL=http://127.0.0.1:3000
MAXXY_HOST_ID=
MAXXY_HOST_TOKEN=
MAXXY_HOST_NAME=My Development Machine

MAXXY_HOST_DATA_DIR=/home/user/.local/share/maxxy-me
MAXXY_PROJECT_ROOT=/home/user/projects
MAXXY_WORKTREE_ROOT=/home/user/.local/share/maxxy-me/worktrees
MAXXY_MAX_CONCURRENT_AGENTS=4
MAXXY_CODEX_ACCOUNTS_DIR=/home/user/.local/share/maxxy-me/codex-accounts
MAXXY_CODEX_CHATGPT_LANE_CONCURRENCY=1
MAXXY_CODEX_USAGE_POLL_INTERVAL_MS=60000
MAXXY_CODEX_FAILOVER_ENABLED=true
MAXXY_CODEX_REQUIRE_BILLING_MODE_CONFIRMATION=true

MAXXY_HEARTBEAT_INTERVAL_MS=15000
MAXXY_RECONNECT_MIN_DELAY_MS=1000
MAXXY_RECONNECT_MAX_DELAY_MS=30000
MAXXY_COMMAND_TIMEOUT_MS=1800000
MAXXY_OUTPUT_MAX_BYTES=10485760
MAXXY_PROTOCOL_VERSION=1

CODEX_BINARY=codex
CODEX_HOME=/home/user/.codex
CODEX_REQUIRED_VERSION=
CODEX_AUTH_MODE=chatgpt
OPENAI_API_KEY=

GIT_BINARY=git
GH_BINARY=gh
SSH_BINARY=ssh

GIT_AUTHOR_NAME=maxxy-me Agent
GIT_AUTHOR_EMAIL=maxxy-agent@users.noreply.github.com
GIT_COMMITTER_NAME=maxxy-me Agent
GIT_COMMITTER_EMAIL=maxxy-agent@users.noreply.github.com

HOST_LOG_LEVEL=info
HOST_LOG_DIR=/home/user/.local/state/maxxy-me/logs
HOST_ALLOWED_COMMAND_PROFILES=default
```

---

## 7.8 VPS production configuration checklist

Create these protected files:

```text
/etc/maxxy-me/app.env
/etc/maxxy-me/postgres.env
/etc/maxxy-me/host-agent.env
/etc/maxxy-me/backup.env
/etc/maxxy-me/github-app.pem
```

All files are root-owned and mode `0600`. Mount `github-app.pem` read-only only into the application services that require it.

`app.env` contains:

```text
NODE_ENV=production
APP_ENV=production
APP_NAME=maxxy-me
APP_URL=https://workspace.example.com
AUTH_URL=https://workspace.example.com
AUTH_ALLOW_SIGNUP=false
PORT=3000
DATABASE_URL=<private-postgres-compose-url>
TRUSTED_ORIGINS=https://workspace.example.com
CORS_ALLOWED_ORIGINS=https://workspace.example.com
TRUSTED_PROXY_HOPS=1
SHUTDOWN_GRACE_PERIOD_SECONDS=30
AUTH_SECRET
WS_TICKET_SECRET
INTERNAL_SERVICE_SECRET
TOKEN_PEPPER
DATA_ENCRYPTION_KEY
GITHUB_APP_ID
GITHUB_APP_SLUG
GITHUB_WEBHOOK_SECRET
GITHUB_APP_PRIVATE_KEY_FILE=/run/secrets/github-app.pem
PROTOCOL_VERSION
RELEASE_VERSION
DEPLOYMENT_MODE=vps_single_host
VPS_INSTANCE_NAME
```

Include the remaining non-secret limits and retention variables from section 7.2.

`postgres.env` contains:

```text
POSTGRES_DB=maxxy_me
POSTGRES_USER=maxxy_app
POSTGRES_PASSWORD=<independent-random-secret>
```

`host-agent.env` uses production paths:

```text
MAXXY_CONTROL_PLANE_URL=https://workspace.example.com
MAXXY_HOST_DATA_DIR=/var/lib/maxxy-me/host-agent/state
MAXXY_PROJECT_ROOT=/var/lib/maxxy-me/projects
MAXXY_WORKTREE_ROOT=/var/lib/maxxy-me/worktrees
MAXXY_CODEX_ACCOUNTS_DIR=/var/lib/maxxy-me/host-agent/codex-accounts
HOST_LOG_DIR=/var/log/maxxy-me/host-agent
```

It also contains the enrolled host ID and token plus the capacity and runtime variables from section 7.3.

`backup.env` contains:

```text
BACKUP_STAGING_DIR=/var/lib/maxxy-me/backup-staging
BACKUP_TARGET=<off-server-destination>
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=6
BACKUP_ENCRYPTION_KEY_FILE=/etc/maxxy-me/backup-encryption-key
BACKUP_MAX_STAGING_BYTES=<explicit-limit>
```

Object-storage or remote-backup credentials belong only in this protected backup configuration. They must not be mounted into web, worker, PostgreSQL, or the host agent.

---

## 7.9 GitHub Actions secrets

These are CI/CD secrets, not application runtime variables.

| Secret | Required | Description |
|---|---:|---|
| `VPS_DEPLOY_HOST` | Yes | Production VPS hostname or address |
| `VPS_DEPLOY_PORT` | Yes | Restricted SSH port |
| `VPS_DEPLOY_USER` | Yes | Non-root deployment account |
| `VPS_DEPLOY_SSH_KEY` | Yes | Restricted deployment private key |
| `VPS_SSH_KNOWN_HOSTS` | Yes | Pinned SSH host key entry; do not disable host verification |
| `CONTAINER_REGISTRY_USERNAME` | Yes | Image registry identity |
| `CONTAINER_REGISTRY_TOKEN` | Yes | Minimum-scope image push/pull credential |
| `APP_IMAGE` | Yes | Full application image name |
| `PRODUCTION_APP_URL` | Yes | Smoke-test target |
| `PRODUCTION_HEALTH_TOKEN` | Optional | Auth for protected smoke checks |
| `SENTRY_AUTH_TOKEN` | Optional | Upload source maps/releases |

Do not expose production app secrets, PostgreSQL credentials, backup credentials, runtime GitHub App keys, host tokens, Codex credentials, or Git push credentials to CI. The deployment job should select an already-provisioned server configuration and an immutable application image.

---

## 7.10 Secret generation checklist

Generate independent random values for:

```text
POSTGRES_PASSWORD
AUTH_SECRET
WS_TICKET_SECRET
INTERNAL_SERVICE_SECRET
TOKEN_PEPPER
DATA_ENCRYPTION_KEY
GITHUB_WEBHOOK_SECRET
BACKUP_ENCRYPTION_KEY
```

Do not reuse one value for several purposes.

Recommended properties:

- at least 32 random bytes for signing secrets;
- a correctly sized key for the selected encryption algorithm;
- unique values per environment;
- rotation procedure documented.

---

# 8. VPS Process Definitions

## Recommended logical commands

```text
web container: bun run start:web
worker container: bun run start:worker
migration container: bun run db:migrate
host-agent systemd service: maxxy-host start
backup systemd service: backup script exits after one run
```

Map the web, worker, and migration commands through Compose. Run the host agent and backup jobs through systemd.

## Reverse-proxy responsibilities

- bind public ports 80 and 443;
- obtain and renew TLS certificates;
- redirect HTTP to HTTPS;
- proxy HTTP and WebSocket traffic to the private web service;
- preserve only trusted forwarding headers;
- enforce edge request and log policy;
- persist certificate state.

## Web process responsibilities

- Next.js pages;
- authentication;
- REST API;
- browser WebSockets;
- host-agent WebSockets;
- GitHub webhooks;
- health endpoints;
- event replay;
- fast command acceptance.

The web process must not execute long Codex tasks.

## Worker responsibilities

- task scheduling;
- dependency resolution;
- lease recovery;
- host assignment;
- stale-task detection;
- event retention;
- webhook follow-up work;
- reconciliation.

## Release responsibilities

- database migrations only;
- fail deployment on migration failure;
- no long-running work;
- no agent execution.

## PostgreSQL responsibilities

- listen only on the private Compose network;
- persist data outside the container writable layer;
- expose a health check;
- enforce role separation and authentication;
- support backup and restore jobs;
- restart after host reboot.

## Host-agent responsibilities

- run under the dedicated non-root user;
- own repositories, worktrees, Codex credential lanes, and project toolchains;
- connect to the control plane through authenticated WSS;
- remain outside the web and worker containers;
- never expose Codex App Server publicly;
- reconcile active runs after process or VPS restart.

## Backup responsibilities

- acquire appropriate database backup coordination;
- produce an encrypted, checksummed artifact;
- copy it off the VPS;
- apply retention;
- remove staging data;
- report success or failure;
- never copy live Codex or GitHub credential stores.

---

# 9. VPS-Specific Reliability Rules

1. Never keep durable state only in a container writable layer.
2. Persist PostgreSQL, Caddy state, host-agent state, repositories, and worktrees in explicit volumes or host directories.
3. Never publish PostgreSQL, Codex App Server, the Docker API, or development ports to the internet.
4. Never give web, worker, or host-agent processes the Docker socket.
5. Treat container IDs, process IDs, and WebSocket connections as replaceable.
6. Persist important events before broadcasting.
7. Use heartbeat frames and reconnect logic for browser and host-agent WebSockets.
8. Keep web requests short; queue work instead of waiting for agent completion.
9. Make migrations, PR creation, webhook processing, and deploy commands idempotent where possible.
10. Acquire a deployment lock so two releases cannot migrate or replace services concurrently.
11. Use immutable image tags or digests and record the deployed release.
12. Keep completed branches on GitHub and preserve uncertain worktrees after failure.
13. Monitor disk space aggressively; a full filesystem can damage PostgreSQL availability and agent execution.
14. Keep encrypted database and configuration backups outside the VPS failure boundary.
15. Test database restore and full fresh-VPS recovery, not only backup creation.
16. Restart long-running services automatically after failure and reboot, with backoff to avoid crash loops.
17. Stop new task assignment during incompatible migrations, rollback, or recovery.
18. Keep the database, control plane, host agent, and Codex credentials under separate service and filesystem permissions.

---

# 10. Final Build Order

The required order is:

```text
1. Prove VPS + Compose + Caddy + Bun containers + PostgreSQL + WebSocket + native host agent
2. Create monorepo and CI
3. Build contracts and Postgres schema
4. Add authentication and security
5. Build durable API and scheduler
6. Build persistent host agent
7. Integrate Codex App Server with one isolated connection
8. Add multi-account registry, capacity observations, connection leases, and failover
9. Build Git worktree and GitHub PR workflow
10. Build minimum dashboard
11. Add multi-agent planning and concurrency
12. Add validation and rich diff experience
13. Deploy the complete control and execution planes to the production VPS
14. Add recovery and reliability
15. Complete security hardening
16. Run beta scenarios and launch
```

The most important rule is:

> Do not build the full visual workspace until one Codex task can reliably produce a GitHub pull request from an isolated worktree.

---

# 11. Definition of Project Completion

maxxy-me version one is complete when the user can:

1. open the custom VPS-hosted HTTPS domain;
2. authenticate as the owner;
3. enroll a local computer or persistent server;
4. verify Codex and GitHub authentication on that host;
5. add several authorized Codex connections without sharing credential stores;
6. view their observed availability as one logical capacity pool;
7. route independent task attempts across eligible connections with complete attribution;
8. connect a GitHub repository;
9. describe a feature;
10. approve a multi-agent execution plan;
11. run independent agents on separate worktrees;
12. monitor messages, commands, approvals, and connection usage attribution;
13. receive separate GitHub pull requests;
14. request changes from the same agents;
15. merge approved pull requests personally;
16. survive web, worker, PostgreSQL, and host-agent restarts plus a full VPS reboot without losing durable state;
17. reconnect execution hosts automatically;
18. audit what each agent changed, executed, and which Codex connection ran it.

---

# 12. Official Platform References

Infrastructure documentation relevant to this plan:

- Docker Compose production deployment on a single server:
  - https://docs.docker.com/compose/how-tos/production/
- Docker Compose overview and specification:
  - https://docs.docker.com/compose/
- Caddy automatic HTTPS requirements and certificate persistence:
  - https://caddyserver.com/docs/automatic-https
- Caddy reverse proxy:
  - https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- PostgreSQL `pg_dump`:
  - https://www.postgresql.org/docs/current/app-pgdump.html
- PostgreSQL backup and restore:
  - https://www.postgresql.org/docs/current/backup.html
- systemd service execution and hardening options:
  - https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html

The implementation must be rechecked against the current Linux distribution, Docker, Caddy, PostgreSQL, systemd, firewall, VPS-provider, and Codex documentation before production deployment.

OpenAI documentation relevant to the multi-connection design:

- Codex authentication and credential storage:
  - https://learn.chatgpt.com/docs/auth
- Trusted automation and the one-credential-file-per-serialized-stream rule:
  - https://learn.chatgpt.com/docs/auth/ci-cd-auth
- Codex usage, credits, API-key billing, and limits:
  - https://learn.chatgpt.com/docs/pricing

These references support isolated credential lanes and account-aware scheduling. They do not document provider-side merging of several ChatGPT plan entitlements; maxxy-me must describe the feature as a logical orchestration pool.
