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

- A Linux machine for the quickest local smoke test
- [Bun 1.3.14](https://bun.sh/) on every machine that runs the host agent
- Docker Engine with the Compose plugin
- Git, the official Codex CLI, and GitHub CLI (`gh`) on every execution host
- A GitHub repository the authenticated host account may clone and push to

You do not need to install PostgreSQL locally when using Docker Compose. Before continuing, verify the tools that the setup will use:

```bash
bun --version
docker compose version
git --version
codex --version
gh --version
```

The Bun version should be `1.3.14`, and `codex --version` must begin with `codex-cli`. If Bun was just installed and the shell cannot find it, start a new shell or add `$HOME/.bun/bin` to `PATH`. The checked-in host launcher also searches that directory automatically.

## Quick Start

The simplest evaluation runs the containerized control plane and the native execution host on the same Linux machine.

### 1. Clone and install

```bash
git clone https://github.com/Omakidx/maxxy-me.git
cd maxxy-me
bun install --frozen-lockfile
```

### 2. Start the control plane

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/health
```

Use `sudo docker compose` if your Linux account cannot access Docker directly. Wait until `postgres`, `web`, and `worker` report healthy and `migrate` has exited successfully. Caddy does not accept traffic until both web and worker pass their health checks.

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) and create the single owner account. Public signup is intentionally unavailable.

### 3. Enroll and run the host

In **Setup**, choose local deployment, create an enrollment command, and run that exact command from the repository root before its one-time token expires. It has this shape:

```bash
./deploy/maxxy-host enroll \
  --server http://127.0.0.1:8080 \
  --token <one-time-token>
./deploy/maxxy-host start
```

Keep this terminal open. A successful enrollment followed by a connected WebSocket makes the host appear online. In another terminal, verify its toolchain when needed:

```bash
cd /path/to/maxxy-me
./deploy/maxxy-host doctor
./deploy/maxxy-host registry
```

Do not run `bun run start:host -- enroll` from outside the checkout. The launcher above is the supported command and knows where the host-agent source and Bun binary live.

### 4. Connect Codex

Leave the host agent running. Open **Settings**, select **Add account**, choose the online host and authentication mode, then register the pending connection. Registration alone does not authenticate or connect the account.

Copy the generated `./deploy/maxxy-host codex-login ...` command into a second terminal on that host and complete the official login flow. The account moves into the connected list only after the host verifies the credentials and reports a `ready_*` status. API-key setup reads the key from standard input; never paste a key into the dashboard.

### 5. Authenticate GitHub

Run these commands as the same operating-system account that runs the local host agent:

```bash
gh auth login
gh auth status
git ls-remote https://github.com/OWNER/REPOSITORY.git HEAD
```

Grant only the repository access needed to read the base branch, push task branches, and create draft pull requests. The agent does not merge pull requests.

### 6. Add a workspace

In **Setup**, add the GitHub owner, repository, HTTPS remote, protected base branch, persistent clone path, and a separate worktree root. Both paths are paths on the execution host, not paths inside a control-plane container.

For a same-machine smoke test, the current checkout can be the persistent clone path. Create a separate worktree parent first:

```bash
mkdir -p "$HOME/maxxy-worktrees"
pwd
```

Use the `pwd` result as the clone path and `$HOME/maxxy-worktrees` as the worktree root.

### 7. Run the first task

Open **Agent console**. Confirm the database, worker, hosts, and Codex readiness badges are all healthy, choose the workspace, enter a task title and prompt, then select **Run task**.

The focused task shows agent messages and command output as they arrive. Its activity icon spins only while the agent is actively starting, running, validating, pushing, or opening a pull request. Successful work ends in a draft pull request for owner review.

## Readiness and Failure Behavior

Execution fails closed. New tasks, retries, and plan approvals are blocked unless the database is reachable, the scheduler heartbeat is fresh, every host required by active or pinned workspaces is online, and a ready Codex lane exists on a fresh host. The scheduler independently rejects stale hosts.

The dashboard and read-only diagnostics remain available during an execution outage so the owner can identify and repair the failed dependency; cancelling active work also remains available. PostgreSQL is never deliberately stopped because a host disconnects, which preserves task history and recovery evidence.

## Daily Commands

```bash
# Start or update the local control plane
docker compose up -d --build

# Inspect health and recent logs
docker compose ps
docker compose logs --tail=100 web worker postgres caddy

# Run the local execution host in its own terminal
./deploy/maxxy-host start

# Stop containers without deleting PostgreSQL data
docker compose down
```

Do not add `--volumes` to `docker compose down` unless you intentionally want to delete the local database.

## Fast Troubleshooting

| Symptom | Check |
|---|---|
| `bun: command not found` | Run through `./deploy/maxxy-host`; verify `$HOME/.bun/bin/bun --version` |
| Host is offline | Keep `./deploy/maxxy-host start` running; inspect `docker compose logs --tail=100 web caddy` |
| WebSocket says `Expected 101` | Connect through `http://127.0.0.1:8080`, not the internal web port; rebuild Caddy/web with Compose |
| Codex stays pending | Run the generated login command on the selected host while that host agent remains online |
| Execution is paused | Read the readiness reason in **Agent console** and restore every unhealthy badge |
| GitHub push or PR fails | Run `gh auth status` and `git ls-remote` as the host-agent operating-system user |

For deeper diagnosis, use [Troubleshooting](docs/troubleshooting.md). Never share enrollment tokens, session cookies, Codex credentials, GitHub tokens, or unredacted logs.

## Development

Run an individual service directly only when developing it:

```bash
bun run dev:web
bun run dev:orchestrator
bun run dev:host
```

Direct processes require a PostgreSQL instance and the variables in [.env.example](.env.example). The Compose stack supplies its own internal service configuration.

The focused operator guides are [Host installation](docs/host-installation.md), [GitHub setup](docs/github-app.md), [VPS deployment](docs/vps-deployment.md), [Backup and restore](docs/vps-backup-and-restore.md), and [Recovery](docs/recovery.md).

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
