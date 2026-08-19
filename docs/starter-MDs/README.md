# maxxy-me

**maxxy-me** is a personal, web-based control center for coordinating multiple Codex coding agents across persistent local and remote development hosts.

The complete production system runs on one VPS and is accessed through a Cloudflare-managed custom domain. Cloudflare provides authoritative DNS, the proxied public edge, and visitor TLS. The VPS runs Caddy, the dashboard, API, scheduler, PostgreSQL, the host agent, Codex, repositories, worktrees, credentials, and development toolchains.

The owner can connect multiple authorized Codex accounts or API projects. maxxy-me keeps every credential in an isolated host-local lane, shows their usable capacity in one dashboard pool, and schedules new task attempts across available lanes. This is a logical orchestration pool: OpenAI accounts, billing, credits, and provider-enforced limits remain separate.

The owner can also create reusable Codex-compatible skills, attach exact skill versions to reusable root and expert profiles, and choose a different model and reasoning effort for every agent. The root agent generates the plan, the user approves it, expert agents execute independent work in parallel, and the root resumes to validate and present the combined result.

Each write task receives its own Git branch and Git worktree. When an agent finishes, it validates the changes, pushes the branch to GitHub, and opens a pull request for human review.

Agents propose changes. You decide what gets merged.

> Project status: architecture and planning phase.

## What maxxy-me will provide

- A private dashboard available through a custom domain.
- A self-hosted web and orchestration control plane on one VPS.
- Self-hosted PostgreSQL for persistent application state.
- Cloudflare-managed DNS, proxying, edge TLS, and origin shielding.
- The production VPS as the first persistent execution host, with optional additional hosts later.
- A lightweight maxxy host agent that connects outward through authenticated WSS.
- Multiple specialized Codex agents working concurrently.
- Reusable, versioned skills such as `figma-to-code`.
- Reusable root and expert agent profiles with attached skill versions.
- User-configurable model and reasoning settings globally, per workspace, per role, per profile, and per task run.
- Root-agent planning, user plan approval, parallel delegation, result collection, final validation, and consolidated reporting.
- Multiple isolated Codex connections contributing to one scheduler-facing capacity pool.
- Per-connection health, cooldown, usage observations, task attribution, and failover controls.
- Task dependencies and agent scheduling.
- Live messages, command output, approvals, and status updates.
- One isolated Git branch and worktree per write task.
- Automatic branch push and GitHub pull-request creation.
- Pull-request checks, reviews, and merge status inside the dashboard.
- Human-controlled review and merging.
- Durable task, event, approval, and audit history.

## Core workflow

```text
Open the maxxy-me dashboard
        ↓
Create or reuse skills and agent profiles
        ↓
Configure root and expert models and reasoning efforts
        ↓
Submit a project goal to the root agent
        ↓
Root generates tasks, dependencies, experts, skills, and ownership
        ↓
Approve or edit the plan
        ↓
Scheduler launches independent expert agents concurrently
        ↓
Each write task uses a pinned model, skill set, branch, and worktree
        ↓
Experts validate, push, and open pull requests
        ↓
Reviewer or integrator results return to the root
        ↓
Root resumes, validates the combined outcome, and reports completion
        ↓
You request changes, close, or merge approved pull requests
```

Different agents can work in parallel when their tasks are independent.

```text
Feature request
└── Root agent → approved plan
    ├── Frontend expert + skills/model → frontend worktree → PR
    ├── Backend expert + skills/model  → backend worktree  → PR
    ├── Test expert + skills/model     → testing worktree  → PR
    └── Reviewer/integrator → durable results → root final synthesis
```

## Deployment model

### Cloudflare edge and single-VPS origin

Cloudflare manages the public domain and proxies browser and host-agent traffic to the VPS. It does not run application or database services.

