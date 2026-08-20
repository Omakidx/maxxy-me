# maxxy-me

maxxy-me is a private, self-hosted workspace for turning coding tasks into reviewed GitHub pull requests with Codex. It coordinates isolated execution hosts, Codex connection lanes, Git worktrees, validation, approvals, and pull-request evidence from one dashboard.

This is a personal, single-owner system. It is not a hosted service, a multi-user collaboration platform, or an automatic merge bot.

> **Project status:** Phase 14 launch-candidate implementation. Repository checks and a local container drill pass, but production launch still requires the real-VPS, GitHub, Codex, security-scan, reboot, and off-server restore evidence tracked in [Launch readiness](docs/launch-readiness.md).

## What It Does

- Creates a private owner account; public signup stays disabled.
- Enrolls one or more persistent Linux execution hosts over authenticated outbound WebSockets.
- Keeps Codex and GitHub credentials on execution hosts, outside browser-facing containers.
- Isolates each write task in its own branch and Git worktree.
- Routes work across independent owner-authorized Codex connection lanes.
- Supports task dependencies, manager plans, approvals, validation profiles, and review evidence.
- Pushes an agent branch and creates or updates a draft pull request without merging it.
- Persists control-plane state in PostgreSQL and reconciles interrupted leases after restarts.

## How It Fits Together

```text
Browser
  |
  | HTTPS / WSS
  v
Caddy -> web/API -> PostgreSQL
           |
           v
       worker/scheduler
           |
           | authenticated outbound WSS
           v
Native host agent -> Codex -> Git worktree -> GitHub draft PR
```

The Docker Compose control plane contains Caddy, web, worker, migrations, and PostgreSQL. Codex and the host agent run as a non-root native service because they need controlled access to repositories, worktrees, credentials, and project toolchains. See [Architecture](ARCHITECTURE.md) for the trust boundaries.

## Requirements

- Linux or macOS for local development
- [Bun 1.3.14](https://bun.sh/)
- Docker Engine with the Compose plugin
- PostgreSQL 17 for tests run outside Compose
- Git
- Codex CLI and GitHub CLI on each execution host

## Local Development

Install dependencies:

```bash
bun install
```

Start the production-shaped local stack:

```bash
docker compose up --build
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080), create the owner account, and follow the dashboard's guided setup.

Run the web, worker, or host process directly when developing a specific service:

```bash
bun run dev:web
bun run dev:orchestrator
bun run dev:host
```

Direct processes need a PostgreSQL instance and the variables in [.env.example](.env.example). The Compose stack supplies its own internal service configuration.

## First-Time Setup

The dashboard guides the owner through seven steps:

1. Choose local development or production VPS mode.
2. Create the only owner account.
3. Install and configure the GitHub App.
4. Create a one-time host enrollment command.
5. Register a Codex connection and wait for a healthy lane.
6. Import a GitHub repository and its persistent host paths.
7. Create the first task.

The detailed operator guides are:

- [Host installation](docs/host-installation.md)
- [GitHub App setup](docs/github-app.md)
- [VPS deployment](docs/vps-deployment.md)
- [Backup and restore](docs/vps-backup-and-restore.md)
- [Recovery](docs/recovery.md)
- [Troubleshooting](docs/troubleshooting.md)

## Quality Gates

Run all repository gates before opening a pull request:

```bash
bun run lint
bun run typecheck
bun run docs:check
bun test
bun run build
bun run security:check
```

Validate the production Compose model with non-secret placeholders:

```bash
MAXXY_SITE_ADDRESS=workspace.example.com \
APP_URL=https://workspace.example.com \
APP_SECRET=dummy-secret \
POSTGRES_PASSWORD=dummy-password \
GITHUB_WEBHOOK_SECRET=dummy-webhook \
APP_IMAGE_DIGEST=example.com/maxxy-me@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
docker compose -f compose.yaml -f compose.production.yaml config --quiet
```

## Repository Map

```text
apps/
  web/              Next.js dashboard, API, auth, webhooks, WebSocket gateway
  orchestrator/     scheduler, lease recovery, and worker process
  host-agent/       non-root native execution-host process
packages/
  contracts/        shared schemas and protocol events
  database/         Drizzle schema, repositories, scheduling, and recovery
  codex-adapter/    Codex App Server boundary
  git/              branch and worktree operations
  github/           pull-request and check integration
  security/         tokens, hashing, encryption, and redaction
  workspace-runtime execution command contracts
deploy/systemd/     host-agent and backup units
scripts/            migrations, deploy, backup, restore, smoke, and security checks
docs/               operator guides, phase evidence, and launch status
```

## Safety Model

- The browser never receives host, Codex, GitHub, SSH, or database credentials.
- Application containers do not mount repositories, worktrees, Codex stores, GitHub stores, or the Docker socket.
- The host agent runs as a dedicated non-root user with command allow/deny policy, path guards, timeouts, and output limits.
- Agents may push their task branch and open or update a draft pull request. They do not merge or bypass branch protection.
- Production backups are encrypted and exclude execution-host credential stores.

Report security issues privately as described in [SECURITY.md](SECURITY.md). Do not open a public issue containing a vulnerability or secret.

## Documentation

| Document | Purpose |
|---|---|
| [Architecture](ARCHITECTURE.md) | Services, data ownership, trust boundaries, and failure behavior |
| [User flow](user-flow.md) | Setup, daily task, review, and recovery journeys |
| [Execution phases](execution-phase.md) | Current phase status and evidence index |
| [Contributing](CONTRIBUTING.md) | Local workflow and change standards |
| [Security](SECURITY.md) | Supported scope and vulnerability reporting |
| [Launch readiness](docs/launch-readiness.md) | Beta scenarios and launch decision gates |

The original detailed planning documents remain under [docs/starter-MDs](docs/starter-MDs/) as design history. Current behavior and operator procedures are documented by the root files and focused guides above.

## Production

Production is a single hardened VPS behind Caddy, optionally proxied by Cloudflare. Deployments use an immutable image digest, one-shot migrations, a deployment lock, a pre-deploy backup, health checks, and rollback metadata.

```bash
cp .env.production.example /etc/maxxy-me/production.env
# Replace every placeholder, then follow:
# docs/vps-deployment.md
```

Do not treat a successful local build as production approval. The launch decision is made only from [docs/launch-readiness.md](docs/launch-readiness.md).

## License

No license has been declared yet. Until one is added, copyright is retained by the repository owner.
