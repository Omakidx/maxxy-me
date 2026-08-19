# maxxy-me Architecture

> Status: Planning and architecture phase
> Project type: Personal, single-user multi-agent Codex workspace
> Production deployment: Cloudflare-managed domain in front of a single self-hosted VPS
> Execution model: Native execution host on the production VPS, with optional additional enrolled hosts

## 1. Overview

**maxxy-me** is a personal control center for coordinating multiple Codex-powered coding agents.

Version one also supports multiple owner-authorized Codex connections. Each connection remains an independent authentication, billing, and rate-limit boundary on an execution host. maxxy-me presents their currently usable capacity as one logical pool and routes new work to an eligible connection; it does not merge OpenAI accounts or credentials at the provider layer.

The user accesses a private dashboard through a Cloudflare-managed custom domain. Cloudflare provides authoritative DNS, the proxied public edge, visitor TLS, and origin shielding. A single VPS runs Caddy, the web dashboard, API, scheduler, event service, authentication layer, GitHub webhooks, PostgreSQL, the host agent, Codex, repositories, and worktrees.

The actual Codex coding work runs on persistent enrolled hosts:

- the user's local computer;
- a home workstation;
- a development VPS;
- another persistent Linux server.

Each execution host runs a lightweight **maxxy host agent**. The production VPS is the first enrolled execution host. Its agent creates an authenticated outbound WebSocket connection through the same Cloudflare-proxied domain used by browsers. Additional hosts may connect later without changing the protocol. Each host owns its repositories, Git worktrees, Codex processes, Git credentials, and project toolchains.

Every write-capable task receives:

- one task record;
- one agent session;
- one branch;
- one Git worktree;
- one Codex thread;
- zero or one active GitHub pull request.

After a task is implemented and validated, its branch is pushed to GitHub and a pull request is opened. The user reviews and merges it. Agents never merge directly into the protected default branch.

---

## 2. Product Goals

### Primary goals

1. Provide one secure dashboard for controlling Codex agents.
2. Make the dashboard reachable through a custom domain.
3. Host the complete production system on one hardened VPS.
4. Use Cloudflare for domain management, proxied DNS, edge TLS, and origin protection.
5. Run code-changing agents on persistent enrolled hosts, beginning with the same production VPS.
6. Support several agents working on independent project areas.
7. Isolate every write task with a branch and worktree.
8. Stream agent messages, commands, approvals, and status in real time.
9. Persist task, event, approval, host, and pull-request state in PostgreSQL.
10. Let agents push branches and create GitHub pull requests.
11. Keep all merge decisions under direct user control.
12. Recover from container restarts, VPS reboots, host disconnects, and interrupted Codex sessions.
13. Keep Codex and GitHub protocols isolated behind internal adapters.
14. Let the owner register several authorized Codex connections on one or more hosts.
15. Aggregate connection health and observed capacity into one scheduler-facing pool.
16. Isolate every Codex credential store and attribute each task attempt to the connection that ran it.

### Secondary goals

- Reusable agent profiles.
- Manager-generated task plans.
- Task dependencies and safe concurrency.
- Pull-request checks and reviews inside maxxy-me.
- Request-changes loops that resume the same Codex thread.
- Local and remote execution through one host protocol.
- Personal API tokens for trusted automations.
- Additional agent runtimes later through adapters.

---

## 3. Non-goals for Version One

Version one will not include:

- Multiple AI providers.
- Multi-user teams.
- Public account registration.
- Team billing or quota accounting.
- Provider-side merging of accounts, subscriptions, credits, or rate limits.
- Credential sharing, resale, or using identities the owner is not authorized to use.
- Routing intended to bypass provider enforcement, suspensions, or terms governing an account or workspace.
- Guaranteeing an exact remaining-usage total when Codex does not expose one.
- Agents merging their own pull requests.
- Two agents writing to the same worktree.
- A second hosted application platform or managed production database.
- SQLite as the production database.
- Redis, Kafka, RabbitMQ, or Kubernetes.
- A custom Git implementation.
- A custom terminal emulator.
- Direct browser access to Codex App Server.
- Reusing Codex Web browser cookies.
- Automatic migration of a live Codex turn between machines.
- An unrestricted browser shell.

---

## 4. Core Architectural Principles

### 4.1 The VPS owns the production system

The production VPS owns both the durable coordination layer and the first execution host. Responsibilities remain separated by service account, container or systemd unit, network, credential scope, and filesystem path.

The Docker Compose control-plane stack contains:

- authentication;
- web dashboard;
- REST API;
- browser WebSocket gateway;
- host-agent WebSocket gateway;
- task scheduler;
- dependency resolution;
- host assignment;
- task leases;
- event persistence;
- approvals;
- GitHub metadata and webhooks;
- PostgreSQL migrations;
- Caddy as the only application origin exposed to Cloudflare.

Native systemd services on the same VPS run the host agent and Codex. Repository and worktree data live in explicit persistent host directories, not in container writable layers.

### 4.2 Native host agents are the execution plane

Repositories and Codex processes run on enrolled persistent hosts.

A host may be:

- the production VPS;
- the user's computer;
- a home server;
- a development VPS;
- another machine that can maintain an outbound HTTPS/WSS connection.

Each host owns:

- repository clones;
- branches;
- worktrees;
- Codex authentication;
- GitHub push authentication;
- project dependencies;
- build and test toolchains;
- host-agent logs.

### 4.3 The browser is unprivileged

The browser must never directly:

- start Codex;
- run shell commands;
- read host files;
- modify worktrees;
- receive private SSH keys;
- receive long-lived Codex credentials;
- receive long-lived GitHub credentials;
- connect directly to Codex App Server.

All privileged actions are mediated by the VPS control plane and the authenticated host agent.

### 4.4 Outbound host connectivity

The host agent opens the connection to the Cloudflare-proxied production domain.

```text
Execution host
      │
      │ authenticated WSS
      ▼
Cloudflare edge
      │
      ▼
Caddy → VPS control plane
```

This avoids requiring:

- a public port on the user's computer;
- inbound SSH from the control plane;
- a static home IP address;
- direct exposure of Codex;
- direct exposure of the host filesystem.

### 4.5 One branch, worktree, and pull request per write task

Each write task gets isolated Git state.

```text
Repository clone
├── branch/worktree for frontend task
├── branch/worktree for backend task
└── branch/worktree for testing task
```

The isolation unit is the task, not the permanent agent identity.

### 4.6 Agents propose; the user integrates

Agents may:

- edit their assigned worktree;
- run approved commands;
- validate changes;
- commit;
- push their branch;
- create or update a pull request;
- respond to requested changes.

Agents may not:

- push directly to the protected default branch;
- merge their pull request;
- disable required checks;
- change repository protection;
- delete protected branches;
- approve their own sensitive actions.

### 4.7 Persist before broadcasting

Important state changes are committed to PostgreSQL before they are broadcast.

This supports:

- event replay;
- reconnecting browsers;
- reconnecting hosts;
- task reconciliation;
- audit history;
- container and VPS-reboot recovery.

### 4.8 External systems stay behind adapters

Raw Codex, GitHub, and host-protocol details stay in dedicated packages.

```text
Codex App Server → codex-adapter → internal runtime events
GitHub API        → github package → internal provider models
Host WebSocket    → host protocol  → internal execution commands
```

### 4.9 Codex capacity is pooled logically, not credentially

Each connected Codex account or API key is a separate **Codex connection**. In version one, every ChatGPT-backed connection receives its own `CODEX_HOME` configured with `cli_auth_credentials_store = "file"`; the resulting `auth.json` is protected as a password. API keys use an independent host secret reference. Credential bytes never enter normal control-plane requests, PostgreSQL rows, browser payloads, events, or logs. OS-keyring storage may be enabled later only after distinct per-connection keyring namespaces are verified on the target platform.

The scheduler exposes these isolated connections as one logical capacity pool:

```text
Codex capacity pool
├── Personal Pro connection → isolated credential lane
├── Secondary authorized connection → isolated credential lane
└── API project key → isolated credential lane
```

Pooling means that maxxy-me may route different task attempts to different eligible connections. It does not combine provider identities, alter provider-enforced limits, or make one live Codex thread portable between accounts.

Connection onboarding requires the owner to confirm that each identity or API project is authorized for this use and permitted by the applicable OpenAI plan, workspace, and organization policies. Provider authentication failures, suspensions, and limit responses are terminal for that lane until legitimately resolved; the scheduler must not disguise or retry around enforcement.

For ChatGPT-managed authentication, version one defaults to one active task per connection lane. This follows the conservative automation rule that one cached `auth.json` should belong to one machine or serialized job stream. API-key connections may use a configurable concurrency limit enforced alongside provider rate limits.

Capacity values are observations, not entitlements. The host may report supported Codex status or rate-limit signals, active leases, cooldowns, and reset times. The dashboard must label derived totals as estimated whenever the provider does not expose an authoritative number.

| Source signal | Dashboard treatment | Scheduler treatment |
|---|---|---|
| Authoritative remaining value | Sum once per distinct capacity source | Route within the reported remaining and concurrency bounds |
| Reset time or cooldown only | Show status and reset time, not a fabricated numeric remainder | Hold new work until the reset or a successful health check |
| Ready with no quota value | Show ready source/lane counts and **capacity unknown** | Route conservatively within configured concurrency |
| Authentication expired | Show reauthentication required | Exclude the connection |
| Policy blocked or suspended | Show blocked without failover-around-enforcement | Disable the capacity source until legitimately resolved |

### 4.10 Cloudflare is the edge, not the application host

Cloudflare owns the public DNS zone, proxied records, visitor TLS, and edge protections. It does not run maxxy-me application services or store authoritative application data.

Production requests follow this path:

```text
Browser or host agent
        ↓ HTTPS / WSS
Cloudflare proxied domain
        ↓ authenticated origin TLS
Caddy on the VPS
        ↓ private Compose network
Web and worker services
        ↓
PostgreSQL
```

Cloudflare SSL/TLS mode must be **Full (strict)**. Caddy presents a matching Cloudflare Origin CA certificate, and direct origin traffic is blocked except for explicitly administered paths. The application trusts `CF-Connecting-IP` only when the request came from a current Cloudflare IP range; arbitrary client-supplied forwarding headers are ignored.

---

## 5. Technology Stack

### 5.1 Core