```text
Cloudflare-managed domain
      ↓ proxied HTTPS / WSS
Cloudflare edge
      ↓ Full (strict) origin TLS
Caddy on the VPS
      ↓ private Docker network
├── maxxy-me web process
│   ├── Next.js dashboard and authentication
│   ├── HTTP API and WebSocket gateway
│   └── GitHub webhooks
├── maxxy-me worker process
│   ├── Scheduler, dependencies, and host assignment
│   └── Lease recovery and reconciliation
├── one-shot Drizzle migration service
└── PostgreSQL with a persistent private volume
```

### Persistent execution hosts

Codex work is performed on an enrolled host:

```text
Production VPS or another enrolled host
├── maxxy host agent
├── isolated Codex credential lanes
├── Codex connection and capacity manager
├── model and reasoning capability catalog
├── verified read-only skill materializations
├── root and expert Codex sessions
├── Codex App Server
├── Git
├── GitHub credentials
├── Repository clone
├── Agent branches
└── Git worktrees
```

The host agent opens an authenticated outbound WebSocket connection to the Cloudflare-proxied domain. This keeps one protocol for the VPS and optional remote hosts while avoiding public SSH, Codex, Docker, database, or host-agent control ports.

### Why Codex runs as a native host service

Codex needs controlled access to persistent repositories, worktrees, credentials, and project toolchains. Mounting those resources—or the Docker socket—into a public-facing web container would create unnecessary privilege.

Therefore, Caddy, web, worker, migrations, and PostgreSQL run through Docker Compose, while the non-root host agent and Codex run as native systemd services. Explicit VPS paths persist:

- repositories;
- worktrees;
- uncommitted changes;
- Codex login state;
- GitHub CLI login state;
- database files;
- canonical published skill packages and version manifests.

GitHub is the durable source of truth for pushed code, PostgreSQL is the source of truth for control-plane state, and persistent VPS directories preserve active worktrees and host-agent state. Encrypted backups are copied off the VPS.

Only the web/worker skill-registry path may publish to the canonical skill store. The native host agent reads that store through a read-only mount and writes verified, pinned materializations to its separate skill cache; application containers never receive the cache, repositories, worktrees, Codex credentials, or Git push credentials.

## Planned technology stack

### Application

- Next.js App Router
- React
- TypeScript in strict mode
- Bun runtime and package manager
- Bun workspaces
- Zod

### Data

- Self-hosted PostgreSQL on the VPS in production
- PostgreSQL in local development
- Drizzle ORM
- Drizzle Kit migrations

SQLite is not the production database. It may be used only for isolated fixtures or a future embedded local-only edition.

### Interface

- Tailwind CSS
- shadcn/ui
- Lucide React
- TanStack Query
- Zustand
- React Hook Form
- Monaco Editor
- xterm.js
- react-resizable-panels
- next-themes

### Control plane

- Next.js web process
- Bun orchestration worker
- Bun HTTP and WebSocket services
- Postgres-backed task scheduling and leases
- Authenticated host-agent WebSockets
- GitHub webhook processing
- Structured event persistence
- Versioned skill, agent-profile, model-policy, plan, delegation, and result metadata

### Execution hosts

- maxxy host agent
- Codex App Server
- Codex model and supported-reasoning discovery
- Codex-compatible skill discovery and explicit skill inputs
- Per-attempt runtime snapshots for connection, model, reasoning, skills, and permissions
- `Bun.spawn()`
- Git
- Git worktrees
- GitHub CLI or host credential manager
- Native development toolchains

### Hosting and security

- Linux VPS
- Docker Engine and Docker Compose
- Caddy origin reverse proxy
- Cloudflare authoritative DNS and proxied records
- Cloudflare SSL/TLS **Full (strict)** with an Origin CA certificate
- Cloudflare DNSSEC and origin-IP firewall restrictions
- Native systemd host-agent service
- Better Auth
- GitHub App integration
- GitHub branch protection

### Testing and quality

- Bun test
- React Testing Library
- Playwright
- Biome
- GitHub Actions
- Container build checks
- Migration tests

## Planned repository structure