| Area | Technology |
|---|---|
| Language | TypeScript in strict mode |
| Runtime | Bun |
| Package manager | Bun |
| Monorepo | Bun workspaces |
| Web framework | Next.js App Router |
| Frontend | React |
| Runtime validation | Zod |

### 5.2 Database

| Area | Technology |
|---|---|
| Production database | Self-hosted PostgreSQL on the VPS |
| Local database | PostgreSQL |
| ORM | Drizzle ORM |
| Migrations | Drizzle Kit |
| Queue foundation | PostgreSQL rows and leases |
| Event storage | PostgreSQL |

SQLite is not used for production control-plane state.

### 5.3 Frontend

| Purpose | Technology |
|---|---|
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Icons | Lucide React |
| Server state | TanStack Query |
| Local UI state | Zustand |
| Forms | React Hook Form |
| Code and diff view | Monaco Editor |
| Terminal output | xterm.js |
| Panels | react-resizable-panels |
| Themes | next-themes |

### 5.4 Control plane

| Purpose | Technology |
|---|---|
| Web process | Next.js and Bun |
| Worker process | Bun |
| HTTP API | Next.js routes or Bun service boundary |
| Live communication | Authenticated WebSocket |
| Process deployment | Docker Compose on the VPS |
| Release migrations | One-shot Compose migration service |
| Authentication | Better Auth |
| Logging | Structured JSON |

### 5.5 Execution plane

| Purpose | Technology |
|---|---|
| Host service | maxxy host agent |
| Agent runtime | Codex App Server |
| Optional internal runtime | Codex SDK |
| Credential isolation | One file-backed `CODEX_HOME` per ChatGPT connection; one host secret slot per API connection |
| Capacity telemetry | Host-reported health, leases, cooldowns, and supported usage signals |
| Process execution | `Bun.spawn()` |
| Source control | Git |
| Isolation | Git worktrees |
| GitHub push | Host Git credentials or GitHub CLI |
| Connectivity | Outbound HTTPS/WSS |

### 5.6 GitHub

| Purpose | Technology |
|---|---|
| Metadata and PR API | GitHub App |
| Webhook updates | GitHub webhooks |
| Branch push | Execution-host credentials |
| CI checks | GitHub Actions |
| Merge protection | GitHub branch protection |

### 5.7 Quality

| Purpose | Technology |
|---|---|
| Formatting and linting | Biome |
| Unit and integration tests | Bun test |
| React tests | React Testing Library |
| End-to-end tests | Playwright |
| CI/CD | GitHub Actions |
| Container delivery | Docker, Compose, and immutable image digests |

---

## 6. High-Level Architecture

```text
User browser / optional remote host agents
                    │ HTTPS / WSS
                    ▼
      Cloudflare DNS, proxy, and edge TLS
                    │ Full (strict) origin TLS
                    ▼
                VPS: Caddy
                    │ private Compose network
          ┌─────────┴─────────┐
          ▼                   ▼
   Web/API/WebSockets    Worker/scheduler
          └─────────┬─────────┘
                    ▼
              PostgreSQL
                    │ task commands and events
                    ▼
      Native systemd host agent on VPS
                    │
      Codex lanes, repos, and worktrees
                    │
                    ▼
                  GitHub
```

Additional execution hosts use the same authenticated outbound WSS protocol. They never require public inbound control ports.

---

## 7. VPS Process Model

### 7.1 Web process

The web process owns:

- Next.js pages;
- owner authentication;
- session validation;
- REST endpoints;
- browser WebSockets;
- host-agent WebSockets;
- GitHub webhook receipt;
- event replay;
- quick task commands;
- health endpoints.

It must not wait synchronously for a Codex task to finish.

### 7.2 Worker process

The worker owns:

- task scheduling;
- dependency resolution;
- host selection;
- task leases;
- stale lease recovery;
- host-offline detection;
- reconciliation;
- event retention;
- background GitHub synchronization.

### 7.3 Release process

The release process runs:

```text
bun run db:migrate
```

A failed migration blocks the release and leaves the previously running application image selected.

### 7.4 Database

The private PostgreSQL container stores all durable control-plane state on an explicit VPS volume. It is not published to the internet.

### 7.5 Container filesystem rule

No important runtime state may exist only in a container writable layer.

Temporary files may be created during a request or worker operation, but they must not be treated as durable. PostgreSQL data, Caddy origin configuration, deployment metadata, repositories, worktrees, and host-agent state use explicit volumes or host paths.

---

## 8. Monorepo Structure

```text
maxxy-me/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   └── lib/
│   │
│   ├── orchestrator/
│   │   └── src/
│   │       ├── scheduler/
│   │       ├── reconciliation/
│   │       ├── leases/
│   │       ├── retention/
│   │       └── jobs/
│   │
│   └── host-agent/
│       └── src/
│           ├── connection/
│           ├── codex-connections/
│           ├── capacity/
│           ├── commands/
│           ├── codex/
│           ├── git/
│           ├── worktrees/
│           ├── policies/
│           └── recovery/
│
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── codex-adapter/
│   ├── codex-capacity/
│   ├── workspace-runtime/
│   ├── host-protocol/
│   ├── git/
│   ├── github/
│   ├── scheduler/
│   ├── security/
│   ├── logger/
│   ├── ui/
│   └── config/
│
├── docs/
├── scripts/
├── Dockerfile
├── compose.yaml
├── compose.production.yaml
├── Caddyfile
├── deploy/
│   └── systemd/
├── package.json
├── bun.lock
├── biome.json
├── tsconfig.json
├── ARCHITECTURE.md
├── user-flow.md
├── execution-phase.md
└── README.md
```

---

## 9. Application Boundaries

### 9.1 Web application

The Next.js application is responsible for:

- rendering the dashboard;
- authentication screens;
- workspace and task management;
- displaying live events;
- presenting approvals;
- showing host health;
- showing pull requests and checks;
- issuing user commands;
- creating WebSocket tickets.

It does not execute repository commands or Codex.

### 9.2 Orchestrator worker

The worker is responsible for durable coordination:

- readiness calculation;
- dependency resolution;
- task assignment;
- task leases;
- retries;
- stale task handling;
- host capacity;
- Codex connection eligibility and capacity;
- account-aware leases and cooldowns;
- reconciliation;
- maintenance jobs.

### 9.3 Host agent

The host agent is responsible for privileged execution:

- maintaining the outbound WSS connection;
- reporting host health;
- validating workspace paths;
- cloning or opening repositories;
- creating and removing worktrees;
- starting Codex App Server;
- maintaining isolated Codex credential lanes;
- reporting per-connection health and observed capacity;
- forwarding normalized events;
- running approved commands;
- committing and pushing branches;
- opening or updating pull requests;
- surviving control-plane reconnects.

### 9.4 Database package

The database package owns:

- Drizzle schemas;
- migrations;
- PostgreSQL connections;
- transaction helpers;
- database repositories;
- idempotency helpers;
- lease operations;
- test factories.

Route handlers and runtime adapters should not use raw Drizzle queries directly.

### 9.5 Contracts package

The contracts package owns Zod schemas for:

- HTTP requests and responses;
- WebSocket messages;
- host commands;
- host events;
- task and agent status;
- approval decisions;
- Git and GitHub results;
- errors;
- compatibility versions.

### 9.6 Codex adapter

The Codex adapter owns:

- App Server process startup;
- JSONL framing;
- thread creation and resume;
- turn start and steer;
- interrupt;
- approval responses;
- event normalization;
- process failure detection.
- connection selection inputs and normalized limit signals.

Raw Codex messages do not leave this package.

### 9.7 Git package

The Git package owns:

- repository discovery;
- fetch;
- branch creation;
- worktree creation;
- status;
- diff;
- commit;
- push;
- cleanup;
- conflict detection.

### 9.8 GitHub package

The GitHub package owns:

- GitHub App authentication;
- repository metadata;
- pull-request creation and update;
- checks and review status;
- webhook verification;
- webhook deduplication;
- merge status.

### 9.9 Security package

The security package owns:

- token hashing;
- token scope validation;
- encryption helpers;
- path containment checks;
- command policy;
- origin validation;
- redaction.

---

## 10. Host Enrollment and Connection

### 10.1 Enrollment

1. Owner creates a one-time enrollment token.
2. User starts the host agent with the token.
3. Host agent exchanges the token over HTTPS.
4. Server stores the assigned host and token hash.
5. Enrollment token becomes invalid.
6. Host agent stores its host ID and secret in a protected local file.

### 10.2 Persistent connection

The host agent opens:

```text
wss://<maxxy-domain>/api/host/connect
```

The connection includes:

- host authentication;
- protocol version;
- host version;
- tool inventory;
- capacity;
- heartbeat.

### 10.3 Reconnection

After reconnecting, the host reports:

- active local runs;
- worktrees;
- Codex process state;
- pending local events;
- last acknowledged command sequence.

The worker reconciles these against PostgreSQL leases.

---

## 11. Workspace Model

A workspace connects a GitHub repository to an execution-host policy.

```ts
interface Workspace {
  id: string;
  name: string;
  repositoryId: string;
  defaultHostId?: string;
  baseBranch: string;
  projectPath: string;
  worktreeRoot: string;
  maximumConcurrentAgents: number;
  codexPoolId?: string;
  codexRoutingPolicy: "balanced" | "ordered" | "manual";
  approvalPolicy: ApprovalPolicy;
  validationProfileId?: string;
}
```

A repository may be registered on several hosts. Each host keeps its own clone and worktrees.

---

## 12. Agent and Task Model

### 12.1 Agent profile

```ts
interface AgentProfile {
  id: string;
  name: string;
  role:
    | "manager"
    | "architect"
    | "frontend"
    | "backend"
    | "testing"
    | "reviewer"
    | "integrator"
    | "custom";
  instructions: string;
  sandboxMode: "read-only" | "workspace-write";
  canCreateSubagents: boolean;
}
```

### 12.2 Agent session

```ts
interface AgentSession {
  id: string;
  workspaceId: string;
  taskId: string;
  profileId: string;
  hostId: string;
  codexConnectionId: string;
  attemptNumber: number;
  threadId?: string;
  turnId?: string;
  worktreeId?: string;
  status: AgentStatus;
}
```

### 12.3 Task

```ts
interface Task {
  id: string;
  workspaceId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  assignedHostId?: string;
  assignedCodexConnectionId?: string;
  preferredCodexPoolId?: string;
  assignedProfileId?: string;
  branchName?: string;
  baseSha?: string;
  pullRequestId?: string;
  priority: number;
}
```