```text
maxxy-me/
├── apps/
│   ├── web/                    # Next.js dashboard and public API
│   ├── orchestrator/           # Scheduler and control-plane worker
│   └── host-agent/             # Persistent execution-host service
│
├── packages/
│   ├── contracts/              # Shared schemas and event types
│   ├── database/               # PostgreSQL and Drizzle
│   ├── codex-adapter/          # Codex App Server integration
│   ├── codex-capacity/         # Connection registry, capacity, leases, routing
│   ├── skill-registry/         # Codex-compatible packages, versions, hashes, bindings
│   ├── model-catalog/          # Connection-scoped models and reasoning capabilities
│   ├── orchestration/          # Root plans, delegations, result bundles, finalization
│   ├── workspace-runtime/      # Host execution contracts
│   ├── git/                    # Git and worktree operations
│   ├── github/                 # Pull requests, checks, and webhooks
│   ├── scheduler/              # Dependencies, leases, and concurrency
│   ├── security/               # Token, path, and command policies
│   ├── logger/                 # Structured logging
│   ├── ui/                     # Shared UI components
│   └── config/                 # Shared tooling configuration
│
├── docs/
├── scripts/
├── Dockerfile
├── compose.yaml
├── compose.production.yaml
├── Caddyfile
├── deploy/
│   └── systemd/
├── ARCHITECTURE.md
├── user-flow.md
├── execution-phase.md
└── README.md
```

## Pull-request policy

Every write-capable agent task follows these rules:

1. Fetch the configured base branch.
2. Create a dedicated task branch.
3. Create a dedicated Git worktree.
4. Start a dedicated Codex thread in that worktree.
5. Modify only the assigned task scope.
6. Run required lint, type-check, test, and build commands.
7. Commit with a clear task-linked message.
8. Push the task branch to GitHub.
9. Open or update one pull request for the task.
10. Include a summary, validation results, risks, and dependencies.
11. Stop for human review.

Agents must not:

- push directly to the protected default branch;
- merge their own pull requests;
- bypass branch protection;
- disable required checks;
- force-push unless the user explicitly approves it.

## Repository and worktree model

maxxy-me normally creates one repository clone on each execution host.

It does not create a complete clone for every task.

```text
Repository clone
├── worktree/task-101-frontend
│   └── branch: maxxy/task-101/frontend
├── worktree/task-102-backend
│   └── branch: maxxy/task-102/backend
└── worktree/task-103-testing
    └── branch: maxxy/task-103/testing
```

This gives each task an isolated working directory while sharing the repository's Git object database.

## Codex support

Version one supports Codex only.

### Primary runtime

- Codex App Server
- ChatGPT account authentication or OpenAI API-key authentication
- streamed messages and tool activity
- command and file approvals
- turn interruption and continuation

### Multiple Codex connections and pooled capacity

Each connected ChatGPT account, OpenAI API key, or supported enterprise access token becomes a `CodexConnection` on a specific execution host.

```text
Logical capacity pool
├── ChatGPT connection A → isolated CODEX_HOME A → one leased task lane
├── ChatGPT connection B → isolated CODEX_HOME B → one leased task lane
└── API key connection C → protected host secret → configurable task lanes
```

The scheduler chooses both a host and a connection for every task attempt. It considers connection readiness, active leases, observed limit signals, cooldowns, workspace policy, and priority. Every attempt is attributed to exactly one connection.

If the same provider account or API project is available through several hosts, those connections belong to one capacity source and are counted once. A second login location improves host availability; it does not multiply that account's usage budget.

Important boundaries:

- credentials stay on the execution host and never enter normal PostgreSQL rows or browser events;
- each ChatGPT connection has a separate file-backed `CODEX_HOME`; OS-keyring use is deferred until distinct per-connection namespaces are verified;
- version one conservatively allows one active task per ChatGPT credential lane;
- the dashboard aggregates capacity observations but does not claim OpenAI merged the accounts or their subscriptions;
- an active turn stays pinned to its connection;
- failover creates a new attempt and thread with an explicit context handoff;
- only accounts and API projects the owner is authorized to use may be connected.
- provider limit, suspension, and authentication responses are respected; the pool is not a mechanism for bypassing enforcement.