### 12.4 Task dependencies

Dependencies are stored separately.

A task becomes ready only when all required predecessors satisfy the configured completion condition.

### 12.5 Codex connections and capacity pools

```ts
type CodexAuthMode = "chatgpt" | "api_key" | "enterprise_access_token";

interface CodexConnection {
  id: string;
  hostId: string;
  capacitySourceId: string;
  label: string;
  authMode: CodexAuthMode;
  status:
    | "signed_out"
    | "authenticating"
    | "ready"
    | "limited"
    | "cooldown"
    | "expired"
    | "disabled"
    | "policy_blocked"
    | "revoked"
    | "error";
  credentialSlotId: string; // opaque host-local identifier, never a credential
  maxConcurrentRuns: number;
  lastHealthAt?: string;
}

interface CodexCapacitySource {
  id: string;
  label: string;
  kind: "chatgpt_account" | "api_project" | "enterprise_workspace";
  providerScopeHint?: string; // masked, non-secret, and optional
}

interface CodexCapacityPool {
  id: string;
  name: string;
  routingPolicy: "balanced" | "ordered" | "manual";
  memberConnectionIds: string[];
}

interface CodexCapacitySnapshot {
  id: string;
  capacitySourceId: string;
  reportingConnectionId: string;
  availability: "available" | "limited" | "cooldown" | "unknown";
  remainingPercent?: number;
  resetAt?: string;
  observationSource: "codex_status" | "runtime_event" | "rate_limit_error" | "manual";
  observedAt: string;
}

interface TaskRuntimeAttempt {
  id: string;
  taskId: string;
  attemptNumber: number;
  hostId: string;
  codexConnectionId: string;
  capacitySourceId: string;
  threadId?: string;
  handoffFromAttemptId?: string;
  handoffReason?: string;
}
```

The control plane stores connection metadata, policy, health, and usage observations. The host stores the actual credential material. `credentialSlotId` only identifies a protected local slot.

A **capacity source** represents the underlying provider-side account, API project, or enterprise workspace whose limits may be shared. Several host-local connections may point to one source, but registering the same identity on two hosts does not create additional pooled capacity. If Codex does not expose a stable non-secret identity hint, the owner must attach the connection to an existing source manually or accept an explicit unknown/deduplication warning.

Capacity snapshots are attached to the source, with the reporting connection recorded as provenance. A connection lease includes both `codexConnectionId` and `capacitySourceId`, so scheduler transactions enforce local lane concurrency and shared provider-source concurrency together.

Each task attempt records its selected connection. A running turn is pinned to that connection. If the connection becomes unavailable before a new turn, maxxy-me may create a new attempt on another pool member with an explicit context handoff; it must never claim to have migrated the original live thread.

---

## 13. Task State Machine

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

All transitions go through one state-transition service.

Invalid transitions are rejected.

---

## 14. Scheduling and Leases

PostgreSQL is the initial durable queue.

The scheduler uses:

- task rows;
- task dependency rows;
- lease rows;
- atomic claims;
- transaction locks;
- host capacity;
- Codex pool membership;
- connection readiness, cooldown, and concurrency;
- per-connection capacity leases;
- lease expiration;
- polling;
- optional PostgreSQL notifications.

A task may have only one active lease.

A task attempt may also have only one active Codex connection lease. Host capacity and Codex capacity are separate constraints; both must be available before assignment.

Selection order is:

1. filter to online compatible hosts;
2. filter to workspace-allowed pool members on those hosts and group them by capacity source;
3. exclude signed-out, expired, disabled, policy-blocked, revoked, limited, or cooling-down connections;
4. enforce connection and host concurrency;
5. apply the pool routing policy and recent observed utilization;
6. atomically lease the task and selected connection;
7. send the command containing only `codexConnectionId`, never credentials.

The host must heartbeat a running task before the lease expires.

---

## 15. Agent Execution Lifecycle

```text
User creates task
        ↓
Scheduler confirms dependencies
        ↓
Scheduler selects an online host
        ↓
Scheduler leases an eligible Codex connection
        ↓
Host claims task lease
        ↓
Host fetches base branch
        ↓
Host creates task branch and worktree
        ↓
Host starts Codex App Server
with the selected credential namespace
        ↓
Codex thread and turn start
        ↓
Events are normalized and uploaded
        ↓
Approvals pause the operation when needed
        ↓
Codex finishes
        ↓
Host runs validation
        ↓
Host commits and pushes branch
        ↓
GitHub pull request is created or updated
        ↓
Task becomes awaiting_review
        ↓
User requests changes, closes, or merges
```

---

## 16. Git and Worktree Strategy

### 16.1 One clone per repository per host

The host normally keeps one main clone.

```text
<project-root>/<repository>
```

Task worktrees live under:

```text
<worktree-root>/<workspace-id>/<task-id>-<agent-role>
```

### 16.2 Branch naming

```text
maxxy/<task-id>/<agent-role>
```

### 16.3 Worktree rules

1. Never run a write task in the main checkout.
2. Never assign two write tasks to one worktree.
3. Record the base SHA.
4. Preserve dirty worktrees after failure.
5. Push completed branches promptly.
6. Delete worktrees only after the branch is preserved.
7. Require approval for destructive cleanup.

---

## 17. GitHub Pull-Request Workflow

### 17.1 Pull-request creation