Codex does not currently document a general provider API for combining ChatGPT plan limits. maxxy-me therefore treats remaining-capacity figures as estimates unless Codex supplies an authoritative status or reset signal. For shared or high-volume automation, API-key or supported enterprise access-token connections are the preferred lanes.

Design references: [Codex authentication](https://learn.chatgpt.com/docs/auth), [trusted automation authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth), and [Codex pricing and usage](https://learn.chatgpt.com/docs/pricing).

### Reusable skills, configurable agents, and root orchestration

A skill is a Codex-compatible package with a required `SKILL.md` and optional `SKILL.json`, references, templates, assets, or scripts. The dashboard supports draft, validation, publication, version history, duplication, disablement, archival, and reuse.

Published versions are immutable and content-addressed. Agent profiles bind to either a pinned version or `latest_published`; each task resolves that policy to an exact version before execution. Skill scripts never run automatically, and a skill cannot widen sandbox, filesystem, network, tool, connector, credential, or approval permissions.

Every agent profile can choose its own model and supported reasoning effort:

```text
Root / Manager
├── model: gpt-5.6-sol
├── reasoning: medium
└── skills: architecture-planning@2, task-decomposition@1

Figma-to-Code Expert
├── model: gpt-5.5
├── reasoning: high
└── skills: figma-to-code@3
```

Settings resolve in this order:

```text
system → workspace → role → agent profile → task-run override
```

The model picker is populated from Codex App Server for the selected host and connection, including supported reasoning efforts. maxxy-me snapshots the resolved connection, model, effort, skill versions, and effective permissions on every attempt. An unavailable choice blocks by default; fallback occurs only through an explicit ordered policy and is never silent.

The root-agent lifecycle is:

1. analyze the goal and workspace;
2. propose a versioned task DAG, expert assignments, skills, models, ownership, acceptance criteria, and validation;
3. wait for user approval;
4. delegate ready nodes to compatible expert agents;
5. wait for durable child and reviewer or integrator results;
6. resume the root thread with a structured result bundle;
7. request bounded follow-up work when needed;
8. validate and present one consolidated outcome with pull-request links;
9. stop for user review and merge.

Official behavior references: [Codex models and reasoning](https://learn.chatgpt.com/docs/models), [Codex App Server models and skills](https://learn.chatgpt.com/docs/app-server), and [subagent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents).

### Optional internal adapter

- Codex SDK for structured programmatic jobs

### External companion

- Codex Web or Codex Cloud may be opened as a separate companion surface
- maxxy-me can track the resulting GitHub branch or pull request
- maxxy-me does not scrape or reuse browser session cookies from Codex Web

## GitHub setup

GitHub is the code review and integration boundary.

Recommended repository protection:

- Require pull requests for the default branch.
- Require CI checks before merge.
- Require conversations to be resolved.
- Disable force pushes.
- Prevent branch deletion.
- Keep merge permission under the owner's account.

The control plane may use a GitHub App for:

- repository metadata;
- pull-request creation;
- webhook events;
- checks and review status.

Execution hosts may use their existing GitHub CLI or Git credential manager to push task branches.

Raw GitHub credentials must not be stored in normal control-plane PostgreSQL fields.

## Prerequisites

### Local development

- Bun
- Git
- Docker
- PostgreSQL
- GitHub CLI
- Codex CLI
- A GitHub repository

### Production VPS and domain

- Supported Linux VPS with a static public IP
- Enough CPU, memory, and disk for the control plane, PostgreSQL, Codex, builds, and backups
- Docker Engine and Docker Compose
- Cloudflare account with an active zone for the custom domain or subdomain
- Proxied Cloudflare `A` and optional `AAAA` records targeting the VPS
- Cloudflare DNSSEC and SSL/TLS mode set to **Full (strict)**
- Cloudflare Origin CA certificate installed for Caddy
- Firewall rules that allow HTTPS to the origin only from current Cloudflare IP ranges and SSH only from administrator sources
- GitHub App
- GitHub Actions deployment credentials
- Encrypted off-server backup destination
- Persistent storage and backup coverage for `/var/lib/maxxy-me/skills`

### Execution hosts

- Bun or packaged maxxy host-agent binary
- Codex CLI
- A pinned Codex version whose App Server schemas support model discovery, explicit thread model selection, skill listing, and explicit skill inputs
- Git
- GitHub authentication
- Persistent project and worktree directories
- A protected directory or OS credential-store namespace for each Codex connection
- Required project development tools
- Writable host-agent skill cache and read-only per-task skill materialization support

## Expected development workflow

The project has not been scaffolded yet. Once the foundation is implemented:

```bash
git clone <repository-url>
cd maxxy-me
bun install
cp .env.example .env
bun run db:migrate
bun run dev
```

Expected monorepo scripts:

```bash
bun run dev
bun run dev:web
bun run dev:orchestrator
bun run dev:host

bun run build
bun run start:web
bun run start:worker
bun run start:host

bun run typecheck
bun run lint
bun run test
bun run test:e2e

bun run db:generate
bun run db:migrate
bun run db:check
```

## Environment configuration

The complete variable inventory is maintained in [`execution-phase.md`](./execution-phase.md).

A minimal local example:

```env
NODE_ENV=development
APP_ENV=development
APP_NAME=maxxy-me
APP_URL=http://127.0.0.1:3000

DATABASE_URL=postgres://maxxy:maxxy@127.0.0.1:5432/maxxy_me

AUTH_SECRET=replace-with-a-long-random-value
AUTH_URL=http://127.0.0.1:3000
AUTH_ALLOW_SIGNUP=true
OWNER_BOOTSTRAP_EMAIL=owner@example.com

TRUSTED_ORIGINS=http://127.0.0.1:3000
WS_TICKET_SECRET=replace-with-a-long-random-value
INTERNAL_SERVICE_SECRET=replace-with-a-long-random-value
TOKEN_PEPPER=replace-with-a-long-random-value
DATA_ENCRYPTION_KEY=replace-with-a-valid-key

GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=

DEFAULT_ROOT_MODEL_ID=gpt-5.6-sol
DEFAULT_ROOT_REASONING_EFFORT=medium
DEFAULT_AGENT_MODEL_ID=gpt-5.5
DEFAULT_AGENT_REASONING_EFFORT=high
MODEL_FALLBACK_MODE=block
SKILL_STORE_ROOT=/var/lib/maxxy-me/skills
ROOT_PLAN_APPROVAL_REQUIRED=true

PROTOCOL_VERSION=1
```

Host-side multi-connection defaults are documented in `execution-phase.md`, including `MAXXY_CODEX_ACCOUNTS_DIR`, model-catalog refresh, skill cache, conservative ChatGPT lane concurrency, usage polling, and failover policy. Environment model values bootstrap defaults; the owner configures effective agent settings in the dashboard. Do not put raw Codex credentials in Compose environment files, control-plane containers, PostgreSQL, or CI secrets.

Do not commit real secrets, Codex credentials, GitHub tokens, host tokens, or production database URLs.

## Development roadmap

The authoritative implementation order is documented in [`execution-phase.md`](./execution-phase.md).

### Milestone 1 — Platform proven

- Cloudflare proxy reaches Caddy over **Full (strict)** origin TLS.
- Bun web and worker containers run on the VPS.
- Next.js web process starts.
- Worker process starts.
- Private PostgreSQL connects and survives container replacement.
- Release migration succeeds.
- Authenticated WebSocket connects through Cloudflare and Caddy and reconnects safely.
- Native systemd host agent starts Codex on the VPS.

### Milestone 2 — First Codex pull request

- Enroll one persistent execution host.
- Connect one repository.
- Create one worktree.
- Run one Codex task.
- Validate and push its branch.
- Open one GitHub pull request.
- Prove one credential lane before enabling pool routing.

### Milestone 3 — Terminal-free control

- Dashboard task creation.
- Live event timeline.
- Approval handling.
- Pull-request status and review flow.

### Milestone 4 — Multi-agent workspace

- Reusable Codex-compatible skills with immutable published versions.
- Root and expert agent profiles.
- Per-agent model and reasoning configuration.
- Root planning and user plan approval.
- Task dependencies.
- Parallel agents.
- Per-host capacity.
- Multiple isolated Codex connections.
- Account-aware capacity leases, cooldowns, routing, and task attribution.
- Reviewer and integration workflows.
- Root-agent resumption, final validation, and consolidated reporting.

### Milestone 5 — Reliable personal production

- Cloudflare-managed production domain, proxied DNS, DNSSEC, and locked-down origin.
- Recovery and reconciliation.
- Backup and restore testing.
- Security hardening.
- Daily self-hosted use.

## Security model

maxxy-me controls source code, development commands, credentials, and AI agents. Treat it as an administrative development tool.

Core rules:

- Require authentication for all hosted access.
- Use HTTPS and WSS in production.
- Keep Codex credentials on execution hosts.
- Isolate each Codex connection in its own credential namespace.
- Never copy one ChatGPT `auth.json` into concurrent lanes or several machines.
- Send only opaque connection IDs to the control plane; resolve them locally on the authenticated host.
- Audit connection addition, reauthentication, routing, failover, and revocation.
- Keep Git push credentials on execution hosts.
- Store host and API tokens as secure hashes where possible.
- Never broadcast secrets through live events.
- Validate every host-agent message with Zod.
- Restrict command execution to registered workspace roots.
- Require approval for destructive operations.
- Protect the GitHub default branch.
- Never grant agents merge permission.
- Treat skill packages as untrusted content and validate paths, archives, manifests, dependencies, sizes, file counts, and hashes.
- Never execute skill scripts during install, discovery, or attachment.
- Never let a skill widen the effective sandbox, filesystem, network, tool, connector, credential, or approval policy.
- Populate model choices from the selected connection's live Codex catalog and reject unsupported reasoning efforts.
- Snapshot model, reasoning, skill versions, connection, and effective permissions for every root and expert attempt.
- Never silently substitute a model or mutate an active turn after a settings change.
- Bound root delegation depth and child-task fan-out; make child creation and finalization idempotent.
- Treat container writable layers as temporary; keep durable state in explicit volumes or host paths.
- Trust `CF-Connecting-IP` only when Caddy received the request from a current Cloudflare source range.
- Never use Cloudflare **Flexible** SSL/TLS mode.

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system boundaries, Cloudflare edge, VPS control plane, host-agent model, data model, security, and deployment.
- [`user-flow.md`](./user-flow.md) — local and production VPS user journeys, authentication, Codex execution, approvals, and pull requests.
- [`execution-phase.md`](./execution-phase.md) — authoritative build order, priorities, exit criteria, deployment process, and required variables.
- **maxxy-me workspace** in Notion — product planning, requirements, and project decisions.

## Project status

maxxy-me is currently in the planning and architecture stage.

The next milestone is not visual polish. It is a deployment and execution proof:

```text
Cloudflare + Caddy + Compose + PostgreSQL + WebSocket
        ↓
Native host agent on the VPS
        ↓
One isolated Codex connection and task
        ↓
One GitHub pull request
```

After that single-lane proof, the next execution milestone is a reusable `figma-to-code` skill, a root configured for `gpt-5.6-sol`, an expert configured for `gpt-5.5` with `high` reasoning, two authorized connections, parallel child tasks, and a resumed root that returns one validated consolidated result with complete per-attempt attribution.

## License

No public license has been selected yet. Until one is added, the project should be treated as private and all rights reserved.