After the first successful push, maxxy-me creates a draft pull request.

The body includes:

- task goal;
- agent role;
- implementation summary;
- changed files;
- validation results;
- risks;
- dependencies;
- task ID;
- host name.

### 17.2 Synchronization

GitHub webhooks update:

- PR state;
- checks;
- reviews;
- mergeability;
- merge result;
- new commits.

Webhook deliveries are signature-verified and deduplicated.

### 17.3 Merge authority

Only an authenticated owner action may request a merge.

Branch protection remains the final GitHub enforcement layer.

---

## 18. Approval Model

Approval types include:

```text
command
file_change
network_access
dependency_install
database_migration
git_force_push
git_reset
worktree_delete
host_operation
```

Decisions include:

```text
approve_once
approve_for_session
decline
cancel
```

Every decision is persisted and audited.

---

## 19. WebSocket Protocols

### 19.1 Browser WebSocket

Used for:

- live task events;
- approval notifications;
- host status;
- pull-request updates;
- event replay.

The browser uses a short-lived ticket.

### 19.2 Host-agent WebSocket

Used for:

- heartbeat;
- command delivery;
- command acknowledgments;
- Codex events;
- output chunks;
- task completion;
- reconnect reconciliation.

### 19.3 Event envelope

```ts
interface EventEnvelope<T = unknown> {
  id: string;
  type: string;
  workspaceId?: string;
  taskId?: string;
  hostId?: string;
  runId?: string;
  attemptId?: string;
  codexConnectionId?: string;
  capacitySourceId?: string;
  sequence: number;
  timestamp: string;
  payload: T;
}
```

Important events are stored before they are sent.

---

## 20. Database Design

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
repository_hosts

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
pull_request_reviews
github_webhook_deliveries

personal_api_tokens
audit_logs
settings
```

`accounts` is reserved for the maxxy-me authentication library's owner-login records. Codex runtime identities belong only in `codex_connections`; the two concepts must not share tables or secrets.

### Storage rules

- Use UTC timestamps.
- Use foreign keys.
- Use idempotency keys.
- Validate JSON payloads before persistence.
- Hash host and personal API tokens.
- Never store raw Codex credentials.
- Never store `auth.json`, refresh tokens, API keys, or enterprise access tokens in PostgreSQL.
- Treat reported usage as an observation with a source and timestamp, not as a guaranteed entitlement.
- Never store raw GitHub push credentials.
- Do not store repository file contents as the source of truth.
- Run scheduled encrypted PostgreSQL dumps and copy them to an off-server backup destination.

---

## 21. Authentication and Authorization

### 21.1 Owner account

Version one has one owner.

After the first account is created:

- public registration is disabled;
- all dashboard routes require authentication;
- all WebSockets require authentication;
- privileged actions require the owner role.

### 21.2 Personal API tokens

Tokens have:

- a name;
- scopes;
- expiration;
- revocation;
- last-used time;
- secure hash storage.

Merge permission is disabled by default.

### 21.3 Host tokens

Host tokens are:

- unique per host;
- revocable;
- stored as hashes in PostgreSQL;
- stored in a protected file on the host;
- never sent to the browser.

### 21.4 Codex connections

Only the owner may add, reauthenticate, disable, reprioritize, or remove a Codex connection. Setup is initiated from the dashboard but completed by the official Codex login flow or a local secret prompt on the selected host.

The browser may receive:

- connection label and authentication mode;
- masked account or workspace hint when Codex supplies one;
- readiness, cooldown, and last-health timestamps;
- observed capacity and active lease counts.

The browser and control plane must never receive the cached ChatGPT credential file, refresh token, raw API key, or OS-keyring secret.

---

## 22. Security Model

### 22.1 Web security

Use:

- HTTPS;
- WSS;
- secure HTTP-only cookies;
- CSRF protection;
- origin validation;
- CSP;
- HSTS;
- request size limits;
- rate limits.

### 22.2 Host security

The host agent:

- runs as a non-root user;
- restricts paths to configured roots;
- validates every command;
- filters environment variables;
- limits output size;
- supports process-tree cancellation;
- records commands;
- requires approvals based on risk.

### 22.3 Secret separation

Control-plane secrets live in root-owned `0600` environment files under `/etc/maxxy-me`. Cloudflare Origin CA private keys are mounted only into Caddy. Optional Cloudflare API tokens are available only to DNS/deployment automation and use the narrowest required zone permissions.

Codex and Git push credentials remain on execution hosts.

Each Codex connection uses a separate host-local credential namespace. The host resolves an opaque connection ID to that namespace only after authenticating and authorizing the control-plane command.

The browser receives neither.

### 22.4 Repository security

Repository content may contain malicious instructions.

Agent prompts and command policies must treat repository files as untrusted input.

---

## 23. Reliability and Recovery

### 23.1 Service and VPS restart recovery

On worker startup:

1. load active task leases;
2. inspect host heartbeat state;
3. request active host runs;
4. reconcile task and host state;
5. expire abandoned leases;
6. preserve uncertain worktrees;
7. resume event delivery.
8. expire orphaned Codex connection leases and retain cooldown observations.

### 23.2 Host reconnect recovery

The host uploads:

- missed events;
- active run IDs;
- worktree status;
- local branch state.

### 23.3 Idempotency

The following operations must be idempotent:

- task creation;
- host command dispatch;
- event ingestion;
- branch push request;
- pull-request creation;
- webhook processing;
- approval decisions.

### 23.4 Compatibility

Track:

- control-plane version;
- host-agent version;
- protocol version;
- Codex version;
- database schema version.

### 23.5 Limit handling and connection failover

Provider limit signals are normalized into `available`, `limited`, `cooldown`, or `unknown` capacity states. A limited connection receives no new work until a supported reset time passes or a fresh health check succeeds.

Failover rules:

- never move an in-progress turn between connections;
- allow an active turn to finish when Codex permits it;
- retry only idempotent start failures automatically;
- create a new task attempt and Codex thread when another connection must continue the work;
- keep the same task branch and worktree only after local process ownership is reconciled;
- persist the handoff summary, source connection, destination connection, and reason;
- require user confirmation when context loss or billing-mode change is material.

---

## 24. Deployment Topologies

### 24.1 Local development

```text
Browser
  ↓
Local web process
  ↓
Local worker
  ↓
Local PostgreSQL
  ↓
Local host agent
  ↓
Codex and worktrees
```

### 24.2 Production single-VPS topology

```text
Cloudflare-managed domain
      ↓ proxied HTTPS / WSS
Cloudflare edge
      ↓ Full (strict) TLS
Caddy on VPS
      ↓ private Compose network
Web/API/WebSocket gateway ↔ Worker
      ↓
Private PostgreSQL container
      ↑ authenticated host protocol
Native host agent on VPS
      ↓
Codex, Git, repositories, worktrees
      ↓
GitHub pull requests
```

### 24.3 Initial service formation

Initial scale:

```text
caddy=1
web=1
worker=1
postgres=1
host-agent=1 native systemd service
```

Horizontal web scaling is deferred until cross-instance live-event distribution is implemented. Vertical capacity is constrained so Codex jobs cannot starve PostgreSQL or the control plane.

### 24.4 Backups

Back up:

- PostgreSQL dumps and restore metadata;
- GitHub repository and branches;
- deployment configuration;
- GitHub App configuration;
- host-agent configuration references;
- encrypted copies in an off-server destination.

Active worktrees are not the primary backup. Task branches should be pushed to GitHub.

---

## 25. Configuration

The complete variable list is maintained in `execution-phase.md`.

Primary control-plane variables include:

```env
APP_ENV=production
APP_NAME=maxxy-me
APP_URL=https://workspace.example.com
DATABASE_URL=<private-compose-postgres-url>
DEPLOYMENT_MODE=vps_single_host
CLOUDFLARE_PROXY_ENABLED=true
CLOUDFLARE_REAL_IP_HEADER=CF-Connecting-IP

AUTH_SECRET=<secret>
AUTH_URL=https://workspace.example.com
AUTH_ALLOW_SIGNUP=false
OWNER_BOOTSTRAP_EMAIL=owner@example.com

TRUSTED_ORIGINS=https://workspace.example.com
WS_TICKET_SECRET=<secret>
INTERNAL_SERVICE_SECRET=<secret>
TOKEN_PEPPER=<secret>
DATA_ENCRYPTION_KEY=<secret>

GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=

PROTOCOL_VERSION=1
```

Primary host-agent variables include:

```env
MAXXY_CONTROL_PLANE_URL=https://workspace.example.com
MAXXY_HOST_ID=
MAXXY_HOST_TOKEN=
MAXXY_PROJECT_ROOT=/home/user/projects
MAXXY_WORKTREE_ROOT=/home/user/.local/share/maxxy-me/worktrees
MAXXY_MAX_CONCURRENT_AGENTS=4
MAXXY_CODEX_ACCOUNTS_DIR=/home/user/.local/share/maxxy-me/codex-accounts
MAXXY_CODEX_CHATGPT_LANE_CONCURRENCY=1
MAXXY_CODEX_USAGE_POLL_INTERVAL_MS=60000
MAXXY_CODEX_FAILOVER_ENABLED=true
MAXXY_CODEX_REQUIRE_BILLING_MODE_CONFIRMATION=true

CODEX_BINARY=codex
CODEX_AUTH_MODE=chatgpt # legacy default used when no connection is selected

GIT_BINARY=git
GH_BINARY=gh
```

---

## 26. Testing Strategy

### Unit tests

Test:

- task transitions;
- dependency resolution;
- lease claims;
- token scopes;
- path validation;
- event normalization;
- webhook verification.

### Integration tests

Test:

- PostgreSQL repositories;
- migrations;
- WebSocket authentication;
- host enrollment;
- task leasing;
- Git worktrees;
- Codex JSONL fixtures;
- Codex connection selection and lease accounting;
- isolated `CODEX_HOME` resolution;
- capacity cooldown and failover rules;
- GitHub webhook deduplication.

### End-to-end tests

Test:

- owner setup;
- host enrollment;
- workspace creation;
- task execution;
- adding two Codex connections and routing separate tasks across them;
- exhausting or disabling one test connection and selecting another for a new attempt;
- approval response;
- PR creation;
- request changes;
- host disconnect;
- service restart and VPS reboot recovery.

---

## 27. Implementation Priorities

The authoritative order is defined in `execution-phase.md`.

The architectural milestone order is:

1. Prove Cloudflare → Caddy → Compose deployment, PostgreSQL persistence, migrations, WebSockets, and the native host agent.
2. Build contracts, database, authentication, and task leasing.
3. Build the persistent host agent.
4. Integrate Codex App Server.
5. Complete the branch, worktree, push, and pull-request vertical slice.
6. Add isolated multi-account connections and account-aware capacity leases.
7. Build the functional dashboard.
8. Add multi-agent planning and concurrency.
9. Add recovery, hardening, and production operations.

The first major product milestone is:

```text
One user task
→ one enrolled host
→ one worktree
→ one Codex run
→ one GitHub pull request
```

---

## 28. Architecture Decisions

### ADR-001: One VPS hosts the production system

**Decision:** A single VPS runs Caddy, the dashboard, API, WebSocket gateway, worker, release migrations, PostgreSQL, the first host agent, Codex, repositories, and worktrees.

**Reason:** The first personal deployment favors direct operational ownership and one predictable infrastructure boundary. Logical service and credential isolation is preserved inside that boundary.

### ADR-002: Persistent hosts execute code

**Decision:** Codex, repositories, and worktrees run through a native non-root host agent, initially on the production VPS and optionally on additional enrolled hosts.

**Reason:** Native host execution gives Codex controlled access to persistent project files and toolchains without mounting the Docker socket or broad host paths into web-facing containers.

### ADR-003: Use PostgreSQL for control-plane state

**Decision:** Use a private self-hosted PostgreSQL container in production and PostgreSQL locally.

**Reason:** Control-plane state must survive service restarts and VPS reboots while supporting leases, transactions, events, and concurrent workers.

### ADR-004: Use an outbound host agent

**Decision:** Execution hosts initiate authenticated WSS connections to the Cloudflare-proxied production domain.

**Reason:** This works behind NAT and avoids exposing local machines or Codex publicly.

### ADR-005: Use a separate worker

**Decision:** Scheduling and recovery run in a separate worker container.

**Reason:** Long-running coordination should not depend on the web request lifecycle.

### ADR-006: Use one branch and worktree per write task

**Decision:** Every write task has isolated Git state.

**Reason:** It prevents agents from overwriting one another and maps clearly to pull requests.

### ADR-007: GitHub pull requests are the review boundary

**Decision:** Agents push task branches and open PRs; the owner reviews and merges.

**Reason:** GitHub supplies durable CI, review, conflict, and audit workflows.

### ADR-008: Agents cannot merge

**Decision:** Only authenticated owner actions may initiate merging.

**Reason:** Human control remains the final safety boundary.

### ADR-009: Hide Codex and GitHub behind adapters

**Decision:** External protocols are translated into stable internal contracts.

**Reason:** Provider changes should not require rewriting the scheduler or dashboard.

### ADR-010: Use PostgreSQL as the first queue

**Decision:** Use task rows and leases before adding Redis.

**Reason:** The initial personal deployment does not require another stateful service.

### ADR-011: Use Docker Compose for VPS services

**Decision:** Deploy Caddy, Bun web and worker services, one-shot migrations, and PostgreSQL through Docker Compose using immutable application image digests.

**Reason:** Compose gives reproducible service definitions, private networking, explicit volumes, health checks, and controlled release sequencing on a single VPS.

### ADR-012: Pool Codex capacity through isolated connection lanes

**Decision:** Register each authorized ChatGPT account, API key, or enterprise access token as a separate host-local Codex connection. The scheduler may aggregate their available lanes and route new task attempts across them.

**Reason:** This delivers one orchestration capacity view without centralizing credentials, sharing one auth cache across accounts, or pretending provider-side limits have been merged.

### ADR-013: Cloudflare manages the public domain and edge

**Decision:** Use Cloudflare for authoritative DNS, proxied records, visitor TLS, DNSSEC, and origin shielding. Use **Full (strict)** TLS to Caddy with a Cloudflare Origin CA certificate.

**Reason:** This centralizes domain management and reduces direct origin exposure while keeping every application and data service on the VPS.

---

## 29. Future Extensions

- Tauri desktop shell.
- Packaged host-agent installers.
- Native notifications.
- Additional source-control providers.
- Additional coding-agent providers.
- Sandboxed container execution hosts.
- Stacked pull requests.
- Cost and usage reporting.
- Provider-authoritative quota APIs, if OpenAI exposes supported interfaces for them.
- Scheduled tasks.
- Team collaboration.
- Redis or another queue only if scale requires it.
- Horizontal WebSocket scaling.
- Mobile companion application.

---

## 30. Final Architecture Summary

```text
Custom domain
    ↓
Cloudflare DNS, proxy, and edge TLS
    ↓
Caddy on the VPS
    ↓
Web + worker + release migrations + PostgreSQL
    ↓
Native host agent and optional remote execution hosts
    ├── maxxy host agent
    ├── isolated Codex connection lanes
    ├── Codex App Server
    ├── repository clone
    └── one branch/worktree per task
    ↓
GitHub pull request
    ↓
User review and merge
```

The central architectural rules are:

> Cloudflare protects the public edge; the VPS coordinates and executes the work; agents submit pull requests; and the user decides what is merged.

> Multiple Codex connections contribute schedulable capacity through isolated lanes; maxxy-me aggregates availability and attribution, never credentials or provider accounts.
